import { callKapruka } from "./client";
import { KaprukaError } from "./unwrap";
import type { CartItem } from "@/lib/cart/cart";
import type {
  CreateOrderResponse,
  OrderLine,
  OrderRecipient,
  OrderResult,
} from "./types";

/**
 * `kapruka_create_order` wrapper (Sprint 2).
 *
 * Maps our flat, conversationally-collected fields onto the MCP's nested
 * request shape:
 *  - recipient.name / recipient.phone           → recipient
 *  - recipient.address / .city / deliveryDate    → delivery (location_type:"house")
 *  - senderName                                  → sender
 * Always passes currency:"LKR" and response_format:"json".
 *
 * Never crashes the request path: any failure (rate-limit, network, validation)
 * is caught and returned as a typed `{ ok: false, message }` so the UI can
 * render a clean "let's try again" state instead of a raw error. Real judges
 * WILL hit the 30-orders/hour MCP limit during a demo.
 *
 * TODO(sprint3): support `icing_text` per cart item ("message on the cake").
 * TODO(sprint5): remove the console.log calls added here for rate-limit debugging.
 */
export class KaprukaOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KaprukaOrderError";
  }
}

export interface CreateOrderInput {
  items: CartItem[];
  recipient: OrderRecipient;
  deliveryDate: string;
  senderName: string;
  /** Optional fuller sender identity; guest defaults on the pay page if absent. */
  senderEmail?: string | null;
  senderPhone?: string | null;
  giftMessage?: string | null;
}

const FRIENDLY_FAILURE =
  "I couldn't create the order just now — Kapruka's checkout was briefly busy. " +
  "Let's try again in a moment 🙏";

/**
 * Build the WhatsApp "send to family to pay" share link. The message is warm,
 * short, and carries the pay URL; the 60-minute validity is stated so the payer
 * doesn't sit on it.
 */
export function buildWhatsAppShareUrl(payUrl: string): string {
  const text =
    "Hi! I picked a gift on Kapruka but I need help with the payment. " +
    "Could you pay this for me? It's valid for 60 minutes 🙏 " +
    payUrl;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function toLine(item: CartItem): OrderLine {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.price.amount,
    subtotal: item.price.amount * item.quantity,
    image_url: item.image_url,
  };
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<OrderResult> {
  // senderEmail / senderPhone are intentionally not destructured: the live MCP
  // sender schema rejects them (see the sender mapping below).
  const { items, recipient, deliveryDate, senderName, giftMessage } = input;

  // TODO(sprint5): drop this log once rate-limit debugging is done.
  console.log("[create_order] attempt", {
    items: items.map((i) => `${i.id}x${i.quantity}`),
    city: recipient.city,
    date: deliveryDate,
  });

  if (items.length === 0) {
    return { ok: false, message: "Your cart is empty — let's add a gift first." };
  }

  const params: Record<string, unknown> = {
    cart: items.map((i) => ({
      product_id: i.id,
      quantity: i.quantity,
      // TODO(sprint3): icing_text for cakes.
    })),
    recipient: { name: recipient.name, phone: recipient.phone },
    delivery: {
      address: recipient.address,
      city: recipient.city,
      date: deliveryDate,
      location_type: "house",
      ...(recipient.instructions
        ? { instructions: recipient.instructions }
        : {}),
    },
    // The live MCP `sender` schema accepts ONLY `name` — passing email/phone
    // triggers a Pydantic `extra_forbidden` error and fails the whole order.
    // We still accept senderEmail/senderPhone at the tool layer (approved API),
    // but do NOT forward them; the pay page uses guest defaults for those.
    sender: { name: senderName },
    ...(giftMessage ? { gift_message: giftMessage } : {}),
    currency: "LKR",
    response_format: "json",
  };

  try {
    const res = await callKapruka<CreateOrderResponse>(
      "kapruka_create_order",
      params,
    );

    const lines = items.map(toLine);
    const result: OrderResult = {
      ok: true,
      orderRef: res.order_ref,
      checkoutUrl: res.checkout_url,
      whatsappUrl: buildWhatsAppShareUrl(res.checkout_url),
      expiresAt: res.expires_at,
      currency: res.summary?.currency ?? "LKR",
      recipient,
      delivery: { date: deliveryDate, fee: res.summary?.delivery_fee ?? 0 },
      items: lines,
      giftMessage: giftMessage ?? null,
      senderName,
      itemsTotal: res.summary?.items_total ?? lines.reduce((s, l) => s + l.subtotal, 0),
      grandTotal: res.summary?.grand_total ?? 0,
    };

    console.log("[create_order] ok", { ref: result.orderRef });
    return result;
  } catch (err) {
    const detail = err instanceof KaprukaError ? err.message : String(err);
    console.error("[create_order] failed", { detail });
    return { ok: false, message: FRIENDLY_FAILURE };
  }
}
