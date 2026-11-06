"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client";
import PrintSheet from "@/components/PrintSheet";
import { PrintIcon, SendIcon } from "@/components/icons";
import { ErrorLine, Panel, inputClass, primaryBtn, secondaryBtn } from "@/components/ui";

const SPECS = ["63 x 88 mm", "Crop marks", "A QR for this print"];

export default function CardActions({ tokenId, status, media, cardName, qr, isHolder, printNumber, crystalYield, lastCopy, locked }: {
  tokenId: string;
  status: string;
  media: string;
  cardName: string;
  qr: string;
  isHolder: boolean;
  printNumber: number;
  crystalYield: number;
  lastCopy: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<"print" | "return" | "transfer" | "dismantle" | null>(null);
  const [to, setTo] = useState("");

  const run = async (url: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await post(`/api/cards/${tokenId}/${url}`, body);
      setConfirming(null);
      setTo("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  if (status === "Burned") {
    return (
      <p id="print" className="rounded-2xl border border-cn-line bg-white/[.03] px-4 py-3 text-sm text-cn-text-2 scroll-mt-24" data-testid="card-destroyed">
        This card was dismantled by its last holder. It is gone for good, and only its record remains.
      </p>
    );
  }

  // Everyone else gets the record and nothing to press: the QR gives no power.
  if (!isHolder) {
    return (
      <p id="print" className="flex items-center gap-2 rounded-2xl border border-cn-line bg-white/[.03] px-4 py-3 text-sm text-cn-text-2 scroll-mt-24" data-testid="not-holder">
        <PrintIcon width={17} height={17} className="text-cn-lavender shrink-0" />
        {status === "Digital"
          ? "This digital card can be printed by its holder."
          : "Having the paper does not make you the holder. Only the holder's approval moves this card."}
      </p>
    );
  }

  const sheet = (
    <div className="w-40 sm:w-44 mx-auto sm:mx-0 shrink-0 -rotate-2">
      <PrintSheet src={media} qr={qr} label={`Preview of the print file for ${cardName}`} />
    </div>
  );

  if (status === "ReturnPending") {
    return (
      <section id="print" className="panel print-panel p-5 sm:p-6 scroll-mt-24" data-testid="return-pending">
        <h2 className="font-display font-semibold text-lg">Waiting for your card</h2>
        <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">
          In production you would now post the physical card to Gachard. Once it is checked and
          destroyed, this card is digital again. Until then it cannot be transferred.
        </p>
        <div className="mt-4 rounded-2xl border border-[#f7c96b40] bg-[#f7c96b12] p-4">
          <p className="text-sm leading-relaxed text-cn-text-2">
            <strong className="font-semibold text-cn-credits">Hackathon simulation.</strong>{" "}
            Nothing is posted in this demo, so these buttons stand in for Gachard&apos;s answer. The
            transaction is real, but in this demo a card you no longer have could be returned too.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className={primaryBtn} disabled={busy} onClick={() => run("return/simulate", { accepted: true })} data-testid="simulate-accept">
              Simulate: card received and destroyed
            </button>
            <button className={secondaryBtn} disabled={busy} onClick={() => run("return/simulate", { accepted: false })} data-testid="simulate-reject">
              Simulate: card is not genuine
            </button>
          </div>
        </div>
        <ErrorLine>{error}</ErrorLine>
      </section>
    );
  }

  const printed = status === "Printed";

  return (
    <>
      <section id="print" className="panel print-panel p-5 sm:p-6 flex flex-col sm:flex-row gap-6 sm:items-center scroll-mt-24">
        {sheet}
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-lg inline-flex items-center gap-2">
            <PrintIcon width={19} height={19} className="text-cn-lavender" />
            {printed ? `Your print (print ${printNumber})` : "Print this card"}
          </h2>
          {printed ? (
            <>
              <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">A hackathon simulation. Print it yourself and it stands in for the card the platform would ship.</p>
              <a className={`${primaryBtn} mt-4`} href={`/api/cards/${tokenId}/pdf`} data-testid="download-pdf">
                <PrintIcon width={17} height={17} /> Download print PDF
              </a>
            </>
          ) : confirming === "print" ? (
            <div className="mt-2 pop" data-testid="print-notice">
              <p className="text-sm text-cn-text-2 leading-relaxed">
                This is a hackathon simulation. In production, cards would be printed and shipped by
                the platform. Here you get a PDF to print yourself. After printing, the way back to
                digital is to send in the physical card. If it is lost or stolen, it can never return.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className={primaryBtn} disabled={busy} onClick={() => run("print")} data-testid="confirm-print">{busy ? "Printing..." : "Print and create PDF"}</button>
                <button className={secondaryBtn} disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-cn-text-2 leading-relaxed">Turn this digital card into a physical one. You stay its holder, and only your account can transfer it.</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {SPECS.map((spec) => (
                  <li key={spec} className="rounded-full border border-cn-line-strong bg-white/[.04] px-2.5 py-0.5 text-xs text-cn-text-2">{spec}</li>
                ))}
              </ul>
              <button className={`${primaryBtn} mt-4`} onClick={() => setConfirming("print")} data-testid="print">
                <PrintIcon width={17} height={17} /> Print this card
              </button>
            </>
          )}
        </div>
      </section>

      {printed ? null : <Panel>
        <h2 className="font-display font-semibold text-base inline-flex items-center gap-2">
          <SendIcon width={18} height={18} className="text-cn-lavender" /> Transfer to a collector
        </h2>
        {locked ? (
          <p className="mt-2 text-sm text-cn-text-2 leading-relaxed" data-testid="transfer-locked">You locked this card, so it cannot be transferred. Unlock it in <a href="/collection" className="font-semibold text-cn-lavender hover:underline">My Cards</a>.</p>
        ) : confirming === "transfer" ? (
          <div className="mt-3 pop" data-testid="transfer-notice">
            <p className="text-sm text-cn-text-2 leading-relaxed">
              Transfer this card to <strong className="text-cn-text-1">@{to.trim().replace(/^@/, "").toLowerCase()}</strong>?
              {" "}Only they can transfer it back.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className={primaryBtn} disabled={busy} onClick={() => run("send", { to })} data-testid="confirm-transfer">{busy ? "Transferring..." : "Transfer"}</button>
              <button className={secondaryBtn} disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <form className="mt-3 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); setError(""); setConfirming("transfer"); }}>
            <input className={`${inputClass} flex-1 min-w-48`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Their username" aria-label="Username" data-testid="send-to" required />
            <button className={secondaryBtn} data-testid="send">Continue</button>
          </form>
        )}
      </Panel>}

      {printed ? (
        <Panel>
          <h2 className="font-display font-semibold text-base">Return to digital</h2>
          {confirming === "return" ? (
            <div className="mt-2 pop" data-testid="return-notice">
              <p className="text-sm text-cn-text-2 leading-relaxed">
                You will send the physical card to Gachard to be destroyed, and its QR code will read
                VOID for good. The card cannot be transferred until this is done.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className={primaryBtn} disabled={busy} onClick={() => run("return")} data-testid="confirm-return">{busy ? "Working..." : "Request return"}</button>
                <button className={secondaryBtn} disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">It takes the physical card, so one that is lost or stolen can never return. In this hackathon demo, a button stands in for posting it.</p>
              <button className={`${secondaryBtn} mt-4`} onClick={() => setConfirming("return")} data-testid="return">Return to digital</button>
            </>
          )}
        </Panel>
      ) : (
        <Panel>
          <h2 className="font-display font-semibold text-base">Dismantle for Crystal</h2>
          {confirming === "dismantle" ? (
            <div className="mt-2 pop" data-testid="dismantle-notice">
              <p className="text-sm text-cn-text-2 leading-relaxed">
                This destroys the card for good and gives you {crystalYield} Crystal. It cannot be undone.
                {lastCopy ? " This is your only copy, so your progress in this series goes down." : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className={primaryBtn} disabled={busy} onClick={() => run("dismantle")} data-testid="confirm-dismantle">{busy ? "Destroying..." : `Destroy for ${crystalYield} Crystal`}</button>
                <button className={secondaryBtn} disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {locked ? (
                <p className="mt-1 text-sm text-cn-text-2 leading-relaxed" data-testid="card-locked">You locked this card, so it cannot be dismantled or transferred. Unlock it in <a href="/collection" className="font-semibold text-cn-lavender hover:underline">My Cards</a>.</p>
              ) : (
                <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">Got a duplicate? Turn it into {crystalYield} Crystal, and trade that for a card you are missing.</p>
              )}
              {locked ? null : <button className={`${secondaryBtn} mt-4`} onClick={() => setConfirming("dismantle")} data-testid="dismantle" data-last-copy={lastCopy}>Dismantle</button>}
            </>
          )}
        </Panel>
      )}
      <ErrorLine>{error}</ErrorLine>
    </>
  );
}
