/**
 * Packs (ADR-048). A pack has one price, the buyer pays first, and five cards are
 * drawn at the creator's published rates and minted at once. Turning them over
 * afterwards is only a reveal: the cards already belong to the buyer.
 *
 * The draw is a server-side random choice, and a buyer depends on it. It is not
 * verifiable, so the rates are published, not proven: do not call them provably fair.
 */
import { randomBytes, randomInt } from "node:crypto";
import { withDb, type PackOffer, type SeriesRow } from "./db.ts";
import { spend } from "./limits.ts";
import { missingRarities, RARITIES } from "./catalog.ts";
import { CRYSTAL_PACK_PRICE } from "./economy.ts";
import { ContractRefused, platformCall } from "./near.ts";
import { CARDS_PER_PACK, packPrice } from "./pack-price.ts";

export { CARDS_PER_PACK, packPrice };

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

const STILL_MINTING_MS = 120_000;
// Each card takes about 0.004 NEAR of storage from the contract, so packs are what drains it.
const MAX_PACKS_PER_USER_PER_HOUR = 15;
const MAX_PACKS_PER_VISITOR_PER_HOUR = 40;

/** What the client may know: a card stays secret until it is turned over. */
export function packView(offer: PackOffer, series: SeriesRow) {
  const cards = offer.templateIds.map((id, index) => {
    if (!offer.revealed[index]) return null;
    const t = series.templates.find((x) => x.id === id)!;
    return { name: t.name, rarity: RARITIES[t.rarity], media: t.media };
  });
  return {
    id: offer.id,
    seriesId: series.id,
    seriesName: series.name,
    logo: series.logo,
    status: offer.status,
    cards,
    allOpen: offer.revealed.every(Boolean),
    tokenIds: offer.tokenIds,
  };
}

export async function revealCard(userId: string, offerId: string, index: number) {
  return withDb((d) => {
    const offer = d.offers.find((o) => o.id === offerId && o.userId === userId);
    if (!offer || offer.status !== "bought") throw new ContractRefused("This pack cannot be opened.");
    if (!Number.isInteger(index) || index < 0 || index >= offer.revealed.length) {
      throw new ContractRefused("There is no such card.");
    }
    offer.revealed[index] = true;
    return packView(offer, d.series.find((s) => s.id === offer.seriesId)!);
  });
}

export async function buyPack(userId: string, seriesId: number, pay: "credits" | "crystal" = "credits", visitor = "script") {
  // Credits leave and the pack is claimed in one step. A second click while it mints
  // is refused, so a double click buys once.
  const claim = await withDb((d) => {
    const series = d.series.find((s) => s.id === seriesId);
    if (!series) throw new ContractRefused("Series not found.");
    if (series.hidden) throw new ContractRefused("This series has been retired. Cards already bought stay valid.");
    const missing = missingRarities(series);
    if (missing.length) throw new ContractRefused(`This series still needs a ${missing[0]} card.`);
    const busy = d.offers.some((o) => o.userId === userId && o.seriesId === seriesId && o.status === "minting"
      && Date.now() - Date.parse(o.createdAt) < STILL_MINTING_MS);
    if (busy) throw new ContractRefused("Your last pack is still on its way. Try again in a moment.");
    const user = d.users.find((u) => u.id === userId)!;
    const inCrystal = pay === "crystal";
    const allowed = spend(d, [
      { key: `pack:${userId}`, max: MAX_PACKS_PER_USER_PER_HOUR },
      { key: `pack-visitor:${visitor}`, max: MAX_PACKS_PER_VISITOR_PER_HOUR },
    ]);
    if (!allowed) throw new ContractRefused("That is a lot of packs for one hour. Please try again later.");
    const price = inCrystal ? 0 : packPrice(series);
    if (inCrystal) {
      if ((user.crystal ?? 0) < CRYSTAL_PACK_PRICE) throw new ContractRefused(`A Crystal Pack takes ${CRYSTAL_PACK_PRICE} Crystal.`);
      user.crystal = (user.crystal ?? 0) - CRYSTAL_PACK_PRICE;
    } else {
      if (user.credits < price) throw new ContractRefused("Not enough Credits for this pack.");
      user.credits -= price;
    }
    const offer: PackOffer = {
      id: randomBytes(12).toString("hex"),
      userId,
      seriesId,
      // The rarest last, so a pack builds to its best card.
      templateIds: Array.from({ length: CARDS_PER_PACK }, () => drawTemplate(series))
        .sort((a, b) => series.templates.find((t) => t.id === a)!.rarity - series.templates.find((t) => t.id === b)!.rarity),
      revealed: Array(CARDS_PER_PACK).fill(false),
      status: "minting",
      tokenIds: [],
      price,
      ...(inCrystal ? { crystalPrice: CRYSTAL_PACK_PRICE } : {}),
      createdAt: new Date().toISOString(),
    };
    d.offers.push(offer);
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
      const offer = d.offers.find((o) => o.id === claim.offer.id)!;
      offer.status = "bought";
      offer.tokenIds = tokenIds;
      for (const id of tokenIds) d.txs[id] = [hash];
    });
    return { id: claim.offer.id, tokenIds };
  } catch (error) {
    // A refusal means nothing was minted, so the Credits go back. Any other error
    // may be a mint that landed with a lost response, so nothing is refunded blind.
    const refused = error instanceof ContractRefused;
    await withDb((d) => {
      const offer = d.offers.find((o) => o.id === claim.offer.id)!;
      offer.status = refused ? "refunded" : "unresolved";
      if (refused) {
        const user = d.users.find((u) => u.id === userId)!;
        user.credits += claim.offer.price;
        if (claim.offer.crystalPrice) user.crystal = (user.crystal ?? 0) + claim.offer.crystalPrice;
      }
    });
    throw error;
  }
}
