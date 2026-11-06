"use client";

import { useMemo, useState } from "react";
import TradeButton from "@/components/TradeButton";
import { CardImage, inputClass, Rarity } from "@/components/ui";

export interface TradeItem {
  seriesId: number;
  seriesName: string;
  templateId: number;
  name: string;
  media: string;
  rarity: string;
  price: number;
  /** The collector already holds a card from this series. */
  started: boolean;
}

const PAGE = 12;
const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

/** The cards a collector is missing, with what they can afford and their own series first. */
export default function CrystalTradeList({ crystal, items }: { crystal: number; items: TradeItem[] }) {
  const [series, setSeries] = useState("");
  const [rarity, setRarity] = useState("");
  const [affordable, setAffordable] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const seriesList = useMemo(() => [...new Map(items.map((item) => [item.seriesId, item.seriesName])).entries()], [items]);
  const reset = () => setShown(PAGE);

  const matches = items
    .filter((item) => (!series || String(item.seriesId) === series) && (!rarity || item.rarity === rarity) && (!affordable || item.price <= crystal))
    .sort((a, b) =>
      Number(b.price <= crystal) - Number(a.price <= crystal) ||
      Number(b.started) - Number(a.started) ||
      a.price - b.price);

  if (items.length === 0) {
    return <p className="panel mt-3 p-6 text-center text-sm text-cn-text-2">You hold every card on Gachard. Nothing left to trade for.</p>;
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {seriesList.length > 1 ? (
          <label>
            <span className="sr-only">Series</span>
            <select className={`${inputClass} !min-h-10 !w-auto [&>option]:bg-cn-surface-1`} value={series} onChange={(e) => { setSeries(e.target.value); reset(); }}>
              <option value="">All series</option>
              {seriesList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rarity">
          {RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rarity === r}
              className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition ${rarity === r ? "border-cn-lavender bg-white/10 text-cn-text-1" : "border-cn-line-strong text-cn-text-2 hover:text-cn-text-1"}`}
              onClick={() => { setRarity(rarity === r ? "" : r); reset(); }}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-cn-text-2 cursor-pointer">
          <input type="checkbox" className="size-4 accent-[var(--cn-crystal-lavender)]" checked={affordable} onChange={(e) => { setAffordable(e.target.checked); reset(); }} data-testid="only-affordable" />
          Only what I can afford
        </label>
      </div>
      <p className="mt-3 text-sm text-cn-text-3 tabular" aria-live="polite">{matches.length} {matches.length === 1 ? "card" : "cards"} you are missing</p>

      {matches.length === 0 ? (
        <p className="panel mt-3 p-6 text-center text-sm text-cn-text-2">No cards match. Try clearing a filter.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6" data-testid="trade-list">
          {matches.slice(0, shown).map((item) => (
            <li key={item.templateId} className="min-w-0">
              <div className={item.price <= crystal ? "" : "opacity-55"}>
                <CardImage src={item.media} alt={item.name} rarity={item.rarity} />
              </div>
              <p className="mt-2.5 text-sm font-semibold truncate">{item.name}</p>
              <p className="text-xs text-cn-text-3 truncate">{item.seriesName}</p>
              <Rarity value={item.rarity} />
              <TradeButton seriesId={item.seriesId} templateId={item.templateId} price={item.price} crystal={crystal} />
            </li>
          ))}
        </ul>
      )}

      {matches.length > shown ? (
        <div className="mt-6 text-center">
          <button type="button" className="min-h-11 rounded-full border border-cn-line-strong px-5 text-sm font-semibold hover:border-cn-lavender transition" onClick={() => setShown(shown + PAGE)}>
            Show more <span className="ml-1 font-medium text-cn-text-3 tabular">{matches.length - shown} left</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
