"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { SparkIcon } from "@/components/icons";
import { ErrorLine, secondaryBtn } from "@/components/ui";

export default function CrystalShop({ crystal, extraPacks, price, yields, duplicates }: {
  crystal: number;
  extraPacks: number;
  price: number;
  yields: string;
  duplicates: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const buy = async () => {
    setBusy(true);
    setError("");
    try {
      await post("/api/me/extra-pack");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <section id="shop" className="panel p-5 sm:p-6 mb-8 scroll-mt-24" data-testid="crystal-shop">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 max-w-xl">
          <p className="inline-flex items-center gap-2 font-display font-bold text-2xl">
            <SparkIcon width={20} height={20} className="text-cn-lavender" />
            <span className="tabular" data-testid="crystal-balance">{crystal.toLocaleString("en-US")}</span> Crystal
          </p>
          <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">
            Dismantle a digital card you do not need, and it is destroyed for good. A card gives {yields} Crystal, from Common to Legendary.
            {duplicates ? ` You have ${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-cn-text-2"><span className="tabular font-semibold text-cn-text-1" data-testid="extra-packs">{extraPacks}</span> extra pack {extraPacks === 1 ? "slot" : "slots"}</p>
          <button className={secondaryBtn} disabled={busy || crystal < price} onClick={buy} data-testid="buy-extra-pack">
            {busy ? "Buying..." : `Buy a slot for ${price} Crystal`}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-cn-text-3 leading-relaxed">
        A slot opens one more pack after the day&apos;s limit, and you still see every card before you pay. Crystal cannot be bought, sent or cashed out. These figures are examples for this demo.
      </p>
      <ErrorLine>{error}</ErrorLine>
    </section>
  );
}
