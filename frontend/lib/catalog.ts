/**
 * Series and cards. A creator's own account signs these, so the chain records
 * them as the issuer. The database row is a cache for listing pages.
 */
import { DEFAULT_CATEGORY } from "./categories.ts";
import { storeArt } from "./art.ts";
import { randomUUID } from "node:crypto";
import { readDb, withDb, type DraftCard, type SeriesRow, type TemplateRow, type User } from "./db.ts";
import { ContractRefused, platformCall, userCall, view } from "./near.ts";

export const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

// A public URL with open uploads and no review (ADR-044). The caps limit how much
// can be published, and how fast it spends the platform's funds.
const MAX_SERIES_PER_USER = 3;
const MAX_SERIES_PER_HOUR = 10;
const MAX_CARDS_PER_SERIES = 20;
const MAX_CARDS_PER_HOUR = 60;
const MAX_UPLOADS_PER_HOUR = 120;
// A request stops starting new cards after this, and the browser sends the next one (Vercel limits a function to 30 s).
const PUBLISH_BUDGET_MS = 18_000;
// Longer than a function can live, so an older claim means the publish that made it has ended.
const CLAIM_MS = 60_000;
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
  if (all.filter((s) => s.ownerUserId === user.id && !s.deletedAt).length >= MAX_SERIES_PER_USER) {
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
  const series = await ownSeries(user, seriesId);
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

async function ownSeries(user: User, seriesId: number): Promise<SeriesRow> {
  const series = (await readDb()).series.find((s) => s.id === seriesId);
  if (!series) throw new ContractRefused("Series not found.");
  if (series.ownerUserId !== user.id) throw new ContractRefused("This is not your series.");
  if (series.deletedAt) throw new ContractRefused("This series has been deleted.");
  return series;
}

/**
 * Deletes a series. With no published card nothing can refer to it, so it goes. With one,
 * a collector may hold a copy, and trades leave no record here to prove nobody does, so it
 * is retired: no more packs or trades, and its cards stay valid. The chain keeps its record.
 */
export async function deleteSeries(user: User, seriesId: number): Promise<void> {
  await ownSeries(user, seriesId);
  const refused = await withDb((d) => {
    const row = d.series.find((s) => s.id === seriesId);
    if (!row || row.deletedAt) return "This series has been deleted.";
    if (row.drafts?.some(isClaimed)) return "This series is being published. Try again in a minute.";
    if (row.templates.length) {
      row.hidden = true;
      row.deletedAt = new Date().toISOString();
      row.drafts = [];
    } else {
      d.series = d.series.filter((s) => s.id !== seriesId);
    }
    return null;
  });
  if (refused) throw new ContractRefused(refused);
}

/** The same rules the contract applies, so a draft cannot fail later at publish. */
function checkCard(name: string, rarity: number) {
  const bytes = Buffer.byteLength(name);
  if (bytes < 1 || bytes > 64) throw new ContractRefused("A card's name must be 1 to 64 characters.");
  if (!Number.isInteger(rarity) || rarity < 0 || rarity >= RARITIES.length) throw new ContractRefused("Choose a rarity.");
}

async function storeUpload(art: Buffer) {
  const allowed = await withDb((d) => {
    const recent = (d.artUploads ?? []).filter(withinHour);
    if (recent.length >= MAX_UPLOADS_PER_HOUR) {
      d.artUploads = recent;
      return false;
    }
    d.artUploads = [...recent, new Date().toISOString()];
    return true;
  });
  if (!allowed) throw new ContractRefused("Too many uploads this hour. Please try again later.");
  return storeArt(art);
}

/** Adds a card to a series as a draft. Nothing reaches the chain until the series is published. */
export async function addDraft(user: User, seriesId: number, name: string, rarity: number, art: Buffer): Promise<DraftCard> {
  const series = await ownSeries(user, seriesId);
  checkCard(name, rarity);
  if (series.templates.length + (series.drafts?.length ?? 0) >= MAX_CARDS_PER_SERIES) {
    throw new ContractRefused(`A series can hold ${MAX_CARDS_PER_SERIES} cards in this demo.`);
  }
  const draft: DraftCard = { id: randomUUID(), name, rarity, ...(await storeUpload(art)), createdAt: new Date().toISOString() };
  await withDb((d) => {
    const row = d.series.find((s) => s.id === seriesId);
    if (row) row.drafts = [...(row.drafts ?? []), draft];
  });
  return draft;
}

const isClaimed = (draft: DraftCard) => Boolean(draft.claimedAt) && Date.now() - Date.parse(draft.claimedAt!) < CLAIM_MS;

function changeableDraft(series: SeriesRow, draftId: string): DraftCard {
  const draft = series.drafts?.find((c) => c.id === draftId);
  if (!draft || draft.claimedAt) throw new ContractRefused("That card has been published or is being published.");
  return draft;
}

export async function updateDraft(
  user: User,
  seriesId: number,
  draftId: string,
  changes: { name: string; rarity: number; art?: Buffer },
): Promise<void> {
  changeableDraft(await ownSeries(user, seriesId), draftId);
  checkCard(changes.name, changes.rarity);
  const stored = changes.art ? await storeUpload(changes.art) : null;
  const changed = await withDb((d) => {
    const draft = d.series.find((s) => s.id === seriesId)?.drafts?.find((c) => c.id === draftId);
    if (!draft || draft.claimedAt) return false;
    draft.name = changes.name;
    draft.rarity = changes.rarity;
    if (stored) Object.assign(draft, stored);
    return true;
  });
  if (!changed) throw new ContractRefused("That card has been published or is being published.");
}

export async function removeDraft(user: User, seriesId: number, draftId: string): Promise<void> {
  changeableDraft(await ownSeries(user, seriesId), draftId);
  const removed = await withDb((d) => {
    const row = d.series.find((s) => s.id === seriesId);
    const draft = row?.drafts?.find((c) => c.id === draftId);
    if (!row || !draft || draft.claimedAt) return false;
    row.drafts = row.drafts!.filter((c) => c.id !== draftId);
    return true;
  });
  if (!removed) throw new ContractRefused("That card has been published or is being published.");
}

/** Whether an earlier publish did write this draft before it ended, so it is not written twice. */
async function alreadyOnChain(series: SeriesRow, draft: DraftCard): Promise<number | null> {
  const onChain = await view<{ template_count: number } | null>("get_series", { series_id: series.id });
  for (let id = 1; id <= (onChain?.template_count ?? 0); id += 1) {
    if (series.templates.some((t) => t.id === id)) continue;
    const template = await view<{ name: string; rarity: number; media_hash: string } | null>("get_template", { series_id: series.id, template_id: id });
    if (template?.media_hash === draft.mediaHash && template.name === draft.name && template.rarity === draft.rarity) return id;
  }
  return null;
}

/**
 * Writes a series' drafts to the chain, where they can no longer change. Each card lands
 * on its own, so a publish that stops part way can simply be repeated. It does as many as
 * fit in one request, and `remaining` tells the browser to send another.
 */
export async function publishSeries(user: User, seriesId: number): Promise<{ published: number; remaining: number }> {
  const started = Date.now();
  const { series: all } = await readDb();
  const series = await ownSeries(user, seriesId);
  const drafts = series.drafts ?? [];
  if (!drafts.length) throw new ContractRefused("There are no new cards to publish.");
  const missing = missingToPublish(series);
  if (missing.length) throw new ContractRefused(`Add a card for: ${missing.join(", ")}.`);
  const recent = all.flatMap((s) => s.templates).filter((t) => withinHour(t.createdAt)).length;
  if (recent + drafts.length > MAX_CARDS_PER_HOUR) {
    throw new ContractRefused("Too many new cards this hour. Please try again later.");
  }

  let published = 0;
  for (const draft of drafts) {
    if (Date.now() - started > PUBLISH_BUDGET_MS) break;
    const claim = await withDb((d) => {
      const row = d.series.find((s) => s.id === seriesId)?.drafts?.find((c) => c.id === draft.id);
      if (!row || isClaimed(row)) return null;
      const resumed = Boolean(row.claimedAt);
      row.claimedAt = new Date().toISOString();
      return { resumed };
    });
    if (!claim) continue;
    let templateId: number | null;
    try {
      templateId = claim.resumed ? await alreadyOnChain(series, draft) : null;
      templateId ??= (await userCall(user, "add_template", {
        series_id: seriesId,
        name: draft.name,
        rarity: draft.rarity,
        media: draft.media,
        media_hash: draft.mediaHash,
      })).value as number;
    } catch (error) {
      // Refused means it was not written. Any other failure leaves the claim, because it may have been.
      if (error instanceof ContractRefused) {
        await withDb((d) => {
          const row = d.series.find((s) => s.id === seriesId)?.drafts?.find((c) => c.id === draft.id);
          if (row) delete row.claimedAt;
        });
      }
      throw error;
    }
    const template: TemplateRow = {
      id: templateId,
      name: draft.name,
      rarity: draft.rarity,
      media: draft.media,
      mediaHash: draft.mediaHash,
      createdAt: new Date().toISOString(),
    };
    await withDb((d) => {
      const row = d.series.find((s) => s.id === seriesId);
      if (!row) return;
      row.drafts = row.drafts?.filter((c) => c.id !== draft.id);
      if (!row.templates.some((t) => t.id === template.id)) row.templates.push(template);
    });
    published += 1;
  }
  const remaining = (await readDb()).series.find((s) => s.id === seriesId)?.drafts?.length ?? 0;
  return { published, remaining };
}

/** Writes a card straight to the chain. Only the seed script does this: it has no drafts to review. */
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

/** The rarities with a rate that have no card yet, counting drafts. Publishing needs this empty. */
export function missingToPublish(series: SeriesRow): string[] {
  return RARITIES.filter(
    (_, rarity) => series.ratesBps[rarity] > 0
      && !series.templates.some((t) => t.rarity === rarity)
      && !series.drafts?.some((c) => c.rarity === rarity),
  );
}

/** A pack can only honour the published rates if every rarity with a rate has a card. */
export function missingRarities(series: SeriesRow): string[] {
  return RARITIES.filter(
    (_, rarity) => series.ratesBps[rarity] > 0 && !series.templates.some((t) => t.rarity === rarity),
  );
}
