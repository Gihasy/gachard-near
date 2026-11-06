"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import TiltCard from "@/components/TiltCard";
import { SearchIcon } from "@/components/icons";
import { inputClass, Rarity } from "@/components/ui";
import type { OwnedCard } from "@/lib/cards";

const PAGE = 24;
const RARITIES = ["Legendary", "Epic", "Rare", "Common"];

/** Every card a collector holds, with copies of one card stacked and a way to narrow it down. */
export default function CollectionGrid({ cards, seriesNames }: { cards: OwnedCard[]; seriesNames: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("");
  const [rarity, setRarity] = useState("");
  const [shown, setShown] = useState(PAGE);

  const stacks = useMemo(() => {
    const byDesign = new Map<string, OwnedCard[]>();
    for (const card of cards) byDesign.set(card.design, [...(byDesign.get(card.design) ?? []), card]);
    return [...byDesign.values()].sort((a, b) => RARITIES.indexOf(a[0].rarity) - RARITIES.indexOf(b[0].rarity) || a[0].name.localeCompare(b[0].name));
  }, [cards]);

  const heldSeries = useMemo(() => [...new Set(cards.map((c) => c.design.split(":")[0]))], [cards]);

  const matches = stacks.filter(([card]) =>
    (!series || card.design.startsWith(`${series}:`)) &&
    (!rarity || card.rarity === rarity) &&
    card.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section data-testid="all-cards">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative grow basis-52 max-w-sm">
          <span className="sr-only">Search your cards</span>
          <SearchIcon width={16} height={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cn-text-3" />
          <input className={`${inputClass} !min-h-10 !pl-10`} placeholder="Search your cards" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </label>
        {heldSeries.length > 1 ? (
          <label>
            <span className="sr-only">Series</span>
            <select className={`${inputClass} !min-h-10 !w-auto`} value={series} onChange={(e) => { setSeries(e.target.value); setShown(PAGE); }}>
              <option value="">All series</option>
              {heldSeries.map((id) => <option key={id} value={id}>{seriesNames[id] ?? `Series ${id}`}</option>)}
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
              onClick={() => { setRarity(rarity === r ? "" : r); setShown(PAGE); }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-sm text-cn-text-3 tabular" aria-live="polite">{matches.length} of {stacks.length} different cards</p>

      {matches.length === 0 ? (
        <p className="panel mt-3 p-6 text-center text-sm text-cn-text-2">No cards match. Try clearing a filter.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
          {matches.slice(0, shown).map((copies) => {
            const first = copies.find((c) => c.status === "Digital") ?? copies[0];
            const printed = copies.filter((c) => c.status !== "Digital").length;
            return (
              <article key={first.design} data-testid="owned-card" className="min-w-0">
                <Link href={`/scan/${first.tokenId}`} className="group block relative rounded-lg">
                  <TiltCard src={first.media} alt={first.name} rarity={first.rarity} />
                  {copies.length > 1 ? (
                    <span className="absolute -top-2 -right-2 z-10 grid place-items-center min-w-7 h-7 px-1.5 rounded-full crystal-calm text-cn-text-on-crystal text-xs font-bold tabular" data-testid="duplicate">
                      <span className="sr-only">Copies: </span>×{copies.length}
                    </span>
                  ) : null}
                  <p className="mt-2.5 text-sm font-semibold truncate transition group-hover:text-cn-lavender">{first.name}</p>
                </Link>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <Rarity value={first.rarity} />
                  {printed ? <span className="text-[11px] font-semibold text-cn-text-2">{printed} printed</span> : null}
                </div>
                {copies.length > 1 ? (
                  <details className="copies mt-1 text-xs text-cn-text-3">
                    <summary className="cursor-pointer select-none py-0.5 hover:text-cn-text-1">Choose a copy</summary>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {copies.map((c) => (
                        <li key={c.tokenId}>
                          <Link href={`/scan/${c.tokenId}`} className="inline-block rounded-full border border-cn-line-strong px-2 py-0.5 tabular hover:text-cn-text-1 hover:border-cn-lavender">
                            #{c.tokenId}{c.status === "Digital" ? "" : " · printed"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {matches.length > shown ? (
        <div className="mt-6 text-center">
          <button type="button" className="min-h-11 rounded-full border border-cn-line-strong px-5 text-sm font-semibold hover:border-cn-lavender transition" onClick={() => setShown(shown + PAGE)}>
            Show more
          </button>
        </div>
      ) : null}
    </section>
  );
}
