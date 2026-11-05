/**
 * Plans the v1 → v2 migration snapshot (docs/CONTRACT-V2-SPEC.md §17).
 *
 * Pure apart from the chain reads it is given, so it can be tested without a
 * database or an RPC (scripts/v2-migration-snapshot.test.mjs). The CLI in
 * scripts/v2-migration-snapshot.mjs feeds it MongoDB and the v1 contract at
 * one block, then builds the Merkle tree with lib/v2/chain-v2.ts.
 *
 * The database says who should hold a card; the chain decides. A card is only
 * included when both agree at the snapshot block. Every card left out is
 * listed with its reason, because a silent gap here would be a card that never
 * reaches v2.
 */

/** The fields of a `cards` document this needs. */
export interface SnapshotCard {
  cardId: string;
  tokenId: number | string | null;
  templateId: string; // v1 template name, e.g. "common-1"
  status: string;
  ownerAddress?: string | null; // the user's custodial address
  privyWalletAddress?: string | null; // set while Exported
  releasedTo?: string | null; // set once Released
  contractAddress?: string | null;
  isListed?: boolean;
}

/** v1 GachardCard reads, pinned to the snapshot block by the caller. */
export interface ChainView {
  cardStatus(tokenId: bigint): Promise<number>; // 0 Digital, 1 Vaulted
  balanceOf(holder: string, tokenId: bigint): Promise<bigint>;
}

export interface PlannedEntry {
  v1TokenId: bigint;
  holder: string;
  templateId: number; // v2 template id
  kind: 0 | 1; // 0 Digital, 1 printed on v1
  cardId: string;
  dbStatus: string;
}

export interface ExcludedCard {
  cardId: string;
  tokenId: string | null;
  reason: string;
}

export interface SnapshotPlan {
  entries: PlannedEntry[];
  excluded: ExcludedCard[];
  warnings: string[];
}

/**
 * Where the chain should show each database status, and as which kind.
 * - Vaulted and Real are both printed: the token stays in the holder's wallet,
 *   locked on chain (ADR-004 amendment).
 */
function expectation(card: SnapshotCard): { holder?: string | null; kind: 0 | 1 } | null {
  switch (card.status) {
    case "Digital":
      return { holder: card.ownerAddress, kind: 0 };
    case "Exported":
      return { holder: card.privyWalletAddress, kind: 0 };
    case "Released":
      return { holder: card.releasedTo, kind: 0 };
    case "Vaulted":
    case "Real":
      return { holder: card.ownerAddress, kind: 1 };
    default:
      return null;
  }
}

export async function planSnapshot(input: {
  cards: readonly SnapshotCard[];
  chain: ChainView;
  templateMap: Readonly<Record<string, number>>;
  v1Contract: string;
  concurrency?: number;
}): Promise<SnapshotPlan> {
  const { cards, chain, templateMap } = input;
  const v1 = input.v1Contract.toLowerCase();
  const entries: PlannedEntry[] = [];
  const excluded: ExcludedCard[] = [];
  const warnings: string[] = [];

  const unmapped = [...new Set(cards.filter((c) => c.status !== "Burned").map((c) => c.templateId))].filter(
    (t) => templateMap[t] === undefined,
  );
  if (unmapped.length > 0) {
    throw new Error(`No v2 template id for: ${unmapped.join(", ")}. Map every template before taking the snapshot.`);
  }

  const seen = new Set<string>();
  const toCheck: { card: SnapshotCard; tokenId: bigint; holder: string; kind: 0 | 1 }[] = [];

  for (const card of cards) {
    const tokenText = card.tokenId === null || card.tokenId === undefined ? null : String(card.tokenId);
    const leave = (reason: string) => excluded.push({ cardId: card.cardId, tokenId: tokenText, reason });

    if (card.contractAddress && card.contractAddress.toLowerCase() !== v1) {
      leave(`belongs to another contract (${card.contractAddress})`);
      continue;
    }
    if (card.status === "Burned") {
      leave("burned (dismantled)");
      continue;
    }
    if (tokenText === null) {
      leave(`never minted (status ${card.status})`);
      continue;
    }
    if (seen.has(tokenText)) {
      leave(`duplicate tokenId ${tokenText} in the database`);
      continue;
    }
    seen.add(tokenText);

    const expected = expectation(card);
    if (!expected) {
      leave(`status "${card.status}" has no migration rule`);
      continue;
    }
    if (!expected.holder) {
      leave(`status ${card.status} but no holder address recorded`);
      continue;
    }
    if (card.isListed) warnings.push(`${card.cardId}: listed on Trade. Cancel listings before migrating.`);
    if (card.status === "Released") {
      warnings.push(`${card.cardId}: goes to ${expected.holder}, an address outside Gachard.`);
    }
    toCheck.push({ card, tokenId: BigInt(tokenText), holder: expected.holder, kind: expected.kind });
  }

  const limit = Math.max(1, input.concurrency ?? 8);
  for (let i = 0; i < toCheck.length; i += limit) {
    const batch = toCheck.slice(i, i + limit);
    const results = await Promise.all(
      batch.map(async ({ tokenId, holder }) => ({
        status: await chain.cardStatus(tokenId),
        balance: await chain.balanceOf(holder, tokenId),
      })),
    );
    batch.forEach(({ card, tokenId, holder, kind }, j) => {
      const { status, balance } = results[j];
      const leave = (reason: string) => excluded.push({ cardId: card.cardId, tokenId: tokenId.toString(), reason });
      if (status !== kind) {
        leave(`chain says ${status === 1 ? "Vaulted" : "Digital"} but the database says ${card.status}`);
        return;
      }
      if (balance !== 1n) {
        leave(`${holder} does not hold it on chain (database says ${card.status})`);
        return;
      }
      entries.push({
        v1TokenId: tokenId,
        holder,
        templateId: templateMap[card.templateId],
        kind,
        cardId: card.cardId,
        dbStatus: card.status,
      });
    });
  }

  entries.sort((a, b) => (a.v1TokenId < b.v1TokenId ? -1 : a.v1TokenId > b.v1TokenId ? 1 : 0));
  return { entries, excluded, warnings };
}
