/**
 * One card, read from the chain. The database adds only transaction hashes for
 * the links, and the redeem code for whoever holds the card.
 */
import { createHash, randomBytes } from "node:crypto";
import { artMatches } from "./art.ts";
import { RARITIES } from "./catalog.ts";
import { decrypt, encrypt } from "./crypto.ts";
import { readDb, withDb, type User } from "./db.ts";
import { accountFromCode, ContractRefused, userCall, view } from "./near.ts";

interface ChainCard {
  token_id: string;
  owner_id: string;
  series_id: number;
  template_id: number;
  creator: string;
  status: "Digital" | "Printed";
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
    };
  });
}

const logTx = (tokenId: string, hash: string) =>
  withDb((d) => {
    (d.txs[tokenId] ??= []).push(hash);
  });

// Crockford base32: no I, L, O or U, so a code survives being read off paper.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newRedeemCode(): string {
  return Array.from(randomBytes(16), (b) => ALPHABET[b % 32]).join("");
}

const normaliseCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");

export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** Locks the card and records its code. Only a hash of the code goes on chain. */
export async function printCard(user: User, tokenId: string) {
  const card = await readCard(tokenId);
  if (!card) throw new ContractRefused("Card not found.");
  // Checked here as well as on chain: storing a code for a card this user does
  // not hold would overwrite the real holder's code.
  if (card.owner_id !== user.accountId) throw new ContractRefused("Only the holder can print a card.");
  if (card.status !== "Digital") throw new ContractRefused("Card is already printed.");
  const code = newRedeemCode();
  const cycle = card.print_cycle + 1;
  const codeHash = createHash("sha256")
    .update(`gachard-redeem:${tokenId}:${cycle}:${code}`)
    .digest("base64");
  // The code is kept first. A lock without its code could never be redeemed.
  await withDb((d) => {
    d.prints[tokenId] = { cycle, codeEncrypted: encrypt(code) };
  });
  const { hash } = await userCall(user, "print_lock", { token_id: tokenId, code_hash: codeHash }, 1n);
  await logTx(tokenId, hash);
}

/** The code on the holder's PDF, or null if this user may not see it. */
export async function codeForHolder(user: User, card: { owner_id: string; token_id: string; status: string }) {
  if (card.owner_id !== user.accountId || card.status !== "Printed") return null;
  const row = (await readDb()).prints[card.token_id];
  return row ? decrypt(row.codeEncrypted) : null;
}

export async function redeemCard(user: User, tokenId: string, code: string) {
  const clean = normaliseCode(code);
  const { hash } = await userCall(user, "redeem", { token_id: tokenId, code: clean }, 1n);
  await logTx(tokenId, hash);
  await withDb((d) => {
    delete d.prints[tokenId];
  });
}

export async function sendCard(user: User, tokenId: string, toCode: string) {
  const receiver = accountFromCode(toCode);
  if (!receiver || !(await readDb()).users.some((u) => u.accountId === receiver)) {
    throw new ContractRefused("No collector has that code.");
  }
  const { hash } = await userCall(
    user,
    "mt_transfer",
    { receiver_id: receiver, token_id: tokenId, amount: "1" },
    1n,
  );
  await logTx(tokenId, hash);
}
