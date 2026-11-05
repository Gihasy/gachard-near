import Link from "next/link";
import PackArt from "@/components/PackArt";
import PrintSheet from "@/components/PrintSheet";
import SeriesBrowser, { type SeriesItem } from "@/components/SeriesBrowser";
import TiltCard from "@/components/TiltCard";
import {
  ArrowIcon,
  CheckIcon,
  PrintIcon,
  ScanIcon,
  SearchIcon,
  SparkIcon,
  SwapIcon,
  UserIcon,
} from "@/components/icons";
import { CardImage, Eyebrow, inputClass, primaryBtn } from "@/components/ui";
import { CATEGORIES, DEFAULT_CATEGORY } from "@/lib/categories";
import { missingRarities, RARITIES } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { qrDataUrl, siteOrigin } from "@/lib/qr";
import { nameOf } from "@/lib/users";

export const dynamic = "force-dynamic";

const FAVORITES = [
  { src: "/cards/demo/aika-legendary.jpg", rarity: "Legendary", r: "-11deg", x: "-58%", y: "16px" },
  { src: "/cards/demo/noa-epic.jpg", rarity: "Epic", r: "11deg", x: "58%", y: "16px" },
  { src: "/cards/demo/mochi-legendary.jpg", rarity: "Legendary", r: "0deg", x: "0%", y: "-10px" },
];

const RAIL = [
  "demo/mochi-epic.jpg", "rare-2.webp", "demo/aika-epic.jpg", "legendary-1.webp", "demo/noa-rare.jpg", "epic-1.webp",
  "demo/mochi-rare.jpg", "demo/aika-rare.jpg", "legendary-2.webp", "demo/noa-legendary.jpg", "demo/aika-common.jpg", "demo/mochi-common.jpg",
];

const PROMISES = ["No wallet to set up", "No network fees", "Pay only for what you see"];

// Written as what collecting tends to feel like, not as quotes: no real person said these.
const WORRIES = [
  { title: "Buying blind", text: "You pay for a pack, and only then find out what is inside." },
  { title: "Is it even real?", text: "A picture of a card proves nothing, and anyone can copy one." },
  { title: "A wallet, just to collect?", text: "You came for a card, not for seed phrases and network fees." },
  { title: "A card you can never hold", text: "Most digital cards stay on a screen, however much you love them." },
];

const NOTHING_TO_SET_UP = ["No wallet", "No seed phrase", "No network fees"];

const PRINT_STEPS = [
  { title: "Own the digital card", text: "It lives in your collection, with its own public record." },
  { title: "Get the print file", text: "Choose Print. You get a PDF with crop marks and a QR code unique to that print." },
  { title: "Print it and pass it on", text: "Anyone who scans the QR sees the card. Only its holder, signed in, can transfer it to another username." },
  { title: "Send it back to go digital", text: "The physical card goes to Gachard to be destroyed, and its old QR reads VOID. A card that is lost or stolen can never come back." },
];

const PRINT_SPECS = ["63 x 88 mm", "3 mm bleed", "Crop marks"];

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

export default async function Home({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  const [{ series, users }, { q, category }, origin] = await Promise.all([readDb(), searchParams, siteOrigin()]);
  const sampleQr = await qrDataUrl(`${origin}/scan`);

  const items: SeriesItem[] = series
    .filter((s) => missingRarities(s).length === 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category ?? DEFAULT_CATEGORY,
      creator: nameOf(s.creatorAccount, users),
      cardCount: s.templates.length,
      covers: [...s.templates]
        .sort((a, b) => b.rarity - a.rarity)
        .slice(0, 3)
        .map((t) => ({ id: t.id, media: t.media, rarity: RARITIES[t.rarity] })),
    }));
  const categories = CATEGORIES.filter((name) => items.some((item) => item.category === name));

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-6 items-center">
        <div className="rise">
          <Eyebrow>For collectors</Eyebrow>
          <h1 className="mt-5 font-display font-bold text-[2.15rem] leading-[1.12] sm:text-5xl xl:text-[3.5rem]">
            Find your favorites.{" "}
            <span className="crystal-text">Collect their cards.</span>
          </h1>
          <p className="mt-5 max-w-xl text-cn-text-2 text-base sm:text-lg leading-relaxed">
            Characters, VTubers, actors and whole worlds release their own trading cards here.
            Open a pack for free, keep what you love, and print any card you own.
          </p>
          <form action="/#series" method="get" className="mt-7 flex gap-2 max-w-xl">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Search series</span>
              <SearchIcon width={18} height={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-cn-text-3" />
              <input className={`${inputClass} !pl-11`} type="search" name="q" placeholder="Search your favorite" />
            </label>
            <button className={`${primaryBtn} shrink-0`}>
              Find <ArrowIcon width={16} height={16} />
            </button>
          </form>
          <ul className="mt-6 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-5 gap-y-2 text-sm text-cn-text-2">
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
      <section className="rail mt-10 sm:mt-14" aria-hidden="true">
        <div className="rail-track">
          {[...RAIL, ...RAIL].map((file, i) => (
            <div key={i} className="w-28 sm:w-36 shrink-0 opacity-80">
              <CardImage src={`/cards/${file}`} alt="" eager />
            </div>
          ))}
        </div>
      </section>

      {/* ---- Empathy: what collecting feels like today ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-20" data-testid="worries">
        <h2 className="font-display font-bold text-2xl sm:text-4xl max-w-3xl leading-tight">
          You love them. Collecting them shouldn&apos;t feel like a gamble.
        </h2>
        <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORRIES.map((worry) => (
            <li key={worry.title} className="panel p-5">
              <h3 className="font-display font-semibold text-base">{worry.title}</h3>
              <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">{worry.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Solution: the first three worries, answered ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24">
        <h2 className="font-display font-bold text-2xl sm:text-4xl leading-tight">
          Collecting,{" "}
          <span className="crystal-text">without the gamble.</span>
        </h2>
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Tile
            icon={<UserIcon />}
            title="See every card before you pay"
            text="Open a pack for free and turn over all five cards. Then buy the pack or skip it. Skipping costs nothing."
          >
            <div className="mt-6 grid grid-cols-5 gap-2 -mb-14">
              {["card-back.webp", "demo/mochi-rare.jpg", "demo/aika-epic.jpg", "card-back.webp", "card-back.webp"].map((file, i) => (
                <CardImage key={i} src={`/cards/${file}`} alt="" rarity={file.includes("epic") ? "Epic" : file.includes("rare") ? "Rare" : undefined} />
              ))}
            </div>
          </Tile>
          <Tile
            icon={<ScanIcon />}
            title="Know it is the real thing"
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
          <Tile
            icon={<CheckIcon />}
            title="Nothing to set up"
            text="Sign in the way you sign in anywhere else. Gachard handles the blockchain and pays its network fees."
            className="md:col-span-2 lg:col-span-1"
          >
            <ul className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              {NOTHING_TO_SET_UP.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-cn-line-strong bg-white/[.04] px-3 py-1.5">
                  <CheckIcon width={14} height={14} className="text-cn-crystal" /> {item}
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      </section>

      {/* ---- Solution: the fourth worry, a card you can hold ---- */}
      <section id="print" className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 scroll-mt-24">
        <div className="panel print-stage p-5 sm:p-10">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-14 items-center">
            <div>
              <Eyebrow>Digital first, printable anytime</Eyebrow>
              <h2 className="mt-4 font-display font-bold text-3xl sm:text-5xl leading-tight">
                One card. <span className="crystal-text">Two worlds.</span>
              </h2>
              <p className="mt-4 max-w-md text-cn-text-2 leading-relaxed">
                Every card starts digital. Print it to hold it, pass it on, or send it back to make it digital again.
              </p>
            </div>
            <figure className="m-0">
              <div className="duo">
                <div className="duo-panel">
                  <span className="duo-tag">On screen</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="duo-phone" src="/cards/digital-card.webp" alt="A trading card on a phone" width={500} height={700} loading="lazy" draggable={false} />
                </div>
                <div className="duo-swap" aria-hidden="true">
                  <span>Print</span>
                  <i><SwapIcon width={18} height={18} /></i>
                  <span>Send back</span>
                </div>
                <div className="duo-panel">
                  <span className="duo-tag">In hand</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cards/real-card.webp" alt="The same card, printed and held in a hand" width={500} height={700} loading="lazy" draggable={false} />
                </div>
              </div>
              <figcaption className="mt-2 text-center text-xs text-cn-text-3 leading-relaxed">
                Illustration of a production print. In this hackathon demo, you print a PDF yourself.
              </figcaption>
            </figure>
          </div>
          <div className="mt-10 lg:mt-14 pt-10 lg:pt-14 border-t border-cn-line grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
          <div className="print-show">
            <div className="print-show-back">
              <PrintSheet src="/cards/card-back.webp" side="back" marks={false} label="The back of a printed card, naming the print" />
            </div>
            <div className="print-show-front">
              <PrintSheet src="/cards/legendary-1.webp" qr={sampleQr} label="The front of a printed card, with crop marks and a QR code in the corner" />
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

      {/* ---- Engage: find your favorite ---- */}
      <section id="series" className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 scroll-mt-24">
        <h2 className="font-display font-bold text-2xl sm:text-4xl">Who do you collect?</h2>
        {items.length === 0 ? (
          <div className="panel mt-6 p-8 sm:p-10 text-center">
            <p className="font-display font-semibold text-lg">Nothing is live yet.</p>
            <p className="mt-2 text-cn-text-2">Be the first to release a series.</p>
            <Link className={`${primaryBtn} mt-5`} href="/creator">Release a series</Link>
          </div>
        ) : (
          <>
            <SeriesBrowser
              items={items}
              categories={categories}
              initialQuery={typeof q === "string" ? q : ""}
              initialCategory={typeof category === "string" ? category : ""}
            />
            <p className="mt-4 text-xs text-cn-text-3">
              Demo series. Mochi Puffs, Aika Nova and Noa Vantor are invented, and are not real people or brands.
            </p>
          </>
        )}
      </section>

      {/* ---- Creator call ---- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24">
        <div className="crystal-mesh rounded-[28px] p-8 sm:p-12 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <p className="text-sm font-bold opacity-70">For creators and IP owners</p>
            <h2 className="mt-2 font-display font-bold text-2xl sm:text-4xl leading-tight max-w-2xl">
              Your community should not need a crypto tutorial.
            </h2>
            <p className="mt-3 max-w-xl leading-relaxed opacity-80">
              Publish your own series in minutes, with your art, your rates and your prices. Your account is on record as the one who released it.
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
