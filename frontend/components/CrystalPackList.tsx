"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CrystalGem } from "@/components/icons";
import { ErrorLine } from "@/components/ui";
import { post } from "@/lib/client";

/** A pack paid for in Crystal. It opens like any other pack. */
export default function CrystalPackList({ crystal, price, series }: {
  crystal: number;
  price: number;
  series: { id: number; name: string; logo?: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const short = price - crystal;

  return (
    <>
      <ul className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {series.map((s) => (
          <li key={s.id} className="panel p-4 flex flex-col items-center text-center">
            <div className="ip-logo ip-logo-small">
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo} alt="" loading="lazy" />
              ) : (
                <span className="font-display font-bold text-2xl crystal-text" aria-hidden="true">{s.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <p className="mt-2 w-full text-sm font-semibold truncate">{s.name}</p>
            <button
              type="button"
              className="mt-3 w-full min-h-10 rounded-full border border-cn-line-strong px-3 text-sm font-semibold tabular transition enabled:hover:border-cn-lavender disabled:opacity-50"
              disabled={busy !== null || short > 0}
              aria-label={`Trade ${price} Crystal for a ${s.name} pack`}
              data-testid="crystal-pack"
              onClick={async () => {
                setBusy(s.id);
                setError("");
                try {
                  const { id } = await post<{ id: string }>("/api/packs", { seriesId: s.id, pay: "crystal" });
                  router.push(`/pack/${id}`);
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(null);
                }
              }}
            >
              {busy === s.id ? "Minting..." : <span className="inline-flex items-center justify-center gap-1.5"><CrystalGem size={14} /> {price}</span>}
            </button>
          </li>
        ))}
      </ul>
      {short > 0 ? <p className="mt-3 text-sm text-cn-text-3">You need {short.toLocaleString("en-US")} more Crystal for a pack.</p> : null}
      <ErrorLine>{error}</ErrorLine>
    </>
  );
}
