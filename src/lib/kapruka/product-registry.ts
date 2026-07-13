import type { Product } from "./types";

/**
 * Process-global registry of products the shopper has actually seen, keyed by
 * lowercased Kapruka id.
 *
 * Why this exists: search_products' `toModelOutput` deliberately hands the model
 * only a lean text summary (name — price (id)) with NO image URL — we don't want
 * the model transcribing long CDN URLs, and it tends to echo rich JSON if given
 * it. So when the model later calls add_to_cart it can only supply id/name/price.
 * This registry lets the add_to_cart tool backfill the AUTHORITATIVE image_url
 * (and product url) from what Kapruka returned, so cart line items and the
 * checkout order card show real thumbnails instead of gray placeholders.
 *
 * Same lifecycle as the cart (src/lib/cart/cart.ts): in-memory, process-global,
 * not persisted — so both reset together on a cold start and stay consistent.
 */
type Entry = { image_url?: string; url?: string };

const registry = new Map<string, Entry>();

/** Record every product from a search / get_product result. */
export function rememberProducts(products: Product[]): void {
  for (const p of products) {
    if (!p?.id) continue;
    registry.set(p.id.toLowerCase(), { image_url: p.image_url, url: p.url });
  }
}

/** Look up a remembered product's image_url/url by id (case-insensitive). */
export function lookupProduct(id: string): Entry | undefined {
  return registry.get(id.toLowerCase());
}

/** Test/dev helper — wipe the registry. */
export function clearProductRegistry(): void {
  registry.clear();
}
