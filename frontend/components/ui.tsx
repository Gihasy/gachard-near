import { isFramedArt } from "@/lib/framed-art";
import type { ReactNode } from "react";
import { CrystalStar } from "@/components/icons";
import { splitSeriesName } from "@/lib/series-name";

export const RARITY_COLOR: Record<string, string> = {
  Common: "var(--cn-rarity-common)",
  Rare: "var(--cn-rarity-rare)",
  Epic: "var(--cn-rarity-epic)",
  Legendary: "var(--cn-rarity-legendary)",
};

export const primaryBtn =
  "crystal-calm inline-flex items-center justify-center gap-2 rounded-full font-bold px-6 min-h-12 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
export const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full border border-cn-line-strong bg-white/[.04] text-cn-text-1 font-semibold px-6 min-h-12 text-sm hover:bg-white/10 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition";
export const inputClass =
  "w-full rounded-2xl bg-cn-bg/60 border border-cn-line-strong px-4 min-h-12 text-sm text-cn-text-1 placeholder:text-cn-text-3 focus:outline-none focus:border-cn-lavender focus:ring-4 focus:ring-[#c9b3fb26] transition";

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`${wide ? "max-w-7xl" : "max-w-6xl"} mx-auto px-4 sm:px-6 py-8 sm:py-12`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="eyebrow">
      <CrystalStar size={13} />
      {children}
    </span>
  );
}

export function Title({ children, sub, eyebrow }: { children: ReactNode; sub?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow ? <div className="mb-4"><Eyebrow>{eyebrow}</Eyebrow></div> : null}
      <h1 className="text-2xl sm:text-4xl font-bold font-display break-words leading-tight">{children}</h1>
      {sub ? <p className="mt-3 text-cn-text-2 leading-relaxed max-w-2xl">{sub}</p> : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function CardImage({ src, alt, rarity, eager = false }: { src: string; alt: string; rarity?: string; eager?: boolean }) {
  return (
    <span className="card-frame" data-rarity={rarity}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" data-framed={isFramedArt(src) || undefined} />
    </span>
  );
}

/** A series' name, with "Fictional IP" as a label when the name says so. */
export function SeriesName({ name }: { name: string }) {
  const { title, fictional } = splitSeriesName(name);
  return (
    <>
      {title}
      {fictional ? <span className="fictional-tag" data-testid="fictional-tag">Fictional IP</span> : null}
    </>
  );
}

export function Rarity({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: RARITY_COLOR[value] }}>
      <span className="size-1.5 rotate-45 rounded-[1px]" style={{ background: RARITY_COLOR[value] }} aria-hidden="true" />
      {value}
    </span>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-3 rounded-xl border border-[#ff7a8a40] bg-[#ff7a8a14] px-3 py-2 text-sm text-cn-danger" role="alert">
      {children}
    </p>
  );
}
