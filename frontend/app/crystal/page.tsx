import Link from "next/link";
import { redirect } from "next/navigation";
import CrystalPackList from "@/components/CrystalPackList";
import CrystalTradeList, { type TradeItem } from "@/components/CrystalTradeList";
import { ArrowIcon, CrystalGem } from "@/components/icons";
import { Eyebrow, Page, secondaryBtn } from "@/components/ui";
import { cardsOf } from "@/lib/cards";
import { isListed, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { CRYSTAL_BY_RARITY, CRYSTAL_PACK_PRICE, TRADE_PRICE } from "@/lib/economy";
import { splitSeriesName } from "@/lib/series-name";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function CrystalShop() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/crystal");
  const [cards, { series }] = await Promise.all([cardsOf(user.accountId), readDb()]);
  const crystal = user.crystal ?? 0;
  const live = series.filter(isListed);
  const held = new Set(cards.map((card) => card.design));

  // Copies beyond the first of a card, which can be dismantled without losing it.
  const copies = new Map<string, number>();
  for (const card of cards) copies.set(card.design, (copies.get(card.design) ?? 0) + 1);
  const duplicates = [...copies.values()].reduce((sum, count) => sum + count - 1, 0);

  // Cards from series the collector has started come first, because those finish a set.
  const started = new Set(cards.map((card) => Number(card.design.split(":")[0])));
  const missing: TradeItem[] = [...live]
    .sort((a, b) => Number(started.has(b.id)) - Number(started.has(a.id)))
    .flatMap((s) => s.templates
      .filter((t) => !held.has(`${s.id}:${t.id}`))
      .map((t) => ({
        seriesId: s.id,
        seriesName: splitSeriesName(s.name).title,
        templateId: t.id,
        name: t.name,
        media: t.media,
        rarity: RARITIES[t.rarity],
        price: TRADE_PRICE[t.rarity],
        started: started.has(s.id),
      })));

  return (
    <Page wide>
      <Eyebrow>Crystal Shop</Eyebrow>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-4xl">Spend your Crystal</h1>
          <p className="mt-2 max-w-xl text-cn-text-2 leading-relaxed">Trade Crystal for the card you are missing, or for a whole pack.</p>
        </div>
        <p className="inline-flex items-center gap-2.5 font-display font-bold text-2xl sm:text-3xl" data-testid="shop-balance">
          <CrystalGem size={30} />
          <span className="tabular">{crystal.toLocaleString("en-US")}</span>
        </p>
      </div>

      <section className="panel mt-6 px-4 py-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3" data-testid="shop-earn">
        <p className="min-w-0 flex-1 basis-64 text-sm text-cn-text-2 leading-relaxed">
          <strong className="font-semibold text-cn-text-1">Need more?</strong>{" "}
          {duplicates ? `You have ${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"} to dismantle. ` : ""}
          A card gives {CRYSTAL_BY_RARITY.join(", ")} Crystal, from Common to Legendary.
        </p>
        <Link className={`${secondaryBtn} !min-h-10`} href="/collection">Go to My Cards <ArrowIcon width={15} height={15} /></Link>
      </section>

      <section className="mt-10" aria-labelledby="shop-packs">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="shop-packs" className="font-display font-semibold text-lg sm:text-xl">Crystal Pack</h2>
          <p className="text-sm text-cn-text-3">Five cards drawn at the series&apos; published odds.</p>
        </div>
        <CrystalPackList
          crystal={crystal}
          price={CRYSTAL_PACK_PRICE}
          series={[...live].reverse().map((s) => ({ id: s.id, name: splitSeriesName(s.name).title, logo: s.logo }))}
        />
      </section>

      <section className="mt-10" aria-labelledby="shop-trade">
        <h2 id="shop-trade" className="font-display font-semibold text-lg sm:text-xl">Trade for a card</h2>
        <CrystalTradeList crystal={crystal} items={missing} />
      </section>

      <p className="mt-10 text-xs text-cn-text-3 leading-relaxed">Crystal cannot be bought, sent or cashed out. These figures are examples for this demo.</p>
    </Page>
  );
}
