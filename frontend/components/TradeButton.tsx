"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { ErrorLine } from "@/components/ui";

/** Trades Crystal for a card the collector is missing. */
export default function TradeButton({ seriesId, templateId, price, crystal }: { seriesId: number; templateId: number; price: number; crystal: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="mt-1.5 w-full rounded-full border border-cn-line-strong px-2 py-1.5 text-[11px] leading-tight font-semibold tabular transition enabled:hover:border-cn-lavender disabled:opacity-50"
        disabled={busy || crystal < price}
        data-testid="trade"
        data-template={templateId}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            // The chain lists a new card a moment later, but its own record is there at once.
            const { tokenId } = await post<{ tokenId: string }>("/api/me/trade", { seriesId, templateId });
            router.push(`/scan/${tokenId}`);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? "Trading..." : `${price} Crystal`}
      </button>
      <ErrorLine>{error}</ErrorLine>
    </>
  );
}
