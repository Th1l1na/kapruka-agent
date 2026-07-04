"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

const SUGGESTIONS = [
  "A birthday cake for my mother",
  "Flowers under LKR 5000",
  "A soft toy for a 5-year-old",
];

export function ChatPanel() {
  const { messages, sendMessage, status, error, regenerate, clearError } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || status !== "ready") return;
    if (error) clearError();
    sendMessage({ text: trimmed });
    setInput("");
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-4">
        {isEmpty ? (
          <div className="mx-auto mt-10 max-w-md text-center">
            <p className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
              Kapruka gift assistant
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Tell me who you’re shopping for and I’ll find the perfect gift.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} status={status} onAction={send} />
        )}

        {error && (
          <div className="mx-auto mt-4 flex max-w-md flex-col items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
            <span>{error.message}</span>
            <button
              type="button"
              onClick={() => regenerate()}
              disabled={status !== "ready"}
              className="rounded-lg border border-amber-400/60 px-3 py-1 text-xs font-medium transition hover:bg-amber-100 disabled:opacity-40 dark:hover:bg-amber-900/40"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="pt-2">
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          disabled={status !== "ready"}
        />
      </div>
    </div>
  );
}
