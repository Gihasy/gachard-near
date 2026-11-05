import Link from "next/link";
import { redirect } from "next/navigation";
import AddCardForm from "@/components/AddCardForm";
import CreateSeriesForm from "@/components/CreateSeriesForm";
import { CardImage, Page, Panel, Rarity, Title } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Creator() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/creator");
  const mine = (await readDb()).series.filter((s) => s.ownerUserId === user.id);
  return (
    <Page>
      <Title sub="Your art, your rates, your prices. Your community needs no wallet to collect.">Release a series</Title>
      <p className="mb-6 text-xs text-cn-text-3 leading-relaxed max-w-2xl">
        Demo: anyone can upload here and nothing is reviewed. A card&apos;s record shows which account
        released it, not that the account owns the rights to the art.
      </p>
      <div className="space-y-6">
        {mine.map((s) => {
          const missing = missingRarities(s);
          return (
            <Panel key={s.id}>
              <div className="flex flex-wrap justify-between gap-3 items-baseline">
                <h2 className="text-lg font-semibold">{s.name}</h2>
                {missing.length ? (
                  <span className="text-sm text-cn-text-3" data-testid="series-state">Needs: {missing.join(", ")}</span>
                ) : (
                  <Link className="text-sm underline text-cn-success" href={`/series/${s.id}`} data-testid="series-state">Live: view the series</Link>
                )}
              </div>
              {s.templates.length ? (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {s.templates.map((t) => (
                    <div key={t.id}>
                      <CardImage src={t.media} alt={t.name} />
                      <p className="mt-1 text-xs truncate">{t.name}</p>
                      <Rarity value={RARITIES[t.rarity]} />
                    </div>
                  ))}
                </div>
              ) : null}
              <AddCardForm seriesId={s.id} />
            </Panel>
          );
        })}
        <Panel>
          <h2 className="font-semibold mb-4">New series</h2>
          <CreateSeriesForm />
        </Panel>
      </div>
    </Page>
  );
}
