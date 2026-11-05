"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { CardImage, Panel, Rarity, primaryBtn, secondaryBtn } from "@/components/ui";

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

export default function PackReveal({ initial }: { initial: View }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reveal = async (index: number) => {
    try {
      setView(await post<View>(`/api/packs/${view.id}/reveal`, { index }));
    } catch (e) {
      setError((e as Error).message);
    }
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {view.cards.map((card, i) =>
          card ? (
            <div key={i} data-testid={`card-${i}`}>
              <CardImage src={card.media} alt={card.name} />
              <p className="mt-2 text-sm font-medium">{card.name}</p>
              <div className="flex justify-between items-center">
                <Rarity value={card.rarity} />
                {view.allOpen ? <span className="text-xs text-cn-credits tabular">{card.price}</span> : null}
              </div>
            </div>
          ) : (
            <button key={i} onClick={() => reveal(i)} data-testid={`card-${i}`} aria-label={`Open card ${i + 1}`} className="block hover:scale-[1.02] transition">
              <CardImage src="/cards/card-back.webp" alt="" />
              <p className="mt-2 text-sm text-cn-text-3">Tap to open</p>
            </button>
          ),
        )}
      </div>

      <Panel>
        {view.status === "bought" ? (
          <div data-testid="bought">
            <h2 className="font-semibold text-cn-success">These cards are yours.</h2>
            <p className="mt-2 text-sm text-cn-text-2">Each has its own public record. Open one to verify or print it.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className={primaryBtn} href="/collection">Go to collection</Link>
              <Link className={secondaryBtn} href={`/scan/${view.tokenIds[0]}`}>See the first card&apos;s record</Link>
            </div>
          </div>
        ) : view.status === "skipped" ? (
          <div>
            <h2 className="font-semibold">Pack skipped. Nothing was charged.</h2>
            <Link className={`${secondaryBtn} mt-4`} href={`/series/${view.seriesId}`}>Back to the series</Link>
          </div>
        ) : view.status === "unresolved" || view.status === "minting" ? (
          <p className="text-sm text-cn-text-2">We could not confirm this purchase yet, so your Credits are held. Check your collection shortly.</p>
        ) : view.allOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-cn-text-3">This pack</p>
              <p className="text-2xl font-bold text-cn-credits tabular" data-testid="pack-price">{view.price?.toLocaleString("en-US")} Credits</p>
            </div>
            <div className="flex gap-3">
              <button className={secondaryBtn} disabled={busy} onClick={skip} data-testid="skip">Skip</button>
              <button className={primaryBtn} disabled={busy} onClick={buy} data-testid="buy">{busy ? "Buying..." : "Buy this pack"}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-cn-text-2">The price appears once every card is open.</p>
            <button
              className={secondaryBtn}
              data-testid="open-all"
              onClick={async () => {
                for (let i = 0; i < view.cards.length; i += 1) if (!view.cards[i]) await reveal(i);
              }}
            >
              Open all
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-cn-danger" role="alert">{error}</p> : null}
      </Panel>
    </div>
  );
}
