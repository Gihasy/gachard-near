"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PrintIcon, SearchIcon } from "@/components/icons";
import { CardImage, inputClass } from "@/components/ui";

export interface SeriesItem {
  id: number;
  name: string;
  category: string;
  creator: string;
  cardCount: number;
  covers: { id: number; media: string; rarity: string }[];
}

const ALL = "All";

export default function SeriesBrowser({ items, categories, initialQuery, initialCategory }: {
  items: SeriesItem[];
  categories: string[];
  initialQuery: string;
  initialCategory: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(categories.includes(initialCategory) ? initialCategory : ALL);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (category !== ALL && item.category !== category) return false;
      const text = `${item.name} ${item.creator} ${item.category}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [items, query, category]);

  return (
    <>
      <div className="mt-6 flex flex-col lg:flex-row lg:items-center gap-3">
        <label className="relative block lg:w-96 shrink-0">
          <span className="sr-only">Search series</span>
          <SearchIcon width={18} height={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-cn-text-3" />
          <input
            className={`${inputClass} !pl-11`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a character, creator or series"
            data-testid="series-search"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {[ALL, ...categories].map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="font-display font-semibold text-lg">Nothing matches that yet.</p>
          <button type="button" className="mt-3 text-sm font-semibold text-cn-lavender hover:underline" onClick={() => { setQuery(""); setCategory(ALL); }}>
            Show every series
          </button>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((item) => (
            <Link key={item.id} href={`/series/${item.id}`} data-testid="series-card" className="panel panel-link group block p-5 overflow-hidden">
              <div className="relative h-52 flex items-center justify-center">
                <div className="absolute inset-x-8 inset-y-2 rounded-full blur-3xl opacity-40 bg-cn-lavender" />
                <div className="flex -space-x-14 relative">
                  {item.covers.map((card, i) => (
                    <div key={card.id} className="w-32 transition-transform duration-500 group-hover:-translate-y-1" style={{ transform: `rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                      <CardImage src={card.media} alt="" rarity={card.rarity} />
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-xs font-semibold text-cn-lavender">{item.category}</p>
              <h3 className="mt-1 font-display font-semibold text-base leading-snug">{item.name}</h3>
              <p className="mt-1 text-sm text-cn-text-2 truncate">by {item.creator}</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-cn-text-3">
                {item.cardCount} {item.cardCount === 1 ? "card" : "cards"}, all printable <PrintIcon width={14} height={14} />
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
