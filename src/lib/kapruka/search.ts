import { callKapruka } from "./client";
import { cached } from "./cache";
import type { SearchResponse } from "./types";

/**
 * `kapruka_search_products` wrapper.
 *
 * Enforces the Sprint-0 rules in code (not just prose):
 *  - injects response_format:"json" and currency:"LKR"
 *  - default limit 40 for browsing (server hard max is 50)
 *  - <3-results fallback: retry once with a broader single-word query (or the
 *    category alone) and merge de-duplicated results
 *  - caches by param signature (rate-limit defence)
 *
 * Note on `intimate_essentials`: search takes no exclude param and the
 * per-result `category` is unreliable ("general"), so exclusion is enforced by
 * (a) never passing category="intimate_essentials" and (b) the system prompt.
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

async function rawSearch(o: SearchOptions): Promise<SearchResponse> {
  const params = buildParams(o);
  const key = `search:${JSON.stringify(params)}`;
  return cached(key, SEARCH_TTL_MS, () =>
    callKapruka<SearchResponse>("kapruka_search_products", params),
  );
}

export async function searchProducts(o: SearchOptions): Promise<SearchResponse> {
  const primary = await rawSearch(o);
  if ((primary.results?.length ?? 0) >= 3) return primary;

  // Fallback: broaden to the first meaningful word (min 3 chars for the
  // server), or — if that can't broaden — retry with the category alone.
  const firstWord = o.q.trim().split(/\s+/)[0] ?? "";
  const canBroaden =
    firstWord.length >= 3 &&
    firstWord.toLowerCase() !== o.q.trim().toLowerCase();

  if (!canBroaden && !o.category) return primary;

  const fallback = await rawSearch({
    ...o,
    q: canBroaden ? firstWord : o.q,
    cursor: undefined,
  });

  const seen = new Set(
    (primary.results ?? []).map((p) => p.id.toLowerCase()),
  );
  const merged = [...(primary.results ?? [])];
  for (const p of fallback.results ?? []) {
    const idl = p.id.toLowerCase();
    if (!seen.has(idl)) {
      seen.add(idl);
      merged.push(p);
    }
  }

  return {
    ...primary,
    results: merged,
    next_cursor: fallback.next_cursor ?? primary.next_cursor,
  };
}
