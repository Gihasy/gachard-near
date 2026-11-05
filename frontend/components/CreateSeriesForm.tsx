"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { ErrorLine, inputClass, primaryBtn, RARITY_COLOR } from "@/components/ui";

const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

export default function CreateSeriesForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rates, setRates] = useState([70, 20, 8, 2]);
  const [prices, setPrices] = useState([40, 120, 360, 1200]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = rates.reduce((a, b) => a + b, 0);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await post("/api/creator/series", { name, ratesPct: rates, prices });
          setName("");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Series name" aria-label="Series name" maxLength={64} required data-testid="series-name" />

      {/* The rates at a glance, as a pack's odds really split. */}
      <div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-white/10" aria-hidden="true">
          {RARITIES.map((r, i) => (
            <span key={r} className="transition-all duration-300" style={{ width: `${Math.max(0, rates[i])}%`, background: RARITY_COLOR[r] }} />
          ))}
        </div>
        <p className={`mt-2 text-xs ${total === 100 ? "text-cn-text-3" : "text-cn-danger font-semibold"}`}>
          Rates add up to {total}%. They must add up to 100%.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RARITIES.map((r, i) => (
          <fieldset key={r} className="rounded-2xl border border-cn-line bg-white/[.03] p-3">
            <legend className="px-1 text-sm font-semibold" style={{ color: RARITY_COLOR[r] }}>{r}</legend>
            <label className="block text-xs text-cn-text-3">
              Rate %
              <input className={`${inputClass} mt-1 !min-h-10 tabular`} type="number" min={0} max={100} step="any" aria-label={`${r} rate`} value={rates[i]} onChange={(e) => setRates(rates.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
            </label>
            <label className="mt-2 block text-xs text-cn-text-3">
              Price in Credits
              <input className={`${inputClass} mt-1 !min-h-10 tabular`} type="number" min={1} step={1} aria-label={`${r} price`} value={prices[i]} onChange={(e) => setPrices(prices.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
            </label>
          </fieldset>
        ))}
      </div>

      <button className={primaryBtn} disabled={busy || total !== 100} data-testid="create-series">{busy ? "Publishing..." : "Publish series"}</button>
      <ErrorLine>{error}</ErrorLine>
    </form>
  );
}
