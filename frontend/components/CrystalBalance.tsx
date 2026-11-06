import { SparkIcon } from "@/components/icons";

export default function CrystalBalance({ crystal, yields, tradeFrom, duplicates }: { crystal: number; yields: string; tradeFrom: number; duplicates: number }) {
  return (
    <section id="crystal" className="panel p-5 sm:p-6 mb-8 scroll-mt-24" data-testid="crystal-panel">
      <p className="inline-flex items-center gap-2 font-display font-bold text-2xl">
        <SparkIcon width={20} height={20} className="text-cn-lavender" />
        <span className="tabular" data-testid="crystal-balance">{crystal.toLocaleString("en-US")}</span> Crystal
      </p>
      <p className="mt-2 text-sm text-cn-text-2 leading-relaxed max-w-2xl">
        Dismantle a digital card you do not need, and it is destroyed for good. A card gives {yields} Crystal, from Common to Legendary. Trade Crystal for a card you are missing, from {tradeFrom} Crystal, below.
        {duplicates ? ` You have ${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"}.` : ""}
      </p>
      <p className="mt-3 text-xs text-cn-text-3 leading-relaxed">Crystal cannot be bought, sent or cashed out. These figures are examples for this demo.</p>
    </section>
  );
}
