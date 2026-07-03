import { isToolUIPart, getToolName, type UIMessage } from "ai";
import type { Product } from "@/lib/kapruka/types";
import { ProductGrid } from "@/components/cards/ProductCard";

type SearchOutput = {
  count: number;
  products: Product[];
  next_cursor: string | null;
};

/** Friendly one-liner for a tool while it's still running. */
const TOOL_RUNNING_LABEL: Record<string, string> = {
  search_products: "Looking through the Kapruka catalogue…",
  list_categories: "Checking Kapruka's gift categories…",
  get_product: "Fetching the details…",
  add_to_cart: "Adding to your cart…",
  remove_from_cart: "Updating your cart…",
  view_cart: "Opening your cart…",
};

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-2 text-sm text-white"
            : "max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <div key={message.id} className="flex flex-col gap-2">
          {message.parts.map((part, i) => {
            // Plain text
            if (part.type === "text") {
              if (!part.text) return null;
              return (
                <Bubble
                  key={i}
                  role={message.role === "user" ? "user" : "assistant"}
                >
                  <span className="whitespace-pre-wrap">{part.text}</span>
                </Bubble>
              );
            }

            // Tool parts (type "tool-<name>")
            if (isToolUIPart(part)) {
              const name = getToolName(part);

              if (part.state === "output-available") {
                if (name === "search_products") {
                  const out = part.output as SearchOutput;
                  return (
                    <div key={i} className="my-1">
                      <ProductGrid products={out?.products ?? []} />
                    </div>
                  );
                }
                // Other tools (categories / get_product / cart) — the model
                // narrates these in text, so nothing extra to render here.
                return null;
              }

              // Still running: show a subtle status line.
              if (
                part.state === "input-streaming" ||
                part.state === "input-available"
              ) {
                return (
                  <p
                    key={i}
                    className="pl-1 text-xs italic text-neutral-400"
                  >
                    {TOOL_RUNNING_LABEL[name] ?? "Working…"}
                  </p>
                );
              }
              return null;
            }

            return null;
          })}
        </div>
      ))}

      {status === "submitted" && (
        <p className="pl-1 text-xs italic text-neutral-400">Thinking…</p>
      )}
    </div>
  );
}
