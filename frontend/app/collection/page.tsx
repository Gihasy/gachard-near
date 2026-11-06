import Link from "next/link";
import { redirect } from "next/navigation";
import CollectionGrid from "@/components/CollectionGrid";
import CrystalBalance from "@/components/CrystalBalance";
import CollectionTabs from "@/components/CollectionTabs";
import SeriesProgress, { startedSeries } from "@/components/SeriesProgress";
import UsernameForm from "@/components/UsernameForm";
import { ArrowIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, primaryBtn } from "@/components/ui";
import { cardsOf } from "@/lib/cards";
import { RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { CRYSTAL_BY_RARITY } from "@/lib/economy";
import { defaultUsername } from "@/lib/near";
import { splitSeriesName } from "@/lib/series-name";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Collection() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/collection");
  const [cards, { series }] = await Promise.all([cardsOf(user.accountId), readDb()]);
  const username = user.username ?? defaultUsername(user.accountId);
  // Only a digital card can be dismantled, so only those count as spare copies.
  const copies = new Map<string, number>();
  for (const c of cards) copies.set(c.design, (copies.get(c.design) ?? 0) + 1);
  const spare = new Map<string, number>();
  for (const c of cards) if (c.status === "Digital") spare.set(c.design, (spare.get(c.design) ?? 0) + 1);
  const duplicates = [...spare].reduce((sum, [design, count]) => sum + Math.min(count, (copies.get(design) ?? 1) - 1), 0);
  const crystalByRarity = Object.fromEntries(RARITIES.map((name, i) => [name, CRYSTAL_BY_RARITY[i]]));
  const seriesNames = Object.fromEntries(series.map((row) => [row.id, splitSeriesName(row.name).title]));
  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-5 mb-6">
        <div>
          <Eyebrow>@{username}</Eyebrow>
          <h1 className="mt-4 font-display font-bold text-2xl sm:text-4xl">My cards</h1>
          <p className="mt-2 text-cn-text-2">{cards.length} {cards.length === 1 ? "card" : "cards"}{cards.length ? ". Open any card to verify or print it." : ""}</p>
        </div>
        <UsernameForm username={username} />
      </div>

      <CrystalBalance
        crystal={user.crystal ?? 0}
        duplicates={duplicates}
      />

      {cards.length === 0 ? (
        <div className="panel p-8 sm:p-12 text-center">
          <div className="flex justify-center -space-x-12 mb-6" aria-hidden="true">
            {[-10, 0, 10].map((r) => (
              <div key={r} className="w-24 opacity-70" style={{ transform: `rotate(${r}deg)` }}>
                <CardImage src="/cards/card-back.webp" alt="" />
              </div>
            ))}
          </div>
          <p className="font-display font-semibold text-lg">No cards yet.</p>
          <p className="mt-2 text-cn-text-2">Buy a pack and see what you find.</p>
          <Link className={`${primaryBtn} mt-5`} href="/series">Browse series <ArrowIcon width={16} height={16} /></Link>
        </div>
      ) : (
        <CollectionTabs
          cardCount={cards.length}
          seriesCount={startedSeries(series, cards).length}
          cards={<CollectionGrid cards={cards} seriesNames={seriesNames} crystalByRarity={crystalByRarity} locked={user.lockedDesigns ?? []} />}
          series={<SeriesProgress series={series} cards={cards} crystal={user.crystal ?? 0} />}
        />
      )}
    </Page>
  );
}
