import Link from "next/link";
import { missingRarities } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { Page, Panel, primaryBtn, secondaryBtn } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Creators release", "Publish your own card series with your art, your rates and your prices."],
  ["Collectors open", "Sign in, open a pack for free and pay only for cards you have seen."],
  ["Anyone verifies", "Every card has a public record of who released it and who has held it."],
  ["Print and return", "Print a card and bring it back to digital with its code. It stays the same card."],
];

export default async function Home() {
  const series = (await readDb()).series.filter((s) => missingRarities(s).length === 0);
  return (
    <Page>
      <section className="py-6 sm:py-10">
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight font-[family-name:var(--font-unbounded)]">
          Release your own trading cards. Your community just collects.
        </h1>
        <p className="mt-5 max-w-2xl text-cn-text-2 text-lg leading-relaxed">
          Every card is digital from birth, can be verified by anyone, and can be printed. Nobody has
          to set up a wallet or pay network fees to collect one.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className={primaryBtn} href="#series">Browse series</Link>
          <Link className={secondaryBtn} href="/creator">Release a series</Link>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {STEPS.map(([title, text]) => (
          <Panel key={title}>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">{text}</p>
          </Panel>
        ))}
      </section>

      <section id="series">
        <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-unbounded)]">Series</h2>
        {series.length === 0 ? (
          <Panel><p className="text-cn-text-2">No series is live yet. Be the first to release one.</p></Panel>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.map((s) => (
              <Link key={s.id} href={`/series/${s.id}`} data-testid="series-card" className="block rounded-2xl bg-cn-surface-1 border border-cn-line p-4 hover:border-cn-line-strong transition">
                <div className="flex -space-x-8 mb-4">
                  {s.templates.slice(0, 4).map((t) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={t.id} src={t.media} alt="" className="w-24 aspect-[63/88] object-cover rounded-lg border border-cn-line-strong" />
                  ))}
                </div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-cn-text-3 mt-1">{s.templates.length} cards</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
