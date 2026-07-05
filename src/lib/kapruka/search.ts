import { callKapruka } from "./client";
import { KaprukaError } from "./unwrap";
import { cached } from "./cache";
import type { Product, SearchResponse } from "./types";

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

// ---------------------------------------------------------------------------
// Adult-product safety filter (hotfix)
//
// Adult items (e.g. sex dolls) are returned under category "general" — the same
// unreliable slug as everything else — so category filtering alone does NOT
// catch them. We drop them here, server-side, before the model ever sees them.
// Confirmed live: adult product IDs carry the `EF_PC_ADUL` prefix (soft toys use
// `EF_PC_SOFT`), and names contain explicit terms.
// ---------------------------------------------------------------------------
const ADULT_ID_PREFIXES = ["ef_pc_adul"]; // e.g. EF_PC_ADUL0V2810P00154
// Word-boundary prefix match (no trailing boundary) so plurals/variants are
// caught: "sex"->sexy, "breast"->breasts, "vagina"->vaginas. `pant(y|ies)`
// blocks adult underwear ("...Panties For Women Spank Me") without hitting
// legit apparel — "pants"/"panther" don't match. Leading \b prevents false
// hits inside words (e.g. "Middlesex" won't match "sex").
const ADULT_NAME_RE =
  /\b(sex|adult|intimate|vagina|breast|lingerie|pant(y|ies)|spank|masturbat)/i;

/** Returns a reason string if the product is adult content, else null. */
function adultReason(p: Product): string | null {
  const slug = (p.category?.slug ?? "").toLowerCase();
  const cname = (p.category?.name ?? "").toLowerCase();
  const id = (p.id ?? "").toLowerCase();
  if (slug === "intimate_essentials") return "category.slug=intimate_essentials";
  if (cname.includes("adult")) return "category.name~adult";
  if (cname.includes("intimate")) return "category.name~intimate";
  if (ADULT_ID_PREFIXES.some((pre) => id.startsWith(pre))) return "adult-id-prefix";
  const m = (p.name ?? "").match(ADULT_NAME_RE);
  if (m) return `name~"${m[0]}"`;
  return null;
}

/** Drop adult products (see adultReason for the match rules). */
function filterAdult(results: Product[] | undefined): Product[] {
  return (results ?? []).filter((p) => adultReason(p) === null);
}

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
      const r = await callKapruka<SearchResponse>("kapruka_search_products", params);
      // Strip adult products BEFORE returning so downstream count()-based
      // fallback logic operates on the safe result set (if filtering drops us
      // below 3, the broaden-and-retry path fires just like a keyword miss).
      return { ...r, results: filterAdult(r.results) };
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

// ---------------------------------------------------------------------------
// Query planning: noun-first search + descriptor post-filter
//
// Kapruka's search treats multi-word queries as OR-loose, so "pink fluffy doll"
// returns pink shirts and fluffy bottles with zero actual dolls. Fix: pull the
// strong PRODUCT NOUN out of the query and search on that alone (AND-tight on
// the thing the shopper actually wants), then rank/keep by the descriptive
// words ("pink", "fluffy") in code.
// ---------------------------------------------------------------------------
const PRODUCT_NOUNS = [
  "doll", "cake", "flower", "chocolate", "lego", "bear", "toy", "bouquet",
  "perfume", "watch", "book", "cushion", "mug", "puzzle",
];

// Words that are never useful descriptors (would spuriously match "For Her"
// etc. in product names). Descriptors otherwise become the in-code post-filter.
const STOPWORDS = new Set([
  "for", "my", "the", "a", "an", "to", "of", "and", "or", "with", "in", "on",
  "at", "some", "any", "me", "i", "want", "need", "please", "looking", "find",
  "show", "buy", "send", "her", "him", "his", "them", "gift", "gifts", "one",
]);

const ENOUGH = 3;

interface QueryPlan {
  q: string;
  descriptors: string[];
}

/** Singularise a naive plural ("dolls" -> "doll") for noun matching. */
function singular(w: string): string {
  return w.endsWith("s") ? w.slice(0, -1) : w;
}

/**
 * Rewrite the raw query to its product noun(s) and split off the descriptive
 * words. Falls back to the original query when no product noun is present.
 */
function planQuery(rawQ: string): QueryPlan {
  const trimmed = rawQ.trim();
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const foundNouns: string[] = [];
  for (const w of words) {
    const noun = PRODUCT_NOUNS.includes(w)
      ? w
      : PRODUCT_NOUNS.includes(singular(w))
        ? singular(w)
        : null;
    if (noun && !foundNouns.includes(noun)) foundNouns.push(noun);
  }

  if (foundNouns.length === 0) {
    return { q: trimmed, descriptors: [] };
  }

  const chosen = foundNouns.slice(0, 2); // first two nouns if two match
  const descriptors = words.filter((w) => {
    if (chosen.includes(w) || chosen.includes(singular(w))) return false;
    if (STOPWORDS.has(w)) return false;
    return w.length >= 3;
  });

  const q = chosen.join(" ");
  return { q, descriptors };
}

/**
 * Keep/boost products whose name or summary contains a descriptor. If we have
 * enough strong matches, drop the weakly-matched rest; if not, keep everything
 * but float the strong matches to the front.
 */
function applyDescriptorFilter(
  results: Product[],
  descriptors: string[],
): Product[] {
  if (descriptors.length === 0 || results.length === 0) return results;
  const matches: Product[] = [];
  const rest: Product[] = [];
  for (const p of results) {
    const hay = `${p.name ?? ""} ${p.summary ?? ""}`.toLowerCase();
    (descriptors.some((d) => hay.includes(d)) ? matches : rest).push(p);
  }
  if (matches.length >= ENOUGH) return matches;
  return [...matches, ...rest];
}

export async function searchProducts(o: SearchOptions): Promise<SearchResponse> {
  const plan = planQuery(o.q);
  const res = await runSearch({ ...o, q: plan.q });
  return { ...res, results: applyDescriptorFilter(res.results ?? [], plan.descriptors) };
}

async function runSearch(o: SearchOptions): Promise<SearchResponse> {
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
