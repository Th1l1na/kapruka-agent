"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ThemeToggle } from "./ThemeToggle";
import {
  type Language,
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  OPENERS,
  SUGGESTIONS,
  COPY,
} from "@/lib/ai/language";

export function ChatPanel() {
  const { messages, sendMessage, status, error, regenerate, clearError } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
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
    // Pass the current toggle per-turn (ChatRequestOptions.body). `send` is
    // recreated each render, so it always reads the latest `language`.
    sendMessage({ text: trimmed }, { body: { language } });
    setInput("");
  }

  const isEmpty = messages.length === 0;
  const opener = OPENERS[language];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-2 pt-2">
        <div
          role="radiogroup"
          aria-label="Language"
          className="inline-flex rounded-full border border-black/10 bg-white p-0.5 text-xs dark:border-white/10 dark:bg-neutral-900"
        >
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = opt.value === language;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLanguage(opt.value)}
                className={
                  "rounded-full px-3 py-1 transition " +
                  (active
                    ? "bg-emerald-600 text-white"
                    : "text-neutral-600 hover:text-emerald-700 dark:text-neutral-300")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <ThemeToggle language={language} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-4">
        {isEmpty ? (
          <div className="mx-auto mt-10 max-w-md text-center">
            <p className="text-lg font-medium text-neutral-800 dark:text-neutral-100">
              {opener.title}
            </p>
            <p className="mt-1 text-sm text-neutral-500">{opener.subtitle}</p>
            {/* Left-aligned example rows: the phrases are full sentences, so a
                rounded-full pill would wrap awkwardly at phone width. */}
            <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
              {SUGGESTIONS[language].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-left text-xs leading-snug text-neutral-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            status={status}
            language={language}
            onAction={send}
          />
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
              {COPY[language].tryAgain}
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
