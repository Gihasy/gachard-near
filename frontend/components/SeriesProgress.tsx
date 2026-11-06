import Link from "next/link";
import { CardPeek } from "@/components/CardViewDialog";
import { CheckIcon } from "@/components/icons";
import TradeButton from "@/components/TradeButton";
import { CardImage, Rarity, SeriesName } from "@/components/ui";
import { splitSeriesName } from "@/lib/series-name";
import { RARITIES } from "@/lib/catalog";
import type { OwnedCard } from "@/lib/cards";
import type { SeriesRow } from "@/lib/db";
import { TRADE_PRICE } from "@/lib/economy";

const PREVIEW = 4;

/** The series a collector has started, rarest cards first in each preview. */
export function startedSeries(series: SeriesRow[], cards: OwnedCard[]) {
  const held = new Map<string, string>();
  for (const card of cards) if (!held.has(card.design)) held.set(card.design, card.tokenId);
  return series
    .map((s) => {
      const slots = [...s.templates]
        .sort((a, b) => a.rarity - b.rarity || a.id - b.id)
        .map((t) => ({ template: t, tokenId: held.get(`${s.id}:${t.id}`) }));
      return { series: s, slots, owned: slots.filter((slot) => slot.tokenId).length };
    })
    .filter((row) => row.owned > 0)
    .sort((a, b) => b.owned / b.slots.length - a.owned / a.slots.length);
}

/**
 * How much of each series a collector holds (ADR-046), shaped like the Series page. A
 * card opens to every card in the series, and a way to the ones missing (ADR-048).
 * Nothing is locked or won, so a card here can still be printed, moved or dismantled.
 */
export default function SeriesProgress({ series, cards, crystal }: { series: SeriesRow[]; cards: OwnedCard[]; crystal: number }) {
  const started = startedSeries(series, cards);
  if (started.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4 items-start" data-testid="series-progress">
      {started.map(({ series: s, slots, owned }) => {
        const complete = owned === slots.length;
        const preview = slots.filter((slot) => slot.tokenId).sort((a, b) => b.template.rarity - a.template.rarity).slice(0, PREVIEW);
        return (
          <details key={s.id} className="series-row panel overflow-hidden" data-testid="series-progress-row" data-series={s.id} data-owned={owned} data-total={slots.length}>
            <summary className="block p-5 cursor-pointer select-none hover:bg-white/[.02] transition list-none">
              <div className="flex items-center gap-4">
                <div className="ip-logo ip-logo-small shrink-0">
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo} alt="" loading="lazy" />
                  ) : (
                    <span className="font-display font-bold text-2xl crystal-text" aria-hidden="true">{s.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-semibold text-base leading-snug break-words"><SeriesName name={s.name} /></h3>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className="block grow h-1.5 rounded-full bg-white/10 overflow-hidden"
                      role="progressbar"
                      aria-label={`Cards collected in ${s.name}`}
                      aria-valuemin={0}
                      aria-valuemax={slots.length}
                      aria-valuenow={owned}
                    >
                      <span className={`block h-full rounded-full ${complete ? "bg-cn-success" : "bg-cn-lavender"}`} style={{ width: `${(owned / slots.length) * 100}%` }} />
                    </span>
                    <span className={`inline-flex items-center gap-1 text-sm font-semibold tabular shrink-0 ${complete ? "text-cn-success" : "text-cn-text-2"}`}>
                      {complete ? <CheckIcon width={14} height={14} /> : null}
                      {owned}/{slots.length}
                    </span>
                  </div>
                </div>
                <span className="series-chevron text-cn-text-3 shrink-0" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </span>
              </div>
              <div className="series-preview mt-4 grid grid-cols-4 gap-2 sm:gap-3">
                {preview.map(({ template: t }) => <CardImage key={t.id} src={t.media} alt="" rarity={RARITIES[t.rarity]} />)}
              </div>
              <p className="series-preview mt-3 text-sm text-cn-text-3">
                {complete ? "You have every card." : `${slots.length - owned} still to collect. Open to see them.`}
              </p>
            </summary>
            <div className="px-5 pb-5">
              <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {slots.map(({ template: t, tokenId }) => (
                  <li key={t.id} className="min-w-0">
                    {tokenId ? (
                      <CardPeek card={cards.find((card) => card.tokenId === tokenId)!} seriesName={splitSeriesName(s.name).title} label={t.name}>
                        <CardImage src={t.media} alt="" rarity={RARITIES[t.rarity]} />
                      </CardPeek>
                    ) : (
                      <div className="grid place-items-center aspect-[63/88] rounded-lg border border-dashed border-cn-line-strong bg-white/[.02] font-display font-bold text-xl text-cn-text-3" data-testid="missing-card" role="img" aria-label={`Missing: ${t.name}`}>
                        ?
                      </div>
                    )}
                    <p className={`mt-1.5 text-xs font-medium truncate ${tokenId ? "" : "text-cn-text-3"}`}>{t.name}</p>
                    <Rarity value={RARITIES[t.rarity]} />
                    {!tokenId && !s.hidden ? <TradeButton seriesId={s.id} templateId={t.id} price={TRADE_PRICE[t.rarity]} crystal={crystal} /> : null}
                  </li>
                ))}
              </ul>
              {s.hidden ? null : <Link href={`/series/${s.id}`} className="mt-4 inline-block text-sm font-semibold text-cn-lavender hover:underline">Buy a pack from this series</Link>}
            </div>
          </details>
        );
      })}
    </div>
  );
}
