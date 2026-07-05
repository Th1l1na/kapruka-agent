import { resolveCity } from "@/lib/kapruka/cities";
import { checkDelivery } from "@/lib/kapruka/delivery";
import { createOrder } from "@/lib/kapruka/orders";
import {
  openNonEmptyCarts,
  missingFields,
  markCartCheckedOut,
  type Cart,
} from "./cart";
import type { CheckoutAllResult, CheckoutOutcome } from "@/lib/kapruka/types";

/**
 * Sprint 3 batch checkout.
 *
 * ONE atomic tool call that iterates every open, non-empty cart and, for each,
 * runs resolve_city -> check_delivery -> create_order. Rationale for one tool
 * (vs the model firing N sequential create_order calls):
 *  - keeps the model's tool-turn budget under Gemini free-tier limits
 *    (2 recipients would be 6+ sequential tool calls),
 *  - one clean CheckoutBatch render target,
 *  - partial-failure handling lives in ONE code path, not N.
 *
 * Partial failure NEVER aborts the batch: a cart that can't resolve its city,
 * has no delivery slot, or fails to create an order becomes a SOFT failure in
 * the results and is surfaced for retry. Other carts still complete.
 */
export interface CheckoutSender {
  senderName: string;
  senderEmail?: string;
  senderPhone?: string;
}

/** Perishable families (CAKE, FLOWER, COMBO) trigger the freshness warning. */
function pickPerishableId(ids: string[]): string | undefined {
  return ids.find((id) => /^(cake|flower|combo)/i.test(id)) ?? ids[0];
}

async function checkoutOne(
  cart: Cart,
  sender: CheckoutSender,
): Promise<CheckoutOutcome> {
  const r = cart.recipient;
  // Pre-flight already guaranteed these are present; assert for the type.
  const rawCity = r.city as string;
  const deliveryDate = r.deliveryDate as string;

  // 1) resolve_city — never pass raw user text onward.
  const resolution = await resolveCity(rawCity);
  if (!resolution.match) {
    return {
      status: "failed",
      cartName: cart.displayName,
      reason: `I couldn't find "${rawCity}" as a Kapruka delivery city. Please check the spelling or give a nearby town.`,
    };
  }
  const city = resolution.match.name;

  // 2) check_delivery — bail (soft) on anything that isn't an available slot,
  //    surfacing the server's suggested date so the UI can offer a rebook.
  const ids = [...cart.items.values()].map((i) => i.id);
  const delivery = await checkDelivery({
    city,
    date: deliveryDate,
    productId: ids.length ? pickPerishableId(ids) : undefined,
  });

  if (delivery.mode === "past_date") {
    return {
      status: "failed",
      cartName: cart.displayName,
      reason: `The delivery date for ${city} is in the past — please pick today or a future date.`,
    };
  }
  if (delivery.mode === "rescheduled") {
    return {
      status: "failed",
      cartName: cart.displayName,
      reason: `${city}'s slots on ${deliveryDate} are full. The earliest available is ${delivery.nextAvailableDate}.`,
      nextAvailableDate: delivery.nextAvailableDate,
    };
  }
  if (delivery.mode === "unavailable") {
    return {
      status: "failed",
      cartName: cart.displayName,
      reason: `Delivery to ${city} on ${deliveryDate} isn't available — please try a different date or nearby city.`,
    };
  }

  // 3) create_order — real pay link.
  const result = await createOrder({
    items: [...cart.items.values()],
    recipient: {
      name: r.name as string,
      phone: r.phone as string,
      address: r.address as string,
      city, // canonical
      instructions: r.instructions,
    },
    deliveryDate,
    senderName: sender.senderName,
    senderEmail: sender.senderEmail,
    senderPhone: sender.senderPhone,
    giftMessage: r.giftMessage ?? null,
  });

  if (!result.ok) {
    return { status: "failed", cartName: cart.displayName, reason: result.message };
  }

  markCartCheckedOut(cart.key);
  return { status: "success", cartName: cart.displayName, order: result };
}

export async function checkoutAll(sender: CheckoutSender): Promise<CheckoutAllResult> {
  const carts = openNonEmptyCarts();

  if (carts.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "There are no open carts with items to check out.",
    };
  }

  // ADDITION A — pre-flight validation. Before touching any MCP tool, confirm
  // every cart has complete-enough recipient details. If any is incomplete, we
  // return WITHOUT calling resolve_city / check_delivery / create_order, so a
  // partial batch never burns the shared Kapruka rate limit.
  const incomplete = carts
    .map((c) => ({ cartName: c.displayName, missing: missingFields(c) }))
    .filter((c) => c.missing.length > 0);
  if (incomplete.length > 0) {
    return { ok: false, reason: "incomplete", carts: incomplete };
  }

  // Sequential (not Promise.all): the MCP is one shared IP at 60 req/min and
  // 30 create_order/hour — parallel bursts risk tripping the limit mid-batch.
  const outcomes: CheckoutOutcome[] = [];
  for (const cart of carts) {
    outcomes.push(await checkoutOne(cart, sender));
  }

  const successCount = outcomes.filter((o) => o.status === "success").length;
  return {
    ok: true,
    outcomes,
    successCount,
    failureCount: outcomes.length - successCount,
  };
}
