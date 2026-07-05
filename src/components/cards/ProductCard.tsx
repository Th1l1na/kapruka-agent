import type { Product } from "@/lib/kapruka/types";
import { type Language, COPY } from "@/lib/ai/language";

function formatPrice(amount: number, currency: string): string {
  // e.g. "LKR 5,770" — group digits, no decimals (Kapruka prices are whole LKR)
  return `${currency} ${new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function ProductCard({ product }: { product: Product }) {
  const { name, price, image_url, url } = product;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-neutral-900"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        {/* External Kapruka CDN image; plain img avoids next/image remote config. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image_url}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {name}
        </h3>
        <p className="mt-auto text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {formatPrice(price.amount, price.currency)}
        </p>
      </div>
    </a>
  );
}

export function ProductGrid({
  products,
  language,
}: {
  products: Product[];
  language: Language;
}) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-neutral-500">{COPY[language].emptyResults}</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
