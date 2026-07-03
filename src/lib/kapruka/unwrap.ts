/**
 * Parsing helper for Kapruka MCP tool results.
 *
 * IMPORTANT (corrected during Sprint 1 kickoff — see notes/data-shapes.md):
 * Over raw MCP (`@ai-sdk/mcp`), a tool result's content-text IS the JSON
 * payload directly (e.g. `{"categories":[...]}`). Parse it ONCE. There is no
 * `{ result: "<json string>" }` envelope — that was a claude.ai-connector
 * artifact. Errors surface as text starting with "Error:" (validation) or
 * "Error executing tool" (an isError:true result); throw before parsing.
 */
export class KaprukaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KaprukaError";
  }
}

export function unwrap<T>(text: string): T {
  if (text.startsWith("Error:") || text.startsWith("Error executing tool")) {
    throw new KaprukaError(text.trim());
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new KaprukaError(
      `Unparseable Kapruka response: ${text.slice(0, 200)}`,
    );
  }
}
