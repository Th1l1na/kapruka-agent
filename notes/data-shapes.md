# Kapruka MCP — Data Shapes & Constraints Reference

Captured 12 June 2026 via MCP Inspector + claude.ai connector live tests.
Raw response files in `raw-responses/`.
This doc gets pasted into Claude Code context at the start of Sprint 1.

> **Corrected 2026-07-03 after Sprint 1 kickoff** (verified against live
> `mcp.kapruka.com` over raw streamable-HTTP / `@ai-sdk/mcp`):
> 1. **Every tool nests its arguments under a `params` object** — the original
>    capture missed this. `{"response_format":"json"}` → Pydantic
>    `params Field required` error. Correct shape: `{"params":{...}}`.
> 2. **The `{ "result": "<json string>" }` envelope does NOT exist over raw MCP.**
>    That was a claude.ai-connector artifact. Over `createMCPClient` the tool
>    result's content-text *is* the JSON payload — `JSON.parse` it **once**,
>    there is no `.result` field.
> 3. **`search_products` schema is `q` (not `query`), `limit` ≤ 50** (not 40),
>    `category` filters by **name**, plus free params: `in_stock_only`, `sort`,
>    `min_price`/`max_price`, `include_stubs`.
> Details inline in the affected sections below, marked ⟲.

---

## ⭐ Golden rule: always pass `response_format: "json"`

Default is markdown (human-readable). Pass `"json"` to every read tool —
**nested under `params`**: `{"params":{"response_format":"json", ...}}`. ⟲

⟲ **Envelope correction.** The original `{ "result": "<json string>" }`
double-wrap was a **claude.ai-connector** artifact. Over raw MCP
(`@ai-sdk/mcp` `createMCPClient`, which is how the Next backend talks to the
server) the tool result comes back as MCP content whose text field **is** the
JSON payload directly (e.g. `{"categories":[...]}`) — parse it **once**, there
is no `.result` key. Errors surface two ways: content text starting `"Error:"`
(validation) **and** an `isError:true` result whose text starts
`"Error executing tool ..."`. The real helper (see `src/lib/kapruka/unwrap.ts`):

```ts
// input = the MCP tool-result's text payload (a string)
function unwrap<T>(text: string): T {
  if (text.startsWith("Error:") || text.startsWith("Error executing tool")) {
    throw new KaprukaError(text);
  }
  return JSON.parse(text) as T; // parsed ONCE — payload directly, no .result
}
```

---

## Tool: `kapruka_list_categories`

Returns a flat list of ~60 category slugs. **No hierarchy.**

Slug casing is inconsistent — treat slugs as exact strings, never normalize:
`Automobile`, `cakes`, `Softtoy`, `pirikara`, `childrensday`.

### Slugs we'll use in the agent

- Gifting hero categories: `cakes`, `flowers`, `Softtoy`, `Chocolates`, `Personalized Gifts`
- Occasion shortcuts: `childrensday`, `birthday`, `anniversary`, `mother`, `lover`, `wedding`, `valentine`
- Sri Lanka cultural: `pirikara` (Buddhist offerings), `thaipongle`, `diwali`
- Operational filters: `samedaydelivery`, `bestsellers`, `newadditions`, `promotions`

### EXCLUDE from elder-mode and all default flows

`intimate_essentials` ("Adult Products"). Hard rule in system prompt.

---

## Tool: `kapruka_search_products`

⟲ **Input schema (verified live).** Args nest under `params`. Fields:
- `q` **(required, not `query`)** — string, **min 3 chars**, must contain
  specific terms (stopwords-only is rejected). Max 200 chars.
- `category` — filter by category **name** (e.g. `"Cakes"`, `"Birthday"`),
  case-insensitive. (Not the slug.)
- `limit` — 1–**50** (server max is 50, not 40). Default 10.
- `cursor` — pagination token from a prior `next_cursor`.
- `currency` — default `LKR`; also USD, GBP, AUD, CAD, EUR.
- `min_price` / `max_price` — inclusive, in requested currency.
- `in_stock_only` — bool, default false.
- `sort` — `relevance` (default) | `price_asc` | `price_desc` | `newest` | `bestseller`.
- `include_stubs` — default false already filters out CATSYM landing-page
  stubs (`price=0`), so we don't need to filter those client-side.
- `response_format` — `"json"`.

Pass `response_format: "json"`. Returns:
{
results: Product[],
next_cursor: string,        // pass back as cursor for next page
applied_filters: { ... }    // echoes the params used
}

### Product shape (what each result looks like)
id                      string   "CAKE00KA001685"
name                    string
summary                 string   noisy — see below
price.amount            number   5770
price.currency          string   "LKR"
compare_at_price        number | null
in_stock                boolean
stock_level             string   "low" | (others TBC)
image_url               string   full CDN URL with resize params
category.name           string   often "General" — not trustworthy here
category.slug           string   often "general" — DO NOT use for filtering
rating                  null     (no ratings exposed)
ships_internationally   boolean
url                     string   product page on kapruka.com

### What the card UI uses

`image_url`, `name`, `price.amount` + `price.currency`,
"Low stock" badge when `stock_level === "low"`, click-through to `url`.

### Behavior gotchas

- **Default limit returns few results.** Pass `limit: 40` for browsing.
- **If keyword search returns <3 results, fall back** to either a
  broader single-word query OR a `category` filter.
  Example: "birthday cake" + `limit:40` returns 40+ cakes. With default
  limit it returned 0 in one of our tests.
- **`summary` field has noisy breadcrumb prefix** —
  `"cakes - Kaprukacakes, Birthday, Birthday Kapruka Cakes The Springtime..."`
  Strip everything before the first proper sentence, or skip summary on cards.
- **Image URLs include CDN resize params** (`width=330,quality=93,f=auto`).
  Card uses 330px. For detail view, swap to a larger width in the URL.
- **`category` from `search_products` is unreliable** (always shows "general").
  Use `category` from `get_product` instead.
- **Product IDs are case-insensitive on lookup** but the server returns
  its canonical lowercase form. Compare IDs case-insensitively in code.

---

## Tool: `kapruka_get_product`

Richer than `search_products` row. Use for the product detail view.
id                          string   (canonical lowercase)
name                        string
description                 string   full paragraph(s)
description_format          "plain"
summary                     string   (same noisy prefix as search_products)
price.amount                number
price.currency              string
compare_at_price            number | null
in_stock                    boolean
stock_level                 string
category.id                 string   "cat_cakes"     ← trustworthy here
category.name               string   "cakes"
category.slug               string   "cakes"
category.path               string   "cakes"
variants                    Variant[]
images                      string[]                ← multiple images!
attributes.type             string
attributes.subtype          string
attributes.weight           string   e.g. "2.77" (Lbs for cakes)
attributes.vendor           string
shipping.ships_from         "LK"
shipping.ships_internationally  boolean
shipping.restricted_countries   string[]
rating                      null
url                         string

### Variant shape
id              string
name            string   "Default" if only one
sku             string
price.amount    number
price.currency  string
in_stock        boolean
stock_level     string
attributes      object   variant-specific (e.g. weight, size, flavor)

### What the detail view uses

- `images` — small gallery / carousel (most products have 1–3 images)
- `description` — main body text, after stripping prefix
- `attributes.weight` — surface for cakes/flowers ("1.25 kg")
- `variants` — Sprint 1: use `variants[0]` blindly. Sprint 4: variant selector if >1.
- `shipping.ships_internationally` — useful for diaspora-sender framing.

---

## Tool: `kapruka_list_delivery_cities`
{
cities: [ { name: string, aliases: [string] } ],
total_matched: number,
showing: number
}

### Hard rule for the agent

**Always resolve user-typed cities through this tool before passing to
`check_delivery` or `create_order`.** Never pass raw user input.

### Discovered behavior

- `aliases` is a list with a **single space-separated string**, not separate items.
  Split on whitespace to match individual aliases.
- Vernacular aliases are rich. Confirmed:
  `"malabe"` → canonical `"Malambe"`,
  aliases: `malabe thalahe thalahena akuregoda`.
  This means a grandmother typing "ආකුරේගොඩ" resolves correctly.
- City lookup is case-tolerant.

---

## Tool: `kapruka_check_delivery`

Pass `response_format: "json"`. Four distinct response modes:

### Mode 1 — Available, with perishable warning (far-future cake)
{
city: "Galle",
now: "2026-06-23T11:11:57+05:30",
checked_date: "2026-08-15",
available: true,
rate: 1090,
currency: "LKR",
perishable_warning: "Note: Product CAKE00KA001685 looks like a perishable item..."
}

### Mode 2 — Available, no warning (perishable + near date, or non-perishable any date)

Same as Mode 1 but `perishable_warning: null`. Don't render anything.

### Mode 3 — Slots full today, server suggests next date
{
city: "Galle",
available: false,
reason: "We've scheduled your delivery for tomorrow (24 / June)...",
next_available_date: "2026-06-24",
rate: 1090,
currency: "LKR",
perishable_warning: null
}

### Mode 4 — Past date error (NOT a JSON object)

`result` comes back as: `"Error: Bad request — {...Date is in the past...}"`
Detect via `result.startsWith("Error:")` and treat as validation error.

### Field reference
city                  string   echoed canonical name
now                   ISO datetime in IST (+05:30) — server clock
checked_date          "YYYY-MM-DD" echoed input
available             boolean
rate                  number   flat LKR fee
currency              "LKR"
reason                string | absent
next_available_date   "YYYY-MM-DD" | absent
perishable_warning    string | null

### KEY BEHAVIORS — bake into system prompt

- **`perishable_warning` is context-aware**, not a static product flag.
  Same cake → warning on Aug 15, no warning on tomorrow.
  Trust the server's decision; don't compute it client-side.
- **Never end on "unavailable" if `next_available_date` is present.**
  Always offer the suggested date conversationally:
  *"Today's slots for Galle are full — shall I deliver tomorrow instead?"*
- City input is case-tolerant (`"galle"` → `"Galle"` in response).
- Date format: `YYYY-MM-DD` only.

---

## Tool: `kapruka_create_order`

Not captured via Inspector (saves the rate-limit quota). Observed via
live test on claude.ai connector with a single doll order.

### What it accepts

`cart`, `recipient`, `delivery`, `sender`, `gift_message`, `currency`.
Always pass `currency: "LKR"` explicitly to prevent USD display on pay page.

### What it returns

A click-to-pay URL with pre-payment reference embedded:
https://www.kapruka.com/shops/checkout/securePayment.jsp?utm_source=checkout_continue
Order ref: ORD-YYYYMMDD-XXXX

The pay page itself renders an order summary on the right side
(recipient, address, items, gift message, total) — meaning when the
sender forwards the link via WhatsApp, the payer sees what was chosen
before paying. Free trust feature, no extra build.

### Two-stage order number model (CRITICAL)

- `create_order` returns a **pre-payment reference** like
  `ORD-20260612-3D8V`. This is **NOT trackable** via `track_order`.
- After successful payment, Kapruka emails the buyer a **confirmed
  order number** in the format `VIMPxxxxxCB2`.
- `track_order` **only works on the confirmed number**, not the pre-pay ref.

UX implication: in the "order created" screen, call it the
**order reference**, never **tracking number**. For tracking, prompt the
user to paste the confirmed number from their email.

### Pay link constraints

- **Valid 60 minutes from creation.** Prices locked for the same window.
- After expiry, the order must be recreated to get a fresh link.
- Even though we pass `currency: "LKR"`, the pay page may still display
  totals in USD depending on visitor geolocation — warn the user.

### "Amma picks, putha pays" feature (our core flow)

The pay URL is shareable. WhatsApp share template:
https://wa.me/?text=<URL-encoded message + pay link>

Always offer two buttons after order creation:
**Pay now**  ·  **Send to family to pay**

---

## Tool: `kapruka_track_order`

Takes the **confirmed order number** (VIMP...CB2 format), not the
pre-pay reference. Returns status, recipient, items, timestamped
progress events. Not captured in JSON mode yet — TODO Sprint 1.

UX rule: never auto-pass the pre-pay ref into `track_order`. Always
prompt the user: *"Please paste the order number from your Kapruka
confirmation email — it starts with VIMP."*

---

## Cross-cutting production constraints

### Cloudflare in front of the MCP

- Bot challenges hit raw automated clients (we saw 403s from Inspector
  during heavy use).
- Backend mitigations for Sprint 1:
  - **Aggressive cache** for `list_categories`, `search_products`,
    `get_product`, `list_delivery_cities` (15–30 min TTL).
  - **Retry with backoff** on HTML-bodied responses or 5xx — wait
    5–10s, retry once, don't hot-loop.
  - **Graceful user-facing fallback** — "Kapruka's catalog is briefly
    busy, let me try again in a moment 🙏"

### Rate limits (shared per IP)

- 60 requests/minute per client IP across all tools
- 30 `create_order` calls per hour per client IP
- Our backend = one IP for all users → these are **total**, not per-user
- Frontend NEVER calls MCP directly — always via Next.js backend
- Cache aggressively → fewer real MCP calls per user query

### Server caching on Kapruka's side

- Up to 30 min for product/category reads (per docs)
- Write endpoints never cached
- Our cache stacks in front; total latency for repeat queries is near-zero

---

## Agent behavior rules derived from Sprint 0

These belong in the system prompt as numbered rules:

1. Always pass `response_format: "json"` to every read tool.
2. Always resolve user-typed cities via `list_delivery_cities` before
   `check_delivery` or `create_order`. Never pass raw input.
3. Always pass `currency: "LKR"` to `create_order`.
4. Always pass `limit: 40` to `search_products` for browsing flows;
   smaller limits for "show me top 3" intent.
5. If `search_products` returns <3 results, retry with broader single
   word or matching `category` slug.
6. Exclude `intimate_essentials` from all searches in elder mode.
7. When `check_delivery` returns `available: false` with
   `next_available_date`, offer that date — never end on "unavailable."
8. When `perishable_warning` is a string, surface it prominently with
   icon. When null, don't mention perishability.
9. Call the pre-pay reference "order reference," never "tracking number."
10. For `track_order`, prompt for the VIMP...CB2 number from the
    confirmation email.
11. After `create_order`, present both Pay-now and Share-to-family options.
12. Mention the 60-minute pay link validity in friendly language
    ("tell putha to pay before lunch 😄").

---

## Things still to capture in Sprint 1

- `track_order` JSON shape (need a paid real order or a willing volunteer)
- `kapruka_create_order` full JSON request/response shape
- `stock_level` enum values beyond `"low"` (test products in different states)
- Cake-vs-flower-vs-combo: does `perishable_warning` say something
  different per type? Sprint 1 can test casually.

---

## Suggested file structure for Sprint 1
src/
lib/
kapruka/
client.ts         // MCP client + unwrap helper + retry/backoff
types.ts          // Product, Variant, City, DeliveryCheck types
cache.ts          // Read-tool cache layer
cities.ts         // City resolver wrapper
search.ts         // search_products with fallback strategy
delivery.ts       // check_delivery with next_available_date handling
orders.ts         // create_order + WhatsApp share URL builder
app/
api/chat/route.ts   // Gemini + tools
components/
chat/...
cards/ProductCard.tsx
canvas/GiftTable.tsx
prompts/
system.ts           // the kade mudalali prompt
