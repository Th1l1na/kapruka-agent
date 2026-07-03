import { callKapruka } from "./client";
import { KaprukaError } from "./unwrap";
import { cached } from "./cache";
import type { SearchResponse } from "./types";

/**
 * `kapruka_search_products` wrapper.
 *
 * Enforces the Sprint-0 rules in code (not just prose):
 *  - injects response_format:"json" and currency:"LKR"
 *  - default limit 40 for browsing (server hard max is 50)
 *  - treats the server's plain-text "No products found ..." reply as an empty
 *    result set (it is NOT JSON, so it must not reach unwrap as an error)
 *  - <3-results fallback: drop an unreliable category filter and/or broaden the
 *    query, merging de-duplicated results
 *  - caches by param signature (rate-limit defence)
 *
 * Note on `intimate_essentials`: search takes no exclude param and the
 * per-result `category` is unreliable ("general"), so exclusion is enforced by
 * (a) never passing category="intimate_essentials" and (b) the system prompt.
 *
 * Note on the `category` filter: Kapruka applies it against an internal
 * taxonomy that only covers SOME browse categories (e.g. "Birthday",
 * "Chocolates" resolve; "cakes", "flowers", "valentine" return zero regardless
 * of casing). The <3-results fallback below drops the category and searches by
 * keyword instead, which reliably finds those gifts.
 */
const SEARCH_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 40;
const SERVER_MAX_LIMIT = 50;

export type SearchSort =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "bestseller";

export interface SearchOptions {
  q: string;
  /** Category NAME (e.g. "Cakes"), case-insensitive — not the slug. */
  category?: string;
  limit?: number;
  cursor?: string;
  inStockOnly?: boolean;
  sort?: SearchSort;
  minPrice?: number;
  maxPrice?: number;
}

function buildParams(o: SearchOptions): Record<string, unknown> {
  const params: Record<string, unknown> = {
    q: o.q,
    limit: Math.min(o.limit ?? DEFAULT_LIMIT, SERVER_MAX_LIMIT),
    currency: "LKR",
    response_format: "json",
  };
  if (o.category) params.category = o.category;
  if (o.cursor) params.cursor = o.cursor;
  if (o.inStockOnly) params.in_stock_only = true;
  if (o.sort) params.sort = o.sort;
  if (o.minPrice != null) params.min_price = o.minPrice;
  if (o.maxPrice != null) params.max_price = o.maxPrice;
  return params;
}

const EMPTY: SearchResponse = { results: [], next_cursor: null };

async function rawSearch(o: SearchOptions): Promise<SearchResponse> {
  const params = buildParams(o);
  const key = `search:${JSON.stringify(params)}`;
  return cached(key, SEARCH_TTL_MS, async () => {
    try {
      return await callKapruka<SearchResponse>("kapruka_search_products", params);
    } catch (err) {
      // A zero-result search (keyword miss OR a category filter that matches
      // nothing) comes back as a plain-text "No products found ..." string,
      // which unwrap can't JSON.parse. Treat it as an empty result set.
      if (err instanceof KaprukaError && /no products found/i.test(err.message)) {
        return EMPTY;
      }
      throw err;
    }
  });
}

function count(r: SearchResponse): number {
  return r.results?.length ?? 0;
}

export async function searchProducts(o: SearchOptions): Promise<SearchResponse> {
  const primary = await rawSearch(o);
  if (count(primary) >= 3) return primary;

  const trimmed = o.q.trim();
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  const canBroaden =
    firstWord.length >= 3 && firstWord.toLowerCase() !== trimmed.toLowerCase();

  // Build fallback attempts in priority order:
  //  1. If a category filter is set, drop it (Kapruka's category filter is
  //     unreliable) and fold the category name into the keyword so the topic
  //     still drives the search — e.g. q="gift" + category="Valentine" becomes
  //     a keyword search for "Valentine gift".
  //  2. Broaden the query to its first meaningful word (no category).
  const candidates: SearchOptions[] = [];
  if (o.category) {
    const cat = o.category.trim();
    const alreadyHasCat = trimmed.toLowerCase().includes(cat.toLowerCase());
    const q = (alreadyHasCat ? trimmed : `${cat} ${trimmed}`).slice(0, 200);
    candidates.push({ ...o, category: undefined, q, cursor: undefined });
  }
  if (canBroaden) {
    candidates.push({ ...o, category: undefined, q: firstWord, cursor: undefined });
  }

  // Try candidates until one gives us enough, keeping the best so far.
  let best = primary;
  for (const cand of candidates) {
    const r = await rawSearch(cand);
    if (count(r) > count(best)) best = r;
    if (count(best) >= 3) break;
  }
  if (best === primary) return primary;

  // Merge primary's (few) hits ahead of the fallback's, de-duplicated.
  const seen = new Set((primary.results ?? []).map((p) => p.id.toLowerCase()));
  const merged = [...(primary.results ?? [])];
  for (const p of best.results ?? []) {
    const idl = p.id.toLowerCase();
    if (!seen.has(idl)) {
      seen.add(idl);
      merged.push(p);
    }
  }

  return { ...best, results: merged, next_cursor: best.next_cursor ?? null };
}
