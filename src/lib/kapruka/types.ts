/**
 * Kapruka MCP payload types.
 *
 * Draft shapes from notes/data-shapes.md, verified against a live
 * `kapruka_search_products` response during Sprint 1 kickoff. `stock_level`
 * enum beyond "low" is still TBC (Sprint 1 only branches on "low").
 */
export interface Price {
  amount: number;
  currency: string;
}

/** A row from `kapruka_search_products` (leaner than get_product). */
export interface Product {
  id: string;
  name: string;
  summary?: string;
  price: Price;
  compare_at_price: number | null;
  in_stock: boolean;
  // Unreliable as a scarcity signal: defaults to "low" on essentially every
  // product, so it does not indicate real stock scarcity. Do not surface it in
  // the UI. May revisit a real out-of-stock indicator in a later sprint if a
  // trustworthy source turns up.
  stock_level: string;
  image_url: string;
  /** Unreliable in search results (often "general") — do not filter on this. */
  category?: { id?: string; name: string; slug: string };
  rating: number | null;
  ships_internationally: boolean;
  url: string;
}

export interface SearchResponse {
  results: Product[];
  next_cursor?: string | null;
  applied_filters?: Record<string, unknown>;
}

export interface Category {
  name: string;
  url: string;
}

export interface CategoriesResponse {
  categories: Category[];
}
