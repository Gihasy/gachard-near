import Link from "next/link";
import { redirect } from "next/navigation";
import { CardImage, Page, Panel, Rarity, Title, secondaryBtn } from "@/components/ui";
import { cardsOf } from "@/lib/cards";
import { collectorCode, collectorLabel } from "@/lib/near";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Collection() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/collection");
  const cards = await cardsOf(user.accountId);
  return (
    <Page>
      <Title sub={<>{collectorLabel(user.accountId)}. Give others your code to receive a card: <span className="font-mono text-cn-text-1" data-testid="collector-code">{collectorCode(user.accountId)}</span></>}>
        Your collection
      </Title>
      {cards.length === 0 ? (
        <Panel>
          <p className="text-cn-text-2">No cards yet.</p>
          <Link className={`${secondaryBtn} mt-4`} href="/#series">Browse series</Link>
        </Panel>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {cards.map((c) => (
            <Link key={c.tokenId} href={`/scan/${c.tokenId}`} className="block hover:scale-[1.02] transition" data-testid="owned-card">
              <CardImage src={c.media} alt={c.name} />
              <p className="mt-2 text-sm font-medium">{c.name}</p>
              <div className="flex justify-between items-center">
                <Rarity value={c.rarity} />
                {c.status === "Printed" ? <span className="text-xs text-cn-text-3">Printed</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
