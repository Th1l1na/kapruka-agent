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

// ---------------------------------------------------------------------------
// Sprint 2: delivery cities, delivery check, orders
// ---------------------------------------------------------------------------

/**
 * A canonical Kapruka delivery city, with the `aliases` quirk already
 * normalised. The raw MCP shape is `{ name, aliases: [" malabe thalahe ... "] }`
 * — a single space-separated string in a one-element array. `cities.ts` splits
 * it into individual alias tokens.
 */
export interface City {
  name: string;
  aliases: string[];
}

/** Raw `kapruka_list_delivery_cities` JSON payload (aliases un-normalised). */
export interface DeliveryCitiesResponse {
  cities: { name: string; aliases: string[] }[];
  total_matched: number;
  showing: number;
}

/** Result of resolving user-typed city input against the delivery-city list. */
export interface CityResolution {
  query: string;
  /** Best match (exact name → exact alias → first candidate), or null if none. */
  match: City | null;
  /** Up to 5 candidates for disambiguation (e.g. "colombo" → many zones). */
  candidates: City[];
}

/**
 * `kapruka_check_delivery` result, as a discriminated union over `mode`.
 *
 * Covers the four documented response modes (notes/data-shapes.md):
 *  - Modes 1 & 2 collapse into `available` (`perishableWarning: null` = Mode 2).
 *  - Mode 3 (slots full, server suggests a date) → `rescheduled`.
 *  - Mode 4 (past date) comes back as an `"Error:"` string that `unwrap` throws;
 *    `delivery.ts` catches it and maps it to `past_date` (never crashes).
 *  - `unavailable` is a defensive variant for `available:false` with no
 *    `next_available_date` (not documented, but we never want to crash).
 */
export type DeliveryResult =
  | {
      mode: "available";
      city: string;
      date: string;
      rate: number;
      currency: "LKR";
      perishableWarning: string | null;
    }
  | {
      mode: "rescheduled";
      city: string;
      date: string;
      nextAvailableDate: string;
      reason: string;
      rate: number;
      currency: "LKR";
      perishableWarning: string | null;
    }
  | { mode: "past_date"; message: string }
  | { mode: "unavailable"; city: string; date: string; reason: string };

/** Raw `kapruka_check_delivery` JSON payload (Modes 1–3; Mode 4 is a string). */
export interface CheckDeliveryResponse {
  city: string;
  now?: string;
  checked_date: string;
  available: boolean;
  rate: number;
  currency: "LKR";
  reason?: string | null;
  next_available_date?: string | null;
  perishable_warning?: string | null;
}

/** Raw `kapruka_create_order` JSON payload. */
export interface CreateOrderResponse {
  checkout_url: string;
  order_ref: string;
  summary: {
    items_total: number;
    delivery_fee: number;
    addons_total: number;
    grand_total: number;
    currency: string;
  };
  expires_at: string;
}

/** One line in the order confirmation, with a computed subtotal. */
export interface OrderLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  image_url?: string;
}

/** Recipient + delivery details we collected and echo back in the summary. */
export interface OrderRecipient {
  name: string;
  phone: string;
  address: string;
  city: string;
  instructions?: string;
}

/**
 * The rich payload the `create_order` tool returns and `OrderSummary` renders.
 * A discriminated union on `ok` so the UI can cleanly show either the
 * confirmation card or a "creation failed, let's try again" state.
 */
export type OrderResult =
  | {
      ok: true;
      orderRef: string;
      checkoutUrl: string;
      whatsappUrl: string;
      expiresAt: string;
      currency: string;
      recipient: OrderRecipient;
      delivery: { date: string; fee: number };
      items: OrderLine[];
      giftMessage?: string | null;
      senderName: string;
      itemsTotal: number;
      grandTotal: number;
    }
  | { ok: false; message: string };
