"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import { Panel, inputClass, primaryBtn, secondaryBtn } from "@/components/ui";

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

  const errorLine = error ? <p className="mt-3 text-sm text-cn-danger" role="alert">{error}</p> : null;

  if (status === "Printed") {
    return (
      <Panel>
        {isHolder ? (
          <div className="mb-5">
            <h2 className="font-semibold">Your print</h2>
            <p className="mt-1 text-sm text-cn-text-2">A hackathon simulation. Print it yourself and it stands in for the card the platform would ship.</p>
            <a className={`${primaryBtn} mt-3`} href={`/api/cards/${tokenId}/pdf`} data-testid="download-pdf">Download print PDF</a>
          </div>
        ) : null}
        <h2 className="font-semibold">Return to digital</h2>
        {signedIn ? (
          <>
            <p className="mt-1 text-sm text-cn-text-2">Enter the code from the printed card. The card moves to whoever enters it.</p>
            <form className="mt-3 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); run("redeem", { code }); }}>
              <input className={`${inputClass} flex-1 min-w-48 font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Redeem code" data-testid="redeem-code" required />
              <button className={secondaryBtn} disabled={busy} data-testid="redeem">{busy ? "Working..." : "Redeem"}</button>
            </form>
          </>
        ) : (
          <Link className={`${secondaryBtn} mt-3`} href={`/login?next=/scan/${tokenId}`}>Sign in to redeem</Link>
        )}
        {errorLine}
      </Panel>
    );
  }

  if (!isHolder) return null;

  return (
    <Panel>
      <h2 className="font-semibold">Print this card</h2>
      {confirming ? (
        <div className="mt-2" data-testid="print-notice">
          <p className="text-sm text-cn-text-2 leading-relaxed">
            This is a hackathon simulation. In production, cards would be printed and shipped by the
            platform. Here you get a PDF to print yourself. The card locks until someone redeems it
            with the code on the PDF, and whoever enters that code receives the card.
          </p>
          <div className="mt-3 flex gap-3">
            <button className={primaryBtn} disabled={busy} onClick={() => run("print")} data-testid="confirm-print">{busy ? "Locking..." : "Lock and create PDF"}</button>
            <button className={secondaryBtn} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-cn-text-2">Get a print-ready PDF with a QR code and a redeem code.</p>
          <button className={`${secondaryBtn} mt-3`} onClick={() => setConfirming(true)} data-testid="print">Print</button>
        </>
      )}
      <h2 className="font-semibold mt-6">Send to another collector</h2>
      <form className="mt-3 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); run("send", { to }); }}>
        <input className={`${inputClass} flex-1 min-w-48 font-mono`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Their collector code" aria-label="Collector code" data-testid="send-to" required />
        <button className={secondaryBtn} disabled={busy} data-testid="send">Send</button>
      </form>
      {myCode ? <p className="mt-2 text-xs text-cn-text-3">Your own code is {myCode}.</p> : null}
      {errorLine}
    </Panel>
  );
}
