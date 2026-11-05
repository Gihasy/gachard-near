/**
 * The StoreRepo on MongoDB. The unique indexes of lib/v2/collections.ts do
 * the work the store depends on:
 * - `rotations.rotationId` makes concurrent first visitors share one rotation;
 * - `stores.{userId, rotationId}` gives a user one store per rotation.
 *
 * An insert that loses a race reads back the winner instead of failing.
 * Imports only types from `mongodb`, so tests can load it.
 */
import type { Db } from "mongodb";
import type { RotationDoc, StoreDoc, StoreSlotDoc } from "./collections.ts";
import type { StoreRepo } from "./store-service.ts";

const NO_ID = { projection: { _id: 0 } } as const;
/** Reveals per request, so one slow request never carries a long backlog. */
const REVEALS_PER_CALL = 5;

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 11000;
}

export class MongoStoreRepo implements StoreRepo {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  private rotations() {
    return this.db.collection<RotationDoc>("rotations");
  }

  private stores() {
    return this.db.collection<StoreDoc>("stores");
  }

  async findRotation(rotationId: number) {
    return this.rotations().findOne({ rotationId }, NO_ID);
  }

  async insertRotation(doc: RotationDoc) {
    try {
      await this.rotations().insertOne({ ...doc });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    return (await this.findRotation(doc.rotationId))!;
  }

  async updateRotation(rotationId: number, patch: Partial<RotationDoc>) {
    await this.rotations().updateOne({ rotationId }, { $set: patch });
  }

  async rotationsToReveal(nowIso: string) {
    return this.rotations()
      .find({ revealAfter: { $lte: nowIso }, commitTx: { $exists: true }, revealTx: { $exists: false } }, NO_ID)
      .sort({ rotationId: 1 })
      .limit(REVEALS_PER_CALL)
      .toArray();
  }

  async findStore(userId: string, rotationId: number) {
    return this.stores().findOne({ userId, rotationId }, NO_ID);
  }

  async insertStore(doc: StoreDoc) {
    try {
      await this.stores().insertOne({ ...doc });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    return (await this.findStore(doc.userId, doc.rotationId))!;
  }

  async appendSlots(userId: string, rotationId: number, slots: StoreSlotDoc[]) {
    // Only when none of the new slots is there yet, so two requests cannot add them twice.
    await this.stores().updateOne(
      { userId, rotationId, "slots.slot": { $nin: slots.map((s) => s.slot) } },
      { $push: { slots: { $each: slots } }, $set: { expansion: true } },
    );
    return (await this.findStore(userId, rotationId))!;
  }

  async revealCard(userId: string, rotationId: number, slot: number, depth: number, card: number) {
    return this.stores().findOneAndUpdate(
      { userId, rotationId, slots: { $elemMatch: { slot, depth, soldOut: false } } },
      { $set: { [`slots.$[s].revealed.${card}`]: true } },
      { arrayFilters: [{ "s.slot": slot, "s.depth": depth }], returnDocument: "after", ...NO_ID },
    );
  }
}
