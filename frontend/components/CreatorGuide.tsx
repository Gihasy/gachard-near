/**
 * What a creator needs to know before releasing a series. The art sizes come from
 * docs/CREATOR-ASSET-GUIDE.md, and the limits from lib/catalog.ts and lib/art.ts.
 */
const STEPS = [
  { title: "Add a series", text: "Upload a logo, write a title and a description, and set the odds for each rarity. The odds set the price of a pack." },
  { title: "Add your cards", text: "For each card, upload an image, name it and choose its rarity. Every rarity with odds needs a card. You can add up to 20." },
  { title: "Go live", text: "The series appears on Gachard as soon as its last rarity has a card. Your studio then shows its sales." },
];

const ART = [
  ["Shape", "63 × 88 mm, the size of a standard trading card"],
  ["File size", "815 × 1110 px or larger. 1630 × 2220 px is best for print"],
  ["Format", "PNG, JPG or WebP, in sRGB colour"],
  ["Keep it readable", "The subject should still be clear at a small size"],
];

const ZONES = [
  { color: "#FF7A8A", name: "Cut area", text: "3 mm on every side is trimmed off in print. Extend your background here." },
  { color: "#C9B3FB", name: "Safe area", text: "Keep names, faces and logos 3 mm inside the cut line." },
  { color: "#F7C96B", name: "QR zone", text: "12 mm in the bottom right corner. Keep it plain, because the QR prints over it." },
];

const RECIPE = [
  { rarity: "Common", cards: 4, odds: "70%", color: "var(--cn-rarity-common)" },
  { rarity: "Rare", cards: 2, odds: "20%", color: "var(--cn-rarity-rare)" },
  { rarity: "Epic", cards: 1, odds: "8%", color: "var(--cn-rarity-epic)" },
  { rarity: "Legendary", cards: 1, odds: "2%", color: "var(--cn-rarity-legendary)" },
];

const RULES = [
  { title: "Only art you have the rights to", text: "Your own work, or work you have permission to use. A card's record shows who released it, not who owns the rights." },
  { title: "A card is permanent", text: "A card's name, art and rarity go on a public blockchain and cannot be edited. You can still change the series around it." },
  { title: "Leave these to Gachard", text: "Do not draw a price, a QR code, a serial number or the Gachard logo on a card." },
];

function CardDiagram() {
  return (
    <svg viewBox="0 0 690 940" className="w-full max-w-56 mx-auto" role="img" aria-label="A card with its cut area, safe area and QR zone marked">
      <rect width="690" height="940" rx="16" fill="#1A1B2B" />
      <rect x="1.5" y="1.5" width="687" height="937" rx="16" fill="none" stroke="#FF7A8A" strokeWidth="3" />
      <rect x="30" y="30" width="630" height="880" rx="30" fill="#24253A" stroke="#FF7A8A" strokeWidth="4" strokeDasharray="16 12" />
      <rect x="60" y="60" width="570" height="820" rx="12" fill="none" stroke="#C9B3FB" strokeWidth="4" />
      <rect x="510" y="760" width="120" height="120" rx="10" fill="#F7C96B33" stroke="#F7C96B" strokeWidth="4" />
      <text x="570" y="830" textAnchor="middle" fontSize="38" fontWeight="700" fill="#F7C96B">QR</text>
      <text x="345" y="400" textAnchor="middle" fontSize="44" fontWeight="600" fill="#C9B3FB">Your art</text>
      <text x="345" y="455" textAnchor="middle" fontSize="30" fill="#B9B8CE">63 × 88 mm after the cut</text>
    </svg>
  );
}

export default function CreatorGuide({ open }: { open: boolean }) {
  return (
    <details className="series-row panel mb-8 overflow-hidden" open={open} data-testid="creator-guide">
      <summary className="flex items-center justify-between gap-4 p-5 sm:p-6 cursor-pointer select-none list-none hover:bg-white/[.02] transition">
        <span>
          <span className="block font-display font-semibold text-lg sm:text-xl">Creator guidelines</span>
          <span className="mt-1 block text-sm text-cn-text-2">How to release a series, and how to prepare your art.</span>
        </span>
        <span className="series-chevron text-cn-text-3 shrink-0" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </summary>

      <div className="px-5 sm:px-6 pb-6 space-y-8">
        <section>
          <h3 className="font-display font-semibold text-base">Three steps</h3>
          <ol className="mt-3 grid md:grid-cols-3 gap-3">
            {STEPS.map(({ title, text }, i) => (
              <li key={title} className="rounded-2xl bg-white/[.035] border border-cn-line p-4">
                <span className="font-display font-bold text-cn-lavender tabular">{i + 1}</span>
                <p className="mt-1 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="font-display font-semibold text-base">Prepare your card art</h3>
          <div className="mt-3 grid md:grid-cols-[minmax(0,14rem)_1fr] gap-6 items-center">
            <CardDiagram />
            <div className="min-w-0">
              <ul className="space-y-2.5">
                {ZONES.map(({ color, name, text }) => (
                  <li key={name} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2.5 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
                    <span className="text-cn-text-2 leading-relaxed"><strong className="font-semibold text-cn-text-1">{name}.</strong> {text}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {ART.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-cn-text-3">{label}</dt>
                    <dd className="mt-0.5 text-cn-text-2 leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-display font-semibold text-base">A good first series</h3>
          <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">We suggest at least 8 cards, so collectors have more to chase. These are suggestions, and the numbers are yours to set.</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {RECIPE.map(({ rarity, cards, odds, color }) => (
              <div key={rarity} className="rounded-2xl bg-white/[.035] border border-cn-line p-4">
                <p className="text-xs font-semibold" style={{ color }}>{rarity}</p>
                <p className="mt-1 font-display font-bold text-xl tabular">{cards} {cards === 1 ? "card" : "cards"}</p>
                <p className="text-xs text-cn-text-3 tabular">{odds} odds</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-cn-text-3 leading-relaxed">With odds like these and card values of 40, 120, 360 and 1,200, a pack of five costs 500 simulated Credits.</p>
        </section>

        <section>
          <h3 className="font-display font-semibold text-base">Before you publish</h3>
          <ul className="mt-3 grid md:grid-cols-3 gap-3">
            {RULES.map(({ title, text }) => (
              <li key={title} className="rounded-2xl bg-white/[.035] border border-cn-line p-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </details>
  );
}
