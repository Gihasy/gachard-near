"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { ArrowIcon, CheckIcon, CrystalStar, PrintIcon } from "@/components/icons";
import { CardImage, ErrorLine, Rarity, RARITY_COLOR, primaryBtn, secondaryBtn } from "@/components/ui";

interface Card { name: string; rarity: string; media: string; price: number }
interface View {
  id: string;
  seriesId: number;
  status: string;
  cards: (Card | null)[];
  allOpen: boolean;
  price: number | null;
  tokenIds: string[];
}

const BURST: Record<string, string> = {
  Rare: "#80bafe66",
  Epic: "#c295fc88",
  Legendary: "#f7c96baa",
};
const SPARKS = [[-70, -60], [70, -70], [-85, 10], [85, 20], [-50, 75], [55, 80], [0, -95], [5, 95]];

// Waits for the art, so a card never flips to reveal an empty frame.
function preload(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = image.onerror = () => resolve();
    image.src = src;
  });
}

function PackCard({ card, index, justOpened, onOpen, disabled, showPrice }: {
  card: Card | null;
  index: number;
  justOpened: boolean;
  onOpen: () => void;
  disabled: boolean;
  showPrice: boolean;
}) {
  const faces = (
    <span className="flip-inner">
      <span className="flip-face">
        <CardImage src="/cards/card-back.webp" alt="" />
      </span>
      {card ? (
        <span className="flip-face flip-front">
          <CardImage src={card.media} alt={card.name} rarity={card.rarity} />
        </span>
      ) : null}
    </span>
  );
  const special = card && justOpened && BURST[card.rarity];
  return (
    <div className="relative" data-testid={`card-${index}`}>
      {special ? <span className="burst" style={{ "--burst": BURST[card.rarity] } as React.CSSProperties} aria-hidden="true" /> : null}
      {special && card.rarity !== "Rare"
        ? SPARKS.map(([dx, dy], i) => (
            <span
              key={i}
              className="spark"
              style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, color: RARITY_COLOR[card.rarity], animationDelay: `${260 + i * 28}ms` } as React.CSSProperties}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0 15 9l9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
            </span>
          ))
        : null}
      {/* One element throughout: replacing it would skip the flip. */}
      <button
        type="button"
        className="flip"
        data-open={card ? "true" : "false"}
        onClick={onOpen}
        disabled={disabled || Boolean(card)}
        aria-label={card ? card.name : `Open card ${index + 1}`}
      >
        {faces}
      </button>
      <div className="mt-3 min-h-11">
        {card ? (
          <div className={justOpened ? "pop" : ""}>
            <p className="text-sm font-semibold truncate">{card.name}</p>
            <div className="flex justify-between items-center gap-2">
              <Rarity value={card.rarity} />
              {showPrice ? <span className="pop text-xs text-cn-credits tabular">{card.price.toLocaleString("en-US")}</span> : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-cn-text-3">Tap to open</p>
        )}
      </div>
    </div>
  );
}

export default function PackReveal({ initial }: { initial: View }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openedCount = view.cards.filter(Boolean).length;
  const tally = view.allOpen
    ? ["Legendary", "Epic", "Rare", "Common"]
        .map((r) => [r, view.cards.filter((c) => c?.rarity === r).length] as const)
        .filter(([, n]) => n > 0)
    : [];

  const reveal = async (index: number) => {
    const next = await post<View>(`/api/packs/${view.id}/reveal`, { index });
    const card = next.cards[index];
    if (card) await preload(card.media);
    setOpened((set) => new Set(set).add(index));
    setView(next);
  };

  const revealOne = async (index: number) => {
    setError("");
    try {
      await reveal(index);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const revealAll = async () => {
    setOpening(true);
    setError("");
    try {
      for (let i = 0; i < view.cards.length; i += 1) {
        if (!view.cards[i]) {
          await reveal(i);
          await new Promise((resolve) => setTimeout(resolve, 260));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setOpening(false);
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const buy = () =>
    act(async () => {
      const { tokenIds } = await post<{ tokenIds: string[] }>(`/api/packs/${view.id}/buy`);
      setView((v) => ({ ...v, status: "bought", tokenIds }));
      router.refresh();
    });

  const skip = () =>
    act(async () => {
      await post(`/api/packs/${view.id}/skip`);
      setView((v) => ({ ...v, status: "skipped" }));
    });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-5">
        {view.cards.map((card, i) => (
          <PackCard
            key={i}
            card={card}
            index={i}
            justOpened={opened.has(i)}
            disabled={opening}
            showPrice={view.allOpen}
            onOpen={() => revealOne(i)}
          />
        ))}
      </div>

      <section className="panel p-5 sm:p-6" aria-live="polite">
        {view.status === "bought" ? (
          <div data-testid="bought" className="pop flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <span className="crystal-calm grid place-items-center size-11 rounded-full shrink-0"><CheckIcon /></span>
              <div>
                <h2 className="font-display font-semibold text-lg">These cards are yours.</h2>
                <p className="mt-1 text-sm text-cn-text-2">They are digital now, and any of them can be printed. Each has its own public record.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className={secondaryBtn} href={`/scan/${view.tokenIds[0]}#print`}><PrintIcon width={16} height={16} /> Print or verify the first card</Link>
              <Link className={primaryBtn} href="/collection">Go to my cards <ArrowIcon width={16} height={16} /></Link>
            </div>
          </div>
        ) : view.status === "skipped" ? (
          <div className="pop flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display font-semibold text-lg">Pack skipped. Nothing was charged.</h2>
            <Link className={secondaryBtn} href={`/series/${view.seriesId}`}>Back to the series</Link>
          </div>
        ) : view.status === "unresolved" || view.status === "minting" ? (
          <p className="text-sm text-cn-text-2">We could not confirm this purchase yet, so your Credits are held. Check your collection shortly.</p>
        ) : view.allOpen ? (
          <div className="pop flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm text-cn-text-3">This pack, in simulated Credits</p>
              <p className="font-display font-bold text-3xl text-cn-credits tabular mt-1" data-testid="pack-price">
                {view.price?.toLocaleString("en-US")} <span className="text-base font-semibold">Credits</span>
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {tally.map(([rarity, n]) => (
                  <li key={rarity} style={{ color: RARITY_COLOR[rarity] }} className="font-semibold">{n} {rarity}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className={secondaryBtn} disabled={busy} onClick={skip} data-testid="skip">Skip, pay nothing</button>
              <button className={primaryBtn} disabled={busy} onClick={buy} data-testid="buy">{busy ? "Buying..." : "Buy this pack"}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden="true">
                {view.cards.map((c, i) => (
                  <CrystalStar key={i} size={16} className={c ? "" : "opacity-20 grayscale"} />
                ))}
              </span>
              <p className="text-sm text-cn-text-2">
                {openedCount} of {view.cards.length} open. The price appears with the last card.
              </p>
            </div>
            <button className={secondaryBtn} data-testid="open-all" disabled={opening} onClick={revealAll}>
              {opening ? "Opening..." : "Open all"}
            </button>
          </div>
        )}
        <ErrorLine>{error}</ErrorLine>
      </section>
    </div>
  );
}
