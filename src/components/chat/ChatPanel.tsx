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
  const { messages, sendMessage, status } = useChat({
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
          <MessageList messages={messages} status={status} />
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
