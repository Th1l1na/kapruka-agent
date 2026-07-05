/**
 * Language support for the Kapruka gift agent (Sprint 4).
 *
 * Single source of truth shared by the chat UI (toggle, opener, suggestion
 * chips) and the API route (system-prompt directive). Language is React-state
 * only — it is passed to the route on every turn and never persisted.
 */

export type Language = "english" | "tanglish" | "sinhala";

export const DEFAULT_LANGUAGE: Language = "english";

/** Labels for the three-option segmented control at the top of the chat. */
export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "english", label: "English" },
  { value: "tanglish", label: "Tanglish" },
  { value: "sinhala", label: "සිංහල" },
];

/** Narrows an untrusted body value to a Language, falling back to the default. */
export function toLanguage(value: unknown): Language {
  return value === "sinhala" || value === "tanglish" || value === "english"
    ? value
    : DEFAULT_LANGUAGE;
}

/**
 * Empty-state opener — teaches a first-time judge what to try in ~10 seconds.
 * The subtitle carries a gentle language-toggle hint (Sprint 4); the two
 * SUGGESTIONS chips below demo Sprint 2 (single delivery) and Sprint 3
 * (multi-recipient) with one tap.
 */
export const OPENERS: Record<Language, { title: string; subtitle: string }> = {
  english: {
    title: "Hi! I’m Kade 🎁",
    subtitle:
      "Your gift-giving helper for Kapruka. Try one of these — or just tell me who the gift is for. Switch to සිංහල anytime and I’ll speak your language 😊",
  },
  tanglish: {
    title: "Hi! Mama Kade 🎁",
    subtitle:
      "Kapruka eken gifts yawanna mama udaw karannam. Mehema ekak try karanna — nætnam kaatada gift eka kiyanna. Ona welawaka language eka maaru karanna puluwan 😊",
  },
  sinhala: {
    title: "ආයුබෝවන්! මම Kade 🎁",
    subtitle:
      "Kapruka එකෙන් තෑගි යවන්න මම උදව් කරන්නම්. මේ වගේ එකක් try කරන්න — නැත්නම් කාටද තෑග්ග කියන්න. ඕන වෙලාවක භාෂාව මාරු කරන්නත් පුළුවන් 😊",
  },
};

/**
 * Suggestion chips shown on the empty state, per toggle. Exactly two, mapped
 * to the demo range: [0] Sprint 2 (single recipient, city + date), [1] Sprint 3
 * (two recipients, two cities in one phrase). One tap sends the phrase.
 */
export const SUGGESTIONS: Record<Language, string[]> = {
  english: [
    "Send a birthday cake to my mother in Kandy on Sunday",
    "Two Children’s Day gifts: doll to Malabe, Lego to Galle",
  ],
  tanglish: [
    "Amma ta Kandy walata Sunday birthday cake ekak yawanna",
    "Children’s Day gifts dekak: Malabe ta bonikkek, Galle ta Lego",
  ],
  sinhala: [
    "ඉරිදාට අම්මට Kandy වලට උපන්දින කේක් එකක් යවන්න",
    "Children’s Day තෑගි දෙකක්: Malabe වලට බෝනික්කෙක්, Galle වලට Lego",
  ],
};

const LANGUAGE_NAME: Record<Language, string> = {
  english: "English",
  tanglish: "Tanglish (Sinhala words in Latin script mixed with English)",
  sinhala: "Sinhala (colloquial spoken)",
};

/**
 * The per-turn language directive appended to the system prompt. The current
 * toggle selection is passed to the model on every turn.
 */
export function languageDirective(language: Language): string {
  return (
    `The user's language preference is currently: ${LANGUAGE_NAME[language]}. ` +
    `Respond in that language. If Sinhala, use colloquial spoken Sinhala (not ` +
    `formal written), the register a warm village shopkeeper would use. If ` +
    `Tanglish, mix Sinhala words in Latin script with English naturally — e.g. ` +
    `'මට කේක් එකක් oney' style. If English, warm plain English. NEVER switch ` +
    `mid-reply unless quoting a product name.`
  );
}

/**
 * Sprint 5 — localized UI micro-copy for the surfaces judges actually see:
 * loading lines while a tool runs, empty-results, the expired pay-link note,
 * batch "needs attention" chrome, and button labels. Threaded from the current
 * toggle through the components (never persisted). Dynamic content authored
 * server-side (e.g. a soft-fail reason with a city name) is re-voiced in
 * language by the model, so only the presentational strings live here.
 */
export interface UiCopy {
  /** "Try again" — error banner + retry buttons. */
  tryAgain: string;
  /** Shown between a user turn and the first token. */
  thinking: string;
  /** Fallback loading line for an unmapped tool. */
  working: string;
  /** ProductGrid when a search returns nothing. */
  emptyResults: string;
  /** Warm one-liner per tool while it is still running (keyed by tool name). */
  toolLabels: Record<string, string>;
  order: {
    /** Countdown label once the 60-minute window closes. */
    expired: string;
    /** Caption under the live countdown. */
    payLinkValid: string;
    /** Caption under the countdown once expired. */
    payLink: string;
    /** Note shown at the foot of an expired order card. */
    expiredNote: string;
    /** "Copy pay link" text button under the order actions. */
    copyPayLink: string;
    /** Brief confirmation shown for 2s after copying the pay link. */
    copied: string;
  };
  batch: {
    /** Suffix in "{cart} — {needsAttention}". */
    needsAttention: string;
    /** Rebook button; "{date}" is replaced with the formatted next date. */
    bookInstead: string;
  };
  /** Screen-reader labels for the theme toggle (aria-label only). */
  themeToggle: {
    /** Announced when the button will switch the UI to light mode. */
    toLight: string;
    /** Announced when the button will switch the UI to dark mode. */
    toDark: string;
  };
  /** The additive cart panel (right rail on desktop / bottom drawer on mobile). */
  cart: {
    /** Panel heading. */
    title: string;
    /** Shown when there are no carts with items. */
    empty: string;
    /** Per-cart subtotal row. */
    subtotal: string;
    /** Combined total across carts. */
    total: string;
    /** Pay-now button (same URL/handler as the OrderSummary button). */
    payNow: string;
    /** Send-to-family button (same URL/handler as OrderSummary). */
    sendToFamily: string;
    /** aria-label for the collapsed launcher button. */
    open: string;
    /** aria-label for the panel close button. */
    close: string;
  };
}

const TOOL_LABELS_EN: Record<string, string> = {
  search_products: "Looking through the Kapruka catalogue…",
  list_categories: "Checking Kapruka’s gift categories…",
  get_product: "Fetching the details…",
  create_cart: "Starting a new gift…",
  list_carts: "Reviewing your gifts…",
  add_to_cart: "Adding to your cart…",
  remove_from_cart: "Updating your cart…",
  set_recipient: "Noting the delivery details…",
  resolve_city: "Finding that city on Kapruka…",
  check_delivery: "Checking if we can deliver…",
  checkout_all: "Placing your order — one moment…",
};

const TOOL_LABELS_SI: Record<string, string> = {
  search_products: "Kapruka එකේ තෑගි හොයනවා…",
  list_categories: "තෑගි වර්ග බලනවා…",
  get_product: "විස්තර ගේනවා…",
  create_cart: "අලුත් තෑග්ගක් පටන් ගන්නවා…",
  list_carts: "ඔයාගෙ තෑගි බලනවා…",
  add_to_cart: "කරත්තෙට එකතු කරනවා…",
  remove_from_cart: "කරත්තෙ update කරනවා…",
  set_recipient: "බෙදාහරින විස්තර සටහන් කරනවා…",
  resolve_city: "ඒ නගරේ හොයනවා…",
  check_delivery: "බෙදාහැරීම පුළුවන්ද කියලා බලනවා…",
  checkout_all: "ඔයාගෙ order එක හදනවා — පොඩ්ඩක් ඉන්න…",
};

const TOOL_LABELS_TA: Record<string, string> = {
  search_products: "Kapruka catalogue eke hoyanawa…",
  list_categories: "Gift categories balanawa…",
  get_product: "Details gannawa…",
  create_cart: "Aluth gift ekak patan ganna…",
  list_carts: "Oyage gifts balanawa…",
  add_to_cart: "Cart ekata add karanawa…",
  remove_from_cart: "Cart eka update karanawa…",
  set_recipient: "Delivery details satahan karanawa…",
  resolve_city: "Ee town eka hoyanawa…",
  check_delivery: "Deliver karanna puluwanda balanawa…",
  checkout_all: "Oyage order eka hadanawa — poddak inna…",
};

export const COPY: Record<Language, UiCopy> = {
  english: {
    tryAgain: "Try again",
    thinking: "Thinking…",
    working: "Working…",
    emptyResults: "No matching gifts found — try a different keyword.",
    toolLabels: TOOL_LABELS_EN,
    order: {
      expired: "Expired",
      payLinkValid: "pay link valid",
      payLink: "pay link",
      expiredNote:
        "The 60-minute window closed — ask me to recreate the order for a fresh pay link.",
      copyPayLink: "Copy pay link",
      copied: "Copied!",
    },
    batch: {
      needsAttention: "needs attention",
      bookInstead: "Book {date} instead",
    },
    themeToggle: {
      toLight: "Switch to light mode",
      toDark: "Switch to dark mode",
    },
    cart: {
      title: "Your cart",
      empty: "No gifts in your cart yet.",
      subtotal: "Subtotal",
      total: "Total",
      payNow: "Pay now",
      sendToFamily: "Send to family to pay",
      open: "Open cart",
      close: "Close cart",
    },
  },
  sinhala: {
    tryAgain: "ආයෙ try කරන්න",
    thinking: "හිතනවා…",
    working: "වැඩ කරනවා…",
    emptyResults: "ගැලපෙන තෑගි හම්බුනේ නෑ — වෙන වචනයක් try කරන්න.",
    toolLabels: TOOL_LABELS_SI,
    order: {
      expired: "කල් ඉකුත්යි",
      payLinkValid: "pay link වලංගුයි",
      payLink: "pay link",
      expiredNote:
        "විනාඩි 60ක කාලය ඉවරයි — අලුත් pay link එකකට order එක ආයෙ හදන්න කියන්න.",
      copyPayLink: "පේ ලින්ක් copy කරන්න",
      copied: "Copy උනා!",
    },
    batch: {
      needsAttention: "අවධානය ඕන",
      bookInstead: "ඒ වෙනුවට {date} book කරන්න",
    },
    themeToggle: {
      toLight: "Light mode එකට මාරු කරන්න",
      toDark: "Dark mode එකට මාරු කරන්න",
    },
    cart: {
      title: "ඔයාගෙ කරත්තෙ",
      empty: "තාම කරත්තෙ තෑගි නෑ.",
      subtotal: "උප එකතුව",
      total: "මුළු එකතුව",
      payNow: "දැන් ගෙවන්න",
      sendToFamily: "පවුලට එවලා ගෙවන්න",
      open: "කරත්තෙ බලන්න",
      close: "වහන්න",
    },
  },
  tanglish: {
    tryAgain: "Ayet try karanna",
    thinking: "Hitanawa…",
    working: "Wæda karanawa…",
    emptyResults: "Galapena gifts hambune nææ — wena keyword ekak try karanna.",
    toolLabels: TOOL_LABELS_TA,
    order: {
      expired: "Iwarai",
      payLinkValid: "pay link valid",
      payLink: "pay link",
      expiredNote:
        "Minutes 60ke welawa iwarai — aluth pay link ekakata order eka ayet hadanna kiyanna.",
      copyPayLink: "Pay link copy karanna",
      copied: "Copy una!",
    },
    batch: {
      needsAttention: "attention ona",
      bookInstead: "Eeka wenuwata {date} book karanna",
    },
    themeToggle: {
      toLight: "Light mode ekata maaru karanna",
      toDark: "Dark mode ekata maaru karanna",
    },
    cart: {
      title: "Oyage cart eka",
      empty: "Cart eke thama gifts nææ.",
      subtotal: "Subtotal",
      total: "Total",
      payNow: "Dæn gevanna",
      sendToFamily: "Family ekata evala gevanna",
      open: "Cart eka open karanna",
      close: "Close karanna",
    },
  },
};

/** Loading line for a tool while it runs, in the current language (with fallback). */
export function toolLabel(language: Language, toolName: string): string {
  return COPY[language].toolLabels[toolName] ?? COPY[language].working;
}
