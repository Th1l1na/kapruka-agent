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
import { kaprukaTools } from "@/lib/kapruka/tools";
import { cartTools } from "@/lib/cart/tools";

// Node runtime: the MCP client uses a persistent streamable-HTTP connection,
// which we want to keep warm across invocations (not the edge runtime).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { ...kaprukaTools, ...cartTools },
    // Allow multi-step tool use within one turn. Worst realistic first turn:
    // list_categories -> search -> fallback search -> get_product -> answer
    // = 5 steps, so 6 gives one step of headroom without inviting runaway loops.
    stopWhen: stepCountIs(6),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
