import type { ReactNode } from "react";

export const RARITY_COLOR: Record<string, string> = {
  Common: "var(--cn-rarity-common)",
  Rare: "var(--cn-rarity-rare)",
  Epic: "var(--cn-rarity-epic)",
  Legendary: "var(--cn-rarity-legendary)",
};

export const primaryBtn =
  "inline-flex items-center justify-center rounded-xl bg-cn-text-1 text-cn-bg font-semibold px-5 py-3 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition";
export const secondaryBtn =
  "inline-flex items-center justify-center rounded-xl border border-cn-line-strong text-cn-text-1 font-semibold px-5 py-3 text-sm hover:bg-cn-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition";
export const inputClass =
  "w-full rounded-xl bg-cn-surface-2 border border-cn-line-strong px-4 py-3 text-sm text-cn-text-1 placeholder:text-cn-text-3 focus:outline-none focus:border-cn-text-2";

export function Page({ children }: { children: ReactNode }) {
  return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">{children}</div>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-cn-text-1 font-[family-name:var(--font-unbounded)] break-words">
        {children}
      </h1>
      {sub ? <p className="mt-3 text-cn-text-2 leading-relaxed">{sub}</p> : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-cn-surface-1 border border-cn-line p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function CardImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="w-full aspect-[63/88] object-cover rounded-xl border border-cn-line bg-cn-surface-2" />
  );
}

export function Rarity({ value }: { value: string }) {
  return (
    <span className="text-xs font-semibold" style={{ color: RARITY_COLOR[value] }}>
      {value}
    </span>
  );
}
