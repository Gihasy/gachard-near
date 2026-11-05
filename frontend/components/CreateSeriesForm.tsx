"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { inputClass, primaryBtn, RARITY_COLOR } from "@/components/ui";

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
      className="space-y-4"
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
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 items-center text-sm">
        <span className="text-cn-text-3 text-xs">Rarity</span>
        <span className="text-cn-text-3 text-xs">Rate %</span>
        <span className="text-cn-text-3 text-xs">Price (Credits)</span>
        {RARITIES.map((r, i) => (
          <div key={r} className="contents">
            <span style={{ color: RARITY_COLOR[r] }} className="font-medium">{r}</span>
            <input className={inputClass} type="number" min={0} max={100} step="any" aria-label={`${r} rate`} value={rates[i]} onChange={(e) => setRates(rates.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
            <input className={inputClass} type="number" min={1} step={1} aria-label={`${r} price`} value={prices[i]} onChange={(e) => setPrices(prices.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
          </div>
        ))}
      </div>
      <p className={`text-xs ${total === 100 ? "text-cn-text-3" : "text-cn-danger"}`}>Rates add up to {total}%. They must add up to 100%.</p>
      <button className={primaryBtn} disabled={busy || total !== 100} data-testid="create-series">{busy ? "Publishing..." : "Publish series"}</button>
      {error ? <p className="text-sm text-cn-danger" role="alert">{error}</p> : null}
    </form>
  );
}
