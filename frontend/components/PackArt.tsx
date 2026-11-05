import { CrystalStar } from "@/components/icons";

/** A sealed pack, drawn in crystal foil, so any series has one without artwork. */
export default function PackArt({ name, cards, className = "" }: { name: string; cards: number; className?: string }) {
  return (
    <div className={`crystal-mesh foil ${className}`} aria-hidden="true">
      <CrystalStar size={44} className="mb-3 drop-shadow" />
      <p className="font-display font-bold text-base leading-tight break-words max-w-full">{name}</p>
      <p className="mt-2 text-xs font-semibold opacity-70">{cards} cards</p>
      <span className="foil-seam" />
    </div>
  );
}
