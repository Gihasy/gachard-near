"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowIcon, LockIcon, PrintIcon } from "@/components/icons";
import { CardImage, Rarity, primaryBtn, secondaryBtn } from "@/components/ui";
import type { OwnedCard } from "@/lib/cards";

/** A quick look at a card from My Cards. Its own page stays the public record. */
export default function CardViewDialog({ card, seriesName, copies, locked, onClose, onToggleLock, onDismantle }: {
  card: OwnedCard | null;
  seriesName?: string;
  copies?: number;
  locked?: boolean;
  onClose: () => void;
  onToggleLock?: () => void;
  onDismantle?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (card && !dialog.current?.open) dialog.current?.showModal();
    if (!card && dialog.current?.open) dialog.current.close();
  }, [card]);

  const digital = card?.status === "Digital";

  return (
    <dialog
      ref={dialog}
      className="card-view"
      aria-label={card?.name}
      data-testid="card-view"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      {card ? (
        <div className="card-view-body">
          <div className="card-view-art">
            <CardImage src={card.media} alt={card.name} rarity={card.rarity} eager full />
          </div>
          <div className="min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {seriesName ? <p className="text-sm text-cn-text-2 truncate">{seriesName}</p> : null}
                <h2 className="mt-0.5 font-display font-bold text-xl sm:text-2xl leading-tight break-words">{card.name}</h2>
              </div>
              <button type="button" className="card-view-close" aria-label="Close" onClick={() => dialog.current?.close()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Rarity value={card.rarity} />
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${digital ? "bg-[#7ee0a61f] text-cn-success" : "bg-[#f7c96b1f] text-cn-credits"}`}>
                {digital ? "Digital" : card.status === "Printed" ? "Printed" : "Returning"}
              </span>
              {locked ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-cn-credits"><LockIcon width={13} height={13} /> Locked</span> : null}
            </div>
            <p className="mt-3 text-sm text-cn-text-3 tabular">
              Card #{card.tokenId}{copies && copies > 1 ? ` · You have ${copies} copies` : ""}
            </p>

            <div className="mt-5 grid gap-2.5 sm:mt-auto sm:pt-5">
              <Link className={primaryBtn} href={`/scan/${card.tokenId}#print`} data-testid="card-view-print">
                <PrintIcon width={16} height={16} /> Print or send
              </Link>
              <Link className={secondaryBtn} href={`/scan/${card.tokenId}`} data-testid="card-view-record">
                View full record <ArrowIcon width={15} height={15} />
              </Link>
              {onToggleLock || onDismantle ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {onToggleLock ? (
                    <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-cn-text-2 hover:text-cn-text-1 transition" onClick={onToggleLock} data-testid="card-view-lock">
                      <LockIcon width={15} height={15} open={!locked} /> {locked ? "Unlock" : "Lock"}
                    </button>
                  ) : null}
                  {onDismantle && digital && !locked ? (
                    <button type="button" className="min-h-10 text-sm font-semibold text-cn-danger hover:brightness-110 transition" onClick={onDismantle} data-testid="card-view-dismantle">
                      Dismantle
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * A card that opens the quick look when clicked. It stays a real link, so opening it in
 * a new tab still goes to the card's page.
 */
export function CardPeek({ card, seriesName, label, children }: { card: OwnedCard; seriesName?: string; label?: string; children: ReactNode }) {
  const [viewing, setViewing] = useState(false);
  const open = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setViewing(true);
  };
  return (
    <>
      <Link href={`/scan/${card.tokenId}`} className="block rounded-lg" aria-label={label} onClick={open}>{children}</Link>
      <CardViewDialog card={viewing ? card : null} seriesName={seriesName} onClose={() => setViewing(false)} />
    </>
  );
}
