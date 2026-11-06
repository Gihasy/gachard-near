"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UploadIcon } from "@/components/icons";
import { CATEGORIES, DEFAULT_CATEGORY } from "@/lib/categories";
import { post } from "@/lib/client";
import { packPrice } from "@/lib/pack-price";
import { ErrorLine, inputClass, primaryBtn, RARITY_COLOR, secondaryBtn } from "@/components/ui";

const RARITIES = ["Common", "Rare", "Epic", "Legendary"];
const LOGO_SIZE = 512;

/** A square-ish PNG that keeps transparency. Done here so the server never decodes an image (ADR-044). */
async function toLogoPng(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That logo is not a readable image.");
  }
  const scale = Math.min(1, LOGO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the logo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser cannot prepare the logo.");
  return blob;
}

export interface EditableSeries {
  id: number;
  name: string;
  description?: string;
  category?: string;
  logo?: string;
  ratesBps: number[];
  prices: number[];
}

/** Creates a series, or changes one when it is given `series`. */
export default function CreateSeriesForm({ onCancel, series }: { onCancel: () => void; series?: EditableSeries }) {
  const router = useRouter();
  const [name, setName] = useState(series?.name ?? "");
  const [description, setDescription] = useState(series?.description ?? "");
  const [category, setCategory] = useState(series?.category ?? DEFAULT_CATEGORY);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [rates, setRates] = useState(series ? series.ratesBps.map((r) => r / 100) : [70, 20, 8, 2]);
  const [prices, setPrices] = useState(series?.prices ?? [40, 120, 360, 1200]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = rates.reduce((a, b) => a + b, 0);
  const price = packPrice({ ratesBps: rates.map((r) => r * 100), prices });

  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  return (
    <form
      className="panel p-5 sm:p-6 space-y-6"
      data-testid="series-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          // Prepared first, so a bad logo stops here and not after the series is on chain.
          const logoPng = logo ? await toLogoPng(logo) : null;
          const fields = { name, description, category, ratesPct: rates, prices };
          const id = series
            ? (await post(`/api/creator/series/${series.id}`, fields), series.id)
            : (await post<{ id: number }>("/api/creator/series", fields)).id;
          if (logoPng) {
            const body = new FormData();
            body.set("logo", logoPng, "logo.png");
            const saved = await fetch(`/api/creator/series/${id}/logo`, { method: "POST", body });
            // The series exists by now, so say so instead of offering to create it again.
            if (!saved.ok) {
              router.refresh();
              throw new Error("Your series was saved, but its logo could not be.");
            }
          }
          onCancel();
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <div className="grid sm:grid-cols-[112px_1fr] gap-4">
        <label className="relative grid place-items-center w-28 h-28 rounded-2xl border border-dashed border-cn-line-strong hover:border-cn-lavender bg-white/[.03] cursor-pointer overflow-hidden transition">
          {logoUrl || series?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl ?? series?.logo} alt="Chosen logo" className="max-w-full max-h-full object-contain p-2" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 text-cn-text-3 text-xs text-center px-2">
              <UploadIcon />
              Upload logo
            </span>
          )}
          <input
            className="absolute inset-0 opacity-0 cursor-pointer"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Series logo"
            data-testid="series-logo"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setLogo(file);
              setLogoUrl(file ? URL.createObjectURL(file) : null);
            }}
          />
        </label>
        <div className="min-w-0 space-y-3">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Title" aria-label="Title" maxLength={64} required data-testid="series-name" />
          <textarea
            className={`${inputClass} !py-3 min-h-20 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description, in a sentence or two"
            aria-label="Description"
            maxLength={200}
            data-testid="series-description"
          />
          <label className="block text-xs text-cn-text-3">
            Category
            <select className={`${inputClass} mt-1 [&>option]:bg-cn-surface-1`} value={category} onChange={(e) => setCategory(e.target.value)} data-testid="series-category">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>

      <fieldset className="min-w-0">
        <legend className="font-display font-semibold text-base">Rarity</legend>
        <p className="mt-1 text-sm text-cn-text-2">How often each rarity appears in a pack, for every card in this series.</p>
        <div className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-white/10" aria-hidden="true">
          {RARITIES.map((r, i) => (
            <span key={r} className="transition-all duration-300" style={{ width: `${Math.max(0, rates[i])}%`, background: RARITY_COLOR[r] }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {RARITIES.map((r, i) => (
            <label key={r} className="block rounded-2xl border border-cn-line bg-white/[.03] p-3 text-sm font-semibold" style={{ color: RARITY_COLOR[r] }}>
              {r}
              <span className="mt-1.5 flex items-center gap-1.5">
                <input
                  className={`${inputClass} !min-h-10 tabular`}
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  aria-label={`${r} odds in percent`}
                  value={rates[i]}
                  onChange={(e) => setRates(rates.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                />
                <span className="text-cn-text-3 font-medium">%</span>
              </span>
            </label>
          ))}
        </div>
        <p className={`mt-3 text-sm ${total === 100 ? "text-cn-text-2" : "text-cn-danger font-semibold"}`} data-testid="series-summary">
          {total === 100
            ? <>A pack of 5 cards will cost <strong className="font-semibold text-cn-credits tabular">{price.toLocaleString("en-US")} Credits</strong>.</>
            : `The odds add up to ${total}%. They need to add up to 100%.`}
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-cn-lavender select-none">Change the pack price</summary>
          <p className="mt-2 text-xs text-cn-text-3 leading-relaxed">A pack costs what 5 cards are worth on average, so a higher value for a rarity raises the price.</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {RARITIES.map((r, i) => (
              <label key={r} className="block text-xs text-cn-text-3">
                {r} value
                <input
                  className={`${inputClass} mt-1 !min-h-10 tabular`}
                  type="number"
                  min={1}
                  step={1}
                  aria-label={`${r} value in Credits`}
                  value={prices[i]}
                  onChange={(e) => setPrices(prices.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                />
              </label>
            ))}
          </div>
        </details>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button className={primaryBtn} disabled={busy || total !== 100} data-testid="create-series">{busy ? "Saving..." : series ? "Save changes" : "Create series"}</button>
        <button type="button" className={secondaryBtn} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      <p className="text-xs text-cn-text-3 leading-relaxed">You can change all of this later. New odds apply to packs bought after that, and each change stays on the public record.</p>
      <ErrorLine>{error}</ErrorLine>
    </form>
  );
}
