/**
 * An in-memory StoreRepo for tests and local development. It keeps the same
 * guarantees the MongoDB indexes give: one rotation per id, one store per user
 * per rotation (lib/v2/collections.ts).
 */
import type { RotationDoc, StoreDoc, StoreSlotDoc } from "./collections.ts";
import type { StoreRepo } from "./store-service.ts";

const clone = <T>(x: T): T => structuredClone(x);

export class MemoryStoreRepo implements StoreRepo {
  readonly rotations = new Map<number, RotationDoc>();
  readonly stores = new Map<string, StoreDoc>();

  private key(userId: string, rotationId: number) {
    return `${userId}:${rotationId}`;
  }

  async findRotation(rotationId: number) {
    const r = this.rotations.get(rotationId);
    return r ? clone(r) : null;
  }

  async insertRotation(doc: RotationDoc) {
    if (!this.rotations.has(doc.rotationId)) this.rotations.set(doc.rotationId, clone(doc));
    return clone(this.rotations.get(doc.rotationId)!);
  }

  async updateRotation(rotationId: number, patch: Partial<RotationDoc>) {
    const r = this.rotations.get(rotationId);
    if (r) this.rotations.set(rotationId, { ...r, ...clone(patch) });
  }

  async rotationsToReveal(nowIso: string) {
    return [...this.rotations.values()].filter((r) => r.revealAfter <= nowIso && r.commitTx && !r.revealTx).map(clone);
  }

  async findStore(userId: string, rotationId: number) {
    const s = this.stores.get(this.key(userId, rotationId));
    return s ? clone(s) : null;
  }

  async insertStore(doc: StoreDoc) {
    const k = this.key(doc.userId, doc.rotationId);
    if (!this.stores.has(k)) this.stores.set(k, clone(doc));
    return clone(this.stores.get(k)!);
  }

  async appendSlots(userId: string, rotationId: number, slots: StoreSlotDoc[]) {
    const s = this.stores.get(this.key(userId, rotationId))!;
    const have = new Set(s.slots.map((x) => x.slot));
    s.slots.push(...clone(slots).filter((x) => !have.has(x.slot)));
    s.expansion = true;
    return clone(s);
  }

  async revealCard(userId: string, rotationId: number, slot: number, depth: number, card: number) {
    const s = this.stores.get(this.key(userId, rotationId));
    const target = s?.slots.find((x) => x.slot === slot && x.depth === depth && !x.soldOut);
    if (!s || !target) return null;
    target.revealed[card] = true;
    return clone(s);
  }
}
