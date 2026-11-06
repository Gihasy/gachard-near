"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AddCardForm, { type EditableDraft } from "@/components/AddCardForm";
import { CardImage, ErrorLine, Rarity, primaryBtn, secondaryBtn } from "@/components/ui";
import { frameKeyOf, renderCard, type CardFrame } from "@/lib/card-frame";

const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

/** A series' unpublished cards, which can still change, and the button that makes them permanent. */
export default function SeriesDrafts({ seriesId, drafts, rates, missing, live, frame }: {
  seriesId: number;
  frame: CardFrame;
  drafts: EditableDraft[];
  rates: number[];
  missing: string[];
  live: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [total, setTotal] = useState(0);
  const [redrawFailed, setRedrawFailed] = useState("");

  // A series' name or logo is on its cards' frames, so changing either redraws its drafts.
  const key = frameKeyOf(frame);
  const staleIds = drafts.filter((d) => d.sourceMedia && d.frameKey !== key).map((d) => d.id).join();
  useEffect(() => {
    if (!staleIds) return;
    let stopped = false;
    (async () => {
      try {
        for (const draft of drafts) {
          if (stopped) return;
          if (!draft.sourceMedia || draft.frameKey === key) continue;
          const source = await (await fetch(draft.sourceMedia)).blob();
          const body = new FormData();
          body.set("name", draft.name);
          body.set("rarity", String(draft.rarity));
          body.set("framed", "1");
          body.set("frameKey", key);
          body.set("flavor", draft.flavor ?? "");
          body.set("art", await renderCard({ ...frame, source, name: draft.name, rarity: RARITIES[draft.rarity], flavor: draft.flavor }), "art.jpg");
          const response = await fetch(`/api/creator/series/${seriesId}/cards/${draft.id}`, { method: "POST", body });
          if (!response.ok) throw new Error((await response.json()).error);
        }
        if (!stopped) router.refresh();
      } catch (err) {
        if (!stopped) setRedrawFailed((err as Error).message);
      }
    })();
    return () => { stopped = true; };
    // Runs again only when another set of drafts falls out of date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleIds, key]);

  if (!drafts.length) return null;
  const count = `${drafts.length} ${drafts.length === 1 ? "card" : "cards"}`;
  const current = drafts.find((d) => d.id === editing);

  const remove = async (draft: EditableDraft) => {
    if (!window.confirm(`Remove ${draft.name} from your drafts?`)) return;
    setRemoveError("");
    const response = await fetch(`/api/creator/series/${seriesId}/cards/${draft.id}`, { method: "DELETE" });
    if (!response.ok) setRemoveError((await response.json()).error);
    router.refresh();
  };

  const publish = async () => {
    setBusy(true);
    setError("");
    setTotal(drafts.length);
    setDone(0);
    try {
      // A long series takes several requests. A request that writes nothing means another publish holds the cards.
      for (let finished = 0, stalled = 0; ;) {
        const response = await fetch(`/api/creator/series/${seriesId}/publish`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        finished += data.published;
        setDone(finished);
        if (data.remaining === 0) break;
        stalled = data.published ? 0 : stalled + 1;
        if (stalled >= 2) throw new Error("Some cards are still being written. Try again in a minute.");
      }
      dialog.current?.close();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <section className="mt-6 pt-6 border-t border-cn-line" data-testid="series-drafts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Drafts <span className="text-cn-text-3 font-normal tabular">{drafts.length}</span></h4>
          <p className="mt-0.5 text-xs text-cn-text-3">Only you can see these. Change or remove them until you publish.</p>
        </div>
        <button
          type="button"
          className={primaryBtn}
          disabled={missing.length > 0 || Boolean(staleIds)}
          data-testid="publish-series"
          onClick={() => {
            setError("");
            dialog.current?.showModal();
          }}
        >
          {live ? `Publish ${count}` : "Publish series"}
        </button>
      </div>
      {missing.length ? <p className="mt-2 text-xs text-cn-credits sm:text-right" data-testid="publish-needs">Still needs a card for: {missing.join(", ")}</p> : null}
      {staleIds && !redrawFailed ? <p className="mt-2 text-xs text-cn-text-3 sm:text-right" data-testid="redrawing">Updating the card frames...</p> : null}
      <ErrorLine>{redrawFailed}</ErrorLine>
      <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="pop" data-testid="draft-card">
            <CardImage src={draft.media} alt={draft.name} rarity={RARITIES[draft.rarity]} />
            <p className="mt-2 text-xs font-medium truncate">{draft.name}</p>
            <Rarity value={RARITIES[draft.rarity]} />
            <div className="mt-1 flex gap-3 text-xs font-semibold">
              <button type="button" className="text-cn-lavender hover:underline" data-testid="edit-draft" onClick={() => setEditing(draft.id)}>Edit</button>
              <button type="button" className="text-cn-text-3 hover:text-cn-danger hover:underline" data-testid="remove-draft" onClick={() => remove(draft)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      {current ? (
        <AddCardForm key={current.id} seriesId={seriesId} rates={rates} suggested={current.rarity} frame={frame} draft={current} onDone={() => setEditing(null)} />
      ) : null}
      <ErrorLine>{removeError}</ErrorLine>

      <dialog ref={dialog} className="dismantle-dialog" aria-labelledby={`publish-${seriesId}`} data-testid="publish-dialog" onCancel={(e) => { if (busy) e.preventDefault(); }}>
        <h2 id={`publish-${seriesId}`} className="font-display font-semibold text-lg">Publish {count}?</h2>
        <p className="mt-3 text-sm text-cn-text-2 leading-relaxed">
          {live ? "They join your live series." : "Your series goes live, and anyone can buy its packs."}
        </p>
        <div className="mt-4 rounded-2xl border border-[#f7c96b40] bg-[#f7c96b12] p-3 text-sm leading-relaxed" role="alert">
          <strong className="font-semibold text-cn-credits">These cards cannot be changed after this.</strong>{" "}
          Each one is written to the blockchain for good: its name, image and rarity. You can still edit the series around them.
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => dialog.current?.close()}>Keep editing</button>
          <button type="button" className={primaryBtn} disabled={busy} data-testid="confirm-publish" onClick={publish}>
            {busy ? `Publishing ${Math.min(done + 1, total)} of ${total}...` : "Publish"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
