import { tool } from "ai";
import { z } from "zod";
import { callKapruka } from "./client";
import { cached } from "./cache";
import { searchProducts } from "./search";
import type { CategoriesResponse, Product } from "./types";

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
          "Min 3 chars; use specific terms, not stopwords only.",
      ),
    category: z
      .string()
      .optional()
      .describe(
        "Optional category NAME to narrow results, e.g. 'Cakes', 'Flowers', " +
          "'Chocolates'. Use a name from list_categories.",
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
    // Never let the model steer into the excluded category.
    const category = isExcludedCategoryName(args.category)
      ? undefined
      : args.category;

    const res = await searchProducts({ ...args, category });

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

export const kaprukaTools = {
  search_products: searchProductsTool,
  list_categories: listCategoriesTool,
  get_product: getProductTool,
};
