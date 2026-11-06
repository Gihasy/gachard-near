/**
 * Series and cards. A creator's own account signs these, so the chain records
 * them as the issuer. The database row is a cache for listing pages.
 */
import { DEFAULT_CATEGORY } from "./categories.ts";
import { storeArt } from "./art.ts";
import { readDb, withDb, type SeriesRow, type TemplateRow, type User } from "./db.ts";
import { ContractRefused, platformCall, userCall } from "./near.ts";

export const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

// A public URL with open uploads and no review (ADR-044). The caps limit how much
// can be published, and how fast it spends the platform's funds.
const MAX_SERIES_PER_USER = 3;
const MAX_SERIES_PER_HOUR = 10;
const MAX_CARDS_PER_SERIES = 20;
const MAX_CARDS_PER_HOUR = 60;
const HOUR = 3_600_000;

const withinHour = (iso: string) => Date.now() - Date.parse(iso) < HOUR;

export async function createSeries(
  user: User,
  name: string,
  ratesBps: number[],
  prices: number[],
  category: string = DEFAULT_CATEGORY,
  description?: string,
): Promise<SeriesRow> {
  const { series: all } = await readDb();
  if (all.filter((s) => s.ownerUserId === user.id).length >= MAX_SERIES_PER_USER) {
    throw new ContractRefused(`An account can release ${MAX_SERIES_PER_USER} series in this demo.`);
  }
  if (all.filter((s) => withinHour(s.createdAt)).length >= MAX_SERIES_PER_HOUR) {
    throw new ContractRefused("Too many new series this hour. Please try again later.");
  }
  if (!user.approvedCreator) {
    await platformCall("approve_creator", { creator: user.accountId });
    await withDb((d) => {
      const row = d.users.find((u) => u.id === user.id);
      if (row) row.approvedCreator = true;
    });
  }
  const { value } = await userCall(user, "create_series", { name, rates_bps: ratesBps, prices });
  const series: SeriesRow = {
    id: value as number,
    ownerUserId: user.id,
    creatorAccount: user.accountId,
    name,
    category,
    ...(description ? { description } : {}),
    ratesBps,
    prices,
    templates: [],
    createdAt: new Date().toISOString(),
  };
  await withDb((d) => d.series.push(series));
  return series;
}

/**
 * Changes a series. Its name, rates and prices are on chain, so the creator's account
 * signs them. Its logo, description and category are the app's own. Cards never change.
 */
export async function updateSeries(
  user: User,
  seriesId: number,
  changes: { name: string; ratesBps: number[]; prices: number[]; category: string; description: string },
): Promise<void> {
  const series = (await readDb()).series.find((s) => s.id === seriesId);
  if (!series) throw new ContractRefused("Series not found.");
  if (series.ownerUserId !== user.id) throw new ContractRefused("This is not your series.");
  const oddsChanged = changes.ratesBps.some((rate, i) => rate !== series.ratesBps[i]);
  const onChainChanged = oddsChanged || changes.name !== series.name || changes.prices.some((price, i) => price !== series.prices[i]);
  if (onChainChanged) {
    await userCall(user, "update_series", { series_id: seriesId, name: changes.name, rates_bps: changes.ratesBps, prices: changes.prices });
  }
  await withDb((d) => {
    const row = d.series.find((s) => s.id === seriesId);
    if (!row) return;
    row.name = changes.name;
    row.ratesBps = changes.ratesBps;
    row.prices = changes.prices;
    row.category = changes.category;
    row.description = changes.description;
    if (oddsChanged) row.oddsChangedAt = new Date().toISOString();
  });
}

export async function addCard(
  user: User,
  seriesId: number,
  name: string,
  rarity: number,
  art: Buffer,
): Promise<TemplateRow> {
  const { series: all } = await readDb();
  const series = all.find((s) => s.id === seriesId);
  if (series && series.templates.length >= MAX_CARDS_PER_SERIES) {
    throw new ContractRefused(`A series can hold ${MAX_CARDS_PER_SERIES} cards in this demo.`);
  }
  const recent = all.flatMap((s) => s.templates).filter((t) => withinHour(t.createdAt)).length;
  if (recent >= MAX_CARDS_PER_HOUR) {
    throw new ContractRefused("Too many new cards this hour. Please try again later.");
  }
  const { media, mediaHash } = await storeArt(art);
  const { value } = await userCall(user, "add_template", {
    series_id: seriesId,
    name,
    rarity,
    media,
    media_hash: mediaHash,
  });
  const template: TemplateRow = {
    id: value as number,
    name,
    rarity,
    media,
    mediaHash,
    createdAt: new Date().toISOString(),
  };
  await withDb((d) => d.series.find((s) => s.id === seriesId)?.templates.push(template));
  return template;
}

/**
 * Whether a series appears in the public lists. The series near-e2e/app-flow.mjs publishes
 * to test the app can be opened by its address, but nobody should come across them.
 */
export const isListed = (series: SeriesRow) =>
  !series.hidden && missingRarities(series).length === 0 && !/^Flow \d+$/.test(series.name);

/** A pack can only honour the published rates if every rarity with a rate has a card. */
export function missingRarities(series: SeriesRow): string[] {
  return RARITIES.filter(
    (_, rarity) => series.ratesBps[rarity] > 0 && !series.templates.some((t) => t.rarity === rarity),
  );
}
