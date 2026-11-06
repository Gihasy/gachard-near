/**
 * Trading a printed card in person. The buyer scans its QR and asks for it, which shows
 * them a code. The holder types that code to approve, then their own account signs the
 * transfer. So both accounts take part, and a photo of the QR gets nobody anything: the
 * paper never moves the card. Off chain until the transfer. Payment is not handled here.
 */
import { randomBytes, randomInt } from "node:crypto";
import { logTx } from "./cards.ts";
import { readDb, withDb, type Data, type User } from "./db.ts";
import { spend } from "./limits.ts";
import { ContractRefused, userCall, view } from "./near.ts";

export const HANDOFF_MINUTES = 15;
const TTL_MS = HANDOFF_MINUTES * 60_000;
const APPROVING_MS = 60_000;
// Not one per card: anyone can scan a QR, and a stranger's request must not block a real buyer.
const MAX_PER_CARD = 3;
const MAX_REQUESTS_PER_USER_PER_HOUR = 20;
const MAX_CODE_ATTEMPTS = 5;

export interface HandoffRow {
  id: string;
  tokenId: string;
  fromUserId: string;
  toUserId: string;
  code: string;
  attempts: number;
  createdAt: string;
  /** Set while the holder's transfer is on its way, so it cannot be sent twice. */
  approvingAt?: string;
}

type ChainState = { owner_id: string; status: string; series_id: number; template_id: number } | null;

const live = (row: HandoffRow) => (row.approvingAt
  ? Date.now() - Date.parse(row.approvingAt) < APPROVING_MS
  : Date.now() - Date.parse(row.createdAt) < TTL_MS);

const prune = (d: Data) => {
  d.handoffs = (d.handoffs ?? []).filter(live);
  return d.handoffs;
};

/** What each side may see. The holder never sees the code: they have to get it from the buyer. */
export function handoffView(data: Data, userId: string, tokenId: string) {
  const rows = (data.handoffs ?? []).filter((row) => row.tokenId === tokenId && live(row));
  const mine = rows.find((row) => row.toUserId === userId);
  const nameOf = (id: string) => data.users.find((u) => u.id === id)?.username ?? "a collector";
  return {
    asBuyer: mine ? { id: mine.id, code: mine.code } : null,
    asHolder: rows.filter((row) => row.fromUserId === userId).map((row) => ({ id: row.id, username: nameOf(row.toUserId) })),
  };
}

export type HandoffView = ReturnType<typeof handoffView>;

/** Requests waiting for this holder, on any card. */
export function handoffsWaiting(data: Data, userId: string) {
  return (data.handoffs ?? []).filter((row) => row.fromUserId === userId && live(row));
}

export async function requestHandoff(user: User, tokenId: string) {
  const card = await view<ChainState>("get_card", { token_id: tokenId });
  if (!card) throw new ContractRefused("Card not found.");
  if (card.status !== "Printed") throw new ContractRefused("Only a printed card is traded this way.");
  if (card.owner_id === user.accountId) throw new ContractRefused("You already hold this card.");
  return withDb((d) => {
    const rows = prune(d);
    const existing = rows.find((row) => row.tokenId === tokenId && row.toUserId === user.id);
    if (existing) return { id: existing.id, code: existing.code };
    const holder = d.users.find((u) => u.accountId === card.owner_id);
    if (!holder) throw new ContractRefused("This card's holder cannot approve a request here.");
    if (rows.filter((row) => row.tokenId === tokenId).length >= MAX_PER_CARD) {
      throw new ContractRefused("This card has several requests waiting. Try again in a few minutes.");
    }
    if (!spend(d, [{ key: `handoff:${user.id}`, max: MAX_REQUESTS_PER_USER_PER_HOUR }])) {
      throw new ContractRefused("That is a lot of requests for one hour. Please try again later.");
    }
    const row: HandoffRow = {
      id: randomBytes(8).toString("hex"),
      tokenId,
      fromUserId: holder.id,
      toUserId: user.id,
      code: String(randomInt(1000, 10_000)),
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    rows.push(row);
    return { id: row.id, code: row.code };
  });
}

/** Either side can walk away, until the transfer has started. */
export async function declineHandoff(user: User, tokenId: string, id: string) {
  await withDb((d) => {
    d.handoffs = prune(d).filter((row) => !(row.id === id && row.tokenId === tokenId && !row.approvingAt
      && (row.fromUserId === user.id || row.toUserId === user.id)));
  });
}

export const clearHandoffs = (tokenId: string) =>
  withDb((d) => {
    d.handoffs = (d.handoffs ?? []).filter((row) => row.tokenId !== tokenId);
  });

export async function approveHandoff(user: User, tokenId: string, id: string, code: string) {
  // Only returned from here, not thrown: a throw would also discard the counted attempt.
  const claim = await withDb((d) => {
    const row = prune(d).find((item) => item.id === id && item.tokenId === tokenId && item.fromUserId === user.id);
    if (!row) return { refused: "That request has ended." };
    if (row.approvingAt) return { refused: "This transfer is already on its way." };
    if (row.code !== code) {
      row.attempts += 1;
      if (row.attempts >= MAX_CODE_ATTEMPTS) d.handoffs = d.handoffs!.filter((item) => item !== row);
      return { refused: "That code does not match. Ask for the code on the buyer's screen." };
    }
    const receiver = d.users.find((u) => u.id === row.toUserId);
    if (!receiver) return { refused: "That collector no longer exists." };
    row.approvingAt = new Date().toISOString();
    return { receiver: receiver.accountId };
  });
  if (!claim.receiver) throw new ContractRefused(claim.refused);

  const card = await view<ChainState>("get_card", { token_id: tokenId });
  // An earlier approval whose answer was lost may already have moved it.
  if (card?.owner_id === claim.receiver) {
    await clearHandoffs(tokenId);
    return;
  }
  if (card?.owner_id !== user.accountId || card.status !== "Printed") {
    await clearHandoffs(tokenId);
    throw new ContractRefused("This card can no longer be transferred.");
  }
  if (user.lockedDesigns?.includes(`${card.series_id}:${card.template_id}`)) {
    await withDb((d) => {
      const row = d.handoffs?.find((item) => item.id === id);
      if (row) delete row.approvingAt;
    });
    throw new ContractRefused("This card is locked. Unlock it in My Cards to transfer it.");
  }
  try {
    const { hash } = await userCall(user, "mt_transfer", { receiver_id: claim.receiver, token_id: tokenId, amount: "1" }, 1n);
    await logTx(tokenId, hash);
    await clearHandoffs(tokenId);
  } catch (error) {
    // A refusal means it did not move, so the holder can try again. Any other failure may
    // have moved it, so the claim stays until the check above can tell.
    if (error instanceof ContractRefused) {
      await withDb((d) => {
        const row = d.handoffs?.find((item) => item.id === id);
        if (row) delete row.approvingAt;
      });
    }
    throw error;
  }
}

export const readHandoffs = async (user: User, tokenId: string) => handoffView(await readDb(), user.id, tokenId);
