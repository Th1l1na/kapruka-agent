import { tool } from "ai";
import { z } from "zod";

/**
 * Sri Lankan special-day awareness (ui-redesign).
 *
 * The model must never invent occasion dates. This module owns a small table of
 * FIXED-date days (computable), flags VARIABLE days (Mother's/Father's Day) and
 * LUNAR-calendar days (Poya/Vesak/Diwali/Eid) whose dates shift yearly and which
 * we honestly refuse to guess. The get_special_day_date tool below is the single
 * source the model calls before offering or accepting a delivery date.
 */

export type SpecialDay = {
  key: string;
  displayNames: { en: string; si: string; tn: string };
  date: { month: number; day: number } | "variable";
  notes?: string;
};

export const SPECIAL_DAYS: SpecialDay[] = [
  { key: "new_year", displayNames: { en: "New Year", si: "අලුත් අවුරුද්ද", tn: "New Year" }, date: { month: 1, day: 1 } },
  { key: "thai_pongal", displayNames: { en: "Thai Pongal", si: "තෛපොංගල්", tn: "Thai Pongal" }, date: { month: 1, day: 14 } },
  { key: "independence_day", displayNames: { en: "Independence Day", si: "නිදහස් දිනය", tn: "Independence Day" }, date: { month: 2, day: 4 } },
  { key: "valentines_day", displayNames: { en: "Valentine's Day", si: "වැලන්ටයින් දිනය", tn: "Valentine's Day" }, date: { month: 2, day: 14 } },
  { key: "womens_day", displayNames: { en: "Women's Day", si: "ලෝක කාන්තා දිනය", tn: "Women's Day" }, date: { month: 3, day: 8 } },
  { key: "sinhala_tamil_new_year", displayNames: { en: "Sinhala/Tamil New Year", si: "සිංහල හින්දු අලුත් අවුරුද්ද", tn: "Sinhala/Tamil New Year" }, date: { month: 4, day: 13 } },
  { key: "mothers_day", displayNames: { en: "Mother's Day", si: "මවුවරුන්ගේ දිනය", tn: "Mother's Day" }, date: "variable", notes: "Second Sunday of May" },
  { key: "fathers_day", displayNames: { en: "Father's Day", si: "පියවරුන්ගේ දිනය", tn: "Father's Day" }, date: "variable", notes: "Third Sunday of June" },
  { key: "childrens_day", displayNames: { en: "Children's Day", si: "ලෝක ළමා දිනය", tn: "Children's Day" }, date: { month: 10, day: 1 } },
  { key: "halloween", displayNames: { en: "Halloween", si: "හැලෝවීන්", tn: "Halloween" }, date: { month: 10, day: 31 } },
  { key: "christmas", displayNames: { en: "Christmas", si: "නත්තල", tn: "Christmas" }, date: { month: 12, day: 25 } },
];

// Poya/Vesak/Poson/Diwali/Eid are variable lunar dates — do NOT hardcode.
// The tool returns a hint asking the user to specify.
export const LUNAR_HINTS = ["vesak", "poya", "poson", "diwali", "deepavali", "eid", "ramadan", "වෙසක්", "පොසොන්", "පොහොය"];

// ---------------------------------------------------------------------------
// Matching + date maths (pure, so they're unit-testable without the tool)
// ---------------------------------------------------------------------------

/** Lowercase, drop apostrophes, collapse to spaces; keep Latin + Sinhala letters. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9඀-෿]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(/\s+/).filter(Boolean);
}

const isSinhala = (t: string) => /[඀-෿]/.test(t);

/**
 * Generic / relational words that appear BOTH in occasion names and in ordinary
 * sentences ("day", "mother", "children"…). A match must never hinge on one of
 * these alone, or "birthday cake for my mother" would look like Mother's Day.
 */
const STOP = new Set([
  "day", "දිනය", "ලෝක", "world",
  "mother", "mothers", "father", "fathers",
  "child", "children", "childrens", "kid", "kids",
  "women", "woman", "womens",
  "new", "gift", "gifts", "for", "the", "my", "a", "an", "of", "to", "send", "order",
]);

/**
 * Does `query` refer to the occasion `name`?
 *  - primary: the query CONTAINS the full normalised occasion name
 *    ("childrens day gift" ⊇ "childrens day").
 *  - fallback: a DISTINCTIVE (non-generic) query token prefix-matches a
 *    distinctive name token — catches "valentines" / "valentine day" /
 *    "වැලන්ටයින්" without letting bare "mother" or "day" trigger anything.
 */
function nameMatches(query: string, name: string): boolean {
  const q = norm(query);
  const n = norm(name);
  if (!q || !n) return false;
  if (q.includes(n)) return true;

  const nDist = tokens(n).filter((t) => !STOP.has(t));
  const qDist = tokens(q).filter((t) => !STOP.has(t));
  for (const qt of qDist) {
    // Latin tokens need ≥4 chars to prefix-match; Sinhala words are short but
    // distinctive, so allow them through.
    if (qt.length < 4 && !isSinhala(qt)) continue;
    for (const dt of nDist) {
      if (qt === dt) return true;
      if (dt.startsWith(qt) || qt.startsWith(dt)) return true;
    }
  }
  return false;
}

/** First special day whose en/si/tn name (or key) matches the keyword. */
export function matchSpecialDay(keyword: string): SpecialDay | undefined {
  return SPECIAL_DAYS.find((d) =>
    [d.displayNames.en, d.displayNames.si, d.displayNames.tn, d.key.replace(/_/g, " ")].some(
      (name) => nameMatches(keyword, name),
    ),
  );
}

/** True when the keyword names a lunar-calendar day we won't guess. */
export function isLunarKeyword(keyword: string): boolean {
  return LUNAR_HINTS.some((h) => nameMatches(keyword, h));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Next upcoming YYYY-MM-DD for a fixed month/day relative to today (incl. today). */
export function nextFixedOccurrence(month: number, day: number, todayISO: string): string {
  const [ty, tm, td] = todayISO.split("-").map(Number);
  // Advance to next year only if this year's date is strictly in the past.
  const passed = month < tm || (month === tm && day < td);
  const year = passed ? ty + 1 : ty;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export type SpecialDayResult =
  | { found: true; key: string; displayName_en: string; upcomingDate: string }
  | { found: true; key: string; displayName_en: string; note: string }
  | { found: false; note: string };

/** Pure resolver (today injected) — the tool wraps this with the Colombo date. */
export function resolveSpecialDay(keyword: string, todayISO: string): SpecialDayResult {
  const day = matchSpecialDay(keyword);
  if (day) {
    if (day.date === "variable") {
      return {
        found: true,
        key: day.key,
        displayName_en: day.displayNames.en,
        note: `${day.notes ?? "This day varies each year"} — please ask the user for the exact date this year`,
      };
    }
    return {
      found: true,
      key: day.key,
      displayName_en: day.displayNames.en,
      upcomingDate: nextFixedOccurrence(day.date.month, day.date.day, todayISO),
    };
  }
  if (isLunarKeyword(keyword)) {
    return {
      found: false,
      note:
        "This appears to be a lunar-calendar day (Poya/Vesak/Diwali/Eid) which changes each year — please ask the user for the specific date.",
    };
  }
  return { found: false, note: "No special day matched." };
}

/** Today in Sri Lanka (Asia/Colombo) as YYYY-MM-DD. */
function todayColombo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const getSpecialDayDateTool = tool({
  description:
    "Resolve a Sri Lankan special day / occasion (in English, Sinhala or " +
    "Tanglish) to its next upcoming calendar date. Call this SILENTLY whenever " +
    "the shopper mentions an occasion (e.g. \"Children's Day\", \"Valentine's\", " +
    "\"වැලන්ටයින්\", \"අවුරුද්දට\", \"Vesak\") before offering or accepting a " +
    "delivery date — never guess occasion dates yourself. Returns a concrete " +
    "date for fixed days, a note to ask the user for variable days (Mother's/" +
    "Father's Day) and for lunar-calendar days (Poya/Vesak/Diwali/Eid).",
  inputSchema: z.object({
    occasionKeyword: z
      .string()
      .min(2)
      .describe(
        "The occasion as the shopper referred to it, any language, e.g. " +
          "\"Children's Day\", \"valentines\", \"අවුරුද්දට\", \"Vesak\".",
      ),
  }),
  execute: async ({ occasionKeyword }) =>
    resolveSpecialDay(occasionKeyword, todayColombo()),
});

export const specialDayTools = {
  get_special_day_date: getSpecialDayDateTool,
};
