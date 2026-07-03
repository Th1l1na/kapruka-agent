import { tool } from "ai";
import { z } from "zod";
import { addToCart, removeFromCart, getCart } from "./cart";

/**
 * AI SDK tools for the conversational cart. The model supplies product
 * details (id/name/price) from the search results it has already seen, so no
 * extra MCP round-trip is needed to add an item.
 */
export const addToCartTool = tool({
  description:
    "Add a product to the shopping cart. Use the id, name and price from a " +
    "product the shopper picked from search results.",
  inputSchema: z.object({
    id: z.string().min(3).describe("Kapruka product ID."),
    name: z.string().describe("Product name."),
    amount: z.number().min(0).describe("Unit price amount in LKR."),
    quantity: z.number().int().min(1).optional().describe("Defaults to 1."),
    image_url: z.string().optional(),
    url: z.string().optional(),
  }),
  execute: async (input) => {
    const cart = addToCart({ ...input, currency: "LKR" });
    return { ok: true, cart };
  },
});

export const removeFromCartTool = tool({
  description: "Remove a product from the cart by its Kapruka product ID.",
  inputSchema: z.object({
    id: z.string().min(3).describe("Kapruka product ID to remove."),
  }),
  execute: async ({ id }) => {
    const cart = removeFromCart(id);
    return { ok: true, cart };
  },
});

export const viewCartTool = tool({
  description: "View the current cart contents and running total (LKR).",
  inputSchema: z.object({}),
  execute: async () => ({ cart: getCart() }),
});

export const cartTools = {
  add_to_cart: addToCartTool,
  remove_from_cart: removeFromCartTool,
  view_cart: viewCartTool,
};
