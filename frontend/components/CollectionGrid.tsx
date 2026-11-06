"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import CardViewDialog from "@/components/CardViewDialog";
import TiltCard from "@/components/TiltCard";
import { CrystalGem, LockIcon, SearchIcon } from "@/components/icons";
import { ErrorLine, inputClass, primaryBtn, Rarity, RARITY_COLOR, secondaryBtn } from "@/components/ui";
import { post } from "@/lib/client";
import type { OwnedCard } from "@/lib/cards";

const PAGE = 12;
const RARITIES = ["Legendary", "Epic", "Rare", "Common"];

/**
 * Every card a collector holds, with copies of one card stacked and a way to narrow it
 * down. It is also where several cards are dismantled at once, and where a card a
 * collector wants to keep safe is locked.
 */
export default function CollectionGrid({ cards, seriesNames, crystalByRarity, locked: lockedAtFirst }: {
  cards: OwnedCard[];
  seriesNames: Record<string, string>;
  /** What one card yields, by rarity name. The figures live on the server. */
  crystalByRarity: Record<string, number>;
  locked: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("");
  const [rarity, setRarity] = useState("");
  const [shown, setShown] = useState(PAGE);

  const [locked, setLocked] = useState(() => new Set(lockedAtFirst));
  const [selecting, setSelecting] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  // A list read from the chain can lag a burn, so burned cards are hidden from here at once.
  const [burned, setBurned] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [viewing, setViewing] = useState<OwnedCard | null>(null);
  // A plain click opens the quick look. A new tab still goes to the card's page.
  const view = (event: MouseEvent, card: OwnedCard) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setViewing(card);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const stacks = useMemo(() => {
    const byDesign = new Map<string, OwnedCard[]>();
    for (const card of cards) {
      if (!burned.has(card.tokenId)) byDesign.set(card.design, [...(byDesign.get(card.design) ?? []), card]);
    }
    return [...byDesign.values()].sort((a, b) => RARITIES.indexOf(a[0].rarity) - RARITIES.indexOf(b[0].rarity) || a[0].name.localeCompare(b[0].name));
  }, [cards, burned]);

  const heldSeries = useMemo(() => [...new Set(cards.map((c) => c.design.split(":")[0]))], [cards]);

  const matches = stacks.filter(([card]) =>
    (!series || card.design.startsWith(`${series}:`)) &&
    (!rarity || card.rarity === rarity) &&
    card.name.toLowerCase().includes(query.trim().toLowerCase()));

  // Only a digital card that is not locked can go.
  const burnable = (copies: OwnedCard[]) => (locked.has(copies[0].design) ? [] : copies.filter((c) => c.status === "Digital"));
  const pick = (copies: OwnedCard[], count: number) => {
    const design = copies[0].design;
    const next = Math.max(0, Math.min(count, burnable(copies).length));
    setPicks((all) => {
      const rest = { ...all };
      if (next) rest[design] = next;
      else delete rest[design];
      return rest;
    });
  };

  const chosen = stacks.filter((copies) => picks[copies[0].design]).map((copies) => ({ copies, count: picks[copies[0].design] }));
  const selectedCount = chosen.reduce((sum, row) => sum + row.count, 0);
  const totalCrystal = chosen.reduce((sum, row) => sum + row.count * (crystalByRarity[row.copies[0].rarity] ?? 0), 0);
  const byRarity = RARITIES.map((name) => ({
    name,
    count: chosen.filter((row) => row.copies[0].rarity === name).reduce((sum, row) => sum + row.count, 0),
  })).filter((row) => row.count > 0);
  const lastCopies = chosen.filter((row) => row.count === row.copies.length).map((row) => row.copies[0].name);

  const selectDuplicates = () => {
    const all: Record<string, number> = {};
    for (const copies of stacks) {
      // One copy stays, even if it is the printed one.
      const count = Math.min(burnable(copies).length, copies.length - 1);
      if (count > 0) all[copies[0].design] = count;
    }
    setPicks(all);
  };

  const stopSelecting = () => {
    setSelecting(false);
    setPicks({});
    setError("");
  };

  const toggleLock = async (design: string) => {
    const lock = !locked.has(design);
    const flip = (on: boolean) => setLocked((all) => {
      const next = new Set(all);
      if (on) next.add(design);
      else next.delete(design);
      return next;
    });
    flip(lock);
    if (lock) {
      setPicks((all) => {
        const rest = { ...all };
        delete rest[design];
        return rest;
      });
    }
    try {
      await post("/api/me/lock", { design, locked: lock });
    } catch (e) {
      flip(!lock);
      setNotice((e as Error).message);
    }
  };

  const destroy = async () => {
    const tokens = chosen.flatMap((row) => burnable(row.copies).slice(0, row.count).map((c) => c.tokenId));
    setError("");
    setProgress({ done: 0, total: tokens.length });
    let done = 0;
    let gained = 0;
    try {
      // One at a time: each is its own transaction, signed by the holder's account.
      for (const tokenId of tokens) {
        const { crystal } = await post<{ crystal: number }>(`/api/cards/${tokenId}/dismantle`);
        done += 1;
        gained += crystal;
        setBurned((all) => new Set(all).add(tokenId));
        setProgress({ done, total: tokens.length });
      }
      dialog.current?.close();
      setNotice(`${done} ${done === 1 ? "card" : "cards"} destroyed. You gained ${gained.toLocaleString("en-US")} Crystal.`);
      setSelecting(false);
      setPicks({});
    } catch (e) {
      setError(`${done} of ${tokens.length} destroyed, then this stopped: ${(e as Error).message}`);
      setPicks({});
    }
    setProgress(null);
    router.refresh();
  };

  const busy = progress !== null;

  return (
    <section data-testid="all-cards" className={selecting ? "pb-24" : ""}>
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-cn-text-3 tabular" aria-live="polite">{matches.length} of {stacks.length} different cards</p>
        {selecting ? (
          <button type="button" className="min-h-9 rounded-full border border-cn-line-strong px-3 text-xs font-semibold transition hover:border-cn-lavender" onClick={selectDuplicates} data-testid="select-duplicates">
            Select all duplicates
          </button>
        ) : (
          <button type="button" className="min-h-9 rounded-full border border-cn-line-strong px-3 text-xs font-semibold transition hover:border-cn-lavender" onClick={() => setSelecting(true)} data-testid="start-dismantle">
            Dismantle cards
          </button>
        )}
      </div>

      {notice ? <p className="pop mt-3 rounded-2xl border border-[#7ee0a640] bg-[#7ee0a612] px-4 py-3 text-sm text-cn-text-1" role="status" data-testid="dismantle-done">{notice}</p> : null}
      {!selecting && error ? <div className="mt-3"><ErrorLine>{error}</ErrorLine></div> : null}

      {matches.length === 0 ? (
        <p className="panel mt-3 p-6 text-center text-sm text-cn-text-2">No cards match. Try clearing a filter.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
          {matches.slice(0, shown).map((copies) => {
            const first = copies.find((c) => c.status === "Digital") ?? copies[0];
            const printed = copies.filter((c) => c.status !== "Digital").length;
            const isLocked = locked.has(first.design);
            const available = burnable(copies).length;
            const count = picks[first.design] ?? 0;
            return (
              <article key={first.design} data-testid="owned-card" data-design={first.design} className="min-w-0 relative">
                {selecting ? (
                  <button
                    type="button"
                    className={`block w-full rounded-lg text-left transition ${available ? "" : "opacity-45 cursor-not-allowed"} ${count ? "ring-2 ring-cn-lavender ring-offset-2 ring-offset-cn-bg" : ""}`}
                    disabled={!available}
                    aria-pressed={count > 0}
                    aria-label={`Select ${first.name}`}
                    data-testid="select-card"
                    onClick={() => pick(copies, count ? 0 : 1)}
                  >
                    <TiltCard src={first.media} alt={first.name} rarity={first.rarity} />
                    <p className="mt-2.5 text-sm font-semibold truncate">{first.name}</p>
                  </button>
                ) : (
                  <Link href={`/scan/${first.tokenId}`} className="group block rounded-lg" onClick={(event) => view(event, first)} data-testid="open-card">
                    <TiltCard src={first.media} alt={first.name} rarity={first.rarity} />
                    <p className="mt-2.5 text-sm font-semibold truncate transition group-hover:text-cn-lavender">{first.name}</p>
                  </Link>
                )}
                {copies.length > 1 ? (
                  <span className="absolute -top-2 -right-2 z-10 grid place-items-center min-w-7 h-7 px-1.5 rounded-full crystal-calm text-cn-text-on-crystal text-xs font-bold tabular pointer-events-none" data-testid="duplicate">
                    <span className="sr-only">Copies: </span>×{copies.length}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={`card-lock ${isLocked ? "card-lock-on" : ""}`}
                  aria-pressed={isLocked}
                  aria-label={`${isLocked ? "Unlock" : "Lock"} ${first.name}`}
                  title={isLocked ? "Locked: cannot be dismantled or transferred" : "Lock so it cannot be dismantled or transferred"}
                  data-testid="lock-card"
                  onClick={() => toggleLock(first.design)}
                >
                  <LockIcon width={14} height={14} open={!isLocked} />
                </button>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <Rarity value={first.rarity} />
                  {isLocked ? <span className="text-[11px] font-semibold text-cn-credits">Locked</span> : printed ? <span className="text-[11px] font-semibold text-cn-text-2">{printed} printed</span> : null}
                </div>
                {selecting ? (
                  available ? (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {available > 1 ? (
                        <span className="inline-flex items-center rounded-full border border-cn-line-strong">
                          <button type="button" className="grid place-items-center size-8 text-sm font-bold disabled:opacity-40" disabled={!count} aria-label={`One fewer ${first.name}`} onClick={() => pick(copies, count - 1)}>−</button>
                          <span className="w-5 text-center text-xs font-semibold tabular" data-testid="pick-count">{count}</span>
                          <button type="button" className="grid place-items-center size-8 text-sm font-bold disabled:opacity-40" disabled={count >= available} aria-label={`One more ${first.name}`} onClick={() => pick(copies, count + 1)}>+</button>
                        </span>
                      ) : <span className="text-xs text-cn-text-3">{count ? "Selected" : "Tap to select"}</span>}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-cn-crystal tabular"><CrystalGem size={12} />+{crystalByRarity[first.rarity] ?? 0}</span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-cn-text-3">{isLocked ? "Unlock it to dismantle" : "Printed cards cannot be dismantled"}</p>
                  )
                ) : copies.length > 1 ? (
                  <details className="copies mt-1 text-xs text-cn-text-3">
                    <summary className="cursor-pointer select-none py-0.5 hover:text-cn-text-1">Choose a copy</summary>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {copies.map((c) => (
                        <li key={c.tokenId}>
                          <Link href={`/scan/${c.tokenId}`} onClick={(event) => view(event, c)} className="inline-block rounded-full border border-cn-line-strong px-2 py-0.5 tabular hover:text-cn-text-1 hover:border-cn-lavender">
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
          <button type="button" className="min-h-11 rounded-full border border-cn-line-strong px-5 text-sm font-semibold hover:border-cn-lavender transition" onClick={() => setShown(shown + PAGE)} data-testid="show-more">
            Show more <span className="ml-1 font-medium text-cn-text-3 tabular">{matches.length - shown} left</span>
          </button>
        </div>
      ) : null}

      {selecting ? (
        <div className="select-bar" data-testid="select-bar">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-sm font-semibold tabular" aria-live="polite">
              {selectedCount} {selectedCount === 1 ? "card" : "cards"} selected
              {selectedCount ? <span className="ml-2 inline-flex items-center gap-1 text-cn-crystal"><CrystalGem size={14} />+{totalCrystal.toLocaleString("en-US")} Crystal</span> : null}
            </p>
            <div className="flex gap-2">
              <button type="button" className={secondaryBtn} onClick={stopSelecting}>Cancel</button>
              <button type="button" className={primaryBtn} disabled={!selectedCount} onClick={() => { setError(""); dialog.current?.showModal(); }} data-testid="review-dismantle">Dismantle</button>
            </div>
          </div>
        </div>
      ) : null}

      <CardViewDialog
        card={viewing}
        seriesName={viewing ? seriesNames[viewing.design.split(":")[0]] : undefined}
        copies={viewing ? stacks.find((copies) => copies[0].design === viewing.design)?.length : undefined}
        locked={viewing ? locked.has(viewing.design) : false}
        onClose={() => setViewing(null)}
        onToggleLock={() => { if (viewing) toggleLock(viewing.design); }}
        onDismantle={() => {
          if (!viewing) return;
          setPicks({ [viewing.design]: 1 });
          setError("");
          setViewing(null);
          setSelecting(true);
          // After the quick look has closed, because only one dialog can sit on top.
          setTimeout(() => dialog.current?.showModal(), 0);
        }}
      />

      <dialog ref={dialog} className="dismantle-dialog" aria-labelledby="dismantle-title" data-testid="dismantle-dialog" onCancel={(e) => { if (busy) e.preventDefault(); }}>
        <h2 id="dismantle-title" className="font-display font-semibold text-lg">Dismantle {selectedCount} {selectedCount === 1 ? "card" : "cards"}?</h2>
        <ul className="mt-4 space-y-2 text-sm" data-testid="dismantle-breakdown">
          {byRarity.map(({ name, count }) => (
            <li key={name} className="flex items-center justify-between gap-4">
              <span className="font-semibold" style={{ color: RARITY_COLOR[name] }}>{count} {name}</span>
              <span className="text-cn-text-2 tabular">{count} × {crystalByRarity[name] ?? 0} = {(count * (crystalByRarity[name] ?? 0)).toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 pt-3 border-t border-cn-line flex items-center justify-between gap-4 font-semibold">
          You get
          <span className="inline-flex items-center gap-1.5 font-display text-xl text-cn-crystal tabular" data-testid="dismantle-total"><CrystalGem size={20} />{totalCrystal.toLocaleString("en-US")} Crystal</span>
        </p>
        <div className="mt-4 rounded-2xl border border-[#ff7a8a66] bg-[#ff7a8a1a] p-3 text-sm leading-relaxed" role="alert">
          <strong className="font-semibold text-cn-danger">This cannot be undone.</strong>{" "}
          These cards are destroyed for good, and nobody can bring them back.
          {lastCopies.length ? <span className="mt-1 block text-cn-text-2">You will have no copies left of: {lastCopies.join(", ")}.</span> : null}
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => dialog.current?.close()}>Keep my cards</button>
          <button type="button" className="min-h-11 rounded-full bg-cn-danger px-5 text-sm font-semibold text-[#2a0a10] transition hover:brightness-110 disabled:opacity-60" disabled={busy || !selectedCount} onClick={destroy} data-testid="confirm-bulk-dismantle">
            {busy ? `Destroying ${progress.done + 1} of ${progress.total}...` : `Destroy for ${totalCrystal.toLocaleString("en-US")} Crystal`}
          </button>
        </div>
      </dialog>
    </section>
  );
}
