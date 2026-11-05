/**
 * Tests for the store service and the store view (lib/v2/store-service.ts,
 * lib/v2/store-view.ts), against an in-memory repo and a fake chain.
 *
 * The rule that matters most: no response ever carries a card the user has
 * not revealed. Each test that builds a response checks it on the
 * serialised JSON, which is what a browser would receive.
 *
 *   cd frontend && node --test scripts/v2-store.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_REFILLS_PER_SLOT } from "../lib/v2/chain-v2.ts";
import { ROTATION_SECONDS, rotationIdAt, rotationWindow, secondsLeft } from "../lib/v2/rotation-clock.ts";
import {
  CARD_PRICE_CREDITS,
  SEASON_0,
  limitedChancePpm,
  templatesByRarity,
} from "../lib/v2/store-catalog.ts";
import { MemoryStoreRepo } from "../lib/v2/store-repo-memory.ts";
import { RevealError, ensureRotation, getStore, revealCard, revealDue } from "../lib/v2/store-service.ts";
import { discounted, packPrice, storeView } from "../lib/v2/store-view.ts";

// 15 October 2026 07:00 UTC: one hour into the 06:00 rotation.
const NOW = Date.UTC(2026, 9, 15, 7) / 1000;
const ALICE = { userId: "u-alice", holder: "0x00000000000000000000000000000000000a11ce" };
const BOB = { userId: "u-bob", holder: "0x0000000000000000000000000000000000000b0b" };
const plain = { nowSeconds: NOW, expansion: false, detection: false };

/** A chain that records what it was asked and delivers the seed when told to. */
function fakeChain() {
  const calls = [];
  const seeds = new Map();
  return {
    calls,
    deliver(rotationId) {
      seeds.set(rotationId, "0x" + rotationId.toString(16).padStart(64, "0"));
    },
    async commitRotation(id, hash, endsAt, revealAfter) {
      calls.push(["commit", id, hash, endsAt, revealAfter]);
      return `0xcommit${id}`;
    },
    async requestEntropy(id) {
      calls.push(["entropy", id]);
      return `0xentropy${id}`;
    },
    async readSeed(id) {
      return seeds.get(id) ?? null;
    },
    async revealRotation(id, secret) {
      calls.push(["reveal", id, secret]);
      return `0xreveal${id}`;
    },
  };
}

function setup(overrides = {}) {
  const repo = new MemoryStoreRepo();
  const chain = fakeChain();
  const deps = {
    repo,
    chain,
    catalog: SEASON_0,
    // Reversible and visibly not plain: enough to prove the secret is stored encrypted.
    encrypt: (s) => "enc:" + [...s].reverse().join(""),
    decrypt: (p) => [...p.slice(4)].reverse().join(""),
    limitedRemaining: async () => 5,
    seasonDaysLeft: async () => 90,
    expectedEligibleCardsPerRotation: 1500,
    ...overrides,
  };
  return { repo, chain, deps };
}

async function readyStore(overrides) {
  const ctx = setup(overrides);
  await ensureRotation(ctx.deps, NOW);
  ctx.chain.deliver(rotationIdAt(NOW));
  return ctx;
}

const storeOf = (repo, userId) => repo.stores.get(`${userId}:${rotationIdAt(NOW)}`);

/** Every template id the store holds for a user, revealed or not. */
function allTemplateIds(repo, userId) {
  return storeOf(repo, userId).slots.flatMap((s) => s.templateIds);
}

/**
 * Fails unless the JSON a browser would get names exactly the cards the user
 * has revealed: every hidden position is null, and no template id appears
 * beyond the revealed ones. `extra` counts a card returned beside the view.
 *
 * Season 0 has only 8 templates, so a hidden card often shares its id with a
 * revealed one; the check is by position and count, not by id.
 */
function assertOnlyRevealed(response, store, extra = 0) {
  const json = JSON.stringify(response);
  const shown = store.slots.filter((s) => !s.soldOut).reduce((n, s) => n + s.revealed.filter(Boolean).length, 0);
  assert.equal(json.split('"templateId"').length - 1, shown + extra, `unexpected cards in ${json}`);
  const view = response.view ?? response;
  for (const s of store.slots) {
    const v = view.slots.find((x) => x.slot === s.slot);
    if (s.soldOut) {
      assert.deepEqual(v.cards, []);
      continue;
    }
    s.revealed.forEach((r, i) => {
      if (!r) assert.equal(v.cards[i], null, `slot ${s.slot} card ${i} is hidden`);
    });
  }
}

// ── The rotation clock ──────────────────────────────────────────────────

test("rotations are 6 hours long and start at UTC 00, 06, 12 and 18", () => {
  for (const hour of [0, 6, 12, 18]) {
    const t = Date.UTC(2026, 9, 15, hour) / 1000;
    assert.equal(rotationWindow(rotationIdAt(t)).startsAt, t);
    assert.equal(rotationIdAt(t - 1), rotationIdAt(t) - 1);
  }
  const w = rotationWindow(rotationIdAt(NOW));
  assert.equal(w.endsAt - w.startsAt, ROTATION_SECONDS);
  assert.equal(w.revealAfter, w.endsAt + 24 * 3600);
  assert.equal(secondsLeft(NOW), 5 * 3600);
});

// ── Starting a rotation ─────────────────────────────────────────────────

test("the first visit starts the rotation: stored, committed, seed requested", async () => {
  const { repo, chain, deps } = setup();
  const result = await getStore(deps, ALICE, plain);
  const id = rotationIdAt(NOW);
  assert.equal(result.status, "preparing");
  assert.equal(result.rotationId, id);

  const r = repo.rotations.get(id);
  assert.ok(r.secretEncrypted.startsWith("enc:"), "the secret is stored encrypted");
  assert.ok(!JSON.stringify(r).includes(deps.decrypt(r.secretEncrypted)), "the plain secret is not stored");
  assert.equal(r.commitTx, `0xcommit${id}`);
  assert.equal(r.entropyTx, `0xentropy${id}`);
  const w = rotationWindow(id);
  assert.deepEqual(chain.calls[0], ["commit", id, r.secretHash, w.endsAt, w.revealAfter]);
  assert.deepEqual(chain.calls[1], ["entropy", id]);
});

test("a second visit does not commit again, and the store opens once the seed arrives", async () => {
  const { chain, deps } = setup();
  await getStore(deps, ALICE, plain);
  assert.equal((await getStore(deps, BOB, plain)).status, "preparing");
  assert.equal(chain.calls.filter((c) => c[0] === "commit").length, 1);

  chain.deliver(rotationIdAt(NOW));
  const result = await getStore(deps, ALICE, plain);
  assert.equal(result.status, "ready");
  assert.equal(result.view.slots.length, 3);
  assert.equal(chain.calls.filter((c) => c[0] === "commit").length, 1);
});

test("a commit that failed is retried on the next visit", async () => {
  const { repo, chain, deps } = setup();
  const realCommit = chain.commitRotation;
  chain.commitRotation = async () => {
    throw new Error("rpc down");
  };
  await assert.rejects(getStore(deps, ALICE, plain), /rpc down/);
  const id = rotationIdAt(NOW);
  const stored = repo.rotations.get(id);
  assert.ok(stored && !stored.commitTx, "the rotation is stored, the commit is not");

  chain.commitRotation = realCommit;
  await getStore(deps, ALICE, plain);
  assert.equal(repo.rotations.get(id).secretHash, stored.secretHash, "the same secret, not a new one");
  assert.equal(repo.rotations.get(id).commitTx, `0xcommit${id}`);
});

test("the limited chance is fixed when the rotation starts", async () => {
  let remaining = 5;
  const { repo, deps } = setup({ limitedRemaining: async () => remaining });
  await ensureRotation(deps, NOW);
  const id = rotationIdAt(NOW);
  const expected = limitedChancePpm({ storeRemaining: 5, daysLeft: 90, expectedEligibleCardsPerRotation: 1500 });
  assert.equal(repo.rotations.get(id).limitedChancePpm, expected);
  remaining = 0;
  await ensureRotation(deps, NOW + 60);
  assert.equal(repo.rotations.get(id).limitedChancePpm, expected);
  assert.equal(repo.rotations.get(id).limitedInRefills, true);
});

test("limitedChancePpm spreads the store share over the days left", () => {
  // Season 0: 5 cards over 90 days is 5/360 a rotation. Over 300 eligible cards
  // that is 46 per million; basis points rounded it to zero (chain-v2.ts PPM).
  assert.equal(limitedChancePpm({ storeRemaining: 5, daysLeft: 90, expectedEligibleCardsPerRotation: 300 }), 46);
  assert.equal(limitedChancePpm({ storeRemaining: 400, daysLeft: 10, expectedEligibleCardsPerRotation: 100 }), 100_000);
  assert.equal(limitedChancePpm({ storeRemaining: 400, daysLeft: 1, expectedEligibleCardsPerRotation: 10 }), 1_000_000);
  assert.equal(limitedChancePpm({ storeRemaining: 0, daysLeft: 10, expectedEligibleCardsPerRotation: 100 }), 0);
  assert.equal(limitedChancePpm({ storeRemaining: 10, daysLeft: 0, expectedEligibleCardsPerRotation: 100 }), 0);
});

test("secrets are revealed once their reveal time passes, and only then", async () => {
  const { repo, chain, deps } = await readyStore();
  const id = rotationIdAt(NOW);
  const { revealAfter } = rotationWindow(id);
  assert.deepEqual(await revealDue(deps, revealAfter - 1), []);
  assert.deepEqual(await revealDue(deps, revealAfter), [id]);
  const r = repo.rotations.get(id);
  assert.equal(r.revealTx, `0xreveal${id}`);
  assert.equal(r.revealedSecret, deps.decrypt(r.secretEncrypted));
  assert.deepEqual(chain.calls.at(-1), ["reveal", id, r.revealedSecret]);
  assert.deepEqual(await revealDue(deps, revealAfter + 60), [], "not twice");
});

test("a failing reveal does not take the store down", async () => {
  const { chain, deps } = await readyStore();
  chain.revealRotation = async () => {
    throw new Error("rpc down");
  };
  const later = rotationWindow(rotationIdAt(NOW)).revealAfter + 60;
  chain.deliver(rotationIdAt(later));
  const result = await getStore(deps, ALICE, { ...plain, nowSeconds: later });
  assert.equal(result.status, "ready");
});

// ── What the browser sees ───────────────────────────────────────────────

test("a new store shows no card, no price and no shelf price", async () => {
  const { repo, deps } = await readyStore();
  const result = await getStore(deps, ALICE, plain);
  for (const s of result.view.slots) {
    assert.deepEqual(s.cards, [null, null, null, null, null]);
    assert.equal(s.revealedCount, 0);
    assert.equal(s.priceCredits, undefined);
    assert.equal(s.dismantleCrystal, undefined);
    assert.equal(s.highRarity, undefined);
    assert.equal(s.replacementsLeft, MAX_REFILLS_PER_SLOT);
  }
  assert.deepEqual(result.view.shelf, { discountApplies: false });
  assertOnlyRevealed(result, storeOf(repo, ALICE.userId));
});

test("revealing a card returns that card and no other", async () => {
  const { repo, deps } = await readyStore();
  await getStore(deps, ALICE, plain);
  const result = await revealCard(deps, ALICE, 1, 3, plain);
  const store = repo.stores.get(`${ALICE.userId}:${rotationIdAt(NOW)}`);
  assert.equal(result.card.templateId, store.slots[1].templateIds[3]);
  assert.deepEqual(
    result.view.slots[1].cards.map((c) => c !== null),
    [false, false, false, true, false],
  );
  assertOnlyRevealed(result, storeOf(repo, ALICE.userId), 1);
});

test("revealing is idempotent and survives a reload", async () => {
  const { deps } = await readyStore();
  const a = await revealCard(deps, ALICE, 0, 0, plain);
  const b = await revealCard(deps, ALICE, 0, 0, plain);
  assert.deepEqual(a.card, b.card);
  const reloaded = await getStore(deps, ALICE, plain);
  assert.deepEqual(reloaded.view.slots[0].cards[0], a.card);
  assert.equal(reloaded.view.slots[0].revealedCount, 1);
});

test("a pack's price appears only once all five cards are revealed", async () => {
  const { repo, deps } = await readyStore();
  let view;
  for (let c = 0; c < 4; c++) {
    view = (await revealCard(deps, ALICE, 2, c, plain)).view;
    assert.equal(view.slots[2].priceCredits, undefined, `no price after ${c + 1} cards`);
    assert.equal(view.slots[2].dismantleCrystal, undefined);
  }
  view = (await revealCard(deps, ALICE, 2, 4, plain)).view;
  const ids = repo.stores.get(`${ALICE.userId}:${rotationIdAt(NOW)}`).slots[2].templateIds;
  assert.equal(view.slots[2].priceCredits, packPrice(SEASON_0, ids));
  assert.ok(view.slots[2].dismantleCrystal > 0);
  assert.equal(view.shelf.priceCredits, undefined, "the shelf still has hidden packs");
});

test("the shelf price and the discount appear once the whole shelf is revealed", async () => {
  const { repo, deps } = await readyStore();
  let view;
  for (let s = 0; s < 3; s++) for (let c = 0; c < 5; c++) view = (await revealCard(deps, ALICE, s, c, plain)).view;
  const total = repo.stores
    .get(`${ALICE.userId}:${rotationIdAt(NOW)}`)
    .slots.reduce((sum, s) => sum + packPrice(SEASON_0, s.templateIds), 0);
  assert.equal(view.shelf.priceCredits, total);
  assert.equal(view.shelf.discountApplies, true);
  assert.equal(view.shelf.discountedPriceCredits, discounted(total));
  assert.equal(discounted(1000), 850);
});

test("the discount is for the first full shelf only", async () => {
  const { repo, deps } = await readyStore();
  for (let s = 0; s < 3; s++) for (let c = 0; c < 5; c++) await revealCard(deps, ALICE, s, c, plain);
  const store = structuredClone(repo.stores.get(`${ALICE.userId}:${rotationIdAt(NOW)}`));

  const bought = storeView({ ...store, anyPurchase: true }, SEASON_0, plain);
  assert.equal(bought.shelf.discountApplies, false);
  assert.equal(bought.shelf.discountedPriceCredits, undefined);
  assert.ok(bought.shelf.priceCredits > 0);

  const refilled = structuredClone(store);
  refilled.slots[0].depth = 1;
  assert.equal(storeView(refilled, SEASON_0, plain).shelf.discountApplies, false);
});

test("Detection marks a hidden pack holding Epic or better, and gives nothing else away", async () => {
  const { repo, deps } = await readyStore();
  const detect = { ...plain, detection: true };
  const result = await getStore(deps, ALICE, detect);
  const slots = repo.stores.get(`${ALICE.userId}:${rotationIdAt(NOW)}`).slots;
  for (const [i, s] of result.view.slots.entries()) {
    const high = slots[i].templateIds.some((id) => SEASON_0.templates.find((t) => t.templateId === id)?.rarity >= 2 || id === 201);
    assert.equal(s.highRarity, high);
    assert.equal(s.priceCredits, undefined);
  }
  assertOnlyRevealed(result, storeOf(repo, ALICE.userId));
  assert.equal((await getStore(deps, ALICE, plain)).view.slots[0].highRarity, undefined, "not without Detection");

  for (let c = 0; c < 5; c++) await revealCard(deps, ALICE, 0, c, detect);
  assert.equal((await getStore(deps, ALICE, detect)).view.slots[0].highRarity, undefined, "not once revealed");
});

test("a sold-out slot shows nothing and offers no more replacements", async () => {
  const { repo, deps } = await readyStore();
  await getStore(deps, ALICE, plain);
  const store = structuredClone(repo.stores.get(`${ALICE.userId}:${rotationIdAt(NOW)}`));
  store.slots[0] = { ...store.slots[0], depth: MAX_REFILLS_PER_SLOT, soldOut: true };
  const view = storeView(store, SEASON_0, plain);
  assert.deepEqual(view.slots[0].cards, []);
  assert.equal(view.slots[0].replacementsLeft, 0);
  assertOnlyRevealed(view, store);
});

test("revealing rejects slots and cards that are not there", async () => {
  const { deps } = await readyStore();
  await assert.rejects(revealCard(deps, ALICE, 3, 0, plain), RevealError, "slot 3 needs Expansion");
  await assert.rejects(revealCard(deps, ALICE, 0, 5, plain), RevealError);
  await assert.rejects(revealCard(deps, ALICE, 0, -1, plain), RevealError);
  await assert.rejects(revealCard(deps, ALICE, 0, 1.5, plain), RevealError);
});

test("revealing before the seed arrives is refused", async () => {
  const { deps } = setup();
  await assert.rejects(revealCard(deps, ALICE, 0, 0, plain), RevealError);
});

// ── Stores per user ─────────────────────────────────────────────────────

test("each user has their own store, fixed for the rotation", async () => {
  const { repo, deps } = await readyStore();
  await getStore(deps, ALICE, plain);
  await getStore(deps, BOB, plain);
  const a = allTemplateIds(repo, ALICE.userId);
  assert.notDeepEqual(a, allTemplateIds(repo, BOB.userId));
  await getStore(deps, ALICE, { ...plain, nowSeconds: NOW + 3600 });
  assert.deepEqual(allTemplateIds(repo, ALICE.userId), a, "the same store an hour later");
});

test("Expansion bought mid-rotation adds two slots and keeps the first three", async () => {
  const { repo, deps } = await readyStore();
  await revealCard(deps, ALICE, 0, 0, plain);
  const before = allTemplateIds(repo, ALICE.userId);
  const result = await getStore(deps, ALICE, { ...plain, expansion: true });
  assert.equal(result.view.slots.length, 5);
  assert.deepEqual(allTemplateIds(repo, ALICE.userId).slice(0, 15), before);
  assert.notEqual(result.view.slots[0].cards[0], null, "a revealed card stays revealed");
  assertOnlyRevealed(result, storeOf(repo, ALICE.userId));
});

test("the limited card never appears in an Expansion slot", async () => {
  // Every eligible card becomes the limited card, so only placement rules decide.
  const { repo, deps } = await readyStore({ limitedRemaining: async () => 1e9 });
  await getStore(deps, ALICE, { ...plain, expansion: true });
  const slots = repo.stores.get(`${ALICE.userId}:${rotationIdAt(NOW)}`).slots;
  for (const s of slots.slice(0, 3)) assert.ok(s.templateIds.every((id) => id === 201));
  for (const s of slots.slice(3)) assert.ok(s.templateIds.every((id) => id !== 201));
});

// ── Season 0 against the contracts' deploy file ─────────────────────────

test("SEASON_0 matches contracts/script/v2/season0.json", () => {
  const json = JSON.parse(readFileSync(new URL("../../contracts/script/v2/season0.json", import.meta.url), "utf8"));
  assert.equal(SEASON_0.seriesId, json.seriesId);
  assert.equal(SEASON_0.seriesName, json.seriesName);
  assert.equal(SEASON_0.seasonId, json.seasonId);
  assert.deepEqual(
    Object.fromEntries(SEASON_0.templates.map((t) => [t.v1Name, t.templateId])),
    json.templateMap,
  );
  assert.deepEqual(
    json.albumSlots.map((id) => SEASON_0.templates.find((t) => t.templateId === id).rarity),
    json.rarities,
  );
  for (const key of Object.keys(json.limited)) assert.equal(SEASON_0.limited[key], json.limited[key], `limited.${key}`);
  assert.equal(SEASON_0.completionTemplateId, json.completion.templateId);
  assert.equal(templatesByRarity(SEASON_0).flat().length, json.albumSlots.length);
  assert.equal(CARD_PRICE_CREDITS.length, 4);
});
