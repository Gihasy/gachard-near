"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

/** The two views of My Cards. Both stay in the page, so switching is instant. */
export default function CollectionTabs({ cards, series, cardCount, seriesCount }: { cards: ReactNode; series: ReactNode; cardCount: number; seriesCount: number }) {
  const [tab, setTab] = useState<"cards" | "series">("cards");
  const tabs = [
    { id: "cards" as const, label: "All cards", count: cardCount },
    { id: "series" as const, label: "Series", count: seriesCount },
  ];

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const next = tab === "cards" ? "series" : "cards";
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="My cards" className="flex gap-1 border-b border-cn-line mb-5" onKeyDown={onKey}>
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px min-h-11 px-4 border-b-2 text-sm font-semibold transition ${tab === id ? "border-cn-lavender text-cn-text-1" : "border-transparent text-cn-text-3 hover:text-cn-text-1"}`}
          >
            {label} <span className="ml-1 text-xs font-medium text-cn-text-3 tabular">{count}</span>
          </button>
        ))}
      </div>
      <div id="panel-cards" role="tabpanel" aria-labelledby="tab-cards" hidden={tab !== "cards"}>{cards}</div>
      <div id="panel-series" role="tabpanel" aria-labelledby="tab-series" hidden={tab !== "series"}>{series}</div>
    </>
  );
}
