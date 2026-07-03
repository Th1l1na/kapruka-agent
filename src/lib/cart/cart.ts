import type { Price } from "@/lib/kapruka/types";

/**
 * Sprint 1 cart: a single, deliberately dumb, module-level in-memory cart.
 *
 * NOT persisted and NOT keyed per session/user yet — one process-global cart.
 * This is intentional: Sprint 3 restructures for multi-recipient carts, and
 * keeping this trivial now makes that refactor clean. Do not add persistence
 * or session-keying here without that wider change.
 */
export interface CartItem {
  id: string;
  name: string;
  price: Price;
  quantity: number;
  image_url?: string;
  url?: string;
}

/**
 * Cart lifecycle status.
 *  - "open": normal, accepting items.
 *  - "checked_out": a create_order succeeded against this cart. We keep the
 *    items intact (the 60-min pay link can expire and need the order recreated),
 *    but the NEXT add_to_cart starts a fresh cart so post-order "add another"
 *    doesn't silently reopen an already-ordered cart.
 */
export type CartStatus = "open" | "checked_out";

export interface CartView {
  items: CartItem[];
  total: number;
  currency: string;
  itemCount: number;
  status: CartStatus;
}

const items = new Map<string, CartItem>();
let status: CartStatus = "open";

function keyOf(id: string): string {
  return id.toLowerCase(); // product IDs are case-insensitive on Kapruka
}

export interface AddInput {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  quantity?: number;
  image_url?: string;
  url?: string;
}

export function addToCart(input: AddInput): CartView {
  // A checked-out cart is "sealed": the first add after an order starts fresh
  // so the shopper isn't unknowingly stacking onto an already-ordered cart.
  if (status === "checked_out") {
    items.clear();
    status = "open";
  }
  const key = keyOf(input.id);
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const existing = items.get(key);
  if (existing) {
    existing.quantity += qty;
  } else {
    items.set(key, {
      id: input.id,
      name: input.name,
      price: { amount: input.amount, currency: input.currency ?? "LKR" },
      quantity: qty,
      image_url: input.image_url,
      url: input.url,
    });
  }
  return getCart();
}

export function removeFromCart(id: string): CartView {
  items.delete(keyOf(id));
  return getCart();
}

export function clearCart(): CartView {
  items.clear();
  status = "open";
  return getCart();
}

/**
 * Seal the cart after a successful create_order. Items are preserved (for the
 * recreate-on-expiry recovery path); the next add_to_cart starts fresh.
 */
export function markCheckedOut(): CartView {
  status = "checked_out";
  return getCart();
}

export function getCart(): CartView {
  const list = [...items.values()];
  const total = list.reduce((sum, i) => sum + i.price.amount * i.quantity, 0);
  const currency = list[0]?.price.currency ?? "LKR";
  const itemCount = list.reduce((n, i) => n + i.quantity, 0);
  return { items: list, total, currency, itemCount, status };
}
