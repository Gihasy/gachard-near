import Link from "next/link";
import { redirect } from "next/navigation";
import AddCardForm from "@/components/AddCardForm";
import CreateSeriesForm from "@/components/CreateSeriesForm";
import { ArrowIcon, CheckIcon } from "@/components/icons";
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
      <Title eyebrow="Creator studio" sub="Your art, your rates, your prices. Your community needs no wallet to collect.">
        Release a series
      </Title>
      <p className="mb-6 rounded-2xl border border-cn-line bg-white/[.03] px-4 py-3 text-xs text-cn-text-3 leading-relaxed">
        Demo: anyone can upload here and nothing is reviewed. A card&apos;s record shows which account
        released it, not that the account owns the rights to the art.
      </p>
      <div className="space-y-6">
        {mine.map((s) => {
          const missing = missingRarities(s);
          return (
            <Panel key={s.id}>
              <div className="flex flex-wrap justify-between gap-3 items-center">
                <h2 className="font-display font-semibold text-lg break-words min-w-0">{s.name}</h2>
                {missing.length ? (
                  <span className="rounded-full bg-[#f7c96b1f] px-3 py-1 text-xs font-semibold text-cn-credits" data-testid="series-state">
                    Needs: {missing.join(", ")}
                  </span>
                ) : (
                  <Link className="inline-flex items-center gap-1.5 rounded-full bg-[#7ee0a61f] px-3 py-1 text-xs font-semibold text-cn-success hover:underline" href={`/series/${s.id}`} data-testid="series-state">
                    <CheckIcon width={14} height={14} /> Live: view the series <ArrowIcon width={13} height={13} />
                  </Link>
                )}
              </div>
              {s.templates.length ? (
                <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {s.templates.map((t) => (
                    <div key={t.id} className="pop">
                      <CardImage src={t.media} alt={t.name} rarity={RARITIES[t.rarity]} />
                      <p className="mt-2 text-xs font-medium truncate">{t.name}</p>
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
          <h2 className="font-display font-semibold text-lg mb-4">{mine.length ? "Another series" : "Your first series"}</h2>
          <CreateSeriesForm />
        </Panel>
      </div>
    </Page>
  );
}
