import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { CardImage, Rarity } from "@/components/ui";
import { RARITIES } from "@/lib/catalog";
import type { OwnedCard } from "@/lib/cards";
import type { SeriesRow } from "@/lib/db";

/**
 * How much of each series a collector holds (ADR-046). It only counts: nothing is
 * locked and nothing is won, so a card here can still be printed, moved or dismantled.
 */
export default function SeriesProgress({ series, cards }: { series: SeriesRow[]; cards: OwnedCard[] }) {
  const held = new Map<string, string>();
  for (const card of cards) if (!held.has(card.design)) held.set(card.design, card.tokenId);

  const started = series
    .map((s) => {
      const slots = [...s.templates]
        .sort((a, b) => a.rarity - b.rarity || a.id - b.id)
        .map((t) => ({ template: t, tokenId: held.get(`${s.id}:${t.id}`) }));
      return { series: s, slots, owned: slots.filter((slot) => slot.tokenId).length };
    })
    .filter((row) => row.owned > 0);
  if (started.length === 0) return null;

  return (
    <section className="mb-8" data-testid="series-progress">
      <h2 className="font-display font-semibold text-lg sm:text-xl">Your series</h2>
      <div className="mt-4 space-y-4">
        {started.map(({ series: s, slots, owned }) => {
          const complete = owned === slots.length;
          return (
            <article key={s.id} className="panel p-5" data-testid="series-progress-row" data-series={s.id} data-owned={owned} data-total={slots.length}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <Link href={`/series/${s.id}`} className="font-display font-semibold text-base min-w-0 break-words hover:text-cn-lavender transition">{s.name}</Link>
                <p className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular ${complete ? "text-cn-success" : "text-cn-text-2"}`}>
                  {complete ? <CheckIcon width={15} height={15} /> : null}
                  {complete ? `Complete: all ${slots.length} cards` : `${owned} of ${slots.length} cards`}
                </p>
              </div>
              <div
                className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-label={`Cards collected in ${s.name}`}
                aria-valuemin={0}
                aria-valuemax={slots.length}
                aria-valuenow={owned}
              >
                <div className="h-full rounded-full bg-cn-lavender" style={{ width: `${(owned / slots.length) * 100}%` }} />
              </div>
              <ul className="mt-4 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                {slots.map(({ template: t, tokenId }) => (
                  <li key={t.id} className="min-w-0">
                    {tokenId ? (
                      <Link href={`/scan/${tokenId}`} className="block">
                        <CardImage src={t.media} alt={t.name} rarity={RARITIES[t.rarity]} />
                      </Link>
                    ) : (
                      <div className="grid place-items-center aspect-[63/88] rounded-lg border border-dashed border-cn-line-strong bg-white/[.02] font-display font-bold text-lg text-cn-text-3" data-testid="missing-card">
                        ?
                      </div>
                    )}
                    <p className={`mt-1.5 text-xs font-medium truncate ${tokenId ? "" : "text-cn-text-3"}`}>{t.name}</p>
                    <Rarity value={RARITIES[t.rarity]} />
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
