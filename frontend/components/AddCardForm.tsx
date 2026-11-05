"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { inputClass, secondaryBtn } from "@/components/ui";

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
          const response = await fetch(`/api/creator/series/${seriesId}/cards`, { method: "POST", body: new FormData(e.currentTarget) });
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
