import Link from "next/link";
import { redirect } from "next/navigation";
import CopyCode from "@/components/CopyCode";
import TiltCard from "@/components/TiltCard";
import { ArrowIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, Rarity, primaryBtn } from "@/components/ui";
import { cardsOf } from "@/lib/cards";
import { collectorCode, collectorLabel } from "@/lib/near";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Collection() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/collection");
  const cards = await cardsOf(user.accountId);
  const code = collectorCode(user.accountId);
  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-5 mb-8">
        <div>
          <Eyebrow>{collectorLabel(user.accountId)}</Eyebrow>
          <h1 className="mt-4 font-display font-bold text-2xl sm:text-4xl">Your collection</h1>
          <p className="mt-2 text-cn-text-2">{cards.length} {cards.length === 1 ? "card" : "cards"}</p>
        </div>
        {code ? (
          <div>
            <p className="text-xs text-cn-text-3 mb-1.5">Your code, to receive a card</p>
            <CopyCode code={code} />
          </div>
        ) : null}
      </div>

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
                <Rarity value={c.rarity} />
                {c.status === "Printed" ? (
                  <span className="text-[11px] font-semibold rounded-full bg-white/10 px-2 py-0.5 text-cn-text-2">Printed</span>
                ) : (
                  <span className="text-xs text-cn-text-3 tabular">#{c.tokenId}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
