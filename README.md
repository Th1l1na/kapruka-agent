# Kade — the Kapruka gift agent

> **Built so a grandmother could send a birthday cake to Kandy by talking — in Sinhala.**

### ▶️ Live demo: **https://REPLACE-WITH-YOUR-VERCEL-URL.vercel.app**

<!-- TODO(you): paste the real Vercel URL above before submitting. -->

Kade is a conversational gift-buying assistant for [Kapruka.com](https://kapruka.com),
Sri Lanka's largest e-commerce platform. Tell it who the gift is for — in **English,
Sinhala, or Tanglish** — and it finds the gift, collects the delivery details,
checks Kapruka's real delivery calendar, and hands back a click-to-pay link. No
forms, no menus, no English required.

---

## Try these

Type (or tap a suggestion) in any of the three languages. Use the toggle at the
top to switch — Kade replies in whatever you chose.

**English**
- `Send a birthday cake to my mother in Kandy on Sunday`
- `Two Children's Day gifts: doll to Malabe, Lego to Galle`
- `Flowers for my wife under LKR 5000, delivered tomorrow`

**සිංහල (Sinhala)**
- `ඉරිදාට අම්මට Kandy වලට උපන්දින කේක් එකක් යවන්න`
- `දූට සහ පුතාට Children's Day තෑගි දෙකක්`

**Tanglish**
- `Amma ta Kandy walata Sunday birthday cake ekak yawanna`
- `Wife ta LKR 5000 yatin flowers, heta deliver karanna`

---

## A completed order

![A completed Kapruka order in Kade, ready to pay](notes/screenshots/completed-order.png)

<!-- TODO(you): capture a real completed-order card (Sprint 3 grandma flow) and
     save it to notes/screenshots/completed-order.png. -->

---

## Why Sinhala-first

Most Sri Lankan e-commerce assumes an English-literate, form-comfortable shopper.
That quietly excludes the exact people who most want to send gifts home — elders,
and family sending from abroad who think in Sinhala. Kade is built the other way
round: colloquial spoken Sinhala is a first-class language, not a translation
layer. It speaks in the warm register of a village *kade mudalali*, understands
occasions (Poya, Vesak, Children's Day, birthdays) from natural phrasing, and
never forces a switch to English. The whole flow — search, delivery check,
recipient details, gift message, and pay link — happens in one unbroken
conversation in the shopper's own language.

---

## Tech stack

- **Next.js 16** (App Router, Node runtime) on **Vercel**
- **Vercel AI SDK v7** driving **Anthropic Claude Haiku 4.5** for the conversation and tool use
- **Kapruka MCP server** (`mcp.kapruka.com`) for live product search, delivery, and order creation
- **Tailwind CSS** for the UI (chat, product cards, order summary)
- Multi-recipient carts, batch checkout, and city resolution enforced in code, not just prompt

---

## Known limitations

Being honest about the edges, so nothing surprises you during judging:

- **Pay-page currency**: the Kapruka pay page shows currency based on the
  visitor's location — a judge in the US may see USD where the order was priced
  in LKR. The order total in Kade's own summary card is always the true LKR price.
- **Order tracking** needs the **VIMP…CB2** confirmation number that Kapruka
  emails *after* payment — Kade can't track from the `ORD…` reference alone
  (that's an order reference, not a courier tracking number).
- **Pay links expire after 60 minutes.** Kade shows a live countdown and offers
  to recreate an expired order with a fresh link.
- **Editing or cancelling** an order isn't supported yet — Kade says so if asked.
- The Kapruka catalogue is a **shared public MCP tier** (rate-limited). Under
  heavy load Kade shows a warm "catalogue is briefly busy" message and retries.

---

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Requires an `ANTHROPIC_API_KEY` (see [.env.example](.env.example)). The Kapruka
MCP endpoint is public — no key needed.

---

*Built for the Kapruka Agent Challenge 2026.*
