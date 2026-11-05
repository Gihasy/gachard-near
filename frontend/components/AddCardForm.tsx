"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { inputClass, secondaryBtn } from "@/components/ui";

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
  return (
    <form
      ref={form}
      className="mt-5 grid sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-center"
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
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <input className={inputClass} name="name" placeholder="Card name" aria-label="Card name" maxLength={64} required data-testid="card-name" />
      <select className={inputClass} name="rarity" aria-label="Rarity" data-testid="card-rarity">
        <option value="0">Common</option>
        <option value="1">Rare</option>
        <option value="2">Epic</option>
        <option value="3">Legendary</option>
      </select>
      <input className={`${inputClass} file:mr-3 file:bg-transparent file:border-0 file:text-cn-text-2`} name="art" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Artwork" required data-testid="card-art" />
      <button className={secondaryBtn} disabled={busy} data-testid="add-card">{busy ? "Adding..." : "Add card"}</button>
      {error ? <p className="sm:col-span-4 text-sm text-cn-danger" role="alert">{error}</p> : null}
      <p className="sm:col-span-4 text-xs text-cn-text-3">A card cannot be changed once added. Its artwork&apos;s fingerprint goes on the public record.</p>
    </form>
  );
}
