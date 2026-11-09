import Link from "next/link";
import PackArt from "@/components/PackArt";
import PrintSheet from "@/components/PrintSheet";
import TiltCard from "@/components/TiltCard";
import {
  ArrowIcon,
  CheckIcon,
  CollectionIcon,
  SeriesIcon,
  SparkIcon,
  UserIcon,
  PrintIcon,
  SwapIcon,
} from "@/components/icons";
import { CardImage, Eyebrow, primaryBtn } from "@/components/ui";
import { isListed, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { qrDataUrl, siteOrigin } from "@/lib/qr";
import { splitSeriesName } from "@/lib/series-name";

export const dynamic = "force-dynamic";

const FAVORITES = [
  { src: "/cards/series/aika-legendary.jpg", rarity: "Legendary", r: "-11deg", x: "-58%", y: "16px" },
  { src: "/cards/series/thornmaw-epic.jpg", rarity: "Epic", r: "11deg", x: "58%", y: "16px" },
  { src: "/cards/series/mochi-legendary.jpg", rarity: "Legendary", r: "0deg", x: "0%", y: "-10px" },
];

const RAIL_SIZE = 14;

// The whole loop at a glance. The last step links to how printing works.
const FLOW: { label: string; Icon: typeof SeriesIcon; href?: string }[] = [
  { label: "Sign in with Google", Icon: UserIcon },
  { label: "Pick a series", Icon: SeriesIcon },
  { label: "Open a pack", Icon: SparkIcon },
  { label: "Collect or print", Icon: PrintIcon, href: "#print" },
];

const PRINT_STEPS = [
  { title: "Own the digital card", text: "It lives in your collection, with its own public record." },
  { title: "Get the print file", text: "Choose Print. You get a PDF with crop marks and a QR code unique to that print." },
  { title: "Print it and trade it", text: "Anyone who scans the QR sees the card. To take it, they ask and get a code. The holder enters that code to approve, and the card moves to their account." },
  { title: "Send it back to go digital", text: "The physical card goes to Gachard to be destroyed, and its old QR reads VOID. A card that is lost or stolen can never come back." },
];

const PRINT_SPECS = ["63 x 88 mm", "3 mm bleed", "Crop marks"];

// What each form of a card is good for. Every line is something the demo really does.
const FORMS = [
  {
    name: "Digital card",
    tagline: "Always in your pocket",
    Icon: CollectionIcon,
    accent: "var(--cn-crystal-lavender)",
    points: [
      "Send it to any collector by username, in seconds",
      "Turn duplicates into Crystal, and trade Crystal for the cards you're missing",
      "Lock your favorites, so they can't be dismantled or sent by mistake",
      "Can't bend, fade or get left behind on a train",
      "Print it whenever you want to hold it",
    ],
  },
  {
    name: "Physical card",
    tagline: "Something to hold and show",
    Icon: PrintIcon,
    accent: "var(--cn-credits)",
    points: [
      "Hold it, frame it, or bring it to show your friends",
      "A QR unique to this print shows who holds it and whether it's still valid",
      "Trade in person: the buyer asks, and you approve with their code",
      "A copy or a photo of it can't take the card from you",
      "Send it back anytime to make it digital again, and its old QR reads VOID",
    ],
  },
];

export default async function Home() {
  const [{ series }, origin] = await Promise.all([readDb(), siteOrigin()]);
  const sampleQr = await qrDataUrl(`${origin}/scan`);

  // Cards from every live series, taken in turn and rarest first, each leading to its series.
  const pools = series.filter(isListed).map((s) => [...s.templates]
    .sort((a, b) => b.rarity - a.rarity || a.id - b.id)
    .map((t) => ({ seriesId: s.id, series: splitSeriesName(s.name).title, name: t.name, media: t.media, rarity: RARITIES[t.rarity] })));
  const rail: (typeof pools)[number] = [];
  for (let round = 0; rail.length < RAIL_SIZE && pools.some((pool) => pool[round]); round += 1) {
    for (const pool of pools) if (pool[round] && rail.length < RAIL_SIZE) rail.push(pool[round]);
  }


  return (
    <>
      {/* ---- Hero ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-6 items-center">
        <div className="rise">
          <Eyebrow>For collectors</Eyebrow>
          <h1 className="mt-5 font-display font-bold text-[2.15rem] leading-[1.12] sm:text-5xl xl:text-[3.25rem] [text-wrap:balance]">
            Find your favorite cards.{" "}
            <span className="crystal-text whitespace-nowrap">Collect them!</span>
          </h1>
          <p className="mt-5 max-w-xl text-cn-text-2 text-base sm:text-lg leading-relaxed">
            Characters, VTubers, boy bands, athletes and more, all in one place.
            Open a pack, keep what you love, and print any card you own.
          </p>
          <Link href="/series" className={`${primaryBtn} mt-7`} data-testid="explore-series">
            Explore series <ArrowIcon width={16} height={16} />
          </Link>
          <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="How it works" data-testid="user-flow">
            {FLOW.map((step, i) => (
              <li key={step.label} className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cn-line-strong bg-white/[.04] py-1 pl-1 pr-3">
                  <span className="grid place-items-center size-6 rounded-full crystal-calm" style={{ boxShadow: "none" }} aria-hidden="true"><step.Icon width={13} height={13} /></span>
                  {step.href ? (
                    <a href={step.href} className="font-medium text-cn-text-1 underline decoration-cn-lavender underline-offset-4 hover:text-cn-lavender transition">{step.label}</a>
                  ) : (
                    <span className="font-medium text-cn-text-1">{step.label}</span>
                  )}
                </span>
                {i < FLOW.length - 1 ? <ArrowIcon width={14} height={14} className="text-cn-text-3 shrink-0" aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
        </div>

        <div className="trio" aria-hidden="true">
          <div className="trio-glow" />
          {FAVORITES.map((card) => (
            <div key={card.src} className="trio-card" style={{ "--r": card.r, "--x": card.x, "--y": card.y } as React.CSSProperties}>
              <TiltCard src={card.src} alt="" rarity={card.rarity} eager />
            </div>
          ))}
        </div>
      </section>

      {/* ---- A moving rail of art ---- */}
      {rail.length ? (
        <section className="rail mt-6 sm:mt-10" aria-label="Cards from every series">
          <div className="rail-track">
            {/* Drawn twice so the loop is seamless. The second copy is for the eye only. */}
            {[...rail, ...rail].map((card, i) => {
              const copy = i >= rail.length;
              return (
                <Link
                  key={i}
                  href={`/series/${card.seriesId}`}
                  className="rail-card w-28 sm:w-36 shrink-0"
                  title={`${card.name}, from ${card.series}`}
                  aria-hidden={copy || undefined}
                  tabIndex={copy ? -1 : undefined}
                  data-testid={copy ? undefined : "rail-card"}
                >
                  <CardImage src={card.media} alt={copy ? "" : `${card.name}, from ${card.series}`} rarity={card.rarity} />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ---- A card you can hold ---- */}
      <section id="print" className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 scroll-mt-24">
        <div className="panel print-stage p-5 sm:p-10">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-14 items-center">
            <div>
              <Eyebrow>Digital first, printable anytime</Eyebrow>
              <h2 className="mt-4 font-display font-bold text-3xl sm:text-5xl leading-tight">
                One card. <span className="crystal-text">Two worlds.</span>
              </h2>
              <p className="mt-4 max-w-md text-cn-text-2 leading-relaxed">
                Every card starts digital on the NEAR blockchain, so anyone can check who released it and who holds it. There&apos;s no crypto jargon to learn: just sign in and collect.
              </p>
            </div>
            <figure className="m-0">
              <div className="duo">
                <div className="duo-panel">
                  <span className="duo-tag">On screen</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="duo-cutout" src="/cards/series/digital-card.webp" alt="A trading card open in the Gachard app on a phone" width={500} height={700} loading="lazy" draggable={false} />
                </div>
                <div className="duo-swap" aria-hidden="true">
                  <span>Print</span>
                  <i><SwapIcon width={18} height={18} /></i>
                  <span>Send back</span>
                </div>
                <div className="duo-panel">
                  <span className="duo-tag">In hand</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="duo-cutout" src="/cards/series/real-card.webp" alt="The same card, printed and held in a hand" width={500} height={700} loading="lazy" draggable={false} />
                </div>
              </div>
              <figcaption className="mt-2 text-center text-xs text-cn-text-3 leading-relaxed">
                Illustration of a production print. In this hackathon demo, you print a PDF yourself.
              </figcaption>
            </figure>
          </div>
          <div className="mt-8 lg:mt-10 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="card-forms">
            {FORMS.map(({ name, tagline, Icon, accent, points }) => (
              <div key={name} className="min-w-0 rounded-3xl border border-cn-line bg-white/[.03] p-5 sm:p-6" style={{ boxShadow: `inset 0 1px 0 ${accent}33` }}>
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center size-10 rounded-2xl border border-cn-line-strong bg-white/[.05] shrink-0" style={{ color: accent }}>
                    <Icon width={20} height={20} />
                  </span>
                  <div>
                    <h3 className="font-display font-semibold text-lg leading-tight">{name}</h3>
                    <p className="text-xs text-cn-text-3">{tagline}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-cn-text-2 leading-relaxed">
                      <CheckIcon width={16} height={16} className="mt-0.5 shrink-0" style={{ color: accent }} />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 lg:mt-14 pt-10 lg:pt-14 border-t border-cn-line grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
          <div className="print-show">
            <div className="print-show-back">
              <PrintSheet src="/cards/card-back.webp" side="back" marks={false} label="The back of a printed card, naming the print" />
            </div>
            <div className="print-show-front">
              <PrintSheet src="/cards/series/thornmaw-legendary.jpg" qr={sampleQr} label="The front of a printed card, with crop marks and a QR code in the corner" />
              <span className="print-show-dim" data-axis="w">63 mm</span>
              <span className="print-show-dim" data-axis="h">88 mm</span>
            </div>
            <span className="print-show-tag">A QR for each print</span>
          </div>
          <div>
            <h3 className="font-display font-bold text-2xl sm:text-3xl leading-tight">
              Every digital card can also be <span className="crystal-text">printed.</span>
            </h3>
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
        </div>
      </section>

      {/* ---- Creator call ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24">
        <div className="crystal-mesh rounded-[28px] p-8 sm:p-12 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <p className="text-sm font-bold opacity-70">For creators and IP owners</p>
            <h2 className="mt-2 font-display font-bold text-2xl sm:text-4xl leading-tight max-w-2xl">
              Give your fans something to collect.
            </h2>
            <p className="mt-3 max-w-xl leading-relaxed opacity-80">
              Release your own trading cards with your art and your odds, with nothing to print up front. Every card shows you as the one who released it.
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
