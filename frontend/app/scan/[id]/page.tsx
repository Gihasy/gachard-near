import Link from "next/link";
import { notFound } from "next/navigation";
import CardActions from "@/components/CardActions";
import TiltCard from "@/components/TiltCard";
import { CheckIcon, ExternalIcon, PrintIcon, SendIcon, SparkIcon } from "@/components/icons";
import { Panel, Rarity } from "@/components/ui";
import { printState, readCard, serialForHolder, type PrintState } from "@/lib/cards";
import { readDb } from "@/lib/db";
import { collectorLabel, contractId, explorer } from "@/lib/near";
import { qrDataUrl, siteOrigin } from "@/lib/qr";
import { currentUser, nameOf } from "@/lib/users";

export const dynamic = "force-dynamic";

const ROW: Record<string, { label: string; Icon: typeof CheckIcon }> = {
  Mint: { label: "Minted", Icon: SparkIcon },
  Transfer: { label: "Changed hands", Icon: SendIcon },
  Print: { label: "Printed", Icon: PrintIcon },
  ReturnRequested: { label: "Return requested", Icon: SendIcon },
  ReturnRejected: { label: "Return refused: card not genuine", Icon: PrintIcon },
  Returned: { label: "Returned to digital", Icon: CheckIcon },
};

const STATUS: Record<string, { label: string; className: string }> = {
  Digital: { label: "Digital", className: "bg-[#7ee0a61f] text-cn-success" },
  Printed: { label: "Printed (hackathon demo PDF)", className: "bg-[#f7c96b1f] text-cn-credits" },
  ReturnPending: { label: "Return pending (hackathon simulation)", className: "bg-[#f7c96b1f] text-cn-credits" },
};

const BANNER: Record<PrintState, { title: string; text: string; className: string }> = {
  Active: {
    title: "This QR is this card's current print.",
    text: "A copy of the paper would read the same, so this does not prove the paper is genuine.",
    className: "border-[#7ee0a640] bg-[#7ee0a612]",
  },
  ReturnPending: {
    title: "This print is being returned.",
    text: "Its holder asked to send it back. It cannot be transferred, so do not buy it.",
    className: "border-[#f7c96b40] bg-[#f7c96b12]",
  },
  Void: {
    title: "VOID: this print was cancelled.",
    text: "The card returned to digital after this was printed. This paper is no longer the card.",
    className: "border-[#ff7a8a66] bg-[#ff7a8a1a]",
  },
  Unknown: {
    title: "This QR is not a print of this card.",
    text: "The chain has no record of it. Treat this paper as a fake.",
    className: "border-[#ff7a8a66] bg-[#ff7a8a1a]",
  },
};

function ArtCheck({ value }: { value: boolean | null }) {
  if (value === true) return <span className="inline-flex items-center gap-1 text-cn-success"><CheckIcon width={15} height={15} /> Matches the public record</span>;
  if (value === false) return <span className="text-cn-danger">Does not match the public record</span>;
  return <span className="text-cn-text-3">Could not be checked</span>;
}

function Fact({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) {
  return (
    <div className="rounded-2xl bg-white/[.035] border border-cn-line p-4 min-w-0">
      <dt className="text-xs text-cn-text-3">{label}</dt>
      <dd className="mt-1 text-sm font-semibold break-words" data-testid={testid}>{children}</dd>
    </div>
  );
}

export default async function CardRecord({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string | string[] }>;
}) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  const card = await readCard(id);
  if (!card) notFound();
  const [user, { users }, { print }] = await Promise.all([currentUser(), readDb(), searchParams]);
  const isHolder = user?.accountId === card.owner_id;
  const digital = card.status === "Digital";
  const status = STATUS[card.status] ?? STATUS.Digital;

  // The state of the paper in someone's hand, if they arrived from its QR.
  const scanned = typeof print === "string" && print ? await printState(id, print) : null;
  const banner = scanned ? BANNER[scanned] : null;

  const serial = user ? await serialForHolder(user, card) : null;
  const origin = await siteOrigin();
  const qr = await qrDataUrl(serial ? `${origin}/scan/${id}?print=${serial}` : `${origin}/scan/${id}`);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="grid md:grid-cols-[minmax(240px,340px)_1fr] gap-8 lg:gap-12">
        <div className="md:sticky md:top-24 self-start max-w-[300px] md:max-w-none mx-auto w-full">
          <TiltCard src={card.media} alt={card.cardName} rarity={card.rarity} eager />
        </div>

        <div className="space-y-5 min-w-0">
          {banner ? (
            <div className={`rounded-2xl border px-4 py-3 ${banner.className}`} role="status" data-testid="print-state" data-state={scanned}>
              <p className="font-display font-semibold text-base">{banner.title}</p>
              <p className="mt-1 text-sm text-cn-text-2 leading-relaxed">{banner.text}</p>
            </div>
          ) : null}

          <div>
            <p className="text-sm text-cn-text-2">{card.seriesName}</p>
            <h1 className="mt-1 font-display font-bold text-2xl sm:text-4xl break-words">
              {card.cardName} <span className="text-cn-text-3 font-medium">#{id}</span>
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Rarity value={card.rarity} />
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`} data-testid="card-status">
                {status.label}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Fact label="Holder" testid="card-holder">
              {nameOf(card.owner_id, users)}{isHolder ? " (you)" : ""}
              <a className="mt-0.5 flex items-center gap-1 text-xs font-medium text-cn-lavender hover:underline" target="_blank" rel="noreferrer" href={explorer.account(card.owner_id)}>
                {collectorLabel(card.owner_id)} <ExternalIcon width={12} height={12} />
              </a>
            </Fact>
            <Fact label="Released by">
              {nameOf(card.creator, users)}
              <a className="mt-0.5 flex items-center gap-1 text-xs font-medium text-cn-lavender hover:underline" target="_blank" rel="noreferrer" href={explorer.account(card.creator)}>
                {collectorLabel(card.creator)} <ExternalIcon width={12} height={12} />
              </a>
            </Fact>
            <Fact label="Times printed"><span className="tabular">{card.print_cycle}</span></Fact>
            <Fact label="Artwork file" testid="art-check"><ArtCheck value={card.artMatches} /></Fact>
          </dl>
          <p className="text-xs text-cn-text-3 leading-relaxed">
            {digital
              ? "This record is read live from a public ledger, and the links let you check it there. Usernames are this app's own."
              : "Buying this card? Have the physical card in front of you, and pay only after your username shows as Holder here. The paper alone proves nothing."}
          </p>

          <CardActions
            tokenId={id}
            status={card.status}
            media={card.media}
            cardName={card.cardName}
            qr={qr}
            isHolder={isHolder}
            printNumber={card.print_cycle}
          />

          <Panel>
            <h2 className="font-display font-semibold text-base">History</h2>
            {card.print_cycle > 0 ? (
              <p className="mt-1 text-xs text-cn-text-3 leading-relaxed">Hackathon simulation: in this demo, printing is a PDF and a button stands in for sending a card back.</p>
            ) : null}
            <ol className="timeline mt-5 space-y-5 text-sm" data-testid="history">
              {[...card.history].reverse().map((h, i) => {
                const row = ROW[h.kind] ?? { label: h.kind, Icon: CheckIcon };
                return (
                  <li key={i} className="relative pl-11 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <span className={`absolute left-0 top-0 grid place-items-center size-8 rounded-full border border-cn-line-strong ${i === 0 ? "crystal-calm" : "bg-cn-surface-2 text-cn-text-2"}`} style={i === 0 ? { boxShadow: "none" } : undefined}>
                      <row.Icon width={15} height={15} />
                    </span>
                    <div className="min-w-0">
                      <span className="font-semibold">{row.label}</span>
                      <div className="text-cn-text-2 break-words">
                        {h.from && h.from !== h.to ? `${nameOf(h.from, users)} to ` : ""}{nameOf(h.to, users)}
                      </div>
                      <div className="text-xs text-cn-text-3 mt-0.5">{new Date(h.at_ms).toUTCString()}</div>
                    </div>
                    <a
                      className="inline-flex items-center gap-1 text-xs font-medium text-cn-lavender hover:underline"
                      target="_blank"
                      rel="noreferrer"
                      href={h.txHash ? explorer.tx(h.txHash) : explorer.account(contractId())}
                    >
                      check independently <ExternalIcon width={13} height={13} />
                    </a>
                  </li>
                );
              })}
            </ol>
            {card.history_total > card.history.length ? (
              <p className="mt-4 text-xs text-cn-text-3">Showing the latest {card.history.length} of {card.history_total}.</p>
            ) : null}
          </Panel>

          {!user ? (
            <p className="text-sm text-cn-text-2">
              Want your own? <Link href="/#series" className="text-cn-lavender font-semibold hover:underline">Browse series</Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
