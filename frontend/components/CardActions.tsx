"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import PrintSheet from "@/components/PrintSheet";
import { PrintIcon, SendIcon } from "@/components/icons";
import { ErrorLine, Panel, inputClass, primaryBtn, secondaryBtn } from "@/components/ui";

const SPECS = ["63 x 88 mm", "Crop marks", "QR code", "Redeem code"];

export default function CardActions({ tokenId, status, media, cardName, qr, isHolder, signedIn, myCode }: {
  tokenId: string;
  status: string;
  media: string;
  cardName: string;
  qr: string;
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

  const sheet = (
    <div className="w-36 sm:w-44 mx-auto sm:mx-0 shrink-0 -rotate-2">
      <PrintSheet src={media} qr={qr} label={`Preview of the print file for ${cardName}`} />
    </div>
  );

  if (status === "Printed") {
    return (
      <div id="print" className="space-y-5 scroll-mt-24">
        {isHolder ? (
          <section className="panel print-panel p-5 sm:p-6 flex flex-col sm:flex-row gap-6 sm:items-center">
            {sheet}
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-lg inline-flex items-center gap-2"><PrintIcon width={19} height={19} className="text-cn-lavender" /> Your print is ready</h2>
              <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">A hackathon simulation. Print it yourself and it stands in for the card the platform would ship.</p>
              <a className={`${primaryBtn} mt-4`} href={`/api/cards/${tokenId}/pdf`} data-testid="download-pdf">
                <PrintIcon width={17} height={17} /> Download print PDF
              </a>
            </div>
          </section>
        ) : null}
        <Panel>
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
      </div>
    );
  }

  if (!isHolder) {
    return (
      <p id="print" className="flex items-center gap-2 rounded-2xl border border-cn-line bg-white/[.03] px-4 py-3 text-sm text-cn-text-2 scroll-mt-24">
        <PrintIcon width={17} height={17} className="text-cn-lavender shrink-0" />
        This digital card can be printed by its holder.
      </p>
    );
  }

  return (
    <>
      <section id="print" className="panel print-panel p-5 sm:p-6 flex flex-col sm:flex-row gap-6 sm:items-center scroll-mt-24">
        {sheet}
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-lg inline-flex items-center gap-2"><PrintIcon width={19} height={19} className="text-cn-lavender" /> Print this card</h2>
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
              <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">Turn this digital card into a physical one. You get a print-ready PDF, and the code on it brings the card back to digital.</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {SPECS.map((spec) => (
                  <li key={spec} className="rounded-full border border-cn-line-strong bg-white/[.04] px-2.5 py-0.5 text-xs text-cn-text-2">{spec}</li>
                ))}
              </ul>
              <button className={`${primaryBtn} mt-4`} onClick={() => setConfirming(true)} data-testid="print">
                <PrintIcon width={17} height={17} /> Print this card
              </button>
            </>
          )}
        </div>
      </section>

      <Panel>
        <h2 className="font-display font-semibold text-base inline-flex items-center gap-2"><SendIcon width={18} height={18} className="text-cn-lavender" /> Send to a collector</h2>
        <form className="mt-3 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); run("send", { to }); }}>
          <input className={`${inputClass} flex-1 min-w-48 font-mono`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Their collector code" aria-label="Collector code" data-testid="send-to" required />
          <button className={secondaryBtn} disabled={busy} data-testid="send">Send</button>
        </form>
        {myCode ? <p className="mt-2 text-xs text-cn-text-3">Your own code is {myCode}.</p> : null}
      </Panel>
      <ErrorLine>{error}</ErrorLine>
    </>
  );
}
