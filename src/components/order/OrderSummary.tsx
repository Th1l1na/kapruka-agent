"use client";

import { useEffect, useState } from "react";
import type { OrderResult } from "@/lib/kapruka/types";

/** "LKR 5,770" — grouped digits, no decimals (Kapruka prices are whole LKR). */
function formatPrice(amount: number, currency = "LKR"): string {
  return `${currency} ${new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatDate(iso: string): string {
  // iso is "YYYY-MM-DD"; render human-friendly without a timezone shift.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

/** Live mm:ss countdown to `expiresAt`; `expired` flips when it hits zero. */
function useCountdown(expiresAt: string): { label: string; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(remainingMs) || remainingMs <= 0) {
    return { label: "0:00", expired: true };
  }
  const totalSec = Math.floor(remainingMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return { label: `${mins}:${secs.toString().padStart(2, "0")}`, expired: false };
}

function FailureCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">Order not created</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

export function OrderSummary({ data }: { data: OrderResult }) {
  const countdown = useCountdown(data.ok ? data.expiresAt : "");

  if (!data.ok) return <FailureCard message={data.message} />;

  const {
    orderRef,
    checkoutUrl,
    whatsappUrl,
    currency,
    recipient,
    delivery,
    items,
    giftMessage,
    itemsTotal,
    grandTotal,
  } = data;
  const { expired, label } = countdown;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-600/20 bg-white shadow-sm dark:border-emerald-400/20 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-emerald-50 px-4 py-3 dark:border-white/5 dark:bg-emerald-950/40">
        <div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Order ready to pay 🎁
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/70">
            Reference {orderRef}
          </p>
        </div>
        <div className="text-right">
          <p
            className={
              expired
                ? "text-sm font-semibold text-red-600 dark:text-red-400"
                : "text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-300"
            }
          >
            {expired ? "Expired" : label}
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {expired ? "pay link" : "pay link valid"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Recipient + delivery */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Delivering to
            </p>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {recipient.name}
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {recipient.address}, {recipient.city}
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {recipient.phone}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Delivery date
            </p>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {formatDate(delivery.date)}
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Delivery fee {formatPrice(delivery.fee, currency)}
            </p>
          </div>
        </div>

        {/* Items */}
        <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-900 dark:text-neutral-100">
                  {item.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatPrice(item.unitPrice, currency)} × {item.quantity}
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                {formatPrice(item.subtotal, currency)}
              </p>
            </li>
          ))}
        </ul>

        {/* Gift message */}
        {giftMessage ? (
          <div className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Gift message
            </p>
            <p className="mt-0.5 text-sm italic text-neutral-700 dark:text-neutral-300">
              “{giftMessage}”
            </p>
          </div>
        ) : null}

        {/* Totals */}
        <div className="flex flex-col gap-1 border-t border-black/5 pt-3 text-sm dark:border-white/5">
          <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
            <span>Items</span>
            <span className="tabular-nums">{formatPrice(itemsTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
            <span>Delivery</span>
            <span className="tabular-nums">{formatPrice(delivery.fee, currency)}</span>
          </div>
          <div className="mt-1 flex justify-between text-base font-semibold text-neutral-900 dark:text-neutral-100">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(grandTotal, currency)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={expired ? undefined : checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={expired}
            className={
              expired
                ? "pointer-events-none cursor-not-allowed rounded-xl bg-neutral-200 px-4 py-3 text-center text-sm font-semibold text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600"
                : "rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-700"
            }
          >
            Pay now
          </a>
          <a
            href={expired ? undefined : whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={expired}
            className={
              expired
                ? "pointer-events-none cursor-not-allowed rounded-xl border border-neutral-200 px-4 py-3 text-center text-sm font-semibold text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
                : "rounded-xl border border-emerald-600 px-4 py-3 text-center text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            }
          >
            Send to family to pay
          </a>
        </div>

        {expired ? (
          <p className="text-center text-xs text-red-600 dark:text-red-400">
            This pay link has expired. Ask me to recreate the order for a fresh link.
          </p>
        ) : null}

        {/* Reference vs tracking note */}
        <p className="text-[11px] leading-relaxed text-neutral-400">
          Show reference{" "}
          <span className="font-medium text-neutral-500 dark:text-neutral-400">
            {orderRef}
          </span>{" "}
          to Kapruka for reference only — for tracking, use the VIMP number from
          your confirmation email after payment.
        </p>
      </div>
    </div>
  );
}
