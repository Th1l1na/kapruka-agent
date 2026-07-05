"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
import type { CartSummaryView } from "@/lib/cart/cart";
import type { CheckoutAllResult, OrderSuccess } from "@/lib/kapruka/types";

/**
 * Client mirror of the server cart (Sprint 5, ui-redesign).
 *
 * The server cart (src/lib/cart/cart.ts) stays the single source of truth. This
 * context is a READ-ONLY mirror rebuilt from the tool outputs already present in
 * the chat stream — every `list_carts` snapshot and every cart mutation
 * (create/add/remove/set_recipient) contributes its `CartSummaryView`, and each
 * successful `checkout_all` outcome contributes the payable order for that cart.
 * It powers the additive CartPanel without duplicating any cart logic. It never
 * mutates anything; closing the panel changes nothing about the message stream.
 */
export interface CartMirror {
  /** Latest known view of each cart, in first-seen order. */
  carts: CartSummaryView[];
  /**
   * Payable order per cart name, captured from checkout_all. Presence here (plus
   * a "checked_out" status) is what gates the pay buttons in the panel.
   */
  checkoutByCart: Record<string, OrderSuccess>;
}

interface CartContextValue extends CartMirror {
  /** Rebuild the mirror from the current message stream (idempotent). */
  syncFromMessages: (messages: UIMessage[]) => void;
}

const EMPTY: CartMirror = { carts: [], checkoutByCart: {} };

const CartContext = createContext<CartContextValue | null>(null);

type CartOpOutput = { ok?: boolean; cart?: CartSummaryView };
type ListCartsOutput = { carts?: CartSummaryView[] };

const MUTATION_TOOLS = new Set([
  "create_cart",
  "add_to_cart",
  "remove_from_cart",
  "set_recipient",
]);

/** Derive the mirror from scratch — last write per cart name wins. */
function deriveMirror(messages: UIMessage[]): CartMirror {
  const byName = new Map<string, CartSummaryView>();
  const checkoutByCart: Record<string, OrderSuccess> = {};

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const name = getToolName(part);

      if (name === "list_carts") {
        const out = part.output as ListCartsOutput;
        for (const cart of out?.carts ?? []) byName.set(cart.cartName, cart);
      } else if (MUTATION_TOOLS.has(name)) {
        const out = part.output as CartOpOutput;
        if (out?.ok && out.cart) byName.set(out.cart.cartName, out.cart);
      } else if (name === "checkout_all") {
        const out = part.output as CheckoutAllResult;
        if (out?.ok) {
          for (const o of out.outcomes) {
            if (o.status === "success") checkoutByCart[o.cartName] = o.order;
          }
        }
      }
    }
  }

  return { carts: [...byName.values()], checkoutByCart };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [mirror, setMirror] = useState<CartMirror>(EMPTY);

  const syncFromMessages = useCallback((messages: UIMessage[]) => {
    setMirror(deriveMirror(messages));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({ ...mirror, syncFromMessages }),
    [mirror, syncFromMessages],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
