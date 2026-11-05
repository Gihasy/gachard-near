import { notFound } from "next/navigation";
import OpenPackButton from "@/components/OpenPackButton";
import { CardImage, Page, Panel, Rarity, Title } from "@/components/ui";
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
  return (
    <Page>
      <Title sub={`Released by ${collectorLabel(series.creatorAccount)}`}>{series.name}</Title>
      <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
        <div className="space-y-4">
          <Panel>
            <h2 className="font-semibold">Open a pack</h2>
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">
              Opening is free. See all {CARDS_PER_PACK} cards, then buy or skip. Up to {PACKS_PER_DAY} packs a day.
            </p>
            <div className="mt-4">
              {missing.length ? (
                <p className="text-sm text-cn-text-3">This series still needs a {missing[0]} card.</p>
              ) : (
                <OpenPackButton seriesId={series.id} signedIn={Boolean(user)} />
              )}
            </div>
          </Panel>
          <Panel>
            <h2 className="font-semibold">Rates and prices</h2>
            <p className="mt-1 text-xs text-cn-text-3">Set by the creator. Each card&apos;s price is what you pay for it.</p>
            <table className="w-full mt-3 text-sm tabular">
              <tbody>
                {RARITIES.map((r, i) => (
                  <tr key={r} className="border-t border-cn-line">
                    <td className="py-2"><Rarity value={r} /></td>
                    <td className="py-2 text-right text-cn-text-2">{series.ratesBps[i] / 100}%</td>
                    <td className="py-2 text-right text-cn-credits">{series.prices[i].toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 content-start">
          {series.templates.map((t) => (
            <div key={t.id}>
              <CardImage src={t.media} alt={t.name} />
              <p className="mt-2 text-sm font-medium">{t.name}</p>
              <Rarity value={RARITIES[t.rarity]} />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
