import Link from "next/link";
import { redirect } from "next/navigation";
import CrystalShop from "@/components/CrystalShop";
import SeriesProgress from "@/components/SeriesProgress";
import UsernameForm from "@/components/UsernameForm";
import TiltCard from "@/components/TiltCard";
import { ArrowIcon, PrintIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, Rarity, primaryBtn } from "@/components/ui";
import { cardsOf } from "@/lib/cards";
import { readDb } from "@/lib/db";
import { CRYSTAL_BY_RARITY, EXTRA_PACK_PRICE } from "@/lib/economy";
import { defaultUsername } from "@/lib/near";
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
  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-5 mb-8">
        <div>
          <Eyebrow>@{username}</Eyebrow>
          <h1 className="mt-4 font-display font-bold text-2xl sm:text-4xl">My cards</h1>
          <p className="mt-2 text-cn-text-2">{cards.length} {cards.length === 1 ? "card" : "cards"}{cards.length ? ". Open any card to verify or print it." : ""}</p>
        </div>
        <UsernameForm username={username} />
      </div>

      <CrystalShop
        crystal={user.crystal ?? 0}
        extraPacks={user.extraPacks ?? 0}
        price={EXTRA_PACK_PRICE}
        yields={CRYSTAL_BY_RARITY.join(", ")}
        duplicates={duplicates}
      />

      <SeriesProgress series={series} cards={cards} />

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
          <p className="mt-2 text-cn-text-2">Open a pack for free and see what you find.</p>
          <Link className={`${primaryBtn} mt-5`} href="/#series">Browse series <ArrowIcon width={16} height={16} /></Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
          {cards.map((c) => (
            <Link key={c.tokenId} href={`/scan/${c.tokenId}`} className="block group" data-testid="owned-card">
              <TiltCard src={c.media} alt={c.name} rarity={c.rarity} />
              <p className="mt-3 text-sm font-semibold truncate group-hover:text-cn-lavender transition">{c.name}</p>
              <div className="flex justify-between items-center gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Rarity value={c.rarity} />
                  {(copies.get(c.design) ?? 1) > 1 ? <span className="text-[11px] font-semibold text-cn-text-3 tabular" data-testid="duplicate">x{copies.get(c.design)}</span> : null}
                </span>
                {c.status !== "Digital" ? (
                  <span className="text-[11px] font-semibold rounded-full bg-white/10 px-2 py-0.5 text-cn-text-2">{c.status === "Printed" ? "Printed" : "Returning"}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-cn-text-3 tabular" title="Can be printed"><PrintIcon width={13} height={13} /> #{c.tokenId}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
