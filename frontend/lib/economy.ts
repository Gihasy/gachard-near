/**
 * The small economy of ADR-046: who a pack sale is shared with, what a burned card
 * yields, and what Crystal buys. Every figure here is an example for this demo, and
 * none of it is real money.
 */
import { withDb, type Data, type User } from "./db.ts";
import { ContractRefused } from "./near.ts";

export const CREATOR_SHARE_PCT = 90;
/** By rarity: Common, Rare, Epic, Legendary. Fixed by Gachard, not by a creator. */
export const CRYSTAL_BY_RARITY = [10, 30, 90, 300];
export const EXTRA_PACK_PRICE = 50;

/** Derived from what was bought, so it cannot drift from what was sold. */
export function revenueOf(seriesId: number, offers: Data["offers"]) {
  const sold = offers.filter((o) => o.seriesId === seriesId && o.status === "bought");
  const gross = sold.reduce((sum, o) => sum + o.price, 0);
  const creator = Math.floor((gross * CREATOR_SHARE_PCT) / 100);
  return { packs: sold.length, gross, creator, gachard: gross - creator };
}

/** Credits a burned card once, however many times this is reached for it. */
export function creditDismantle(tokenId: string, userId: string, crystal: number) {
  return withDb((d) => {
    if (d.dismantled[tokenId]) return false;
    d.dismantled[tokenId] = { userId, crystal, at: new Date().toISOString() };
    const user = d.users.find((u) => u.id === userId)!;
    user.crystal = (user.crystal ?? 0) + crystal;
    return true;
  });
}

export function buyExtraPack(user: User) {
  return withDb((d) => {
    const row = d.users.find((u) => u.id === user.id)!;
    const crystal = row.crystal ?? 0;
    if (crystal < EXTRA_PACK_PRICE) throw new ContractRefused(`An extra pack costs ${EXTRA_PACK_PRICE} Crystal.`);
    row.crystal = crystal - EXTRA_PACK_PRICE;
    row.extraPacks = (row.extraPacks ?? 0) + 1;
    return { crystal: row.crystal, extraPacks: row.extraPacks };
  });
}
