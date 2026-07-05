"use client";

import type { CheckoutAllResult, CheckoutOutcome } from "@/lib/kapruka/types";
import { OrderSummary } from "./OrderSummary";
import { type Language, COPY } from "@/lib/ai/language";

type BatchOk = Extract<CheckoutAllResult, { ok: true }>;

/** "Sat, 5 July" from "YYYY-MM-DD", no timezone shift. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

/** Build the header sentence: "one for X, one for Y" from the successful carts. */
function successList(names: string[]): string {
  return names.map((n) => `one for ${n}`).join(", ");
}

/** A soft-failed cart: distinct "needs attention" card, never styled as success. */
function FailedCard({
  outcome,
  language,
  onAction,
}: {
  outcome: Extract<CheckoutOutcome, { status: "failed" }>;
  language: Language;
  onAction?: (text: string) => void;
}) {
  const { cartName, reason, nextAvailableDate } = outcome;
  const copy = COPY[language].batch;
  return (
    <div className="rounded-2xl border border-amber-400/60 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/40">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">
          ⚠️
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {cartName} — {copy.needsAttention}
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
            {reason}
          </p>
          {nextAvailableDate && onAction ? (
            <button
              type="button"
              onClick={() =>
                onAction(
                  `Please book "${cartName}" for delivery on ${nextAvailableDate} instead, then check out again.`,
                )
              }
              className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              {copy.bookInstead.replace("{date}", formatDate(nextAvailableDate))}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Small caption above a stacked success card so recipients are distinguishable. */
function CartCaption({ name }: { name: string }) {
  return (
    <p className="mb-1 pl-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
      {name}
    </p>
  );
}

export function CheckoutBatch({
  data,
  language,
  onAction,
}: {
  data: BatchOk;
  language: Language;
  onAction?: (text: string) => void;
}) {
  const { outcomes, successCount, failureCount } = data;
  const successNames = outcomes
    .filter((o) => o.status === "success")
    .map((o) => o.cartName);

  // Single clean order, no failures → render a bare OrderSummary (identical to
  // the Sprint 2 single-recipient experience; no batch header).
  if (outcomes.length === 1 && outcomes[0].status === "success") {
    return <OrderSummary data={outcomes[0].order} language={language} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header line */}
      {successCount > 0 ? (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Here {successCount === 1 ? "is your order" : `are your ${successCount} orders`} —{" "}
          {successList(successNames)}. Each has its own pay link, all valid 60 minutes.
          {failureCount > 0
            ? ` ${failureCount} ${failureCount === 1 ? "cart" : "carts"} below still ${failureCount === 1 ? "needs" : "need"} attention.`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          None of the orders could be created yet — here&apos;s what needs attention.
        </p>
      )}

      {/* Stacked per-recipient cards, in cart order */}
      {outcomes.map((o, i) =>
        o.status === "success" ? (
          <div key={i}>
            <CartCaption name={o.cartName} />
            <OrderSummary data={o.order} language={language} />
          </div>
        ) : (
          <FailedCard
            key={i}
            outcome={o}
            language={language}
            onAction={onAction}
          />
        ),
      )}
    </div>
  );
}
