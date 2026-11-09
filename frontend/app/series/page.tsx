import Link from "next/link";
import SeriesDirectory, { type DirectoryItem } from "@/components/SeriesDirectory";
import { Page, primaryBtn, Title } from "@/components/ui";
import { CATEGORIES, DEFAULT_CATEGORY } from "@/lib/categories";
import { isListed, RARITIES } from "@/lib/catalog";
import { readDb, type SeriesRow } from "@/lib/db";
import { nameOf } from "@/lib/users";

export const dynamic = "force-dynamic";

const PREVIEW = 4;

// The rarest first, so a series shows its best cards.
const previewOf = (series: SeriesRow) => [...series.templates].sort((a, b) => b.rarity - a.rarity || a.id - b.id).slice(0, PREVIEW);

export default async function AllSeries({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  const [{ series, users }, { q, category }] = await Promise.all([readDb(), searchParams]);
  const items: DirectoryItem[] = series.filter(isListed).reverse().map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category ?? DEFAULT_CATEGORY,
    creator: nameOf(s.creatorAccount, users),
    description: s.description,
    logo: s.logo,
    cardCount: s.templates.length,
    previews: previewOf(s).map((t) => ({ id: t.id, name: t.name, media: t.media, rarity: RARITIES[t.rarity] })),
  }));
  const categories = CATEGORIES.filter((name) => items.some((item) => item.category === name));

  return (
    <Page wide>
      <Title eyebrow="Series" sub="That character you can't stop thinking about. The idol you'd stay up all night for. They deserve a place in your collection, and maybe even on your desk.">
        Find the cards you love
      </Title>

      {items.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-cn-text-2">No series yet.</p>
          <Link className={`${primaryBtn} mt-5`} href="/creator">Release a series</Link>
        </div>
      ) : (
        <>
          <SeriesDirectory
            items={items}
            categories={categories}
            initialQuery={typeof q === "string" ? q : ""}
            initialCategory={typeof category === "string" ? category : ""}
          />
          <p className="mt-6 text-xs text-cn-text-3">Demo series. Mochi Puffs, Aika Nova, Luma Four and Thornmaw Wilds are invented, and are not real people or brands. Their art is AI generated.</p>
        </>
      )}
    </Page>
  );
}
