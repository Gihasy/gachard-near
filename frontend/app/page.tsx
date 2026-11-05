import Link from "next/link";
import PackArt from "@/components/PackArt";
import TiltCard from "@/components/TiltCard";
import {
  ArrowIcon,
  CheckIcon,
  CrystalStar,
  PrintIcon,
  ScanIcon,
  SeriesIcon,
  UserIcon,
} from "@/components/icons";
import { CardImage, Eyebrow, Rarity, primaryBtn, secondaryBtn } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const FAN = [
  { src: "/cards/rare-1.webp", rarity: "Rare", x: "-68%", y: "22px", r: "-15deg", delay: "160ms" },
  { src: "/cards/epic-2.webp", rarity: "Epic", x: "-36%", y: "4px", r: "-7deg", delay: "80ms" },
  { src: "/cards/legendary-1.webp", rarity: "Legendary", x: "0%", y: "-8px", r: "0deg", delay: "0ms" },
  { src: "/cards/legendary-2.webp", rarity: "Legendary", x: "36%", y: "4px", r: "7deg", delay: "80ms" },
  { src: "/cards/epic-1.webp", rarity: "Epic", x: "68%", y: "22px", r: "15deg", delay: "160ms" },
];

const RAIL = ["common-1", "rare-2", "legendary-1", "epic-1", "common-2", "rare-1", "epic-2", "legendary-2"];

const PROMISES = ["No wallet to set up", "No network fees", "Verify any card", "Print it, return it"];

function Tile({ icon, title, text, children, className = "" }: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`panel panel-link p-6 overflow-hidden relative flex flex-col ${className}`}>
      <span className="grid place-items-center size-10 rounded-xl bg-white/[.07] border border-cn-line text-cn-lavender">{icon}</span>
      <h3 className="mt-4 font-display font-semibold text-lg">{title}</h3>
      <p className="mt-2 text-sm text-cn-text-2 leading-relaxed max-w-md">{text}</p>
      {children}
    </article>
  );
}

export default async function Home() {
  const series = (await readDb()).series.filter((s) => missingRarities(s).length === 0);
  return (
    <>
      {/* ---- Hero ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 grid lg:grid-cols-[1.02fr_1fr] gap-6 items-center">
        <div className="rise">
          <Eyebrow>For creators and IP owners</Eyebrow>
          <h1 className="mt-5 font-display font-bold text-[2.15rem] leading-[1.12] sm:text-5xl xl:text-[3.5rem]">
            Release your own trading cards.{" "}
            <span className="crystal-text">Your community just collects.</span>
          </h1>
          <p className="mt-5 max-w-xl text-cn-text-2 text-base sm:text-lg leading-relaxed">
            Every card is digital from birth, can be verified by anyone, and can be printed.
            Nobody has to set up a wallet or pay network fees to collect one.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className={primaryBtn} href="#series">Browse series <ArrowIcon width={16} height={16} /></Link>
            <Link className={secondaryBtn} href="/creator">Release a series</Link>
          </div>
          <ul className="mt-7 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-5 gap-y-2 text-sm text-cn-text-2">
            {PROMISES.map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5">
                <CheckIcon width={15} height={15} className="text-cn-crystal shrink-0" /> {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="fan" aria-hidden="true">
          <div className="fan-glow" />
          {FAN.map((card, i) => (
            <div
              key={card.src}
              className="fan-card"
              style={{ "--x": card.x, "--y": card.y, "--r": card.r, "--delay": card.delay, zIndex: i === 2 ? 3 : i === 1 || i === 3 ? 2 : 1 } as React.CSSProperties}
            >
              <div className="fan-float" style={{ "--delay": `${i * -1.3}s` } as React.CSSProperties}>
                <TiltCard src={card.src} alt="" rarity={card.rarity} eager />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- A moving rail of art ---- */}
      <section className="rail mt-10 sm:mt-14" aria-hidden="true">
        <div className="rail-track">
          {[...RAIL, ...RAIL].map((name, i) => (
            <div key={i} className="w-28 sm:w-36 shrink-0 opacity-80">
              <CardImage src={`/cards/${name}.webp`} alt="" />
            </div>
          ))}
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24">
        <h2 className="font-display font-bold text-2xl sm:text-4xl max-w-2xl leading-tight">
          One card, from a creator&apos;s art to a collector&apos;s hand.
        </h2>
        <div className="mt-8 grid md:grid-cols-6 gap-4">
          <Tile
            className="md:col-span-3"
            icon={<SeriesIcon />}
            title="Creators release"
            text="Publish your own series with your art, your rates and your prices. Your account is on record as the one who released it."
          >
            <div className="mt-6 flex -space-x-9 -mb-16">
              {["rare-2", "epic-1", "legendary-2", "common-1"].map((n, i) => (
                <div key={n} className="w-28" style={{ transform: `rotate(${(i - 1.5) * 5}deg) translateY(${Math.abs(i - 1.5) * 5}px)` }}>
                  <CardImage src={`/cards/${n}.webp`} alt="" />
                </div>
              ))}
            </div>
          </Tile>
          <Tile
            className="md:col-span-3"
            icon={<UserIcon />}
            title="Collectors see before paying"
            text="Sign in and open a pack for free, one card at a time. Then buy it or skip it. You only ever pay for cards you have seen."
          >
            <div className="mt-6 grid grid-cols-5 gap-2 -mb-14">
              {["card-back", "card-back", "epic-2", "common-2", "card-back"].map((n, i) => (
                <CardImage key={i} src={`/cards/${n}.webp`} alt="" rarity={n === "epic-2" ? "Epic" : undefined} />
              ))}
            </div>
          </Tile>
          <Tile
            className="md:col-span-2"
            icon={<ScanIcon />}
            title="Anyone verifies"
            text="Every card has a public record of who released it and who has held it. Check it outside this site, in one click."
          />
          <Tile
            className="md:col-span-2"
            icon={<PrintIcon />}
            title="Print it"
            text="Get a print-ready card with its own QR code and redeem code. In this demo it is a PDF you print yourself."
          />
          <Tile
            className="md:col-span-2"
            icon={<CrystalStar size={20} />}
            title="Bring it back"
            text="Enter the code and the card returns to digital. It stays the same card, with its whole history intact."
          />
        </div>
      </section>

      {/* ---- Live series ---- */}
      <section id="series" className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 scroll-mt-24">
        <h2 className="font-display font-bold text-2xl sm:text-4xl">Live series</h2>
        {series.length === 0 ? (
          <div className="panel mt-6 p-8 sm:p-10 text-center">
            <p className="font-display font-semibold text-lg">Nothing is live yet.</p>
            <p className="mt-2 text-cn-text-2">Be the first to release a series.</p>
            <Link className={`${primaryBtn} mt-5`} href="/creator">Release a series</Link>
          </div>
        ) : (
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.map((s) => {
              const best = [...s.templates].sort((a, b) => b.rarity - a.rarity);
              return (
                <Link key={s.id} href={`/series/${s.id}`} data-testid="series-card" className="panel panel-link group block p-5 overflow-hidden">
                  <div className="relative h-52 flex items-center justify-center">
                    <div className="absolute inset-x-8 inset-y-2 rounded-full blur-3xl opacity-40 bg-cn-lavender" />
                    <div className="flex -space-x-14 relative">
                      {best.slice(0, 3).map((t, i) => (
                        <div key={t.id} className="w-32 transition-transform duration-500 group-hover:-translate-y-1" style={{ transform: `rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                          <CardImage src={t.media} alt="" rarity={RARITIES[t.rarity]} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-base truncate">{s.name}</h3>
                      <p className="mt-1 text-sm text-cn-text-3">{s.templates.length} cards</p>
                    </div>
                    {best[0] ? <Rarity value={`${RARITIES[best[0].rarity]}`} /> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Creator call ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24">
        <div className="crystal-mesh rounded-[28px] p-8 sm:p-12 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <h2 className="font-display font-bold text-2xl sm:text-4xl leading-tight max-w-2xl">
              Your community should not need a crypto tutorial.
            </h2>
            <p className="mt-3 max-w-xl leading-relaxed opacity-80">
              Publish a series in minutes. Fans sign in the way they sign in anywhere else.
            </p>
            <Link
              href="/creator"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#14102A] text-white font-bold px-6 min-h-12 text-sm hover:opacity-90 transition"
            >
              Release a series <ArrowIcon width={16} height={16} />
            </Link>
          </div>
          <div className="hidden md:block w-44 rotate-6">
            <PackArt name="Your series" cards={5} />
          </div>
        </div>
      </section>
    </>
  );
}
