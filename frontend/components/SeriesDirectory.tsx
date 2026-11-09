"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import { CardImage, inputClass, SeriesName } from "@/components/ui";

export interface DirectoryItem {
  id: number;
  name: string;
  category: string;
  creator: string;
  description?: string;
  logo?: string;
  cardCount: number;
  previews: { id: number; name: string; media: string; rarity: string }[];
}

const ALL = "All";

/** Every live series, searchable by name, creator, category or description. */
export default function SeriesDirectory({ items, categories, initialQuery, initialCategory }: {
  items: DirectoryItem[];
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
      const text = `${item.name} ${item.creator} ${item.category} ${item.description ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [items, query, category]);

  return (
    <>
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center gap-3">
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
        {categories.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {[ALL, ...categories].map((name) => (
              <button key={name} type="button" className="chip" aria-pressed={category === name} onClick={() => setCategory(name)}>
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="font-display font-semibold text-lg">Nothing matches that yet.</p>
          <button type="button" className="mt-3 text-sm font-semibold text-cn-lavender hover:underline" onClick={() => { setQuery(""); setCategory(ALL); }}>
            Show every series
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="all-series">
          {shown.map((s) => (
            <Link key={s.id} href={`/series/${s.id}`} className="panel panel-link group block p-5 sm:p-6 min-w-0" data-testid="ip-card">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="ip-logo shrink-0">
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo} alt={`${s.name} logo`} loading="lazy" />
                  ) : (
                    <span className="font-display font-bold text-3xl crystal-text" aria-hidden="true">{s.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-cn-lavender">{s.category}</p>
                  <h2 className="mt-1 font-display font-semibold text-base sm:text-lg leading-snug break-words"><SeriesName name={s.name} /></h2>
                  <p className="mt-1 text-sm text-cn-text-2 truncate">by {s.creator}</p>
                  {s.description ? <p className="mt-1.5 text-sm text-cn-text-3 leading-relaxed line-clamp-2">{s.description}</p> : null}
                </div>
                <ArrowIcon width={18} height={18} className="shrink-0 text-cn-text-3 transition group-hover:text-cn-text-1 group-hover:translate-x-0.5" />
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-3">
                {s.previews.map((t) => (
                  <CardImage key={t.id} src={t.media} alt={t.name} rarity={t.rarity} />
                ))}
              </div>
              <p className="mt-4 text-sm text-cn-text-3">{s.cardCount} {s.cardCount === 1 ? "card" : "cards"} in this series</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
