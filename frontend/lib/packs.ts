/**
 * Packs (ADR-043, decision 2). The creator's published rates decide what is
 * offered, and opening is free. The buyer pays only for cards already in view,
 * and cards are minted only on purchase.
 *
 * The draw is a server-side random choice. It is not verifiable, because a buyer
 * who sees what they pay for does not depend on it. So the rates are published,
 * not proven: do not call them provably fair.
 */
import { randomBytes, randomInt } from "node:crypto";
import { withDb, type PackOffer, type SeriesRow } from "./db.ts";
import { missingRarities, RARITIES } from "./catalog.ts";
import { ContractRefused, platformCall } from "./near.ts";

export const CARDS_PER_PACK = 5;
export const PACKS_PER_DAY = 3;

function drawTemplate(series: SeriesRow): number {
  let roll = randomInt(10_000);
  let rarity = 0;
  for (; rarity < 3; rarity += 1) {
    roll -= series.ratesBps[rarity];
    if (roll < 0) break;
  }
  const pool = series.templates.filter((t) => t.rarity === rarity);
  return pool[randomInt(pool.length)].id;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The user's open pack for this series, or a new one while today's limit allows. */
export async function openPack(userId: string, seriesId: number): Promise<PackOffer> {
  return withDb((d) => {
    const series = d.series.find((s) => s.id === seriesId);
    if (!series) throw new ContractRefused("Series not found.");
    if (series.hidden) throw new ContractRefused("This series has been retired. Cards already bought stay valid.");
    const missing = missingRarities(series);
    if (missing.length) throw new ContractRefused(`This series still needs a ${missing[0]} card.`);

    const mine = d.offers.filter((o) => o.userId === userId && o.seriesId === seriesId);
    const open = mine.find((o) => o.status === "open");
    if (open) return open;
    if (mine.filter((o) => o.createdAt.startsWith(today())).length >= PACKS_PER_DAY) {
      const user = d.users.find((u) => u.id === userId)!;
      if (!user.extraPacks) {
        throw new ContractRefused(`That is all ${PACKS_PER_DAY} packs for today. Come back tomorrow, or use Crystal for an extra slot in My Cards.`);
      }
      user.extraPacks -= 1;
    }
    const offer: PackOffer = {
      id: randomBytes(12).toString("hex"),
      userId,
      seriesId,
      templateIds: Array.from({ length: CARDS_PER_PACK }, () => drawTemplate(series)),
      revealed: Array(CARDS_PER_PACK).fill(false),
      status: "open",
      tokenIds: [],
      price: 0,
      createdAt: new Date().toISOString(),
    };
    d.offers.push(offer);
    return offer;
  });
}

/** What the client may know: unrevealed cards stay secret, and the price with them. */
export function packView(offer: PackOffer, series: SeriesRow) {
  const allOpen = offer.revealed.every(Boolean);
  const cards = offer.templateIds.map((id, index) => {
    if (!offer.revealed[index]) return null;
    const t = series.templates.find((x) => x.id === id)!;
    return { name: t.name, rarity: RARITIES[t.rarity], media: t.media, price: series.prices[t.rarity] };
  });
  return {
    id: offer.id,
    seriesId: series.id,
    seriesName: series.name,
    status: offer.status,
    cards,
    allOpen,
    // Hidden until the last card: a price would give the contents away (ADR-038).
    price: allOpen ? priceOf(offer, series) : null,
    tokenIds: offer.tokenIds,
  };
}

function priceOf(offer: PackOffer, series: SeriesRow) {
  return offer.templateIds.reduce((sum, id) => {
    const rarity = series.templates.find((t) => t.id === id)!.rarity;
    return sum + series.prices[rarity];
  }, 0);
}

export async function revealCard(userId: string, offerId: string, index: number) {
  return withDb((d) => {
    const offer = d.offers.find((o) => o.id === offerId && o.userId === userId);
    if (!offer || offer.status !== "open") throw new ContractRefused("This pack is no longer open.");
    if (!Number.isInteger(index) || index < 0 || index >= offer.revealed.length) {
      throw new ContractRefused("There is no such card.");
    }
    offer.revealed[index] = true;
    return packView(offer, d.series.find((s) => s.id === offer.seriesId)!);
  });
}

export async function skipPack(userId: string, offerId: string) {
  await withDb((d) => {
    const offer = d.offers.find((o) => o.id === offerId && o.userId === userId);
    if (!offer || offer.status !== "open") throw new ContractRefused("This pack is no longer open.");
    offer.status = "skipped";
  });
}

export async function buyPack(userId: string, offerId: string) {
  // Credits leave and the pack is claimed in one step, so a double click buys once.
  const claim = await withDb((d) => {
    const offer = d.offers.find((o) => o.id === offerId && o.userId === userId);
    if (!offer || offer.status !== "open") throw new ContractRefused("This pack is no longer open.");
    if (!offer.revealed.every(Boolean)) throw new ContractRefused("Open every card before buying.");
    const series = d.series.find((s) => s.id === offer.seriesId)!;
    const user = d.users.find((u) => u.id === userId)!;
    const price = priceOf(offer, series);
    if (user.credits < price) throw new ContractRefused("Not enough Credits for this pack.");
    user.credits -= price;
    offer.status = "minting";
    offer.price = price;
    return { offer, receiver: user.accountId };
  });

  try {
    const { hash, value } = await platformCall("mint", {
      series_id: claim.offer.seriesId,
      template_ids: claim.offer.templateIds,
      receiver_id: claim.receiver,
    });
    const tokenIds = value as string[];
    await withDb((d) => {
      const offer = d.offers.find((o) => o.id === offerId)!;
      offer.status = "bought";
      offer.tokenIds = tokenIds;
      for (const id of tokenIds) d.txs[id] = [hash];
    });
    return tokenIds;
  } catch (error) {
    // A refusal means nothing was minted, so the Credits go back. Any other error
    // may be a mint that landed with a lost response, so nothing is refunded blind.
    const refused = error instanceof ContractRefused;
    await withDb((d) => {
      const offer = d.offers.find((o) => o.id === offerId)!;
      offer.status = refused ? "open" : "unresolved";
      if (refused) d.users.find((u) => u.id === userId)!.credits += claim.offer.price;
    });
    throw error;
  }
}
