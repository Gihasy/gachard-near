"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorLine, secondaryBtn } from "@/components/ui";

/** Deleting a series, after a warning that says what happens to its cards. */
export default function DeleteSeries({ seriesId, name, published, packsSold }: {
  seriesId: number;
  name: string;
  published: number;
  packsSold: number;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/creator/series/${seriesId}`, { method: "DELETE" });
    if (response.ok) {
      dialog.current?.close();
      router.refresh();
    } else {
      setError((await response.json()).error);
    }
    setBusy(false);
  };

  return (
    <div className="mt-6 pt-4 border-t border-cn-line flex justify-end">
      <button
        type="button"
        className="text-sm font-semibold text-cn-text-3 hover:text-cn-danger hover:underline"
        data-testid="delete-series"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
      >
        Delete series
      </button>
      <dialog ref={dialog} className="dismantle-dialog" aria-labelledby={`delete-${seriesId}`} data-testid="delete-dialog" onCancel={(e) => { if (busy) e.preventDefault(); }}>
        <h2 id={`delete-${seriesId}`} className="font-display font-semibold text-lg break-words">Delete {name}?</h2>
        {published ? (
          <ul className="mt-3 list-disc pl-5 space-y-1.5 text-sm text-cn-text-2 leading-relaxed">
            <li>It leaves your studio and every public list, and sells no more packs or trades.</li>
            {packsSold ? <li>{packsSold.toLocaleString("en-US")} {packsSold === 1 ? "pack was" : "packs were"} sold. Collectors keep their cards, and those stay valid.</li> : null}
            <li>Its {published} published {published === 1 ? "card stays" : "cards stay"} on the blockchain, which cannot be erased. Its page stays open by its address, marked as retired.</li>
          </ul>
        ) : (
          <p className="mt-3 text-sm text-cn-text-2 leading-relaxed">It leaves Gachard along with its drafts. Only the series&apos; own entry stays on the blockchain, which cannot be erased.</p>
        )}
        <div className="mt-4 rounded-2xl border border-[#ff7a8a66] bg-[#ff7a8a1a] p-3 text-sm leading-relaxed" role="alert">
          <strong className="font-semibold text-cn-danger">This cannot be undone.</strong>
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => dialog.current?.close()}>Keep it</button>
          <button type="button" className="min-h-11 rounded-full bg-cn-danger px-5 text-sm font-semibold text-[#2a0a10] transition hover:brightness-110 disabled:opacity-60" disabled={busy} data-testid="confirm-delete" onClick={remove}>
            {busy ? "Deleting..." : "Delete series"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
