import { SparkIcon } from "@/components/icons";

/** Crystal in one line. Each card's page and each trade button show the actual amounts. */
export default function CrystalBalance({ crystal, duplicates }: { crystal: number; duplicates: number }) {
  return (
    <section id="crystal" className="panel px-4 py-3 sm:px-5 mb-8 scroll-mt-24 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="crystal-panel">
      <p className="inline-flex items-center gap-2 font-display font-bold text-lg whitespace-nowrap">
        <SparkIcon width={16} height={16} className="text-cn-lavender" />
        <span className="tabular" data-testid="crystal-balance">{crystal.toLocaleString("en-US")}</span> Crystal
      </p>
      <p className="min-w-0 flex-1 basis-64 text-sm text-cn-text-2">
        Dismantle duplicates for Crystal, and trade it for cards you are missing.
        {duplicates ? ` You have ${duplicates} to spare.` : ""}
      </p>
    </section>
  );
}
