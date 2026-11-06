"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SendIcon } from "@/components/icons";
import { ErrorLine, Panel, inputClass, primaryBtn, secondaryBtn } from "@/components/ui";
import { post } from "@/lib/client";

type View = { asBuyer: { id: string; code: string } | null; asHolder: { id: string; username: string }[] };

const POLL_MS = 4000;

/** Passing a printed card to someone in person: they ask, and the holder approves with their code. */
export default function CardHandoff({ tokenId, initial, isHolder, signedIn, loginNext }: {
  tokenId: string;
  initial: View;
  isHolder: boolean;
  signedIn: boolean;
  loginNext: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const address = `/api/cards/${tokenId}/handoff`;
  const waiting = Boolean(view.asBuyer);

  // Asks only the app's own database, so waiting does not use up the chain's RPC.
  useEffect(() => {
    if (!signedIn || (!isHolder && !waiting)) return;
    const timer = setInterval(async () => {
      const response = await fetch(address).catch(() => null);
      if (!response?.ok) return;
      const next: View = await response.json();
      setView(next);
      // The buyer's request has ended, by approval or otherwise: the page says which.
      if (waiting && !next.asBuyer) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [address, isHolder, router, signedIn, waiting]);

  const act = async (body: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      await post(address, body);
      const response = await fetch(address);
      if (response.ok) setView(await response.json());
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const title = (
    <h2 className="font-display font-semibold text-base inline-flex items-center gap-2">
      <SendIcon width={18} height={18} className="text-cn-lavender" /> Trade this card
    </h2>
  );

  if (isHolder) {
    return (
      <Panel>
        <div data-testid="handoff-holder">
          {title}
          {view.asHolder.length === 0 ? (
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">
              To pass this card on, ask the new owner to scan its QR and press Request this card. Their request appears here, and only your approval moves the card.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {view.asHolder.map((row) => (
                <li key={row.id} className="rounded-2xl border border-cn-line bg-white/[.03] p-4" data-testid="handoff-request">
                  <p className="text-sm"><strong className="font-semibold">@{row.username}</strong> is asking for this card.</p>
                  <p className="mt-1 text-xs text-cn-text-3 leading-relaxed">Enter the code on their screen. The card then moves to them, and only they can move it again.</p>
                  <form
                    className="mt-3 flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act({ action: "approve", id: row.id, code: codes[row.id] ?? "" });
                    }}
                  >
                    <input
                      className={`${inputClass} !w-28 tabular tracking-widest text-center`}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="0000"
                      aria-label={`Code from @${row.username}`}
                      value={codes[row.id] ?? ""}
                      onChange={(e) => setCodes({ ...codes, [row.id]: e.target.value })}
                      required
                      data-testid="handoff-code-input"
                    />
                    <button className={primaryBtn} disabled={busy} data-testid="handoff-approve">{busy ? "Transferring..." : "Approve"}</button>
                    <button type="button" className={secondaryBtn} disabled={busy} onClick={() => act({ action: "decline", id: row.id })} data-testid="handoff-decline">Decline</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <ErrorLine>{error}</ErrorLine>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div data-testid="handoff-buyer">
        {title}
        {!signedIn ? (
          <>
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">Getting this card from its holder? Sign in to ask for it. The holder approves, and it moves to your account.</p>
            <Link className={`${secondaryBtn} mt-4`} href={`/login?next=${encodeURIComponent(loginNext)}`}>Sign in to request this card</Link>
          </>
        ) : view.asBuyer ? (
          <>
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">Show this code to the holder. They enter it to approve, and this page updates when the card is yours.</p>
            <p className="mt-3 font-display font-bold text-4xl tracking-[.25em] tabular text-cn-crystal" data-testid="handoff-code">{view.asBuyer.code}</p>
            <p className="mt-2 text-xs text-cn-text-3 leading-relaxed">Pay only after your username shows as Holder. Gachard does not handle the payment.</p>
            <button type="button" className={`${secondaryBtn} mt-4`} disabled={busy} onClick={() => act({ action: "decline", id: view.asBuyer!.id })}>Cancel request</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">Getting this card from its holder? Ask for it here. You get a code to show them, and it moves to your account once they approve.</p>
            <button type="button" className={`${primaryBtn} mt-4`} disabled={busy} onClick={() => act({ action: "request" })} data-testid="handoff-request-button">
              {busy ? "Asking..." : "Request this card"}
            </button>
          </>
        )}
        <ErrorLine>{error}</ErrorLine>
      </div>
    </Panel>
  );
}
