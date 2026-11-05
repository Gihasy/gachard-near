"use client";

/**
 * The Store tab (design/gachard.pen: "Store · Mobile", "Flow · Reveal Store").
 *
 * Everything it knows about a pack comes from /api/store, which sends a card
 * only once it is revealed and a price only once the pack is. This component
 * never guesses either.
 *
 * Buying arrives in phase 2 (docs/PLAN-STORE-V2.md), so the buy buttons are
 * shown but disabled.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CatalogCardView, CardView, SlotView, StoreView } from "@/lib/v2/store-view";

interface Catalog {
  seriesName: string;
  seasonId: number;
  cards: CatalogCardView[];
}

type Loaded =
  | { kind: "loading" }
  | { kind: "preparing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; view: StoreView; catalog: Catalog };

const RARITY = ["Common", "Rare", "Epic", "Legendary"] as const;
const RARITY_COLOR = ["--cn-rarity-common", "--cn-rarity-rare", "--cn-rarity-epic", "--cn-rarity-legendary"];
const PACK_NAMES = ["Aurora", "Nebula", "Prism", "Comet", "Halo"];
const PREPARING_RETRY_MS = 3000;
/** About a minute of "preparing" before the page says something is wrong. */
const PREPARING_TRIES = 20;

const number = (n: number) => n.toLocaleString("en-US");

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "1 Legendary · 1 Rare · 1 Common", highest rarity first, with limited cards counted on their own. */
function revealedSummary(cards: (CardView | null)[]): { text: string; limited: boolean } {
  const shown = cards.filter((c): c is CardView => c !== null);
  const limited = shown.filter((c) => c.limited).length;
  const counts = [0, 0, 0, 0];
  for (const c of shown) if (!c.limited) counts[c.rarity]++;
  const parts = [
    ...(limited ? [`${limited} Limited ✦`] : []),
    ...[3, 2, 1, 0].filter((r) => counts[r]).map((r) => `${counts[r]} ${RARITY[r]}`),
  ];
  return { text: parts.join(" · "), limited: limited > 0 };
}

/**
 * Fetch the store, waiting through "preparing" (a new rotation's seed takes a
 * few seconds). Sets no state itself: the caller applies the result.
 */
async function fetchStore(onPreparing: () => void, cancelled: () => boolean): Promise<Loaded | "login" | null> {
  for (let attempt = 0; attempt < PREPARING_TRIES; attempt++) {
    if (cancelled()) return null;
    let res: Response;
    try {
      res = await fetch("/api/store", { credentials: "include", cache: "no-store" });
    } catch {
      return { kind: "error", message: "Could not reach the store. Check your connection." };
    }
    if (res.status === 401) return "login";
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.status === "ready") return { kind: "ready", view: body.view, catalog: body.catalog };
    if (res.status === 503 || body.status === "preparing") {
      onPreparing();
      await new Promise((r) => setTimeout(r, PREPARING_RETRY_MS));
      continue;
    }
    return { kind: "error", message: body.error ?? "The store could not be loaded." };
  }
  return { kind: "error", message: "The store is taking longer than usual. Try again in a minute." };
}

export default function StoreWorkspace() {
  const router = useRouter();
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  /** Bumped to load again: "Try again", or the rotation ending. */
  const [loadKey, setLoadKey] = useState(0);
  /** When the rotation ends, in this browser's clock: server seconds left plus the time of the answer. */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Reveals run one after another, so a later response never replaces a newer view with an older one. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetchStore(
      () => {
        if (!cancelled) setState({ kind: "preparing" });
      },
      () => cancelled,
    ).then((result) => {
      if (cancelled || result === null) return;
      if (result === "login") {
        router.push("/login?next=/store");
        return;
      }
      setState(result);
      if (result.kind === "ready") {
        setSecondsLeft(result.view.secondsLeft);
        setDeadline(Date.now() + result.view.secondsLeft * 1000);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadKey, router]);

  // The rotation timer. At zero a new rotation has begun, with a new shelf.
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(timer);
        setDeadline(null);
        setLoadKey((k) => k + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const reveal = useCallback((slot: number, card: number) => {
    queue.current = queue.current.then(async () => {
      setRevealing(`${slot}:${card}`);
      setNotice(null);
      try {
        const res = await fetch("/api/store/reveal", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot, card }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setState((prev) => (prev.kind === "ready" ? { ...prev, view: body.view } : prev));
        } else {
          setNotice(body.error ?? "Could not reveal that card. Try again.");
        }
      } catch {
        setNotice("Could not reach the store. Check your connection.");
      } finally {
        setRevealing(null);
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-cn-bg text-cn-text-1">
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-40 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[28px] leading-tight">Your shelf</h1>
          {state.kind === "ready" && (
            <div className="flex items-center gap-2 rounded-full border border-cn-line bg-cn-surface-2 px-3 py-1.5 text-[13px]">
              <span className="font-semibold text-cn-text-2">Rotation</span>
              <span className="tabular font-extrabold" aria-label="Time left in this rotation">
                {clock(secondsLeft)}
              </span>
            </div>
          )}
        </header>
        <p className="mt-2 text-sm text-cn-text-2">
          Reveal for free, one card at a time. Pay only for what you have seen.
        </p>

        {notice && (
          <p role="status" className="mt-4 rounded-cn-md border border-cn-line bg-cn-surface-1 px-4 py-3 text-sm text-cn-danger">
            {notice}
          </p>
        )}

        {state.kind === "loading" && <Placeholder text="Loading your shelf…" />}
        {state.kind === "preparing" && <Placeholder text="Preparing the store…" pulse />}
        {state.kind === "error" && (
          <div className="mt-8 rounded-cn-lg border border-cn-line bg-cn-surface-1 p-6 text-center">
            <p className="text-sm text-cn-text-2">{state.message}</p>
            <button
              type="button"
              onClick={() => {
                setState({ kind: "loading" });
                setLoadKey((k) => k + 1);
              }}
              className="mt-4 rounded-cn-md bg-cn-surface-3 px-4 py-2 text-sm font-bold"
            >
              Try again
            </button>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div className="mt-6 flex flex-col gap-4">
              {state.view.slots.map((slot) => (
                <PackPanel
                  key={slot.slot}
                  slot={slot}
                  catalog={state.catalog}
                  revealing={revealing}
                  onReveal={reveal}
                />
              ))}
            </div>
            <ShelfBar view={state.view} />
          </>
        )}
      </div>
    </div>
  );
}

function Placeholder({ text, pulse = false }: { text: string; pulse?: boolean }) {
  return (
    <div className="mt-8 rounded-cn-lg border border-cn-line bg-cn-surface-1 p-10 text-center" role="status">
      <p className={`text-sm text-cn-text-2 ${pulse ? "animate-pulse" : ""}`}>{text}</p>
    </div>
  );
}

function PackPanel({
  slot,
  catalog,
  revealing,
  onReveal,
}: {
  slot: SlotView;
  catalog: Catalog;
  revealing: string | null;
  onReveal: (slot: number, card: number) => void;
}) {
  const name = `Pack ${PACK_NAMES[slot.slot] ?? slot.slot + 1}`;
  const total = slot.cards.length;
  const nextHidden = slot.cards.findIndex((c) => c === null);
  const fully = !slot.soldOut && nextHidden === -1;
  const summary = revealedSummary(slot.cards);

  if (slot.soldOut) {
    return (
      <section className="rounded-cn-lg border border-cn-line bg-cn-surface-1 p-4" aria-label={name}>
        <SlotHeading slot={slot} name={name} />
        <p className="mt-3 text-sm text-cn-text-3">Sold out for this rotation. A new shelf comes with the next one.</p>
      </section>
    );
  }

  return (
    <section className="rounded-cn-lg border border-cn-line bg-cn-surface-1 p-4" aria-label={name}>
      <div className="flex items-start justify-between gap-3">
        <SlotHeading slot={slot} name={name} />
        <div className="text-right">
          <p className="text-xs font-bold text-cn-text-2">
            {slot.revealedCount}/{total} revealed
          </p>
          <div className="mt-1.5 flex justify-end gap-1" aria-hidden>
            {slot.cards.map((c, i) => (
              <span key={i} className={`h-1 w-3 rounded-full ${c ? "bg-cn-pink" : "bg-cn-surface-3"}`} />
            ))}
          </div>
        </div>
      </div>

      {slot.highRarity && (
        <p className="mt-2 inline-block rounded-full border border-cn-line px-2.5 py-0.5 text-[11px] font-bold" style={{ color: "var(--cn-rarity-epic)" }}>
          Detection: Epic or better inside
        </p>
      )}

      <div className="mt-3 grid grid-cols-5 gap-2">
        {slot.cards.map((card, i) => (
          <CardFace
            key={i}
            card={card}
            catalog={catalog}
            busy={revealing === `${slot.slot}:${i}`}
            onReveal={() => onReveal(slot.slot, i)}
            label={`Card ${i + 1} of ${name}`}
          />
        ))}
      </div>

      {summary.text && (
        <p className={`mt-3 text-xs ${summary.limited ? "font-bold text-cn-pink" : "text-cn-text-3"}`}>
          {slot.revealedCount === total && !summary.limited ? summary.text : `Revealed: ${summary.text}`}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-cn-line pt-4">
        {fully ? (
          <div>
            <p className="font-display tabular text-lg text-cn-text-1">
              {number(slot.priceCredits ?? 0)} <span className="text-xs font-semibold text-cn-credits">Credits</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-cn-text-2">
              Dismantle value {number(slot.dismantleCrystal ?? 0)}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-semibold text-cn-text-3">Price appears after</p>
            <p className="text-sm font-extrabold">
              {total - slot.revealedCount} more {total - slot.revealedCount === 1 ? "card" : "cards"} revealed
            </p>
          </div>
        )}
        {fully ? (
          <button
            type="button"
            disabled
            title="Buying opens in the next update"
            className="rounded-cn-md bg-cn-surface-3 px-4 py-2.5 text-sm font-bold text-cn-text-3"
          >
            Buy pack
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onReveal(slot.slot, nextHidden)}
            disabled={revealing !== null}
            className="rounded-cn-md border border-cn-line-strong bg-cn-surface-2 px-4 py-2.5 text-sm font-bold transition hover:bg-cn-surface-3 disabled:opacity-60"
          >
            Keep revealing
          </button>
        )}
      </div>

      {slot.replacementsLeft > 0 && (
        <p className="mt-3 text-[11px] text-cn-text-3">
          Buy this pack and the next one takes its place · {slot.replacementsLeft} left in this slot
        </p>
      )}
    </section>
  );
}

function SlotHeading({ slot, name }: { slot: SlotView; name: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold tracking-[0.12em] text-cn-text-3">SLOT {slot.slot + 1}</p>
      <h2 className="text-base font-extrabold">{name}</h2>
    </div>
  );
}

function CardFace({
  card,
  catalog,
  busy,
  onReveal,
  label,
}: {
  card: CardView | null;
  catalog: Catalog;
  busy: boolean;
  onReveal: () => void;
  label: string;
}) {
  const frame = "relative aspect-[5/7] w-full overflow-hidden rounded-cn-sm border";
  if (!card) {
    return (
      <button
        type="button"
        onClick={onReveal}
        disabled={busy}
        aria-label={`Reveal ${label.toLowerCase()}`}
        className={`${frame} border-cn-line-strong transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-cn-pink ${busy ? "animate-pulse" : ""}`}
      >
        <Image src="/cards/card-back.webp" alt="" fill sizes="20vw" className="object-cover" />
      </button>
    );
  }
  const info = catalog.cards.find((c) => c.templateId === card.templateId);
  const name = info?.name ?? "Card";
  if (card.limited || !info?.artworkUrl) {
    return (
      <div
        className={`${frame} flex flex-col items-center justify-center gap-1 border-cn-pink bg-cn-surface-2 p-1 text-center`}
        role="img"
        aria-label={`${name}, Limited`}
      >
        <span className="text-lg text-cn-pink" aria-hidden>
          ✦
        </span>
        <span className="text-[9px] font-extrabold leading-tight text-cn-pink">Limited</span>
      </div>
    );
  }
  return (
    <div
      className={frame}
      style={{ borderColor: `var(${RARITY_COLOR[card.rarity]})` }}
      role="img"
      aria-label={`${name}, ${RARITY[card.rarity]}`}
    >
      <Image src={info.artworkUrl} alt="" fill sizes="20vw" className="object-cover" />
    </div>
  );
}

function ShelfBar({ view }: { view: StoreView }) {
  const open = view.slots.filter((s) => !s.soldOut);
  const total = open.reduce((n, s) => n + s.cards.length, 0);
  const revealed = open.reduce((n, s) => n + s.revealedCount, 0);
  const { priceCredits, discountedPriceCredits, discountApplies } = view.shelf;
  if (open.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-cn-line bg-cn-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-cn-text-2">
            Shelf · {revealed}/{total} cards revealed
          </p>
          {priceCredits === undefined ? (
            <p className="text-[11px] text-cn-text-3">Shelf price appears once all are revealed</p>
          ) : (
            <p className="font-display tabular whitespace-nowrap text-xl">
              {number(discountApplies && discountedPriceCredits !== undefined ? discountedPriceCredits : priceCredits)}{" "}
              <span className="text-xs font-semibold text-cn-credits">Credits</span>
              {discountApplies && (
                <span className="ml-2 font-sans text-xs text-cn-text-3 line-through">{number(priceCredits)}</span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled
          title="Buying opens in the next update"
          className="shrink-0 whitespace-nowrap rounded-cn-md bg-cn-surface-3 px-3 py-2.5 text-sm font-bold text-cn-text-3 sm:px-4 sm:text-[15px]"
        >
          {discountApplies ? "Buy whole shelf −15%" : "Buy whole shelf"}
        </button>
      </div>
    </div>
  );
}
