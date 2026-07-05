import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  toUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { model } from "@/lib/ai/model";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { toLanguage } from "@/lib/ai/language";
import { friendlyError } from "@/lib/ai/errors";
import { kaprukaTools } from "@/lib/kapruka/tools";
import { cartTools } from "@/lib/cart/tools";

// Node runtime: the MCP client uses a persistent streamable-HTTP connection,
// which we want to keep warm across invocations (not the edge runtime).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  // `language` is the current UI toggle, sent per-turn in the request body
  // (ChatPanel passes it via sendMessage's `body`). Default to English if absent.
  const { messages, language }: { messages: UIMessage[]; language?: unknown } =
    await req.json();

  const lang = toLanguage(language);
  const tools = { ...kaprukaTools, ...cartTools };

  const result = streamText({
    model,
    system: buildSystemPrompt(lang),
    // Pass `tools` here too: search_products' toModelOutput (which strips the
    // rich product JSON down to a lean summary for the model) runs inside
    // convertToModelMessages when replaying earlier turns' tool results.
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // Allow multi-step tool use within one turn. Sprint 3's worst-case single
    // turn is a multi-recipient setup: e.g. two searches, then per recipient
    // create_cart -> add_to_cart -> set_recipient (x2), then list_carts to read
    // back — ~10-11 tool calls before the model answers. checkout_all itself is
    // one atomic call (it loops recipients internally, off the model's budget).
    // 16 covers that with headroom, without inviting runaway loops.
    stopWhen: stepCountIs(16),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Replace the default "An error occurred." with a friendly line in the
      // shopper's current language (quota/429, Kapruka rate limit, MCP timeout,
      // etc.). Real error still logged server-side by the AI SDK.
      onError: (error) => friendlyError(error, lang),
    }),
  });
}
