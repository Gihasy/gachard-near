import Link from "next/link";
import AddCardForm from "@/components/AddCardForm";
import CreateSeriesForm from "@/components/CreateSeriesForm";
import CreatorGuide from "@/components/CreatorGuide";
import { ArrowIcon, CheckIcon, PrintIcon, ScanIcon, SeriesIcon } from "@/components/icons";
import { CardImage, Eyebrow, Page, Panel, Rarity, primaryBtn } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { CREATOR_SHARE_PCT, revenueOf } from "@/lib/economy";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const BENEFITS = [
  { Icon: SeriesIcon, title: "Just bring your art", text: "Publish a series in minutes, with your own rates and your own prices." },
  { Icon: ScanIcon, title: "Your name on the record", text: "Your account signs what you release, so anyone can see that it came from you." },
  { Icon: PrintIcon, title: "Digital and physical", text: "Every card can be printed. Your fans need no wallet and pay no network fees." },
];

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
      <ul className="mt-7 grid md:grid-cols-3 gap-4">
        {BENEFITS.map(({ Icon, title, text }) => (
          <li key={title} className="panel p-5">
            <span className="grid place-items-center size-10 rounded-xl bg-white/[.07] border border-cn-line text-cn-lavender"><Icon /></span>
            <h2 className="mt-4 font-display font-semibold text-base">{title}</h2>
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">{text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-2xl border border-[#f7c96b40] bg-[#f7c96b12] px-4 py-3 text-sm leading-relaxed text-cn-text-2" data-testid="creator-plan">
        <strong className="font-semibold text-cn-credits">The plan for production, not part of this demo:</strong>{" "}
        no upfront cost, with Gachard handling printing and shipping, and a revenue share on every pack sold. Here, each sale is split {CREATOR_SHARE_PCT}/{100 - CREATOR_SHARE_PCT} in simulated Credits and shown in your studio, as an example. Nothing is charged or paid.
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
        {mine.map((s) => {
          const missing = missingRarities(s);
          const revenue = revenueOf(s.id, offers);
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
