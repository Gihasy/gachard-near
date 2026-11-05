/**
 * Tests for the store derivation in lib/v2/chain-v2.ts: the per-slot queue of
 * replacement packs, and where a limited card may and may not appear
 * (ADR-038, amendment of 15 October 2026).
 *
 *   cd frontend && node --test scripts/v2-derive.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_SLOTS,
  EXPANSION_SLOTS,
  MAX_REFILLS_PER_SLOT,
  derivePack,
  deriveStore,
} from "../lib/v2/chain-v2.ts";

const LIMITED = 201;
const base = {
  seed: "0x" + "5e".repeat(32),
  secret: "0x" + "c4".repeat(32),
  holder: "0x00000000000000000000000000000000000a11ce",
  rotationId: 7n,
  cardsPerPack: 5,
  rarityWeights: [7000, 2000, 800, 200],
  templatesByRarity: [[101, 102], [103, 104], [105, 106], [107, 108]],
};
/** Every eligible card becomes the limited card: makes the placement rules visible. */
const always = (inRefills) => ({ ...base, limited: { templateId: LIMITED, chancePpm: 1_000_000, inRefills } });
const hasLimited = (pack) => pack.includes(LIMITED);

test("the queue is fixed: the same inputs always give the same packs", () => {
  for (let slot = 0; slot < BASE_SLOTS + EXPANSION_SLOTS; slot++) {
    for (let depth = 0; depth <= MAX_REFILLS_PER_SLOT; depth++) {
      assert.deepEqual(derivePack(base, slot, depth), derivePack(base, slot, depth));
    }
  }
});

test("each position of the queue is its own pack, and each holder has their own store", () => {
  const queue = [0, 1, 2].map((depth) => derivePack(base, 0, depth).join(","));
  assert.equal(new Set(queue).size, 3, "the opening pack and its replacements differ");
  const other = { ...base, holder: "0x0000000000000000000000000000000000000b0b" };
  assert.notDeepEqual(deriveStore(base), deriveStore(other));
});

test("the opening shelf is depth 0 of each slot: 3 packs, or 5 with Expansion", () => {
  assert.equal(deriveStore(base).length, 3);
  assert.equal(deriveStore(base, 5).length, 5);
  assert.deepEqual(deriveStore(base)[1], derivePack(base, 1, 0));
});

test("a limited card never appears in an Expansion slot, opening or replacement", () => {
  for (let slot = BASE_SLOTS; slot < BASE_SLOTS + EXPANSION_SLOTS; slot++) {
    for (let depth = 0; depth <= MAX_REFILLS_PER_SLOT; depth++) {
      assert.ok(!hasLimited(derivePack(always(true), slot, depth)), `slot ${slot} depth ${depth}`);
    }
  }
});

test("with inRefills off, limited cards appear only in the opening packs of base slots", () => {
  for (let slot = 0; slot < BASE_SLOTS; slot++) {
    assert.ok(hasLimited(derivePack(always(false), slot, 0)));
    for (let depth = 1; depth <= MAX_REFILLS_PER_SLOT; depth++) {
      assert.ok(!hasLimited(derivePack(always(false), slot, depth)), `slot ${slot} depth ${depth}`);
    }
  }
});

test("with inRefills on (the season default), replacements in base slots may hold one", () => {
  for (let slot = 0; slot < BASE_SLOTS; slot++) {
    for (let depth = 0; depth <= MAX_REFILLS_PER_SLOT; depth++) {
      assert.ok(hasLimited(derivePack(always(true), slot, depth)), `slot ${slot} depth ${depth}`);
    }
  }
});

test("no limited offer, or a zero chance, means no limited card anywhere", () => {
  const zero = { ...base, limited: { templateId: LIMITED, chancePpm: 0, inRefills: true } };
  for (const d of [base, zero]) {
    for (let slot = 0; slot < BASE_SLOTS + EXPANSION_SLOTS; slot++) {
      for (let depth = 0; depth <= MAX_REFILLS_PER_SLOT; depth++) assert.ok(!hasLimited(derivePack(d, slot, depth)));
    }
  }
});

test("a slot past Expansion or a third replacement does not exist", () => {
  assert.throws(() => derivePack(base, BASE_SLOTS + EXPANSION_SLOTS, 0), /no slot/);
  assert.throws(() => derivePack(base, 0, MAX_REFILLS_PER_SLOT + 1), /no depth/);
});
