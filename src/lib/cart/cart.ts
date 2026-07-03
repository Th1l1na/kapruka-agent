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

export interface CartView {
  items: CartItem[];
  total: number;
  currency: string;
  itemCount: number;
}

const items = new Map<string, CartItem>();

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
  return getCart();
}

export function getCart(): CartView {
  const list = [...items.values()];
  const total = list.reduce((sum, i) => sum + i.price.amount * i.quantity, 0);
  const currency = list[0]?.price.currency ?? "LKR";
  const itemCount = list.reduce((n, i) => n + i.quantity, 0);
  return { items: list, total, currency, itemCount };
}
