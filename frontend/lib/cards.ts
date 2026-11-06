/**
 * One card, read from the chain. The database adds only transaction hashes for
 * the links, and the serial of a card's latest print.
 */
import { createHash, randomBytes } from "node:crypto";
import { artMatches } from "./art.ts";
import { RARITIES } from "./catalog.ts";
import { readDb, withDb, type User } from "./db.ts";
import { creditDismantle, CRYSTAL_BY_RARITY } from "./economy.ts";
import { clearHandoffs } from "./handoff.ts";
import { ContractRefused, platformCall, userCall, view } from "./near.ts";
import { cleanUsername } from "./users.ts";

interface ChainCard {
  token_id: string;
  owner_id: string;
  series_id: number;
  template_id: number;
  creator: string;
  status: "Digital" | "Printed" | "ReturnPending" | "Burned";
  print_cycle: number;
  minted_at_ms: number;
  history: { kind: string; from: string | null; to: string; block_height: number; at_ms: number }[];
  history_total: number;
}

export async function readCard(tokenId: string) {
  const card = await view<ChainCard | null>("get_card", { token_id: tokenId });
  if (!card) return null;
  const [series, template] = await Promise.all([
    view<{ name: string; rates_bps: number[] }>("get_series", { series_id: card.series_id }),
    view<{ name: string; rarity: number; media: string; media_hash: string }>("get_template", {
      series_id: card.series_id,
      template_id: card.template_id,
    }),
  ]);
  const hashes = (await readDb()).txs[tokenId] ?? [];
  const firstIndex = card.history_total - card.history.length;
  return {
    ...card,
    seriesName: series.name,
    cardName: template.name,
    rarity: RARITIES[template.rarity],
    media: template.media,
    mediaHash: template.media_hash,
    artMatches: await artMatches(template.media, template.media_hash),
    history: card.history.map((h, i) => ({ ...h, txHash: hashes[firstIndex + i] ?? null })),
  };
}

export type CardDetail = NonNullable<Awaited<ReturnType<typeof readCard>>>;

export interface OwnedCard {
  tokenId: string;
  name: string;
  media: string;
  rarity: string;
  status: string;
  /** Same series and template, so copies of one card share it. */
  design: string;
}

export async function cardsOf(accountId: string): Promise<OwnedCard[]> {
  const tokens = await view<
    { token_id: string; token_metadata: { title: string; media: string; extra: string } }[]
  >("mt_tokens_for_owner", { account_id: accountId, limit: 100 });
  return tokens.map((t) => {
    const extra = JSON.parse(t.token_metadata.extra);
    return {
      tokenId: t.token_id,
      name: t.token_metadata.title,
      media: t.token_metadata.media,
      rarity: extra.rarity,
      status: extra.status,
      design: `${extra.series_id}:${extra.template_id}`,
    };
  });
}

export const logTx = (tokenId: string, hash: string) =>
  withDb((d) => {
    (d.txs[tokenId] ??= []).push(hash);
  });

/** What a QR code's serial means, read from the contract. Null if no such card. */
export type PrintState = "Active" | "ReturnPending" | "Void" | "Unknown";
export const printState = (tokenId: string, serial: string) =>
  view<PrintState | null>("print_state", { token_id: tokenId, serial });

async function requireHolder(user: User, tokenId: string) {
  const card = await readCard(tokenId);
  if (!card) throw new ContractRefused("Card not found.");
  if (card.owner_id !== user.accountId) throw new ContractRefused("Only the holder can do this.");
  return card;
}

/** Marks the card as printed under a new serial. Only a hash of it goes on chain. */
export async function printCard(user: User, tokenId: string) {
  const card = await requireHolder(user, tokenId);
  if (card.status !== "Digital") throw new ContractRefused("Card is already printed.");
  const serial = randomBytes(16).toString("hex");
  const printHash = createHash("sha256").update(`gachard-print:${tokenId}:${serial}`).digest("base64");
  // Kept first. A print whose serial was lost could never produce its PDF.
  await withDb((d) => {
    d.prints[tokenId] = { cycle: card.print_cycle + 1, serial };
  });
  const { hash } = await userCall(user, "print_lock", { token_id: tokenId, print_hash: printHash }, 1n);
  await logTx(tokenId, hash);
}

/** The serial for the holder's PDF, or null if this user has no print to download. */
export async function serialForHolder(user: User, card: { owner_id: string; token_id: string; status: string }) {
  if (card.owner_id !== user.accountId || card.status === "Digital" || card.status === "Burned") return null;
  return (await readDb()).prints[card.token_id]?.serial ?? null;
}

/** The holder asks to return a printed card. The physical card must now be sent in. */
export async function requestReturn(user: User, tokenId: string) {
  const { hash } = await userCall(user, "request_return", { token_id: tokenId }, 1n);
  await logTx(tokenId, hash);
  await clearHandoffs(tokenId);
}

/**
 * A stand-in for the step a person does in production, when the physical card
 * arrives (ADR-045). The transaction is the real one. Whether a card arrived is not
 * known here, so the demo cannot tell a card that was sent from one that was lost.
 */
export async function simulateReturnAnswer(user: User, tokenId: string, accepted: boolean) {
  await requireHolder(user, tokenId);
  const { hash } = await platformCall(accepted ? "confirm_return" : "reject_return", { token_id: tokenId });
  await logTx(tokenId, hash);
}

/**
 * Burns the card, then credits its Crystal. If the answer to the burn was lost, asking
 * again finds the card already burned by this user, and credits it once.
 */
export async function dismantleCard(user: User, tokenId: string) {
  const card = await requireHolder(user, tokenId);
  const crystal = CRYSTAL_BY_RARITY[RARITIES.indexOf(card.rarity)];
  if (card.status === "Burned") {
    if (await creditDismantle(tokenId, user.id, crystal)) return crystal;
    throw new ContractRefused("This card was already destroyed.");
  }
  if (card.status !== "Digital") throw new ContractRefused("A printed card must return to digital first.");
  if (user.lockedDesigns?.includes(`${card.series_id}:${card.template_id}`)) {
    throw new ContractRefused("This card is locked. Unlock it in My Cards to dismantle it.");
  }
  const { hash } = await userCall(user, "burn", { token_id: tokenId }, 1n);
  await logTx(tokenId, hash);
  await creditDismantle(tokenId, user.id, crystal);
  return crystal;
}

export async function sendCard(user: User, tokenId: string, to: string) {
  const username = cleanUsername(to);
  const receiver = (await readDb()).users.find((u) => u.username === username);
  if (!receiver) throw new ContractRefused("No collector has that username.");
  // The contract allows it. The app does not, so a printed card moves only when both people agree.
  const card = await view<{ status: string; series_id: number; template_id: number } | null>("get_card", { token_id: tokenId });
  if (card?.status === "Printed") {
    throw new ContractRefused("A printed card is traded in person: the new owner scans its QR and you approve.");
  }
  if (card && user.lockedDesigns?.includes(`${card.series_id}:${card.template_id}`)) {
    throw new ContractRefused("This card is locked. Unlock it in My Cards to transfer it.");
  }
  const { hash } = await userCall(
    user,
    "mt_transfer",
    { receiver_id: receiver.accountId, token_id: tokenId, amount: "1" },
    1n,
  );
  await logTx(tokenId, hash);
}
