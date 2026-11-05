/**
 * What the store sells in Season 0, and at what price (docs/PLAN-STORE-V2.md,
 * decisions P1, P4, P5; ADR-038).
 *
 * Mirrors contracts/script/v2/season0.json, which deploys the same templates.
 * scripts/v2-store.test.mjs fails if the two drift apart.
 */

export const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"] as const;

/** Card price by rarity, in Credits (P1: the Economy Lab proposal). A limited card costs its rarity's price. */
export const CARD_PRICE_CREDITS = [40, 120, 360, 1200] as const;

/** Dismantle yield by rarity, in Crystal (ADR-026, unchanged). Limited cards are never dismantled. */
export const DISMANTLE_CRYSTAL = [20, 50, 120, 300] as const;

/** Rarity odds in basis points: 70 / 20 / 8 / 2 (ADR-009). */
export const RARITY_WEIGHTS_BPS = [7000, 2000, 800, 200] as const;

/** ADR-038: buying the first full shelf of a rotation in one purchase takes 15% off. */
export const WHOLE_SHELF_DISCOUNT_BPS = 1500;

export const CARDS_PER_PACK = 5;

export interface CatalogTemplate {
  templateId: number;
  v1Name: string; // the v1 artwork it reuses: /cards/<v1Name>.webp
  name: string;
  rarity: number;
}

export interface StoreCatalog {
  seriesId: number;
  seriesName: string;
  seasonId: number;
  templates: CatalogTemplate[];
  limited: { templateId: number; rarity: number; storeCap: number; albumCap: number; name: string };
  completionTemplateId: number;
  /** ADR-038 amendment, 15 October 2026: limited cards may appear in replacement packs. */
  limitedInRefills: boolean;
}

/** Season 0: the 8 existing artworks plus one Limited card whose art is still to be made. */
export const SEASON_0: StoreCatalog = {
  seriesId: 1,
  seriesName: "Gachard Originals",
  seasonId: 1,
  templates: [
    { templateId: 101, v1Name: "common-1", name: "Common Card A", rarity: 0 },
    { templateId: 102, v1Name: "common-2", name: "Common Card B", rarity: 0 },
    { templateId: 103, v1Name: "rare-1", name: "Rare Card A", rarity: 1 },
    { templateId: 104, v1Name: "rare-2", name: "Rare Card B", rarity: 1 },
    { templateId: 105, v1Name: "epic-1", name: "Epic Card A", rarity: 2 },
    { templateId: 106, v1Name: "epic-2", name: "Epic Card B", rarity: 2 },
    { templateId: 107, v1Name: "legendary-1", name: "Legendary Card A", rarity: 3 },
    { templateId: 108, v1Name: "legendary-2", name: "Legendary Card B", rarity: 3 },
  ],
  // Its artwork is still to be made, so the store shows a placeholder.
  limited: { templateId: 201, rarity: 3, albumCap: 20, storeCap: 5, name: "Season 0 Limited" },
  completionTemplateId: 301,
  limitedInRefills: true,
};

/** Template ids grouped by rarity, as derivePack expects. */
export function templatesByRarity(catalog: StoreCatalog): number[][] {
  const out: number[][] = [[], [], [], []];
  for (const t of catalog.templates) out[t.rarity].push(t.templateId);
  return out;
}

/** Rarity of any template the catalog can put in a pack, the limited card included. */
export function rarityOf(catalog: StoreCatalog, templateId: number): number {
  if (templateId === catalog.limited.templateId) return catalog.limited.rarity;
  const t = catalog.templates.find((x) => x.templateId === templateId);
  if (!t) throw new Error(`template ${templateId} is not in ${catalog.seriesName} season ${catalog.seasonId}`);
  return t.rarity;
}

/**
 * The limited card's chance per eligible card for one rotation, in parts per
 * million (chain-v2.ts PPM).
 *
 * The store share is spread evenly over the days left (ADR-038), and a day has
 * four rotations. Dividing a rotation's share by the eligible cards expected in
 * it gives the chance per card. It is fixed when the rotation is committed and
 * published with it, because verifying a store needs the exact number.
 */
export function limitedChancePpm(input: {
  storeRemaining: number;
  daysLeft: number;
  expectedEligibleCardsPerRotation: number;
}): number {
  const { storeRemaining, daysLeft, expectedEligibleCardsPerRotation } = input;
  if (storeRemaining <= 0 || daysLeft <= 0 || expectedEligibleCardsPerRotation <= 0) return 0;
  const perRotation = storeRemaining / (daysLeft * 4);
  return Math.min(1_000_000, Math.floor((1_000_000 * perRotation) / expectedEligibleCardsPerRotation));
}
