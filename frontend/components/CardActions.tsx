"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { PrintIcon, SendIcon } from "@/components/icons";
import { ErrorLine, Panel, inputClass, primaryBtn, secondaryBtn } from "@/components/ui";

export default function CardActions({ tokenId, status, isHolder, signedIn, myCode }: {
  tokenId: string;
  status: string;
  isHolder: boolean;
  signedIn: boolean;
  myCode: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState("");
  const [to, setTo] = useState("");

  const run = async (url: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await post(`/api/cards/${tokenId}/${url}`, body);
      setConfirming(false);
      setCode("");
      setTo("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  if (status === "Printed") {
    return (
      <Panel>
        {isHolder ? (
          <div className="mb-6 pb-6 border-b border-cn-line">
            <h2 className="font-display font-semibold text-base">Your print</h2>
            <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">A hackathon simulation. Print it yourself and it stands in for the card the platform would ship.</p>
            <a className={`${primaryBtn} mt-4`} href={`/api/cards/${tokenId}/pdf`} data-testid="download-pdf">
              <PrintIcon width={17} height={17} /> Download print PDF
            </a>
          </div>
        ) : null}
        <h2 className="font-display font-semibold text-base">Return to digital</h2>
        {signedIn ? (
          <>
            <p className="mt-1 text-sm text-cn-text-2">Enter the code from the printed card. The card moves to whoever enters it.</p>
            <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); run("redeem", { code }); }}>
              <input className={`${inputClass} flex-1 min-w-48 font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Redeem code" data-testid="redeem-code" required />
              <button className={secondaryBtn} disabled={busy} data-testid="redeem">{busy ? "Working..." : "Redeem"}</button>
            </form>
          </>
        ) : (
          <Link className={`${secondaryBtn} mt-4`} href={`/login?next=/scan/${tokenId}`}>Sign in to redeem</Link>
        )}
        <ErrorLine>{error}</ErrorLine>
      </Panel>
    );
  }

  if (!isHolder) return null;

  return (
    <Panel>
      <div className="grid sm:grid-cols-2 gap-6 sm:gap-8">
        <div>
          <h2 className="font-display font-semibold text-base inline-flex items-center gap-2"><PrintIcon width={18} height={18} className="text-cn-lavender" /> Print this card</h2>
          {confirming ? (
            <div className="mt-2 pop" data-testid="print-notice">
              <p className="text-sm text-cn-text-2 leading-relaxed">
                This is a hackathon simulation. In production, cards would be printed and shipped by the
                platform. Here you get a PDF to print yourself. The card locks until someone redeems it
                with the code on the PDF, and whoever enters that code receives the card.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className={primaryBtn} disabled={busy} onClick={() => run("print")} data-testid="confirm-print">{busy ? "Locking..." : "Lock and create PDF"}</button>
                <button className={secondaryBtn} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">Get a print-ready PDF with a QR code and a redeem code.</p>
              <button className={`${secondaryBtn} mt-4`} onClick={() => setConfirming(true)} data-testid="print">Print</button>
            </>
          )}
        </div>
        <div>
          <h2 className="font-display font-semibold text-base inline-flex items-center gap-2"><SendIcon width={18} height={18} className="text-cn-lavender" /> Send to a collector</h2>
          <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run("send", { to }); }}>
            <input className={`${inputClass} font-mono`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Their collector code" aria-label="Collector code" data-testid="send-to" required />
            <button className={`${secondaryBtn} self-start`} disabled={busy} data-testid="send">Send</button>
          </form>
          {myCode ? <p className="mt-2 text-xs text-cn-text-3">Your own code is {myCode}.</p> : null}
        </div>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </Panel>
  );
}
