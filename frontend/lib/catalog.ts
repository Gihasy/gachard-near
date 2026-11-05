/**
 * Series, cards and artwork. A creator's own account signs these, so the chain
 * records them as the issuer. The database row is a cache for listing pages.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { DATA_DIR, withDb, type SeriesRow, type TemplateRow, type User } from "./db.ts";
import { ContractRefused, platformCall, userCall } from "./near.ts";

export const RARITIES = ["Common", "Rare", "Epic", "Legendary"];
export const ART_DIR = join(DATA_DIR, "art");
const MAX_UPLOAD = 8 * 1024 * 1024;

export async function createSeries(
  user: User,
  name: string,
  ratesBps: number[],
  prices: number[],
): Promise<SeriesRow> {
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
    ratesBps,
    prices,
    templates: [],
  };
  await withDb((d) => d.series.push(series));
  return series;
}

/** Stores one normalised file named by its hash, the hash the chain records. */
export async function storeArt(input: Buffer) {
  if (input.length > MAX_UPLOAD) throw new ContractRefused("Artwork must be under 8 MB.");
  let bytes: Buffer;
  try {
    bytes = await sharp(input)
      .rotate()
      .resize({ width: 1630, withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new ContractRefused("That file is not a readable image.");
  }
  const digest = createHash("sha256").update(bytes);
  const hex = digest.copy().digest("hex");
  mkdirSync(ART_DIR, { recursive: true });
  writeFileSync(join(ART_DIR, `${hex}.webp`), bytes);
  return { media: `/api/art/${hex}.webp`, mediaHash: digest.digest("base64") };
}

export async function addCard(
  user: User,
  seriesId: number,
  name: string,
  rarity: number,
  art: Buffer,
): Promise<TemplateRow> {
  const { media, mediaHash } = await storeArt(art);
  const { value } = await userCall(user, "add_template", {
    series_id: seriesId,
    name,
    rarity,
    media,
    media_hash: mediaHash,
  });
  const template: TemplateRow = { id: value as number, name, rarity, media, mediaHash };
  await withDb((d) => d.series.find((s) => s.id === seriesId)?.templates.push(template));
  return template;
}

/** A pack can only honour the published rates if every rarity with a rate has a card. */
export function missingRarities(series: SeriesRow): string[] {
  return RARITIES.filter(
    (_, rarity) => series.ratesBps[rarity] > 0 && !series.templates.some((t) => t.rarity === rarity),
  );
}

/**
 * Whether the stored file still hashes to what the chain records. Null means it
 * could not be checked, which must never read as a pass.
 */
export function artMatches(media: string, mediaHashBase64: string): boolean | null {
  const file = media.match(/^\/api\/art\/([0-9a-f]{64})\.webp$/)?.[1];
  if (!file) return null;
  try {
    const bytes = readFileSync(join(ART_DIR, `${file}.webp`));
    return createHash("sha256").update(bytes).digest("base64") === mediaHashBase64;
  } catch {
    return null;
  }
}
