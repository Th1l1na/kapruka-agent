"use client";

import { useState } from "react";
import { useCart } from "./CartContext";
import { CopyPayLink } from "@/components/order/OrderSummary";
import type { CartSummaryView } from "@/lib/cart/cart";
import type { OrderSuccess } from "@/lib/kapruka/types";
import { type Language, COPY } from "@/lib/ai/language";

/** "LKR 5,770" — grouped digits, no decimals (matches OrderSummary). */
function formatPrice(amount: number, currency = "LKR"): string {
  return `${currency} ${new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function CartIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

/**
 * The three pay actions, byte-for-byte the same URLs and handlers as the
 * message-stream OrderSummary. Only rendered once a cart has a payable order.
 */
function PayActions({
  order,
  language,
}: {
  order: OrderSuccess;
  language: Language;
}) {
  const c = COPY[language].cart;
  const o = COPY[language].order;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <a
        href={order.checkoutUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        {c.payNow}
      </a>
      <a
        href={order.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl border border-emerald-600 px-4 py-2 text-center text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {c.sendToFamily}
      </a>
      <CopyPayLink
        payUrl={order.checkoutUrl}
        copyLabel={o.copyPayLink}
        copiedLabel={o.copied}
      />
    </div>
  );
}

/** One cart: name, items with thumbnails + prices, subtotal, and pay buttons. */
function CartSection({
  cart,
  order,
  language,
}: {
  cart: CartSummaryView;
  order?: OrderSuccess;
  language: Language;
}) {
  const c = COPY[language].cart;
  // Show the pay buttons as soon as this cart has a stored checkout order.
  // Gating on cart.status too was wrong: after checkout_all the model rarely
  // re-runs list_carts, so the mirror's status often lingers at "open" — the
  // presence of the order is the authoritative signal, matching OrderSummary.
  const showButtons = !!order;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {cart.cartName}
      </p>

      <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
        {cart.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
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
                {formatPrice(item.unitPrice, cart.currency)} × {item.quantity}
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
              {formatPrice(item.unitPrice * item.quantity, cart.currency)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex justify-between border-t border-black/5 pt-2 text-sm dark:border-white/5">
        <span className="text-neutral-600 dark:text-neutral-400">
          {c.subtotal}
        </span>
        <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
          {formatPrice(cart.total, cart.currency)}
        </span>
      </div>

      {showButtons ? <PayActions order={order!} language={language} /> : null}
    </div>
  );
}

/**
 * Additive cart panel (ui-redesign, Sprint 5): a right rail on desktop and a
 * bottom drawer on mobile. Read-only shortcut view over the client cart mirror
 * — the inline CheckoutBatch/OrderSummary rendering in the message stream is
 * untouched and keeps working whether or not this panel is open. Collapsed by
 * default; the launcher shows a cart-count badge.
 */
export function CartPanel({ language }: { language: Language }) {
  const { carts, checkoutByCart } = useCart();
  const [expanded, setExpanded] = useState(false);
  const c = COPY[language].cart;

  const activeCarts = carts.filter((cart) => cart.itemCount > 0);
  const totalItems = carts.reduce((n, cart) => n + cart.itemCount, 0);
  const currency = activeCarts[0]?.currency ?? "LKR";
  const combinedTotal = activeCarts.reduce((sum, cart) => sum + cart.total, 0);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={c.open}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-neutral-700 shadow-lg transition hover:text-emerald-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:text-emerald-400"
      >
        <CartIcon />
        {totalItems > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
            {totalItems}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <>
      {/* Backdrop — tap to close. */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setExpanded(false)}
        aria-hidden
      />

      {/* Bottom drawer on mobile, right rail on desktop. */}
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-2xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-900 md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-96 md:rounded-none md:rounded-l-2xl"
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {c.title}
          </p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label={c.close}
            className="rounded-lg p-1 text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {activeCarts.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {c.empty}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {activeCarts.map((cart) => (
                <CartSection
                  key={cart.cartName}
                  cart={cart}
                  order={checkoutByCart[cart.cartName]}
                  language={language}
                />
              ))}

              {activeCarts.length > 1 ? (
                <div className="flex justify-between border-t-2 border-black/10 pt-3 text-base font-semibold text-neutral-900 dark:border-white/10 dark:text-neutral-100">
                  <span>{c.total}</span>
                  <span className="tabular-nums">
                    {formatPrice(combinedTotal, currency)}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
