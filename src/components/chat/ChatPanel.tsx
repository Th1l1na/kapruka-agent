"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ThemeToggle } from "./ThemeToggle";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import { CartPanel } from "@/components/cart/CartPanel";
import {
  type Language,
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  OPENERS,
  SUGGESTIONS,
  COPY,
} from "@/lib/ai/language";

export function ChatPanel() {
  return (
    <CartProvider>
      <ChatPanelInner />
    </CartProvider>
  );
}

function ChatPanelInner() {
  const { messages, sendMessage, status, error, regenerate, clearError } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  // Mid-conversation language-switch toast (auto-dismissed). Each setToast makes
  // a fresh object, so the dismiss effect below restarts its 4s timer on every
  // switch.
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { syncFromMessages } = useCart();

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  // Keep the client cart mirror in sync with the server cart by replaying the
  // tool outputs in the stream (list_carts + cart mutations + checkout_all).
  useEffect(() => {
    syncFromMessages(messages);
  }, [messages, syncFromMessages]);

  // Auto-dismiss the language-switch toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Switch the per-turn language. If the conversation is already underway, flash
  // a toast (in the NEW language) that only new messages change — earlier ones
  // are never retranslated.
  function selectLanguage(next: Language) {
    if (next !== language && messages.length >= 1) {
      setToast({ text: COPY[next].languageSwitch });
    }
    setLanguage(next);
  }

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
                onClick={() => selectLanguage(opt.value)}
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

      <CartPanel language={language} />

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto max-w-sm rounded-xl border border-black/10 bg-white/95 px-4 py-2 text-center text-xs text-neutral-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-200"
          >
            {toast.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
