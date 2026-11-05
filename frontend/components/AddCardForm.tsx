"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UploadIcon } from "@/components/icons";
import { ErrorLine, inputClass, secondaryBtn } from "@/components/ui";

const MAX_WIDTH = 1630; // bleed width at 600 dpi, docs/CREATOR-ASSET-GUIDE.md

/**
 * Turns any image the browser can read into a JPEG the server and the PDF can
 * use. Done here so the server never decodes an image (ADR-044).
 */
async function toJpeg(file: File): Promise<Blob> {
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
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("This browser cannot prepare the image.");
  return blob;
}

export default function AddCardForm({ seriesId }: { seriesId: number }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <form
      ref={form}
      className="mt-6 pt-6 border-t border-cn-line grid sm:grid-cols-[112px_1fr] gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const body = new FormData(e.currentTarget);
          body.set("art", await toJpeg(body.get("art") as File), "art.jpg");
          const response = await fetch(`/api/creator/series/${seriesId}/cards`, { method: "POST", body });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          form.current?.reset();
          setPreview(null);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <label className="relative block w-28 aspect-[63/88] rounded-xl border border-dashed border-cn-line-strong hover:border-cn-lavender bg-white/[.03] cursor-pointer overflow-hidden transition focus-within:ring-4 focus-within:ring-[#c9b3fb26]">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Chosen artwork" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-cn-text-3 text-xs text-center px-2">
            <UploadIcon />
            Choose artwork
          </span>
        )}
        <input
          className="absolute inset-0 opacity-0 cursor-pointer"
          name="art"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Artwork"
          required
          data-testid="card-art"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
      </label>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Add a card</h3>
        <div className="mt-2 grid sm:grid-cols-[1fr_auto_auto] gap-3">
          <input className={inputClass} name="name" placeholder="Card name" aria-label="Card name" maxLength={64} required data-testid="card-name" />
          <select className={`${inputClass} [&>option]:bg-cn-surface-1`} name="rarity" aria-label="Rarity" data-testid="card-rarity">
            <option value="0">Common</option>
            <option value="1">Rare</option>
            <option value="2">Epic</option>
            <option value="3">Legendary</option>
          </select>
          <button className={secondaryBtn} disabled={busy} data-testid="add-card">{busy ? "Adding..." : "Add card"}</button>
        </div>
        <p className="mt-2 text-xs text-cn-text-3 leading-relaxed">
          A card cannot be changed once added. Its artwork&apos;s fingerprint goes on the public record. Best at 63 x 88 proportions, because collectors can print it: a QR code goes on the bottom right.
        </p>
        <ErrorLine>{error}</ErrorLine>
      </div>
    </form>
  );
}
