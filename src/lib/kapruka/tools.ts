import { tool } from "ai";
import { z } from "zod";
import { callKapruka } from "./client";
import { cached } from "./cache";
import { searchProducts } from "./search";
import { resolveCity } from "./cities";
import { checkDelivery } from "./delivery";
import { createOrder } from "./orders";
import { getCart, markCheckedOut } from "@/lib/cart/cart";
import type {
  CategoriesResponse,
  CityResolution,
  DeliveryResult,
  OrderResult,
  Product,
} from "./types";

/**
 * AI SDK tool definitions exposed to Gemini.
 *
 * These are OUR tools, not the raw MCP tools: the model sees clean, flat args
 * (no `params` nesting), and each `execute` injects the Sprint-0 rules
 * (response_format:"json", currency:"LKR", limit, adult-category exclusion),
 * unwraps to typed JSON, caches, and returns structured data the chat UI
 * renders as ProductCards.
 *
 * Sprint 1 wires 3 read tools: search_products, list_categories, get_product.
 * (list_delivery_cities / check_delivery / orders wait for Sprint 2.)
 */
const CATEGORY_TTL_MS = 30 * 60 * 1000;
const PRODUCT_TTL_MS = 15 * 60 * 1000;

const EXCLUDED_CATEGORY_SLUG = "intimate_essentials";
const EXCLUDED_CATEGORY_NAME = "adult products";

function isExcludedCategoryName(name?: string): boolean {
  const n = (name ?? "").toLowerCase();
  return n === EXCLUDED_CATEGORY_NAME || n.includes("intimate");
}

export const searchProductsTool = tool({
  description:
    "Search Kapruka's catalogue for gifts by keyword. Returns product cards " +
    "(name, LKR price, image, stock, link). Use for any 'find / show me / " +
    "looking for a gift' intent. Adult products are always excluded.",
  inputSchema: z.object({
    q: z
      .string()
      .min(3)
      .describe(
        "Search keywords, e.g. 'birthday cake', 'roses for mom'. " +
          "Min 3 chars; use specific terms, not stopwords only. For " +
          "occasion-based requests, pass the shopper's full phrase as the query.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Result count (default 40 for browsing; ~3 for 'show a couple')."),
    sort: z
      .enum(["relevance", "price_asc", "price_desc", "newest", "bestseller"])
      .optional(),
    minPrice: z.number().min(0).optional().describe("Minimum price in LKR."),
    maxPrice: z.number().min(0).optional().describe("Maximum price in LKR."),
    inStockOnly: z.boolean().optional(),
  }),
  execute: async (args) => {
    // Category filtering is disabled: Kapruka's category taxonomy is unreliable
    // (e.g. "cakes" resolves to bakeware, not edible cakes). We always search by
    // keyword only, so no category is ever passed through.
    const res = await searchProducts({ ...args, category: undefined });

    // Defence-in-depth (per-result category is unreliable but cheap to check).
    const products = res.results.filter(
      (p) =>
        (p.category?.slug ?? "").toLowerCase() !== EXCLUDED_CATEGORY_SLUG &&
        !isExcludedCategoryName(p.category?.name),
    );

    return {
      count: products.length,
      products,
      next_cursor: res.next_cursor ?? null,
    };
  },
  // The UI renders full product cards from this tool's output (image, price,
  // link — see MessageList/ProductGrid). The MODEL, however, must not see that
  // rich JSON: gemini-2.5-flash tends to echo it verbatim into the chat as a
  // raw blob. So we hand the model a lean text summary instead — enough to
  // write a warm line and to map "the black one" -> an id for add_to_cart, with
  // an explicit reminder that the cards are already on screen.
  toModelOutput: ({ output }) => {
    const { count, products } = output as {
      count: number;
      products: Product[];
    };
    if (count === 0) {
      return {
        type: "text",
        value: "No products found. Suggest a different or simpler keyword.",
      };
    }
    const lines = products
      .map((p) => `- ${p.name} — ${p.price.currency} ${p.price.amount} (id: ${p.id})`)
      .join("\n");
    return {
      type: "text",
      value:
        `${count} product card(s) are ALREADY shown to the shopper (with names, ` +
        `prices, images and links). Do NOT repeat this list in your reply and do ` +
        `NOT paste any of it as JSON — just add one short warm line and a follow-up ` +
        `question. The items below are for your reference only, e.g. to resolve ` +
        `which product the shopper means when adding to the cart:\n${lines}`,
    };
  },
});

export const listCategoriesTool = tool({
  description:
    "List Kapruka's top-level product categories (names + browse URLs). Call " +
    "this once early in a conversation to learn the category vocabulary before " +
    "searching. Adult products are excluded.",
  inputSchema: z.object({}),
  execute: async () => {
    const data = await cached("categories:json", CATEGORY_TTL_MS, () =>
      callKapruka<CategoriesResponse>("kapruka_list_categories", {
        response_format: "json",
      }),
    );
    const categories = data.categories.filter(
      (c) =>
        !c.url.toLowerCase().includes(EXCLUDED_CATEGORY_SLUG) &&
        !isExcludedCategoryName(c.name),
    );
    return { count: categories.length, categories };
  },
});

export const getProductTool = tool({
  description:
    "Fetch full details for one product by its Kapruka product ID (from a " +
    "search result). Use when the shopper wants more detail about a specific item.",
  inputSchema: z.object({
    id: z
      .string()
      .min(3)
      .describe("Kapruka product ID, e.g. 'CAKE00KA001685' (case-insensitive)."),
  }),
  execute: async ({ id }) => {
    const key = `product:${id.toLowerCase()}`;
    // get_product returns a richer superset of Product; typed loosely for now
    // (full shape not yet JSON-verified — see notes/data-shapes.md TODO).
    return cached(key, PRODUCT_TTL_MS, () =>
      callKapruka<Product & Record<string, unknown>>("kapruka_get_product", {
        product_id: id,
        currency: "LKR",
        response_format: "json",
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// Sprint 2: delivery + checkout tools
// ---------------------------------------------------------------------------

/** Perishable families (CAKE, FLOWER, COMBO codes) trigger check_delivery's warning. */
function pickPerishableId(ids: string[]): string | undefined {
  return ids.find((id) => /^(cake|flower|combo)/i.test(id)) ?? ids[0];
}

export const resolveCityTool = tool({
  description:
    "Resolve a user-typed Sri Lankan city/town to its canonical Kapruka " +
    "delivery-city name. ALWAYS call this before check_delivery or create_order " +
    "— never pass raw user-typed city text to those. Handles vernacular spellings " +
    "and aliases (e.g. 'Malabe' -> 'Malambe'). Returns the best match plus other " +
    "candidates for disambiguation.",
  inputSchema: z.object({
    city: z
      .string()
      .min(2)
      .describe("The city/town exactly as the shopper typed it, e.g. 'Malabe'."),
  }),
  execute: async ({ city }) => resolveCity(city),
  toModelOutput: ({ output }) => {
    const { query, match, candidates } = output as CityResolution;
    if (!match) {
      return {
        type: "text",
        value:
          `No Kapruka delivery city matched "${query}". Ask the shopper to ` +
          `re-check the spelling or give a nearby town.`,
      };
    }
    const others = candidates
      .filter((c) => c.name !== match.name)
      .map((c) => c.name);
    const aliasHint = match.aliases.length
      ? ` (aliases: ${match.aliases.slice(0, 4).join(", ")})`
      : "";
    const disambig = others.length
      ? ` Other possible matches: ${others.join(", ")}. If ambiguous, ask which one.`
      : "";
    return {
      type: "text",
      value:
        `Canonical city: "${match.name}"${aliasHint}. Confirm this back to the ` +
        `shopper before proceeding (e.g. "${query} is ${match.name} in our ` +
        `system — is that right?").${disambig} Use "${match.name}" as the city ` +
        `for check_delivery and create_order.`,
    };
  },
});

export const checkDeliveryTool = tool({
  description:
    "Check whether Kapruka can deliver to a CANONICAL city (from resolve_city) " +
    "on a given date, and the flat delivery fee (LKR). Pass the cart's product " +
    "IDs so a freshness warning can be raised for perishable gifts (cakes/flowers). " +
    "Delivery is one flat fee per order regardless of item count.",
  inputSchema: z.object({
    city: z
      .string()
      .min(2)
      .describe("Canonical city name from resolve_city — NOT raw user text."),
    date: z
      .string()
      .optional()
      .describe("Delivery date, YYYY-MM-DD (Sri Lanka time). Omit to check today."),
    productIds: z
      .array(z.string())
      .optional()
      .describe("Cart product IDs; used to detect perishable items for a warning."),
  }),
  execute: async ({ city, date, productIds }) => {
    const productId = productIds?.length ? pickPerishableId(productIds) : undefined;
    return checkDelivery({ city, date, productId });
  },
  // No card renders for this tool — the model narrates the outcome. Give it the
  // exact conversational move for each mode so it never dead-ends on "unavailable".
  toModelOutput: ({ output }) => {
    const r = output as DeliveryResult;
    if (r.mode === "past_date") {
      return {
        type: "text",
        value:
          "That delivery date is in the past. Warmly ask the shopper for a " +
          "today-or-future date, then check again.",
      };
    }
    if (r.mode === "unavailable") {
      return {
        type: "text",
        value:
          `Delivery to ${r.city} isn't available for ${r.date} and no alternative ` +
          `was suggested. Apologise gently and ask for a different date or nearby city.`,
      };
    }
    const warn = r.perishableWarning
      ? ` IMPORTANT perishable note to surface prominently BEFORE confirming the ` +
        `order: "${r.perishableWarning}"`
      : "";
    if (r.mode === "rescheduled") {
      return {
        type: "text",
        value:
          `Requested date is full for ${r.city}. The server suggests ` +
          `${r.nextAvailableDate}. Offer this conversationally (e.g. "today's slots ` +
          `are full — shall I deliver on ${r.nextAvailableDate} instead?"). Do NOT ` +
          `end on "unavailable". Flat delivery fee is LKR ${r.rate}.${warn}`,
      };
    }
    return {
      type: "text",
      value:
        `Delivery to ${r.city} on ${r.date} is available. Flat delivery fee is ` +
        `LKR ${r.rate}.${warn}`,
    };
  },
});

export const createOrderTool = tool({
  description:
    "Create the Kapruka order and return a click-to-pay link. Call this ONLY " +
    "after reading back the full order summary and getting explicit shopper " +
    "confirmation. Uses the current cart. City MUST be the canonical name from " +
    "resolve_city. An order-summary card renders automatically from the result.",
  inputSchema: z.object({
    recipient: z
      .object({
        name: z.string().min(1).describe("Recipient's name."),
        phone: z
          .string()
          .min(7)
          .describe("Recipient phone, local (077...) or E.164 (+9477...)."),
        address: z.string().min(3).describe("Street address."),
        city: z
          .string()
          .min(2)
          .describe("Canonical city from resolve_city — NOT raw user text."),
        instructions: z
          .string()
          .optional()
          .describe("Optional delivery notes, only if the shopper volunteered them."),
      })
      .describe("Recipient + delivery details."),
    deliveryDate: z.string().describe("Delivery date, YYYY-MM-DD (today or future)."),
    senderName: z.string().min(1).describe("The sender's name for the gift card."),
    giftMessage: z
      .string()
      .max(300)
      .optional()
      .describe("Optional gift-card message."),
  }),
  execute: async ({ recipient, deliveryDate, senderName, giftMessage }) => {
    const cart = getCart();
    const result = await createOrder({
      items: cart.items,
      recipient,
      deliveryDate,
      senderName,
      giftMessage,
    });
    if (result.ok) markCheckedOut();
    return result;
  },
  // The OrderSummary card (with Pay-now / Send-to-family buttons and the pay
  // link) renders from this output — keep the model from re-dumping it.
  toModelOutput: ({ output }) => {
    const r = output as OrderResult;
    if (!r.ok) {
      return {
        type: "text",
        value:
          `Order creation failed: ${r.message} Apologise warmly and offer to try ` +
          `again in a moment. Do not invent an order reference.`,
      };
    }
    return {
      type: "text",
      value:
        `Order created. An order-summary card with "Pay now" and "Send to family ` +
        `to pay" buttons and the pay link is ALREADY shown to the shopper — do NOT ` +
        `repeat the details or paste the URL. Refer to ${r.orderRef} as the ` +
        `"order reference" (NEVER a tracking number). Remind them warmly the pay ` +
        `link is valid for 60 minutes. Add one short warm line, e.g. inviting them ` +
        `to pay now or forward it to family.`,
    };
  },
});

export const kaprukaTools = {
  search_products: searchProductsTool,
  list_categories: listCategoriesTool,
  get_product: getProductTool,
  resolve_city: resolveCityTool,
  check_delivery: checkDeliveryTool,
  create_order: createOrderTool,
};
