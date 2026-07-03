/**
 * Maps a thrown/streamed error to a friendly, user-facing message.
 *
 * Used as the `onError` for the chat UI message stream so shoppers never see a
 * raw stack trace or provider error — just a gentle, reassuring line. The real
 * error is still logged server-side by the AI SDK.
 */
export function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Gemini free-tier / paid quota exhaustion or 429.
  if (
    /resource_exhausted|exceeded your current quota|quota|429|too many requests/i.test(
      msg,
    )
  ) {
    return "I've reached today's usage limit for the AI 🙏 Please try again in a little while.";
  }

  // Kapruka MCP shared rate limit (see notes/data-shapes.md).
  if (/rate limit/i.test(msg)) {
    return "Kapruka's catalogue is briefly busy 🙏 Give me a moment and try again.";
  }

  // Missing/invalid credentials or a blocked project (403 PERMISSION_DENIED,
  // "denied access") — surfaced gently (details are in server logs).
  if (
    /api key|api_key|unauthenticated|permission[_ ]denied|denied access|403/i.test(
      msg,
    )
  ) {
    return "I can't reach the assistant right now — there's a configuration issue with the AI service. Please try again later.";
  }

  return "Something went wrong on my end. Please try again in a moment.";
}
