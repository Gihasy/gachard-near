"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UploadIcon } from "@/components/icons";
import { ErrorLine, inputClass, secondaryBtn } from "@/components/ui";
import { frameKeyOf, renderCard, type CardFrame } from "@/lib/card-frame";

const MAX_WIDTH = 1630; // bleed width at 600 dpi, docs/CREATOR-ASSET-GUIDE.md
const MAX_UPLOAD = 4_200_000; // Vercel refuses a request body over 4.5 MB.

/**
 * Turns any image the browser can read into a JPEG the server and the PDF can
 * use. Done here so the server never decodes an image (ADR-044).
 */
async function toJpeg(file: File, quality = 0.9): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file is not a readable image.");
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the image.");
  context.fillStyle = "#ffffff"; // JPEG has no transparency
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This browser cannot prepare the image.");
  return blob;
}

/** "moss-slug_01.png" becomes "moss slug 01": a start for the name, which can be changed. */
const nameFrom = (file: string) => file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 64);

const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

export type EditableDraft = { id: string; name: string; rarity: number; media: string; flavor?: string; sourceMedia?: string; frameKey?: string };

/** Adds a draft card, or changes one when given `draft`. */
export default function AddCardForm({ seriesId, rates, suggested, frame, draft, onDone }: {
  seriesId: number;
  rates: number[];
  suggested: number;
  frame: CardFrame;
  draft?: EditableDraft;
  onDone?: () => void;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [framedPreview, setFramedPreview] = useState(false);
  const [useFrame, setUseFrame] = useState(draft ? Boolean(draft.sourceMedia) : true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = preview ?? draft?.media ?? null;
  const showsFrame = preview ? framedPreview : Boolean(draft?.sourceMedia);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // The picture exactly as it will be, redrawn shortly after anything in the form changes.
  const redraw = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const element = form.current;
      if (!element) return;
      const body = new FormData(element);
      const file = body.get("art") as File;
      try {
        const source = file.size ? file : draft ? await (await fetch(draft.sourceMedia ?? draft.media)).blob() : null;
        if (!source) return;
        const framed = body.get("framed") === "1";
        const image = framed
          ? await renderCard({ ...frame, source, name: String(body.get("name") || "Card name"), rarity: RARITIES[Number(body.get("rarity"))], flavor: String(body.get("flavor") ?? "").trim(), scale: 1 })
          : source;
        setPreview(URL.createObjectURL(image));
        setFramedPreview(framed);
      } catch {
        // The file is checked again on submit, which says what is wrong.
      }
    }, 250);
  }, [draft, frame]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <form
      ref={form}
      className="mt-6 pt-6 border-t border-cn-line grid sm:grid-cols-[112px_1fr] gap-4"
      onChange={redraw}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const body = new FormData(e.currentTarget);
          const file = body.get("art") as File;
          const fresh = file.size ? await toJpeg(file) : null;
          const framed = body.get("framed") === "1";
          body.delete("art");
          if (framed) {
            const source = fresh ?? await (await fetch(draft!.sourceMedia ?? draft!.media)).blob();
            const card = await renderCard({ ...frame, source, name: String(body.get("name")).trim(), rarity: RARITIES[Number(body.get("rarity"))], flavor: String(body.get("flavor") ?? "").trim() });
            body.set("art", card, "art.jpg");
            body.set("frameKey", frameKeyOf(frame));
            if (fresh) {
              const small = fresh.size + card.size > MAX_UPLOAD ? await toJpeg(file, 0.7) : fresh;
              if (small.size + card.size > MAX_UPLOAD) throw new Error("That image is too large. Please use a smaller one.");
              body.set("source", small, "source.jpg");
            }
          } else if (fresh) {
            body.set("art", fresh, "art.jpg");
          } else if (draft?.sourceMedia) {
            body.set("art", await (await fetch(draft.sourceMedia)).blob(), "art.jpg");
          }
          const address = `/api/creator/series/${seriesId}/cards${draft ? `/${draft.id}` : ""}`;
          const response = await fetch(address, { method: "POST", body });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          form.current?.reset();
          setPreview(null);
          setUseFrame(true);
          onDone?.();
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <label className="relative block w-28 aspect-[63/88] rounded-xl border border-dashed border-cn-line-strong hover:border-cn-lavender bg-white/[.03] cursor-pointer overflow-hidden transition focus-within:ring-4 focus-within:ring-[#c9b3fb26]">
        {shown && showsFrame ? (
          <span className="card-frame absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="Chosen artwork" data-framed data-testid="card-preview" />
          </span>
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Chosen artwork" className="absolute inset-0 size-full object-cover" data-testid="card-preview" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-cn-text-3 text-xs text-center px-2">
            <UploadIcon />
            Upload image
          </span>
        )}
        <input
          className="absolute inset-0 opacity-0 cursor-pointer"
          name="art"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Artwork"
          required={!draft}
          data-testid="card-art"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const name = form.current?.elements.namedItem("name") as HTMLInputElement | null;
            if (file && name && !name.value) name.value = nameFrom(file.name);
          }}
        />
      </label>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{draft ? "Change this draft" : "Add a card"}</h3>
        <div className="mt-2 grid sm:grid-cols-[1fr_auto_auto] gap-3">
          <input className={inputClass} name="name" placeholder="Card name" aria-label="Card name" maxLength={64} required defaultValue={draft?.name} data-testid="card-name" />
          <select className={`${inputClass} [&>option]:bg-cn-surface-1`} name="rarity" aria-label="Rarity" defaultValue={draft?.rarity ?? suggested} data-testid="card-rarity">
            {RARITIES.map((r, i) => (rates[i] > 0 ? <option key={r} value={i}>{r}</option> : null))}
          </select>
          <button className={secondaryBtn} disabled={busy} data-testid="add-card">
            {draft ? (busy ? "Saving..." : "Save") : (busy ? "Adding..." : "Add card")}
          </button>
          {draft ? <button type="button" className={secondaryBtn} disabled={busy} onClick={onDone}>Cancel</button> : null}
        </div>
        {useFrame ? (
          <input className={`${inputClass} mt-3`} name="flavor" placeholder="A line of text on the card (optional)" aria-label="Text on the card" maxLength={90} defaultValue={draft?.flavor} data-testid="card-flavor" />
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm text-cn-text-2 cursor-pointer">
          <input type="checkbox" name="framed" value="1" className="size-4 accent-[#c9b3fb]" checked={useFrame} onChange={(e) => setUseFrame(e.target.checked)} data-testid="card-framed" />
          Add the Gachard card frame
        </label>
        <p className="mt-2 text-xs text-cn-text-3 leading-relaxed">
          {draft ? "Choose a new image only if you want to replace this one." : "Cards stay drafts you can change or remove until you publish them."}
        </p>
        <ErrorLine>{error}</ErrorLine>
      </div>
    </form>
  );
}
