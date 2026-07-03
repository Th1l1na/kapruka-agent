import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  toUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { model } from "@/lib/ai/model";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { friendlyError } from "@/lib/ai/errors";
import { kaprukaTools } from "@/lib/kapruka/tools";
import { cartTools } from "@/lib/cart/tools";

// Node runtime: the MCP client uses a persistent streamable-HTTP connection,
// which we want to keep warm across invocations (not the edge runtime).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const tools = { ...kaprukaTools, ...cartTools };

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    // Pass `tools` here too: search_products' toModelOutput (which strips the
    // rich product JSON down to a lean summary for the model) runs inside
    // convertToModelMessages when replaying earlier turns' tool results.
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // Allow multi-step tool use within one turn. Worst realistic first turn:
    // list_categories -> search -> fallback search -> get_product -> answer
    // = 5 steps, so 6 gives one step of headroom without inviting runaway loops.
    stopWhen: stepCountIs(6),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Replace the default "An error occurred." with a friendly line
      // (quota/429, Kapruka rate limit, etc.). Real error still logged.
      onError: friendlyError,
    }),
  });
}
