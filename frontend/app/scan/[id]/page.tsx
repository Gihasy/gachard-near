import { notFound } from "next/navigation";
import CardActions from "@/components/CardActions";
import { CardImage, Page, Panel, Rarity, Title } from "@/components/ui";
import { readCard } from "@/lib/cards";
import { collectorCode, collectorLabel, contractId, explorer } from "@/lib/near";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const ROW: Record<string, string> = {
  Mint: "Released",
  Transfer: "Changed hands",
  Print: "Printed",
  Redeem: "Returned to digital",
};

function ArtCheck({ value }: { value: boolean | null }) {
  if (value === true) return <span className="text-cn-success">Matches the public record</span>;
  if (value === false) return <span className="text-cn-danger">Does not match the public record</span>;
  return <span className="text-cn-text-3">Could not be checked</span>;
}

export default async function CardRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  const card = await readCard(id);
  if (!card) notFound();
  const user = await currentUser();
  const isHolder = user?.accountId === card.owner_id;
  const status = card.status === "Printed" ? "Printed (hackathon demo PDF)" : "Digital";

  return (
    <Page>
      <Title sub={card.seriesName}>{card.cardName} <span className="text-cn-text-3">#{id}</span></Title>
      <div className="grid md:grid-cols-[280px_1fr] gap-6">
        <div>
          <CardImage src={card.media} alt={card.cardName} />
          <div className="mt-2"><Rarity value={card.rarity} /></div>
        </div>
        <div className="space-y-5 min-w-0">
          <Panel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-cn-text-3">Status</dt>
              <dd data-testid="card-status" className="font-medium">{status}</dd>
              <dt className="text-cn-text-3">Holder</dt>
              <dd data-testid="card-holder">{collectorLabel(card.owner_id)}{isHolder ? " (you)" : ""}</dd>
              <dt className="text-cn-text-3">Released by</dt>
              <dd>{collectorLabel(card.creator)}</dd>
              <dt className="text-cn-text-3">Times printed</dt>
              <dd className="tabular">{card.print_cycle}</dd>
              <dt className="text-cn-text-3">Artwork file</dt>
              <dd data-testid="art-check"><ArtCheck value={card.artMatches} /></dd>
            </dl>
            <p className="mt-4 text-xs text-cn-text-3 leading-relaxed">
              {card.status === "Printed"
                ? "A printed copy links to this record but does not prove who owns it, and copies of a demo PDF can be made. This holder and print count are the current truth."
                : "This record is read live from a public ledger. The links below let you check it without trusting this site."}
            </p>
          </Panel>

          <CardActions
            tokenId={id}
            status={card.status}
            isHolder={isHolder}
            signedIn={Boolean(user)}
            myCode={user ? collectorCode(user.accountId) : null}
          />

          <Panel>
            <h2 className="font-semibold">History</h2>
            <ol className="mt-3 divide-y divide-cn-line text-sm" data-testid="history">
              {[...card.history].reverse().map((h, i) => (
                <li key={i} className="py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div>
                    <span className="font-medium">{ROW[h.kind] ?? h.kind}</span>
                    <span className="text-cn-text-2"> · {h.from && h.from !== h.to ? `${collectorLabel(h.from)} to ` : ""}{collectorLabel(h.to)}</span>
                    <div className="text-xs text-cn-text-3">{new Date(h.at_ms).toUTCString()}</div>
                  </div>
                  <a
                    className="text-xs underline text-cn-text-2 hover:text-cn-text-1"
                    target="_blank"
                    rel="noreferrer"
                    href={h.txHash ? explorer.tx(h.txHash) : explorer.account(contractId())}
                  >
                    check independently
                  </a>
                </li>
              ))}
            </ol>
            {card.history_total > card.history.length ? (
              <p className="mt-2 text-xs text-cn-text-3">Showing the latest {card.history.length} of {card.history_total}.</p>
            ) : null}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
