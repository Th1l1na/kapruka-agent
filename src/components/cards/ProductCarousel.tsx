"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/kapruka/types";
import { type Language, COPY } from "@/lib/ai/language";
import { ProductCard } from "./ProductCard";
import { useCart } from "@/components/cart/CartContext";

/**
 * Horizontal coverflow carousel (ui-redesign) — the sole renderer for
 * search_products results (ProductGrid is gone). The focused (center) card is
 * fully readable and carries a full-width localized Add-to-cart button; the
 * ±1 flanking and ±2 edge cards are progressively scaled down and dimmed, and
 * anything past ±2 is unmounted (offscreen).
 *
 * Cart writes reuse the ONE mechanism the rest of the UI uses: there is no
 * client cart API — the server cart is mutated only by the model's add_to_cart /
 * remove_from_cart tools. So the button sends a natural-language instruction via
 * `onAction` (the same channel CheckoutBatch's rebook button uses); the model
 * runs the tool, its output lands in the stream, and CartContext re-derives the
 * mirror, which is what refreshes the CartPanel badge. The "Added ✓" flash is a
 * local optimistic acknowledgement independent of that round-trip.
 */

// Positioning constants. Cards are absolutely centered in the track and pushed
// out by |offset|; scaled cards overlap slightly for the coverflow depth feel.
const OFFSET_X: Record<number, number> = { 0: 0, 1: 118, 2: 210 };
const SCALE: Record<number, number> = { 0: 1, 1: 0.75, 2: 0.5 };
const OPACITY: Record<number, number> = { 0: 1, 1: 0.6, 2: 0.3 };
const SWIPE_THRESHOLD = 40; // px of horizontal travel to count as a swipe

export function ProductCarousel({
  products,
  language,
  onAction,
  busy = false,
}: {
  products: Product[];
  language: Language;
  /** Sends a follow-up chat turn; the model performs the actual cart write. */
  onAction?: (text: string) => void;
  /**
   * True while a turn is streaming — `onAction` (send) is a no-op then, so we
   * disable the button rather than flash a false "Added ✓".
   */
  busy?: boolean;
}) {
  const c = COPY[language].carousel;
  const { carts } = useCart();
  const [centerIndex, setCenterIndex] = useState(0);
  // Product id currently flashing "Added ✓" (cleared after 2s).
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const last = products.length - 1;

  // Keep the focus in range if the result set ever shrinks under us.
  const clampedCenter = Math.min(Math.max(centerIndex, 0), Math.max(last, 0));

  const shift = useCallback(
    (delta: number) => {
      setCenterIndex((i) =>
        Math.min(Math.max(i + delta, 0), Math.max(products.length - 1, 0)),
      );
    },
    [products.length],
  );

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  if (products.length === 0) {
    return (
      <p className="text-sm text-neutral-500">{COPY[language].emptyResults}</p>
    );
  }

  const center = products[clampedCenter];
  const inCart = carts.some((cart) =>
    cart.items.some((it) => it.id.toLowerCase() === center.id.toLowerCase()),
  );
  const isFlashing = flashId === center.id;

  function handleAdd() {
    if (!onAction || busy) return;
    if (inCart) {
      // Already in a cart → tap toggles it back out. It may live in any named
      // cart, so let the model locate it rather than assuming the default.
      onAction(
        `Remove "${center.name}" (id: ${center.id}) from my cart — it may be in any of my carts.`,
      );
      return;
    }
    // Route to the most recently active cart so multi-recipient flows don't
    // spawn a stray "Default" cart (matches the conversational add behaviour).
    onAction(
      `Add "${center.name}" (id: ${center.id}) to my cart — put it in my most recently active cart if I have more than one.`,
    );
    setFlashId(center.id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 2000);
  }

  // Swipe: record the start point; on release, if the gesture is mostly
  // horizontal and past the threshold, move focus by one. We never call
  // preventDefault and the track carries touch-action: pan-y, so vertical page
  // scroll is untouched.
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      shift(dx < 0 ? 1 : -1); // swipe left → next
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      shift(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      shift(1);
    } else if (
      (e.key === "Enter" || e.key === " ") &&
      e.target === e.currentTarget // only when the wrapper itself is focused
    ) {
      e.preventDefault();
      handleAdd();
    }
  }

  const multiple = products.length > 1;

  return (
    <div
      role="region"
      aria-label={c.region}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="mx-auto w-full max-w-md rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
    >
      {/* Track: fixed height fits the largest card at scale 1; overflow hides
          anything past ±2. touch-action: pan-y keeps vertical scroll working. */}
      <div
        className="relative h-[280px] w-full touch-pan-y overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {products.map((p, i) => {
          const offset = i - clampedCenter;
          const mag = Math.abs(offset);
          if (mag > 2) return null; // beyond ±2 → offscreen / unmounted
          const x = Math.sign(offset) * OFFSET_X[mag];
          const isCenter = offset === 0;
          return (
            <div
              key={p.id}
              aria-hidden={!isCenter}
              className="absolute left-1/2 top-1/2 w-[180px] transition-all duration-300 ease-out"
              style={{
                transform: `translate(calc(-50% + ${x}px), -50%) scale(${SCALE[mag]})`,
                opacity: OPACITY[mag],
                zIndex: 30 - mag * 10,
              }}
            >
              <ProductCard product={p} />
              {/* Non-center cards: a transparent overlay captures the tap to
                  focus this card instead of following the ProductCard link. */}
              {!isCenter ? (
                <button
                  type="button"
                  aria-label={c.nowShowing.replace("{name}", p.name)}
                  onClick={() => setCenterIndex(i)}
                  className="absolute inset-0 cursor-pointer rounded-xl"
                />
              ) : null}
            </div>
          );
        })}

        {multiple ? (
          <>
            <button
              type="button"
              aria-label={c.prev}
              onClick={() => shift(-1)}
              disabled={clampedCenter === 0}
              className="absolute left-1 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-700 shadow transition hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-0 dark:border-white/10 dark:bg-neutral-900/90 dark:text-neutral-200"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label={c.next}
              onClick={() => shift(1)}
              disabled={clampedCenter === last}
              className="absolute right-1 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-700 shadow transition hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-0 dark:border-white/10 dark:bg-neutral-900/90 dark:text-neutral-200"
            >
              <Chevron dir="right" />
            </button>
          </>
        ) : null}
      </div>

      {/* Full-width Add-to-cart button under the focused card. */}
      <div className="mx-auto mt-3 w-[180px] max-w-full">
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy}
          className={
            "w-full rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 " +
            (isFlashing || inCart
              ? "border border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              : "bg-emerald-600 text-white hover:bg-emerald-700")
          }
        >
          {isFlashing ? c.added : inCart ? c.inCart : c.addToCart}
        </button>
      </div>

      {/* Announce the focused product to assistive tech on every focus change. */}
      <p aria-live="polite" className="sr-only">
        {c.nowShowing.replace("{name}", center.name)}
      </p>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
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
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
