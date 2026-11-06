import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { CardImage, Page, primaryBtn, SeriesName, Title } from "@/components/ui";
import { DEFAULT_CATEGORY } from "@/lib/categories";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb, type SeriesRow } from "@/lib/db";
import { nameOf } from "@/lib/users";

export const dynamic = "force-dynamic";

const PREVIEW = 4;

// The rarest first, so a series shows its best cards.
const previewOf = (series: SeriesRow) => [...series.templates].sort((a, b) => b.rarity - a.rarity || a.id - b.id).slice(0, PREVIEW);

export default async function AllSeries() {
  const { series, users } = await readDb();
  const live = series.filter((s) => !s.hidden && missingRarities(s).length === 0).reverse();

  return (
    <Page wide>
      <Title eyebrow="Series" sub="Every IP released on Gachard, with its logo and some of its cards. Open one to see its odds and buy a pack.">
        Find the IP you love
      </Title>

      {live.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-cn-text-2">No series yet.</p>
          <Link className={`${primaryBtn} mt-5`} href="/creator">Release a series</Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4" data-testid="all-series">
          {live.map((s) => (
            <Link key={s.id} href={`/series/${s.id}`} className="panel panel-link group block p-5 sm:p-6" data-testid="ip-card">
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
                  <p className="text-xs font-semibold text-cn-lavender">{s.category ?? DEFAULT_CATEGORY}</p>
                  <h2 className="mt-1 font-display font-semibold text-base sm:text-lg leading-snug break-words"><SeriesName name={s.name} /></h2>
                  <p className="mt-1 text-sm text-cn-text-2 truncate">by {nameOf(s.creatorAccount, users)}</p>
                </div>
                <ArrowIcon width={18} height={18} className="shrink-0 text-cn-text-3 transition group-hover:text-cn-text-1 group-hover:translate-x-0.5" />
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-3">
                {previewOf(s).map((t) => (
                  <CardImage key={t.id} src={t.media} alt={t.name} rarity={RARITIES[t.rarity]} />
                ))}
              </div>
              <p className="mt-4 text-sm text-cn-text-3">{s.templates.length} {s.templates.length === 1 ? "card" : "cards"} in this series</p>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
