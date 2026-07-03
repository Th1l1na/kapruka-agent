import { createMCPClient, type MCPClient, type CallToolResult } from "@ai-sdk/mcp";
import { KaprukaError, unwrap } from "./unwrap";

/**
 * Low-level Kapruka MCP client.
 *
 * - Streamable-HTTP transport pointed at the public Kapruka MCP endpoint.
 * - Module-level singleton so it survives across warm serverless invocations
 *   (the frontend NEVER calls the MCP directly — always through this backend —
 *   and the 60 req/min limit is shared across all users on our one IP).
 * - Every tool nests its arguments under a `params` object (Pydantic schema);
 *   `callKapruka` adds that wrapper for callers.
 * - Defensive against cold-instance drops: if a call throws a connection-type
 *   error, the singleton is discarded and the call is retried once on a fresh
 *   client.
 */
const MCP_URL = "https://mcp.kapruka.com/mcp";

let clientPromise: Promise<MCPClient> | null = null;

function connect(): Promise<MCPClient> {
  return createMCPClient({
    transport: { type: "http", url: MCP_URL },
    clientName: "kapruka-agent",
    // SDK-level retry for transient tools/call failures (not app errors).
    maxRetries: 1,
  });
}

function getClient(): Promise<MCPClient> {
  if (!clientPromise) clientPromise = connect();
  return clientPromise;
}

function isConnectionError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    m.includes("closed") ||
    m.includes("connection") ||
    m.includes("terminated") ||
    m.includes("socket") ||
    m.includes("econnreset") ||
    m.includes("network")
  );
}

/** Pull the text payload out of an MCP tool result. */
function extractText(result: CallToolResult): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  if (!Array.isArray(content)) return "";
  const part = content.find((c) => c.type === "text");
  return part && typeof part.text === "string" ? part.text : "";
}

/**
 * Call a Kapruka MCP read tool by name with the given params (the `params`
 * wrapper is added here), then parse the JSON payload once via `unwrap`.
 */
export async function callKapruka<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const args = { params };

  let result: CallToolResult;
  try {
    result = await (await getClient()).callTool({ name, arguments: args });
  } catch (err) {
    if (isConnectionError(err)) {
      // Warm instance's socket went away — rebuild the client and retry once.
      clientPromise = null;
      result = await (await getClient()).callTool({ name, arguments: args });
    } else if (err instanceof KaprukaError) {
      throw err;
    } else {
      throw new KaprukaError(`Kapruka tool "${name}" failed: ${String(err)}`);
    }
  }

  return unwrap<T>(extractText(result));
}
