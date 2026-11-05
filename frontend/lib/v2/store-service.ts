/**
 * The store, phase 1 of docs/PLAN-STORE-V2.md: rotations that start on
 * demand, stores fixed when first built, and a reveal that returns one card.
 *
 * The database and the chain are ports, so this file runs the same against
 * MongoDB and the relayer in production and against in-memory fakes in tests
 * (scripts/v2-store.test.mjs).
 *
 * **On-demand rotations.** Vercel's Hobby plan runs cron at most once a day,
 * so no timer starts a rotation. The first store request after a 6-hour
 * boundary does it:
 * 1. stores the rotation with a fresh secret. A unique index means
 *    concurrent first visitors share one;
 * 2. commits the secret's hash on chain;
 * 3. requests the Pyth seed;
 * 4. reveals any earlier rotation whose reveal time has passed.
 *
 * Until the seed arrives, a few seconds on Monad, the store answers "preparing".
 */
import type { RotationDoc, StoreDoc, StoreSlotDoc } from "./collections.ts";
import {
  BASE_SLOTS,
  EXPANSION_SLOTS,
  derivePack,
  newRotationSecret,
  rotationSecretHash,
  type StoreDerivation,
} from "./chain-v2.ts";
import { rotationIdAt, rotationWindow, secondsLeft } from "./rotation-clock.ts";
import {
  CARDS_PER_PACK,
  RARITY_WEIGHTS_BPS,
  limitedChancePpm,
  rarityOf,
  templatesByRarity,
  type StoreCatalog,
} from "./store-catalog.ts";
import { storeView, type CardView, type StoreView } from "./store-view.ts";

export interface StoreRepo {
  findRotation(rotationId: number): Promise<RotationDoc | null>;
  /** Insert unless one exists, and return whichever is stored: a race has one winner. */
  insertRotation(doc: RotationDoc): Promise<RotationDoc>;
  updateRotation(rotationId: number, patch: Partial<RotationDoc>): Promise<void>;
  /** Rotations whose reveal time has passed and whose secret is not yet revealed. */
  rotationsToReveal(nowIso: string): Promise<RotationDoc[]>;
  findStore(userId: string, rotationId: number): Promise<StoreDoc | null>;
  /** Insert unless one exists, and return whichever is stored. */
  insertStore(doc: StoreDoc): Promise<StoreDoc>;
  /** Add Expansion slots to an existing store; returns the updated store. */
  appendSlots(userId: string, rotationId: number, slots: StoreSlotDoc[]): Promise<StoreDoc>;
  /** Mark one card revealed, only while the slot still shows that pack. Returns the updated store, or null. */
  revealCard(userId: string, rotationId: number, slot: number, depth: number, card: number): Promise<StoreDoc | null>;
}

export interface StoreChain {
  /** Each returns a transaction hash, or "already" when the chain shows it done. */
  commitRotation(rotationId: number, secretHash: string, endsAt: number, revealAfter: number): Promise<string>;
  requestEntropy(rotationId: number): Promise<string>;
  /** The rotation's Pyth seed, or null while it has not arrived. */
  readSeed(rotationId: number): Promise<string | null>;
  revealRotation(rotationId: number, secret: string): Promise<string>;
}

export interface StoreDeps {
  repo: StoreRepo;
  chain: StoreChain;
  catalog: StoreCatalog;
  encrypt(plain: string): string;
  decrypt(packed: string): string;
  /** The store share left on chain: GachardCards.remaining(limited, Store). */
  limitedRemaining(): Promise<number>;
  /** Whole days left in the season, from GachardAlbums.season(id).endsAt. */
  seasonDaysLeft(nowSeconds: number): Promise<number>;
  /** Cards that could be limited, expected across all stores in one rotation (the Lab's estimate). */
  expectedEligibleCardsPerRotation: number;
}

export interface StoreUser {
  userId: string;
  holder: string; // the address cards are minted to
}

export interface StoreOptions {
  nowSeconds: number;
  expansion: boolean;
  detection: boolean;
}

export type StoreResult =
  | { status: "preparing"; rotationId: number; secondsLeft: number }
  | { status: "ready"; view: StoreView };

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

/** The current rotation, started if needed. `ready` once its seed is known. */
export async function ensureRotation(
  deps: StoreDeps,
  nowSeconds: number,
): Promise<{ rotation: RotationDoc; ready: boolean }> {
  const id = rotationIdAt(nowSeconds);
  const window = rotationWindow(id);
  let rotation = await deps.repo.findRotation(id);
  if (!rotation) {
    const secret = newRotationSecret();
    rotation = await deps.repo.insertRotation({
      rotationId: id,
      startsAt: iso(window.startsAt),
      endsAt: iso(window.endsAt),
      revealAfter: iso(window.revealAfter),
      secretEncrypted: deps.encrypt(secret),
      secretHash: rotationSecretHash(secret),
      limitedChancePpm: limitedChancePpm({
        storeRemaining: await deps.limitedRemaining(),
        daysLeft: await deps.seasonDaysLeft(nowSeconds),
        expectedEligibleCardsPerRotation: deps.expectedEligibleCardsPerRotation,
      }),
      limitedInRefills: deps.catalog.limitedInRefills,
    });
  }
  if (!rotation.commitTx) {
    const commitTx = await deps.chain.commitRotation(id, rotation.secretHash, window.endsAt, window.revealAfter);
    await deps.repo.updateRotation(id, { commitTx });
    rotation = { ...rotation, commitTx };
  }
  if (!rotation.entropyTx) {
    const entropyTx = await deps.chain.requestEntropy(id);
    await deps.repo.updateRotation(id, { entropyTx });
    rotation = { ...rotation, entropyTx };
  }
  if (!rotation.seed) {
    const seed = await deps.chain.readSeed(id);
    if (seed) {
      await deps.repo.updateRotation(id, { seed });
      rotation = { ...rotation, seed };
    }
  }
  return { rotation, ready: Boolean(rotation.seed) };
}

/** Publish the secret of every rotation past its reveal time. Returns the rotation ids revealed. */
export async function revealDue(deps: StoreDeps, nowSeconds: number): Promise<number[]> {
  const revealed: number[] = [];
  for (const r of await deps.repo.rotationsToReveal(iso(nowSeconds))) {
    const secret = deps.decrypt(r.secretEncrypted);
    const revealTx = await deps.chain.revealRotation(r.rotationId, secret);
    await deps.repo.updateRotation(r.rotationId, { revealTx, revealedSecret: secret });
    revealed.push(r.rotationId);
  }
  return revealed;
}

function derivation(deps: StoreDeps, rotation: RotationDoc, holder: string): StoreDerivation {
  return {
    seed: rotation.seed!,
    secret: deps.decrypt(rotation.secretEncrypted),
    holder,
    rotationId: BigInt(rotation.rotationId),
    cardsPerPack: CARDS_PER_PACK,
    rarityWeights: RARITY_WEIGHTS_BPS,
    templatesByRarity: templatesByRarity(deps.catalog),
    limited: {
      templateId: deps.catalog.limited.templateId,
      chancePpm: rotation.limitedChancePpm,
      inRefills: rotation.limitedInRefills,
    },
  };
}

function openingSlot(d: StoreDerivation, slot: number): StoreSlotDoc {
  return {
    slot,
    depth: 0,
    templateIds: derivePack(d, slot, 0),
    revealed: Array(CARDS_PER_PACK).fill(false),
    soldOut: false,
    boughtPurchaseIds: [],
  };
}

async function loadStore(
  deps: StoreDeps,
  user: StoreUser,
  rotation: RotationDoc,
  expansion: boolean,
): Promise<StoreDoc> {
  let store = await deps.repo.findStore(user.userId, rotation.rotationId);
  const wanted = BASE_SLOTS + (expansion ? EXPANSION_SLOTS : 0);
  if (!store) {
    const d = derivation(deps, rotation, user.holder);
    store = await deps.repo.insertStore({
      userId: user.userId,
      rotationId: rotation.rotationId,
      holder: user.holder,
      slots: Array.from({ length: wanted }, (_, s) => openingSlot(d, s)),
      expansion,
      anyPurchase: false,
      createdAt: new Date().toISOString(),
    });
  } else if (store.slots.length < wanted) {
    // Expansion bought mid-rotation: its slots join the same derivation.
    const d = derivation(deps, rotation, user.holder);
    const extra = Array.from({ length: wanted - store.slots.length }, (_, i) => openingSlot(d, store!.slots.length + i));
    store = await deps.repo.appendSlots(user.userId, rotation.rotationId, extra);
  }
  return store;
}

/** The user's store for the current rotation. */
export async function getStore(deps: StoreDeps, user: StoreUser, options: StoreOptions): Promise<StoreResult> {
  const { rotation, ready } = await ensureRotation(deps, options.nowSeconds);
  try {
    await revealDue(deps, options.nowSeconds);
  } catch {
    // A late reveal must not take the store down; rotationOverdue raises it on chain (spec §15).
  }
  if (!ready) return { status: "preparing", rotationId: rotation.rotationId, secondsLeft: secondsLeft(options.nowSeconds) };
  const store = await loadStore(deps, user, rotation, options.expansion);
  return { status: "ready", view: storeView(store, deps.catalog, options) };
}

export class RevealError extends Error {}

/** Reveal one card. Free, and idempotent: revealing a card twice returns it twice. */
export async function revealCard(
  deps: StoreDeps,
  user: StoreUser,
  slot: number,
  card: number,
  options: StoreOptions,
): Promise<{ card: CardView; view: StoreView }> {
  const { rotation, ready } = await ensureRotation(deps, options.nowSeconds);
  if (!ready) throw new RevealError("The store is still being prepared.");
  const store = await loadStore(deps, user, rotation, options.expansion);
  const s = store.slots.find((x) => x.slot === slot);
  if (!s || s.soldOut) throw new RevealError("There is no pack in that slot.");
  if (!Number.isInteger(card) || card < 0 || card >= s.templateIds.length) throw new RevealError("There is no such card.");
  const updated = await deps.repo.revealCard(user.userId, rotation.rotationId, slot, s.depth, card);
  if (!updated) throw new RevealError("That pack has changed; reload the store.");
  const templateId = s.templateIds[card];
  return {
    card: { templateId, rarity: rarityOf(deps.catalog, templateId), limited: templateId === deps.catalog.limited.templateId },
    view: storeView(updated, deps.catalog, options),
  };
}
