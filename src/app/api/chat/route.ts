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
    system: buildSystemPrompt(),
    // Pass `tools` here too: search_products' toModelOutput (which strips the
    // rich product JSON down to a lean summary for the model) runs inside
    // convertToModelMessages when replaying earlier turns' tool results.
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // Allow multi-step tool use within one turn. Sprint 2 adds the checkout
    // chain, whose longest realistic single turn is:
    // resolve_city -> check_delivery -> view_cart -> create_order -> answer,
    // and a discovery turn can still run search -> fallback -> get_product.
    // 10 covers the worst case with headroom, without inviting runaway loops.
    stopWhen: stepCountIs(10),
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
