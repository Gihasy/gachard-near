import Link from "next/link";
import { CrystalGem } from "@/components/icons";
import { secondaryBtn } from "@/components/ui";

/** Crystal in one line. Each card's page and each trade button show the actual amounts. */
export default function CrystalBalance({ crystal, duplicates }: { crystal: number; duplicates: number }) {
  return (
    <section id="crystal" className="panel px-4 py-3 sm:px-5 mb-8 scroll-mt-24 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="crystal-panel">
      <p className="inline-flex items-center gap-2 font-display font-bold text-lg whitespace-nowrap">
        <CrystalGem size={22} />
        <span className="tabular" data-testid="crystal-balance">{crystal.toLocaleString("en-US")}</span> Crystal
      </p>
      <p className="min-w-0 flex-1 basis-64 text-sm text-cn-text-2">
        Dismantle duplicates for Crystal, and trade it for cards you are missing.
        {duplicates ? ` You have ${duplicates} to spare.` : ""}
      </p>
      <Link className={`${secondaryBtn} !min-h-10 shrink-0`} href="/crystal" data-testid="crystal-shop">Crystal Shop</Link>
    </section>
  );
}
