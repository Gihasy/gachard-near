/**
 * The store's dependencies for the routes: MongoDB, the relayer, AES-GCM for
 * rotation secrets, and Season 0. Built once per server instance.
 *
 * Server only: it reads the relayer keys and the encryption key from the
 * environment. Tests build their own StoreDeps instead (scripts/v2-store.test.mjs).
 */
import { connectToDatabase } from "@/lib/mongodb";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureV2Indexes, type CrystalItemDoc } from "./collections.ts";
import { V2Relayer, v2ConfigFromEnv } from "./relayer.ts";
import { relayerStoreChain } from "./store-chain.ts";
import { MongoStoreRepo } from "./store-repo-mongo.ts";
import { SEASON_0 } from "./store-catalog.ts";
import type { StoreDeps } from "./store-service.ts";

/** GachardCards.Channel.Store */
const STORE_CHANNEL = 0;
const DAY = 86_400;

/**
 * Eligible cards expected across all stores in one rotation, for pacing the
 * limited card. A testnet guess until the Lab projects it from real traffic:
 * about 20 stores a rotation, 15 base-slot cards each.
 */
const DEFAULT_EXPECTED_ELIGIBLE_CARDS = 300;

let built: Promise<{ deps: StoreDeps; relayer: V2Relayer }> | null = null;

async function build() {
  const db = await connectToDatabase();
  await ensureV2Indexes(db); // before the first write: the unique indexes carry the store's rules
  const relayer = new V2Relayer(v2ConfigFromEnv());
  let seasonEndsAt: number | null = null;

  const deps: StoreDeps = {
    repo: new MongoStoreRepo(db),
    chain: relayerStoreChain(relayer),
    catalog: SEASON_0,
    encrypt,
    decrypt,
    async limitedRemaining() {
      const left = await relayer.read<bigint>("cards", "remaining", [SEASON_0.limited.templateId, STORE_CHANNEL]);
      return Number(left);
    },
    async seasonDaysLeft(nowSeconds) {
      if (seasonEndsAt === null) {
        const season = await relayer.read<{ endsAt: bigint; exists: boolean }>("albums", "season", [SEASON_0.seasonId]);
        if (!season.exists) throw new Error(`season ${SEASON_0.seasonId} is not registered on chain`);
        seasonEndsAt = Number(season.endsAt);
      }
      return Math.max(0, Math.ceil((seasonEndsAt - nowSeconds) / DAY));
    },
    expectedEligibleCardsPerRotation:
      Number(process.env.V2_EXPECTED_ELIGIBLE_CARDS) || DEFAULT_EXPECTED_ELIGIBLE_CARDS,
  };
  return { deps, relayer };
}

export async function storeDeps(): Promise<StoreDeps> {
  built ??= build().catch((err) => {
    built = null; // a failed start is retried by the next request
    throw err;
  });
  return (await built).deps;
}

/** Expansion and Detection the user holds right now (Crystal Shop items, ADR-038). */
export async function activeItems(userId: string, nowSeconds: number): Promise<{ expansion: boolean; detection: boolean }> {
  const db = await connectToDatabase();
  const now = new Date(nowSeconds * 1000).toISOString();
  const items = await db
    .collection<CrystalItemDoc>("crystal_items")
    .find({ userId, item: { $in: ["expansion", "detection"] }, expiresAt: { $gt: now } }, { projection: { item: 1 } })
    .toArray();
  return {
    expansion: items.some((i) => i.item === "expansion"),
    detection: items.some((i) => i.item === "detection"),
  };
}
