import type { Product } from "@/lib/kapruka/types";

function formatPrice(amount: number, currency: string): string {
  // e.g. "LKR 5,770" — group digits, no decimals (Kapruka prices are whole LKR)
  return `${currency} ${new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function ProductCard({ product }: { product: Product }) {
  const { name, price, image_url, url, stock_level } = product;
  const lowStock = stock_level === "low";

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
        {lowStock && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500/95 px-2 py-0.5 text-xs font-medium text-white shadow">
            Low stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {name}
        </h3>
        <p className="mt-auto text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {formatPrice(price.amount, price.currency)}
        </p>
      </div>
    </a>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No matching gifts found — try a different keyword or category.
      </p>
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
