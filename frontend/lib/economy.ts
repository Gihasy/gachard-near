/**
 * The small economy of ADR-046 and ADR-048: who a pack sale is shared with, what a
 * burned card yields, and what Crystal trades for. Every figure here is an example for this demo, and
 * none of it is real money.
 */
import { withDb, type Data, type User } from "./db.ts";
import { ContractRefused, platformCall } from "./near.ts";

export const CREATOR_SHARE_PCT = 90;
/** By rarity: Common, Rare, Epic, Legendary. Fixed by Gachard, not by a creator. */
export const CRYSTAL_BY_RARITY = [10, 30, 90, 300];
/** Five cards of a rarity trade for one of your choice, so a duplicate leads somewhere. */
export const TRADE_PRICE = CRYSTAL_BY_RARITY.map((crystal) => crystal * 5);

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

/** Trades Crystal for one card of a live series, minted to the user. */
export async function tradeForCard(user: User, seriesId: number, templateId: number) {
  const claim = await withDb((d) => {
    const series = d.series.find((s) => s.id === seriesId);
    const template = series?.templates.find((t) => t.id === templateId);
    if (!series || !template) throw new ContractRefused("There is no such card.");
    if (series.hidden) throw new ContractRefused("This series has been retired.");
    const row = d.users.find((u) => u.id === user.id)!;
    const price = TRADE_PRICE[template.rarity];
    if ((row.crystal ?? 0) < price) throw new ContractRefused(`This card takes ${price} Crystal.`);
    row.crystal = (row.crystal ?? 0) - price;
    return { price, receiver: row.accountId };
  });
  try {
    const { hash, value } = await platformCall("mint", { series_id: seriesId, template_ids: [templateId], receiver_id: claim.receiver });
    const [tokenId] = value as string[];
    await withDb((d) => {
      d.txs[tokenId] = [hash];
    });
    return { tokenId };
  } catch (error) {
    // A refusal means nothing was minted. Any other error may be a mint with a lost response.
    if (error instanceof ContractRefused) {
      await withDb((d) => {
        const row = d.users.find((u) => u.id === user.id)!;
        row.crystal = (row.crystal ?? 0) + claim.price;
      });
    }
    throw error;
  }
}
