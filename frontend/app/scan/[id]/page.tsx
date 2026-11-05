import Link from "next/link";
import { notFound } from "next/navigation";
import CardActions from "@/components/CardActions";
import TiltCard from "@/components/TiltCard";
import { CheckIcon, ExternalIcon, PrintIcon, SendIcon, SparkIcon } from "@/components/icons";
import { Panel, Rarity } from "@/components/ui";
import { readCard } from "@/lib/cards";
import { collectorCode, collectorLabel, contractId, explorer } from "@/lib/near";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const ROW: Record<string, { label: string; Icon: typeof CheckIcon }> = {
  Mint: { label: "Released", Icon: SparkIcon },
  Transfer: { label: "Changed hands", Icon: SendIcon },
  Print: { label: "Printed", Icon: PrintIcon },
  Redeem: { label: "Returned to digital", Icon: CheckIcon },
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

export default async function CardRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  const card = await readCard(id);
  if (!card) notFound();
  const user = await currentUser();
  const isHolder = user?.accountId === card.owner_id;
  const printed = card.status === "Printed";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="grid md:grid-cols-[minmax(240px,340px)_1fr] gap-8 lg:gap-12">
        <div className="md:sticky md:top-24 self-start max-w-[300px] md:max-w-none mx-auto w-full">
          <TiltCard src={card.media} alt={card.cardName} rarity={card.rarity} eager />
        </div>

        <div className="space-y-5 min-w-0">
          <div>
            <p className="text-sm text-cn-text-2">{card.seriesName}</p>
            <h1 className="mt-1 font-display font-bold text-2xl sm:text-4xl break-words">
              {card.cardName} <span className="text-cn-text-3 font-medium">#{id}</span>
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Rarity value={card.rarity} />
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${printed ? "bg-[#f7c96b1f] text-cn-credits" : "bg-[#7ee0a61f] text-cn-success"}`}
                data-testid="card-status"
              >
                {printed ? "Printed (hackathon demo PDF)" : "Digital"}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Fact label="Holder" testid="card-holder">{collectorLabel(card.owner_id)}{isHolder ? " (you)" : ""}</Fact>
            <Fact label="Released by">{collectorLabel(card.creator)}</Fact>
            <Fact label="Times printed"><span className="tabular">{card.print_cycle}</span></Fact>
            <Fact label="Artwork file" testid="art-check"><ArtCheck value={card.artMatches} /></Fact>
          </dl>
          <p className="text-xs text-cn-text-3 leading-relaxed">
            {printed
              ? "A printed copy links to this record but does not prove who owns it, and copies of a demo PDF can be made. This holder and print count are the current truth."
              : "This record is read live from a public ledger. The links below let you check it without trusting this site."}
          </p>

          <CardActions
            tokenId={id}
            status={card.status}
            isHolder={isHolder}
            signedIn={Boolean(user)}
            myCode={user ? collectorCode(user.accountId) : null}
          />

          <Panel>
            <h2 className="font-display font-semibold text-base">History</h2>
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
                        {h.from && h.from !== h.to ? `${collectorLabel(h.from)} to ` : ""}{collectorLabel(h.to)}
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
