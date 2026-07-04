import { callKapruka } from "./client";
import { KaprukaError } from "./unwrap";
import type { CheckDeliveryResponse, DeliveryResult } from "./types";

/**
 * `kapruka_check_delivery` wrapper (Sprint 2).
 *
 * Passes `response_format:"json"` (this tool has no currency param — it always
 * returns a flat LKR rate). Delivery is a single shipment per order at one flat
 * rate regardless of item count, so only ONE representative `product_id` is
 * passed — used purely to trigger the perishable warning. The caller (the tool
 * layer) picks the perishable item on a mixed cart.
 *
 * Returns a discriminated union over `mode` covering all four documented modes
 * (notes/data-shapes.md). Crucially, Mode 4 (past date) comes back as an
 * `"Error:"` string that `unwrap` THROWS as a KaprukaError — we catch it here
 * and map to `past_date` so a bad date never crashes the request path.
 *
 * Not cached: availability is time-sensitive ("slots full today" flips).
 */
export interface CheckDeliveryOptions {
  city: string;
  date?: string;
  /** Optional single product id (perishable-family id enables the warning). */
  productId?: string;
}

const PAST_DATE_RE = /date is in the past|past/i;

export async function checkDelivery(
  o: CheckDeliveryOptions,
): Promise<DeliveryResult> {
  const params: Record<string, unknown> = {
    city: o.city,
    response_format: "json",
  };
  if (o.date) params.delivery_date = o.date;
  if (o.productId) params.product_id = o.productId;

  let res: CheckDeliveryResponse;
  try {
    res = await callKapruka<CheckDeliveryResponse>(
      "kapruka_check_delivery",
      params,
    );
  } catch (err) {
    // Mode 4: past-date validation error arrives as an "Error:" string.
    if (err instanceof KaprukaError && PAST_DATE_RE.test(err.message)) {
      return { mode: "past_date", message: err.message };
    }
    throw err;
  }

  const perishableWarning = res.perishable_warning ?? null;

  if (res.available) {
    // Modes 1 & 2 — the null warning is Mode 2.
    return {
      mode: "available",
      city: res.city,
      date: res.checked_date,
      rate: res.rate,
      currency: "LKR",
      perishableWarning,
    };
  }

  if (res.next_available_date) {
    // Mode 3 — server auto-suggested a date; never end on "unavailable".
    return {
      mode: "rescheduled",
      city: res.city,
      date: res.checked_date,
      nextAvailableDate: res.next_available_date,
      reason: res.reason ?? "That date's slots are full.",
      rate: res.rate,
      currency: "LKR",
      perishableWarning,
    };
  }

  // Defensive: unavailable with no suggested date (undocumented).
  return {
    mode: "unavailable",
    city: res.city,
    date: res.checked_date,
    reason: res.reason ?? "We can't deliver to that city on that date.",
  };
}
