/**
 * MongoDB collections for the new store (docs/PLAN-STORE-V2.md phase 0).
 *
 * Indexes are created before the first write, not after a duplicate shows up.
 * The unique ones carry rules the store depends on:
 * - one rotation document per rotation, so concurrent first visitors commit
 *   once (phase 1);
 * - one store per user per rotation;
 * - one record per purchase id (retries);
 * - one album per user per season;
 * - one v2 template id per template.
 *
 * Imports only types from `mongodb`, which Node's type stripping erases, so
 * scripts and tests can load it.
 */
import type { Db, IndexDescription } from "mongodb";

/** A creator's Series (ADR-039). Gachard Originals is Series 1. */
export interface SeriesDoc {
  seriesId: number;
  name: string;
  accent: string; // hex, at least 3:1 against #0A0B14 (docs/CREATOR-ASSET-GUIDE.md)
  status: "draft" | "in_review" | "scheduled" | "live" | "ended";
  createdAt: string;
}

/** A season, mirroring GachardAlbums.registerSeason. */
export interface SeasonDoc {
  seasonId: number;
  seriesId: number;
  albumTemplateIds: number[]; // by slot
  limitedTemplateId: number | null;
  completionTemplateId: number;
  startsAt: string;
  endsAt: string;
}

/** One 6-hour rotation (spec §7). The secret stays server-side until revealed. */
export interface RotationDoc {
  rotationId: number; // floor(startsAt / 6 h)
  startsAt: string;
  endsAt: string;
  revealAfter: string; // endsAt + the Reserve window
  secretEncrypted: string; // AES-256-GCM until the reveal
  secretHash: string;
  /** The limited card's chance per eligible card, fixed at commit and published with the reveal (store-catalog.ts). */
  limitedChancePpm: number;
  limitedInRefills: boolean;
  commitTx?: string;
  entropyTx?: string;
  seed?: string;
  revealTx?: string;
  revealedSecret?: string;
}

/**
 * One slot of a user's store. `templateIds` is the current pack of the slot's
 * queue (derivePack): it never reaches a client before each card is revealed
 * (store-view.ts).
 */
export interface StoreSlotDoc {
  slot: number;
  depth: number; // 0 the opening pack, 1–2 replacements (ADR-038 amendment)
  templateIds: number[];
  revealed: boolean[];
  soldOut: boolean; // the last replacement has been bought
  boughtPurchaseIds: string[];
}

/** A user's store for one rotation, fixed when first built (deriveStore). */
export interface StoreDoc {
  userId: string;
  rotationId: number;
  holder: string;
  slots: StoreSlotDoc[];
  expansion: boolean;
  /** Any pack bought this rotation: the whole-shelf discount is for the first full shelf only. */
  anyPurchase: boolean;
  createdAt: string;
}

export interface PurchaseDoc {
  purchaseId: string; // bytes32 hex, the on-chain idempotency key
  userId: string;
  rotationId: number;
  packIndexes: number[];
  templateIds: number[];
  wholeShelf: boolean;
  priceCredits: number;
  status: "pending" | "confirmed" | "failed" | "refunded";
  txHash?: string;
  firstTokenId?: string;
  createdAt: string;
}

export interface AlbumDoc {
  userId: string;
  seasonId: number;
  slots: (string | null)[]; // v2 token id per slot, null while empty
  rewardsClaimed: boolean;
  completionSerial?: number;
}

export interface CrystalItemDoc {
  userId: string;
  item: "expansion" | "detection" | "reserve" | "wishlist_alert";
  expiresAt: string | null; // null for single-use items until used
  usedAt?: string;
  createdAt: string;
}

export const V2_INDEXES: Record<string, IndexDescription[]> = {
  series: [{ key: { seriesId: 1 }, unique: true }],
  seasons: [{ key: { seasonId: 1 }, unique: true }, { key: { seriesId: 1, startsAt: 1 } }],
  rotations: [{ key: { rotationId: 1 }, unique: true }],
  stores: [{ key: { userId: 1, rotationId: 1 }, unique: true }],
  purchases: [{ key: { purchaseId: 1 }, unique: true }, { key: { userId: 1, createdAt: -1 } }],
  albums: [{ key: { userId: 1, seasonId: 1 }, unique: true }],
  crystal_items: [{ key: { userId: 1, item: 1, expiresAt: 1 } }],
  card_templates: [{ key: { v2TemplateId: 1 }, unique: true, sparse: true }],
  cards: [
    { key: { v2TokenId: 1 }, unique: true, sparse: true },
    { key: { hold: 1 }, sparse: true }, // the platform hold of ADR-040
  ],
};

/** Create every v2 index. Idempotent: MongoDB skips an index that already exists. */
export async function ensureV2Indexes(db: Db): Promise<string[]> {
  const created: string[] = [];
  for (const [collection, indexes] of Object.entries(V2_INDEXES)) {
    const names = await db.collection(collection).createIndexes(indexes);
    created.push(...names.map((n) => `${collection}.${n}`));
  }
  return created;
}
