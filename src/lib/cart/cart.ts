import type { Price } from "@/lib/kapruka/types";

/**
 * Sprint 3 cart: process-global, in-memory, now keyed by RECIPIENT.
 *
 * Sprint 1/2 had a single global cart. Sprint 3 restructures to
 * `Map<cartKey, Cart>` so one shopper can build several gifts for several
 * people in one conversation ("a doll for my granddaughter AND a Lego for my
 * grandson") and check them all out in one batch.
 *
 * Still deliberately NOT persisted and NOT session-keyed — one process-global
 * map, same simplification as before (out of scope: persistence, per-session
 * carts). Backwards-compatible: a single-recipient flow just uses one implicit
 * "Default" cart, so the Sprint 2 experience is unchanged.
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
 * Recipient + delivery details for one cart, filled in INCREMENTALLY via
 * set_recipient (every field optional until checkout). `city` is stored as the
 * shopper typed it; checkout_all resolves it to a canonical Kapruka city.
 */
export interface RecipientInfo {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  deliveryDate?: string; // YYYY-MM-DD
  giftMessage?: string;
  instructions?: string;
}

/**
 * Cart lifecycle status.
 *  - "open": normal, accepting items and eligible for checkout_all.
 *  - "checked_out": a create_order succeeded against this cart. Items are kept
 *    (a 60-min pay link can expire and need the order recreated), but the NEXT
 *    add_to_cart to it starts its items fresh so a post-order "add another"
 *    doesn't silently stack onto an already-ordered cart.
 */
export type CartStatus = "open" | "checked_out";

export interface Cart {
  key: string; // normalised slug of displayName — the Map key
  displayName: string; // human name, e.g. "Grandson's gift"
  status: CartStatus;
  items: Map<string, CartItem>;
  recipient: RecipientInfo;
}

/** Required recipient fields for checkout, with friendly labels for prompts. */
const REQUIRED_FIELDS: { key: keyof RecipientInfo; label: string }[] = [
  { key: "name", label: "recipient name" },
  { key: "phone", label: "phone number" },
  { key: "address", label: "address" },
  { key: "city", label: "city" },
  { key: "deliveryDate", label: "delivery date" },
];

export const DEFAULT_CART_NAME = "Default";

/** One cart flattened for the model / list_carts (Maps → arrays). */
export interface CartSummaryView {
  cartName: string;
  status: CartStatus;
  itemCount: number;
  items: { id: string; name: string; quantity: number; unitPrice: number }[];
  total: number;
  currency: string;
  recipient: RecipientInfo;
  /** Friendly labels of required recipient fields still missing. */
  missing: string[];
  /** True when the cart has ≥1 item AND no required field is missing. */
  complete: boolean;
}

// The one process-global store. Iteration order = insertion order, which we
// rely on so the batch and read-back list carts in the order they were created.
const carts = new Map<string, Cart>();

/**
 * Normalise a display name to a stable match key: lowercase, strip anything
 * that isn't a letter/number to spaces, collapse runs. So "Nimal's gift",
 * "nimals gift" and "Nimal's  Gift" all key the same.
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function itemKeyOf(id: string): string {
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

// ---------------------------------------------------------------------------
// Cart resolution
// ---------------------------------------------------------------------------

export type ResolveResult =
  | { ok: true; cart: Cart }
  | { ok: false; reason: "ambiguous" | "not_found"; candidates: string[] };

/**
 * Find an existing cart by (fuzzy) name. The MODEL owns the semantic mapping
 * ("the boy's parcel" -> "Grandson's gift"); this only forgives casing,
 * punctuation and "gift"/"'s gift" wobble:
 *   1. exact normalised key
 *   2. unique substring match (either direction)
 * Ambiguous (>1) or no match returns the list of names so the caller can ask
 * or auto-create.
 */
export function findCart(name: string): ResolveResult {
  const q = normaliseName(name);
  const all = [...carts.values()];
  const exact = carts.get(q);
  if (exact) return { ok: true, cart: exact };

  // Compact form (spaces removed) so punctuation wobble collapses:
  // "grandsons gift" and "grandson s gift" (from "Grandson's gift") both become
  // "grandsonsgift".
  const compact = (s: string) => s.replace(/\s+/g, "");
  const qc = compact(q);
  const compactHit = all.filter((c) => compact(c.key) === qc);
  if (compactHit.length === 1) return { ok: true, cart: compactHit[0] };

  const partial = all.filter(
    (c) => c.key.includes(q) || q.includes(c.key),
  );
  if (partial.length === 1) return { ok: true, cart: partial[0] };
  if (partial.length > 1) {
    return { ok: false, reason: "ambiguous", candidates: partial.map((c) => c.displayName) };
  }
  return { ok: false, reason: "not_found", candidates: all.map((c) => c.displayName) };
}

function newCart(displayName: string): Cart {
  const key = normaliseName(displayName);
  const cart: Cart = {
    key,
    displayName: displayName.trim(),
    status: "open",
    items: new Map(),
    recipient: {},
  };
  carts.set(key, cart);
  return cart;
}

export type CreateCartResult =
  | { ok: true; cart: CartSummaryView }
  | { ok: false; message: string };

/** Start a new named cart. Rejects a duplicate name so routing stays unambiguous. */
export function createCart(displayName: string): CreateCartResult {
  const trimmed = displayName.trim();
  if (!trimmed) return { ok: false, message: "A cart needs a name." };
  const key = normaliseName(trimmed);
  if (carts.has(key)) {
    return {
      ok: false,
      message: `A cart named "${carts.get(key)!.displayName}" already exists. Use a distinct name.`,
    };
  }
  return { ok: true, cart: toView(newCart(trimmed)) };
}

/**
 * Resolve the target cart for add/remove/set operations.
 *  - no name -> the implicit "Default" cart (created on demand).
 *  - a name that matches -> that cart.
 *  - a name that matches NOTHING -> auto-create it (so "add X to Grandson's
 *    gift" works even if create_cart wasn't called first).
 *  - a name that is AMBIGUOUS -> null, so the caller asks which one.
 */
function resolveTarget(
  cartName?: string,
): { ok: true; cart: Cart } | { ok: false; candidates: string[] } {
  if (!cartName || !cartName.trim()) {
    const existing = carts.get(normaliseName(DEFAULT_CART_NAME));
    return { ok: true, cart: existing ?? newCart(DEFAULT_CART_NAME) };
  }
  const res = findCart(cartName);
  if (res.ok) return { ok: true, cart: res.cart };
  if (res.reason === "ambiguous") return { ok: false, candidates: res.candidates };
  return { ok: true, cart: newCart(cartName) }; // not_found -> auto-create
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type CartOpResult =
  | { ok: true; cart: CartSummaryView }
  | { ok: false; message: string };

function ambiguousMessage(candidates: string[]): string {
  return `That cart name matches more than one cart (${candidates.join(", ")}). Which one did you mean?`;
}

export function addToCart(cartName: string | undefined, input: AddInput): CartOpResult {
  const target = resolveTarget(cartName);
  if (!target.ok) return { ok: false, message: ambiguousMessage(target.candidates) };
  const cart = target.cart;

  // A checked-out cart is "sealed": the first add after an order clears its
  // items (but keeps the recipient) so the shopper isn't stacking onto an
  // already-ordered cart.
  if (cart.status === "checked_out") {
    cart.items.clear();
    cart.status = "open";
  }

  const key = itemKeyOf(input.id);
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const existing = cart.items.get(key);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.items.set(key, {
      id: input.id,
      name: input.name,
      price: { amount: input.amount, currency: input.currency ?? "LKR" },
      quantity: qty,
      image_url: input.image_url,
      url: input.url,
    });
  }
  return { ok: true, cart: toView(cart) };
}

export function removeFromCart(cartName: string | undefined, id: string): CartOpResult {
  const target = resolveTarget(cartName);
  if (!target.ok) return { ok: false, message: ambiguousMessage(target.candidates) };
  target.cart.items.delete(itemKeyOf(id));
  return { ok: true, cart: toView(target.cart) };
}

export function setRecipient(cartName: string, patch: RecipientInfo): CartOpResult {
  const target = resolveTarget(cartName);
  if (!target.ok) return { ok: false, message: ambiguousMessage(target.candidates) };
  const r = target.cart.recipient;
  // Partial update: only overwrite fields actually provided (non-empty).
  for (const [k, v] of Object.entries(patch) as [keyof RecipientInfo, string | undefined][]) {
    if (v != null && String(v).trim() !== "") r[k] = String(v).trim();
  }
  return { ok: true, cart: toView(target.cart) };
}

/** Seal a cart after a successful order (called by checkout_all per cart). */
export function markCartCheckedOut(key: string): void {
  const cart = carts.get(key);
  if (cart) cart.status = "checked_out";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Missing required recipient fields (friendly labels) for a cart. */
export function missingFields(cart: Cart): string[] {
  return REQUIRED_FIELDS.filter(
    ({ key }) => {
      const v = cart.recipient[key];
      return v == null || String(v).trim() === "";
    },
  ).map((f) => f.label);
}

function toView(cart: Cart): CartSummaryView {
  const items = [...cart.items.values()];
  const total = items.reduce((s, i) => s + i.price.amount * i.quantity, 0);
  const currency = items[0]?.price.currency ?? "LKR";
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const missing = missingFields(cart);
  return {
    cartName: cart.displayName,
    status: cart.status,
    itemCount,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.price.amount,
    })),
    total,
    currency,
    recipient: { ...cart.recipient },
    missing,
    complete: items.length > 0 && missing.length === 0,
  };
}

/** All carts, in creation order, flattened for the model / list_carts tool. */
export function listCarts(): CartSummaryView[] {
  return [...carts.values()].map(toView);
}

/** Live carts eligible for checkout: status "open" AND at least one item. */
export function openNonEmptyCarts(): Cart[] {
  return [...carts.values()].filter(
    (c) => c.status === "open" && c.items.size > 0,
  );
}

/** Test/dev helper — wipe all carts. */
export function clearAllCarts(): void {
  carts.clear();
}
