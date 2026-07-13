import { tool } from "ai";
import { z } from "zod";
import {
  createCart,
  addToCart,
  removeFromCart,
  setRecipient,
  listCarts,
  DEFAULT_CART_NAME,
} from "./cart";
import { checkoutAll } from "./checkout";
import { lookupProduct } from "@/lib/kapruka/product-registry";
import type { CheckoutAllResult } from "@/lib/kapruka/types";

/**
 * Sprint 3 cart tools — multi-recipient.
 *
 * Carts are keyed by a human display name ("Grandson's gift"). The MODEL owns
 * the semantic routing ("the boy's parcel" -> which cart); these tools only do
 * forgiving name matching (see cart.ts). `cartName` is optional everywhere and
 * defaults to the implicit "Default" cart, so a single-recipient conversation
 * behaves exactly like Sprint 2.
 */

export const createCartTool = tool({
  description:
    "Start a new named cart for one recipient. Call this IMMEDIATELY (without " +
    "asking permission) when the shopper mentions gifts for more than one " +
    "person in a single request. Name it from context, e.g. \"Grandson's gift\" " +
    'or the recipient\'s name. Multi-cart is for multi-RECIPIENT only — if ' +
    "several gifts go to ONE address, keep them in one cart.",
  inputSchema: z.object({
    displayName: z
      .string()
      .min(1)
      .describe('Human name for the cart, e.g. "Daughter\'s gift" or "Nimal".'),
  }),
  execute: async ({ displayName }) => createCart(displayName),
});

export const addToCartTool = tool({
  description:
    "Add a product to a cart. Use the id, name and price from a product the " +
    "shopper picked from search results. Pass cartName to route to a specific " +
    "recipient's cart; omit it for the single default cart.",
  inputSchema: z.object({
    cartName: z
      .string()
      .optional()
      .describe(
        `Which cart to add to, e.g. "Grandson's gift". Omit for the single "${DEFAULT_CART_NAME}" cart.`,
      ),
    id: z.string().min(3).describe("Kapruka product ID."),
    name: z.string().describe("Product name."),
    amount: z.number().min(0).describe("Unit price amount in LKR."),
    quantity: z.number().int().min(1).optional().describe("Defaults to 1."),
    image_url: z.string().optional(),
    url: z.string().optional(),
  }),
  execute: async ({ cartName, ...input }) => {
    // The model can't supply image_url/url (its view of search results is a lean
    // text summary), so backfill them from the product registry by id. This is
    // what makes real thumbnails show in the cart panel and the order card.
    const known = lookupProduct(input.id);
    return addToCart(cartName, {
      ...input,
      image_url: input.image_url ?? known?.image_url,
      url: input.url ?? known?.url,
      currency: "LKR",
    });
  },
});

export const removeFromCartTool = tool({
  description: "Remove a product from a cart by its Kapruka product ID.",
  inputSchema: z.object({
    cartName: z
      .string()
      .optional()
      .describe(`Which cart to remove from. Omit for the "${DEFAULT_CART_NAME}" cart.`),
    id: z.string().min(3).describe("Kapruka product ID to remove."),
  }),
  execute: async ({ cartName, id }) => removeFromCart(cartName, id),
});

export const setRecipientTool = tool({
  description:
    "Set or update the recipient + delivery details for a cart. Partial update " +
    "— pass only the fields you have; call again as more details arrive. City " +
    "is stored as typed and resolved to a canonical Kapruka city at checkout. " +
    "Required before checkout: name, phone, address, city, deliveryDate.",
  inputSchema: z.object({
    cartName: z
      .string()
      .describe(`Which cart these details belong to, e.g. "Grandson's gift".`),
    name: z.string().optional().describe("Recipient's name."),
    phone: z
      .string()
      .optional()
      .describe("Recipient phone, local (077...) or E.164 (+9477...)."),
    address: z.string().optional().describe("Street address."),
    city: z.string().optional().describe("City/town as the shopper typed it."),
    deliveryDate: z
      .string()
      .optional()
      .describe("Delivery date, YYYY-MM-DD (today or future)."),
    giftMessage: z.string().max(300).optional().describe("Optional gift-card message."),
    instructions: z
      .string()
      .optional()
      .describe("Optional delivery notes, only if volunteered."),
  }),
  execute: async ({ cartName, ...patch }) => setRecipient(cartName, patch),
});

export const listCartsTool = tool({
  description:
    "List every cart with its name, item count, running total, recipient " +
    "details, status, and which required fields are still missing. Use before " +
    "checkout to read each cart back to the shopper, and to re-sync cart names.",
  inputSchema: z.object({}),
  execute: async () => ({ carts: listCarts() }),
});

export const checkoutAllTool = tool({
  description:
    "Check out ALL open carts that have items, in one go. For each cart it " +
    "resolves the city, checks delivery, and creates a real click-to-pay order. " +
    "Call this ONLY after reading every cart back to the shopper and getting " +
    "confirmation. If any cart is missing required recipient fields, this returns " +
    "the gaps WITHOUT creating any order — collect them and call again. A " +
    "CheckoutBatch card with one pay link per recipient renders automatically.",
  inputSchema: z.object({
    senderName: z.string().min(1).describe("The sender's name for the gift cards."),
    senderEmail: z.string().optional().describe("Optional sender email."),
    senderPhone: z.string().optional().describe("Optional sender phone."),
  }),
  execute: async ({ senderName, senderEmail, senderPhone }) =>
    checkoutAll({ senderName, senderEmail, senderPhone }),
  // A CheckoutBatch card renders from this output. Steer the model per variant
  // so it prompts for gaps, retries soft failures, and never re-dumps the cards.
  toModelOutput: ({ output }) => {
    const r = output as CheckoutAllResult;

    if (!r.ok && r.reason === "incomplete") {
      const lines = r.carts
        .map((c) => `- ${c.cartName}: still needs ${c.missing.join(", ")}`)
        .join("\n");
      return {
        type: "text",
        value:
          `No orders were created — some carts are missing details. Warmly ask the ` +
          `shopper for exactly these, then call checkout_all again:\n${lines}`,
      };
    }
    if (!r.ok) {
      return {
        type: "text",
        value:
          `${r.message} Ask the shopper to add a gift to a cart before checking out.`,
      };
    }

    const parts = r.outcomes.map((o) =>
      o.status === "success"
        ? `- ${o.cartName}: order ${o.order.orderRef} created (LKR ${o.order.grandTotal}).`
        : `- ${o.cartName}: NOT ordered — ${o.reason}`,
    );
    const failed = r.failureCount > 0;
    return {
      type: "text",
      value:
        `${r.successCount} order(s) created, ${r.failureCount} still need attention. ` +
        `A CheckoutBatch card with the pay link(s) is ALREADY shown — do NOT repeat ` +
        `details or paste URLs. Summarise warmly: name each successful recipient and ` +
        `their total, and remind them each pay link is valid 60 minutes.` +
        (failed
          ? ` For each cart that needs attention, explain the reason and offer to fix ` +
            `it (e.g. a new delivery date), then check out again.`
          : ``) +
        `\n${parts.join("\n")}`,
    };
  },
});

export const cartTools = {
  create_cart: createCartTool,
  list_carts: listCartsTool,
  add_to_cart: addToCartTool,
  remove_from_cart: removeFromCartTool,
  set_recipient: setRecipientTool,
  checkout_all: checkoutAllTool,
};
