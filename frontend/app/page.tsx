import Link from "next/link";
import PackArt from "@/components/PackArt";
import PrintSheet from "@/components/PrintSheet";
import {
  ArrowIcon,
  CheckIcon,
  PrintIcon,
  ScanIcon,
  SeriesIcon,
  SparkIcon,
  UserIcon,
} from "@/components/icons";
import { CardImage, Eyebrow, Rarity, primaryBtn, secondaryBtn } from "@/components/ui";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { qrDataUrl, siteOrigin } from "@/lib/qr";

export const dynamic = "force-dynamic";

const RAIL = ["common-1", "rare-2", "legendary-1", "epic-1", "common-2", "rare-1", "epic-2", "legendary-2"];

const PROMISES = ["No wallet to set up", "No network fees", "Verify any card"];

const PRINT_STEPS = [
  { title: "Own the digital card", text: "It lives in your collection, with its own public record." },
  { title: "Get the print file", text: "Choose Print. You get a PDF with crop marks and a QR code unique to that print." },
  { title: "Print it and pass it on", text: "Anyone who scans the QR sees the card. Only its holder, signed in, can transfer it to another username." },
  { title: "Send it back to go digital", text: "The physical card goes to Gachard to be destroyed, and its old QR reads VOID. A card that is lost or stolen can never come back." },
];

const PRINT_SPECS = ["63 x 88 mm", "3 mm bleed", "Crop marks", "A QR for each print"];

const RECORD = [
  { label: "Released", Icon: SparkIcon },
  { label: "Printed", Icon: PrintIcon },
  { label: "Returned to digital", Icon: CheckIcon },
];

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
  const sampleQr = await qrDataUrl(`${await siteOrigin()}/scan`);
  return (
    <>
      {/* ---- Hero ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 grid lg:grid-cols-[1.02fr_1fr] gap-6 items-center">
        <div className="rise">
          <Eyebrow>For creators and IP owners</Eyebrow>
          <h1 className="mt-5 font-display font-bold text-[2.15rem] leading-[1.12] sm:text-5xl xl:text-[3.5rem]">
            Release digital trading cards{" "}
            <span className="crystal-text">your fans can also print.</span>
          </h1>
          <p className="mt-5 max-w-xl text-cn-text-2 text-base sm:text-lg leading-relaxed">
            Every card is digital from birth and can be verified by anyone. Its holder can turn it
            into a physical card whenever they want. Nobody sets up a wallet or pays network fees.
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
            <li>
              <a href="#print" className="inline-flex items-center gap-1.5 font-semibold text-cn-text-1 underline decoration-cn-lavender underline-offset-4 hover:text-cn-lavender transition">
                <PrintIcon width={15} height={15} className="text-cn-lavender shrink-0" /> Print any card
              </a>
            </li>
          </ul>
        </div>

        <figure className="m-0">
          <div className="duo">
            <div className="duo-panel">
              <span className="duo-tag">On screen</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="duo-phone" src="/cards/digital-card.webp" alt="A trading card on a phone" width={500} height={700} draggable={false} />
            </div>
            <a href="#print" className="duo-print crystal-calm" aria-label="See how printing works">
              <PrintIcon width={18} height={18} />
              <ArrowIcon width={14} height={14} />
            </a>
            <div className="duo-panel">
              <span className="duo-tag">In hand</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cards/real-card.webp" alt="The same card, printed and held in a hand" width={500} height={700} draggable={false} />
            </div>
          </div>
          <figcaption className="mt-2 text-center text-xs text-cn-text-3 leading-relaxed">
            Illustration of a production print. In this hackathon demo, you print a PDF yourself.
          </figcaption>
        </figure>
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

      {/* ---- Digital to print ---- */}
      <section id="print" className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 scroll-mt-24">
        <div className="panel print-stage p-5 sm:p-10 grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
          <div className="sheets">
            <div className="sheets-back">
              <PrintSheet src="/cards/card-back.webp" side="back" label="Back page of the print file, naming the print" />
            </div>
            <div className="sheets-front">
              <PrintSheet
                src="/cards/legendary-1.webp"
                qr={sampleQr}
                label="Front page of the print file: the card with crop marks, a QR code and a simulation notice"
                footer="In production, cards are printed and shipped by the platform."
                live
              />
            </div>
          </div>
          <div>
            <Eyebrow>Digital first, printable anytime</Eyebrow>
            <h2 className="mt-4 font-display font-bold text-2xl sm:text-4xl leading-tight">
              Every digital card can also be <span className="crystal-text">printed.</span>
            </h2>
            <ol className="mt-7 space-y-5">
              {PRINT_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid place-items-center size-8 shrink-0 rounded-full border border-cn-line-strong bg-white/[.05] font-display text-xs font-semibold tabular">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-0.5 text-sm text-cn-text-2 leading-relaxed">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ul className="mt-6 flex flex-wrap gap-2">
              {PRINT_SPECS.map((spec) => (
                <li key={spec} className="rounded-full border border-cn-line-strong bg-white/[.04] px-3 py-1 text-xs font-medium text-cn-text-2">{spec}</li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl border border-[#f7c96b40] bg-[#f7c96b12] px-4 py-3 text-sm leading-relaxed text-cn-text-2">
              <strong className="font-semibold text-cn-credits">Hackathon simulation.</strong>{" "}
              In production, the platform would print and ship the card, and destroy the ones sent back. Here you print the PDF yourself, and a button stands in for sending it back.
            </p>
          </div>
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
            className="md:col-span-6"
            icon={<ScanIcon />}
            title="Anyone verifies"
            text="Every card has a public record of who released it, who has held it and each time it was printed. Check it outside this site, in one click."
          >
            <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
              {RECORD.map(({ label, Icon }, i) => (
                <li key={label} className="flex items-center gap-2">
                  {i ? <ArrowIcon width={14} height={14} className="text-cn-text-3" /> : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cn-line-strong bg-white/[.04] px-3 py-1.5">
                    <Icon width={14} height={14} className="text-cn-lavender" /> {label}
                  </span>
                </li>
              ))}
            </ol>
          </Tile>
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
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-cn-text-3">{s.templates.length} cards, all printable <PrintIcon width={14} height={14} /></p>
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
              Publish a series in minutes. Fans sign in the way they sign in anywhere else, and can print any card they collect.
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
