import { CrystalStar } from "@/components/icons";

// The crimped top and bottom edges of a sealed foil pack, as one outline.
const TEETH = 24;
const zigzag = (y: number, depth: number) =>
  Array.from({ length: TEETH * 2 + 1 }, (_, i) => [(i * 100) / (TEETH * 2), i % 2 ? y + depth : y] as const);
const OUTLINE = [...zigzag(0, 0.8), ...zigzag(100, -0.8).reverse()]
  .map(([x, y]) => `${x}% ${y}%`)
  .join(",");

/** A sealed pack drawn in code, so any series has one without artwork. */
export default function PackArt({ name, cards, logo, className = "" }: { name: string; cards: number; logo?: string; className?: string }) {
  return (
    <div className={`pack ${className}`} aria-hidden="true">
      <div className="pack-foil" style={{ clipPath: `polygon(${OUTLINE})` }}>
        <span className="pack-crimp" data-edge="top" />
        <span className="pack-crimp" data-edge="bottom" />
        <span className="pack-sheen" />
        <div className="pack-face">
          <p className="pack-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" />
            Gachard
          </p>
          {logo ? (
            <span className="pack-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" />
            </span>
          ) : (
            <span className="pack-star"><CrystalStar size={48} /></span>
          )}
          <p className="pack-name">{name}</p>
          <p className="pack-count">{cards} cards per pack</p>
          <p className="pack-line">Collect. Verify. Print.</p>
        </div>
      </div>
    </div>
  );
}
