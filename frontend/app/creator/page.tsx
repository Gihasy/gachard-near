import Link from "next/link";
import AddCardForm from "@/components/AddCardForm";
import AddSeries from "@/components/AddSeries";
import CreatorGuide from "@/components/CreatorGuide";
import EditSeries from "@/components/EditSeries";
import { ArrowIcon, CheckIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, Panel, Rarity, SeriesName, primaryBtn } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb, type SeriesRow } from "@/lib/db";
import { CREATOR_SHARE_PCT, revenueOf } from "@/lib/economy";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** The rarity a creator most likely wants next: the first one with odds and no card. */
function suggestedRarity(series: SeriesRow) {
  const missing = series.ratesBps.findIndex((rate, rarity) => rate > 0 && !series.templates.some((t) => t.rarity === rarity));
  return missing >= 0 ? missing : series.ratesBps.findIndex((rate) => rate > 0);
}

function Pitch() {
  return (
    <section className="mb-10">
      <Eyebrow>For creators and IP owners</Eyebrow>
      <h1 className="mt-4 font-display font-bold text-3xl sm:text-5xl leading-tight max-w-3xl">
        Turn your fans into <span className="crystal-text">collectors.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-cn-text-2 sm:text-lg leading-relaxed">
        Got a world people love? Release it as cards your community can collect, verify and hold, without a crypto tutorial.
      </p>
      <p className="mt-6 rounded-2xl border border-[#f7c96b40] bg-[#f7c96b12] px-4 py-3 text-sm leading-relaxed text-cn-text-2" data-testid="creator-plan">
        <strong className="font-semibold text-cn-credits">The plan for production, not part of this demo:</strong>{" "}
        no upfront cost, with Gachard handling printing and shipping, and a revenue share on every pack sold. Here, each sale is split in simulated Credits and shown in your studio, as an example. Nothing is charged or paid.
      </p>
    </section>
  );
}

export default async function Creator() {
  const user = await currentUser();
  if (!user) {
    return (
      <Page>
        <Pitch />
        <Link className={`${primaryBtn} mb-8`} href="/login?next=/creator">Sign in to release a series <ArrowIcon width={16} height={16} /></Link>
        <CreatorGuide open />
      </Page>
    );
  }
  const { series, offers } = await readDb();
  const mine = series.filter((s) => s.ownerUserId === user.id);
  return (
    <Page>
      <Pitch />
      <CreatorGuide open={mine.length === 0} />
      <p className="mb-6 rounded-2xl border border-cn-line bg-white/[.03] px-4 py-3 text-xs text-cn-text-3 leading-relaxed">
        Demo: anyone can upload here and nothing is reviewed. A card&apos;s record shows which account
        released it, not that the account owns the rights to the art.
      </p>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-semibold text-lg sm:text-xl">Your series</h2>
          {mine.length ? <AddSeries first={false} /> : null}
        </div>
        {mine.length ? null : <AddSeries first />}
        {mine.map((s) => {
          const missing = missingRarities(s);
          const revenue = revenueOf(s.id, offers);
          return (
            <Panel key={s.id}>
              <div className="flex flex-wrap justify-between gap-3 items-center">
                <div className="flex items-center gap-3 min-w-0">
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo} alt="" className="size-12 object-contain shrink-0" />
                  ) : null}
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-lg break-words"><SeriesName name={s.name} /></h3>
                    {s.description ? <p className="mt-0.5 text-sm text-cn-text-2 leading-relaxed">{s.description}</p> : null}
                  </div>
                </div>
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
              <EditSeries series={{ id: s.id, name: s.name, description: s.description, category: s.category, logo: s.logo, ratesBps: s.ratesBps, prices: s.prices }} />
              {missing.length ? null : (
                <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="series-revenue" data-creator={revenue.creator} data-gachard={revenue.gachard}>
                  {[
                    ["Packs sold", revenue.packs],
                    ["Total sales", revenue.gross],
                    [`Your ${CREATOR_SHARE_PCT}%`, revenue.creator],
                    [`Gachard's ${100 - CREATOR_SHARE_PCT}%`, revenue.gachard],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white/[.035] border border-cn-line p-3">
                      <dt className="text-xs text-cn-text-3">{label}</dt>
                      <dd className="mt-1 font-display font-semibold tabular">{Number(value).toLocaleString("en-US")}</dd>
                    </div>
                  ))}
                  <p className="col-span-full text-xs text-cn-text-3">In simulated Credits. Nobody is paid in this demo.</p>
                </dl>
              )}
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
              <AddCardForm key={s.templates.length} seriesId={s.id} rates={s.ratesBps} suggested={suggestedRarity(s)} />
            </Panel>
          );
        })}
      </div>
    </Page>
  );
}
