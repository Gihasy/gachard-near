import { notFound } from "next/navigation";
import OpenPackButton from "@/components/OpenPackButton";
import PackArt from "@/components/PackArt";
import { PrintIcon } from "@/components/icons";
import CardZoom from "@/components/CardZoom";
import { Eyebrow, Page, Rarity, RARITY_COLOR, SeriesName } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { splitSeriesName } from "@/lib/series-name";
import { CARDS_PER_PACK, packPrice } from "@/lib/packs";
import { currentUser, nameOf } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readDb();
  const series = db.series.find((s) => s.id === Number(id));
  if (!series) notFound();
  const user = await currentUser();
  const missing = missingRarities(series);
  const cover = [...series.templates].sort((a, b) => b.rarity - a.rarity)[0];

  return (
    <>
      <section className="relative overflow-hidden border-b border-cn-line">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.media} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-25 blur-3xl scale-125" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-cn-bg" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-14 grid sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_minmax(280px,340px)] gap-6 md:gap-10 items-center">
          <div className="w-36 sm:w-44 mx-auto sm:mx-0 -rotate-3 pack-idle">
            {series.name.startsWith("Crystal Night") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/packs/crystal-night.webp" alt="" aria-hidden="true" className="w-full rounded-xl shadow-2xl" />
            ) : (
              <PackArt name={splitSeriesName(series.name).title} cards={CARDS_PER_PACK} logo={series.logo} />
            )}
          </div>
          <div className="min-w-0">
            <Eyebrow>Released by {nameOf(series.creatorAccount, db.users)}</Eyebrow>
            <h1 className="mt-4 font-display font-bold text-2xl sm:text-4xl leading-tight break-words"><SeriesName name={series.name} /></h1>
            {series.description ? <p className="mt-3 text-cn-text-1 leading-relaxed max-w-lg">{series.description}</p> : null}
            <p className="mt-3 text-cn-text-2 leading-relaxed max-w-lg">
              Every pack holds {CARDS_PER_PACK} cards at one price. They are drawn at random, at the rates shown here, when you buy.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">
              <PrintIcon width={16} height={16} className="text-cn-lavender" /> Every card you buy can also be printed.
            </p>
          </div>
          <div className="hidden md:block panel p-5 sm:col-span-2 lg:col-span-1">
            {series.hidden ? (
              <p className="text-sm text-cn-text-3">This series has been retired and sells no new packs. Cards already bought stay valid.</p>
            ) : missing.length ? (
              <p className="text-sm text-cn-text-3">This series still needs a {missing[0]} card.</p>
            ) : (
              <>
                <OpenPackButton seriesId={series.id} signedIn={Boolean(user)} price={packPrice(series)} />
                <p className="mt-3 text-center text-xs text-cn-text-3">Simulated Credits, no real money. Missing a card? Trade Crystal for it in My Cards.</p>
              </>
            )}
          </div>
        </div>
      </section>

      {!series.hidden && missing.length === 0 ? (
        <div className="buy-bar md:hidden">
          <OpenPackButton seriesId={series.id} signedIn={Boolean(user)} price={packPrice(series)} />
        </div>
      ) : null}
      <Page>
        <section aria-labelledby="odds" className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="odds" className="font-display font-semibold text-base">The odds</h2>
            <p className="text-xs text-cn-text-3">Set by the creator, for each of a pack&apos;s {CARDS_PER_PACK} cards.</p>
          </div>
          <div className="mt-3 flex h-2.5 gap-0.5 rounded-full overflow-hidden" aria-hidden="true">
            {RARITIES.map((r, i) => (
              <span key={r} style={{ width: `${series.ratesBps[i] / 100}%`, background: RARITY_COLOR[r] }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-1.5">
            {RARITIES.map((r, i) => (
              <li key={r} className="inline-flex items-center gap-2 text-sm">
                <Rarity value={r} />
                <span className="tabular text-cn-text-2">{series.ratesBps[i] / 100}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="font-display font-semibold text-lg">In this series <span className="ml-1 text-sm font-medium text-cn-text-3 tabular">{series.templates.length}</span></h2>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
            {[...series.templates].sort((a, b) => b.rarity - a.rarity || a.id - b.id).map((t) => (
              <div key={t.id} data-template={t.id} data-rarity-index={t.rarity}>
                <CardZoom src={t.media} alt={t.name} rarity={RARITIES[t.rarity]} />
                <p className="mt-2.5 text-sm font-semibold truncate">{t.name}</p>
                <Rarity value={RARITIES[t.rarity]} />
              </div>
            ))}
          </div>
        </section>
      </Page>
    </>
  );
}
