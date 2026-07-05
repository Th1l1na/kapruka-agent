/**
 * Maps a thrown/streamed error to a friendly, user-facing message in the
 * shopper's current language.
 *
 * Used as the `onError` for the chat UI message stream so shoppers never see a
 * raw stack trace or provider error — just a gentle, reassuring line. The real
 * error is still logged server-side by the AI SDK. The route captures the
 * current language toggle and passes it in (see app/api/chat/route.ts).
 */
import { type Language } from "./language";

type Branch = Record<Language, string>;

// Anthropic (Claude) quota / 429 / overload, or an Anthropic rate_limit_error.
const USAGE_LIMIT: Branch = {
  english:
    "One moment — I’m catching my breath 😊 Please try again in a few seconds.",
  sinhala:
    "පොඩ්ඩක් ඉන්න — මම හුස්මක් අරගන්නවා 😊 තත්පර කීපයකින් ආයෙ try කරන්න.",
  tanglish:
    "Poddak inna — mama husmak aragannawa 😊 Seconds keepayakin ayet try karanna.",
};

// Kapruka MCP shared rate limit, an MCP timeout, or a Cloudflare/connection
// block reaching the catalogue (see notes/data-shapes.md).
const CATALOGUE_BUSY: Branch = {
  english:
    "Kapruka’s catalogue is briefly busy 🙏 Let me try again in a moment.",
  sinhala:
    "Kapruka එකේ catalogue එක පොඩ්ඩක් busy 🙏 මොහොතකින් ආයෙ try කරන්නම්.",
  tanglish:
    "Kapruka catalogue eka podda busy 🙏 Mohothakin ayet try karannam.",
};

// Missing/invalid AI credentials or a blocked project (401/403 auth) — surfaced
// gently; the real detail is in server logs.
const CONFIG_ISSUE: Branch = {
  english:
    "I can’t reach the assistant right now — please try again in a little while 🙏",
  sinhala:
    "මට දැන් සේවාවට සම්බන්ධ වෙන්න බෑ — පොඩ්ඩක් ඉඳලා ආයෙ try කරන්න 🙏",
  tanglish:
    "Mata dæn service ekata connect wenna bæ — poddak inna, passe try karanna 🙏",
};

const GENERIC: Branch = {
  english: "Something went wrong on my end — please try again in a moment 🙏",
  sinhala: "මොකක්හරි වැරදුනා — පොඩ්ඩක් ඉඳලා ආයෙ try කරන්න 🙏",
  tanglish: "Mokakhari weraduna — poddak inna, ayet try karanna 🙏",
};

export function friendlyError(
  error: unknown,
  language: Language = "english",
): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Claude quota / 429 / overloaded / rate_limit_error.
  if (
    /resource_exhausted|exceeded your current quota|quota|429|too many requests|overloaded|rate[_ ]?limit[_ ]?error/i.test(
      msg,
    )
  ) {
    return USAGE_LIMIT[language];
  }

  // AI-provider auth issue — keep this ABOVE the catalogue branch, but match
  // only AI-key terms so a Cloudflare 403 on the Kapruka MCP falls through to
  // "catalogue busy" rather than being mislabelled a config problem.
  if (
    /api[_ ]?key|unauthenticated|permission[_ ]denied|authentication_error|invalid x-api-key/i.test(
      msg,
    )
  ) {
    return CONFIG_ISSUE[language];
  }

  // Kapruka MCP rate limit, timeout, Cloudflare block, or a dropped connection.
  if (
    /rate limit|catalogue|catalog|mcp|kapruka|timeout|timed out|cloudflare|econnreset|socket|terminated|network|fetch failed|connection/i.test(
      msg,
    )
  ) {
    return CATALOGUE_BUSY[language];
  }

  return GENERIC[language];
}
