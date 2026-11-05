import { notFound } from "next/navigation";
import OpenPackButton from "@/components/OpenPackButton";
import PackArt from "@/components/PackArt";
import TiltCard from "@/components/TiltCard";
import { Eyebrow, Page, Panel, Rarity, RARITY_COLOR } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { collectorLabel } from "@/lib/near";
import { CARDS_PER_PACK, PACKS_PER_DAY } from "@/lib/packs";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = (await readDb()).series.find((s) => s.id === Number(id));
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
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-14 grid sm:grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_minmax(280px,340px)] gap-6 md:gap-10 items-center">
          <div className="w-36 sm:w-44 mx-auto sm:mx-0 -rotate-3 pack-idle">
            <PackArt name={series.name} cards={CARDS_PER_PACK} />
          </div>
          <div className="min-w-0">
            <Eyebrow>Released by {collectorLabel(series.creatorAccount)}</Eyebrow>
            <h1 className="mt-4 font-display font-bold text-2xl sm:text-4xl leading-tight break-words">{series.name}</h1>
            <p className="mt-3 text-cn-text-2 leading-relaxed max-w-lg">
              Opening is free. See all {CARDS_PER_PACK} cards, then buy or skip. You only pay for what you have seen.
            </p>
          </div>
          <div className="panel p-5 sm:col-span-2 md:col-span-1">
            {missing.length ? (
              <p className="text-sm text-cn-text-3">This series still needs a {missing[0]} card.</p>
            ) : (
              <>
                <OpenPackButton seriesId={series.id} signedIn={Boolean(user)} />
                <p className="mt-3 text-center text-xs text-cn-text-3">Up to {PACKS_PER_DAY} packs a day</p>
              </>
            )}
          </div>
        </div>
      </section>

      <Page>
        <div className="grid lg:grid-cols-[320px_1fr] gap-8 items-start">
          <Panel className="lg:sticky lg:top-24">
            <h2 className="font-display font-semibold text-base">Rates and prices</h2>
            <p className="mt-1 text-xs text-cn-text-3 leading-relaxed">Set by the creator. A pack costs the sum of its cards.</p>
            <ul className="mt-4 space-y-4">
              {RARITIES.map((r, i) => (
                <li key={r}>
                  <div className="flex items-baseline justify-between text-sm">
                    <Rarity value={r} />
                    <span className="tabular text-cn-text-2">{series.ratesBps[i] / 100}%</span>
                  </div>
                  <div className="rate-bar mt-1.5">
                    <span style={{ width: `${series.ratesBps[i] / 100}%`, background: RARITY_COLOR[r] }} />
                  </div>
                  <p className="mt-1 text-xs text-cn-credits tabular">{series.prices[i].toLocaleString("en-US")} Credits</p>
                </li>
              ))}
            </ul>
          </Panel>

          <div>
            <h2 className="font-display font-semibold text-lg">In this series</h2>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
              {series.templates.map((t) => (
                <div key={t.id}>
                  <TiltCard src={t.media} alt={t.name} rarity={RARITIES[t.rarity]} />
                  <p className="mt-3 text-sm font-semibold truncate">{t.name}</p>
                  <Rarity value={RARITIES[t.rarity]} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}
