import { isToolUIPart, getToolName, type UIMessage } from "ai";
import type { Product, CheckoutAllResult } from "@/lib/kapruka/types";
import { ProductCarousel } from "@/components/cards/ProductCarousel";
import { CheckoutBatch } from "@/components/order/CheckoutBatch";
import { type Language, COPY, toolLabel } from "@/lib/ai/language";

type SearchOutput = {
  count: number;
  products: Product[];
  next_cursor: string | null;
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
  language,
  onAction,
}: {
  messages: UIMessage[];
  status: string;
  /** Current toggle — localizes loading lines, empty-results, and cards. */
  language: Language;
  /** Lets a card (e.g. CheckoutBatch's rebook button) send a follow-up message. */
  onAction?: (text: string) => void;
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
                      <ProductCarousel
                        products={out?.products ?? []}
                        language={language}
                        onAction={onAction}
                        busy={status !== "ready"}
                      />
                    </div>
                  );
                }
                if (name === "checkout_all") {
                  const out = part.output as CheckoutAllResult;
                  // Only the ok:true batch renders a card. The incomplete/empty
                  // variants are narrated by the model (via toModelOutput).
                  if (out?.ok) {
                    return (
                      <div key={i} className="my-1">
                        <CheckoutBatch
                          data={out}
                          language={language}
                          onAction={onAction}
                        />
                      </div>
                    );
                  }
                  return null;
                }
                // Other tools (categories / get_product / cart / city / delivery) — the model
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
                    {toolLabel(language, name)}
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
        <p className="pl-1 text-xs italic text-neutral-400">
          {COPY[language].thinking}
        </p>
      )}
    </div>
  );
}
