/**
 * Tests for lib/v2/migration-snapshot.ts, with a fake chain and fake cards.
 *
 *   cd frontend && node --test scripts/v2-migration-snapshot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSnapshot } from "../lib/v2/migration-snapshot.ts";
import { buildMerkle, migrationLeaf, verifyMerkle } from "../lib/v2/chain-v2.ts";

const V1 = "0x2a05a2e3b0e7355b97de593e354063e9474c9d08";
const OLD = "0x712b700000000000000000000000000000000000";
const ALICE = "0x00000000000000000000000000000000000a11ce";
const BOB = "0x0000000000000000000000000000000000000b0b";
const PRIVY = "0x0000000000000000000000000000000000009917";
const OUTSIDE = "0x000000000000000000000000000000000000beef";
const MAP = { "common-1": 101, "rare-1": 103 };

/** v1 as the chain would answer: tokenId → { status, holder }. */
function fakeChain(state) {
  return {
    cardStatus: async (id) => state[id.toString()]?.status ?? 0,
    balanceOf: async (holder, id) => (state[id.toString()]?.holder === holder ? 1n : 0n),
  };
}

const card = (over) => ({ cardId: "C" + over.tokenId, templateId: "common-1", contractAddress: V1, ...over });

test("each status goes to the address the chain should show, as the right kind", async () => {
  const cards = [
    card({ tokenId: 1, status: "Digital", ownerAddress: ALICE }),
    card({ tokenId: 2, status: "Exported", ownerAddress: BOB, privyWalletAddress: PRIVY }),
    card({ tokenId: 3, status: "Released", ownerAddress: BOB, releasedTo: OUTSIDE }),
    card({ tokenId: 4, status: "Vaulted", ownerAddress: ALICE, templateId: "rare-1" }),
    card({ tokenId: 5, status: "Real", ownerAddress: BOB }),
  ];
  const chain = fakeChain({
    1: { status: 0, holder: ALICE },
    2: { status: 0, holder: PRIVY },
    3: { status: 0, holder: OUTSIDE },
    4: { status: 1, holder: ALICE },
    5: { status: 1, holder: BOB },
  });
  const plan = await planSnapshot({ cards, chain, templateMap: MAP, v1Contract: V1 });

  assert.equal(plan.excluded.length, 0);
  assert.deepEqual(
    plan.entries.map((e) => [Number(e.v1TokenId), e.holder, e.templateId, e.kind]),
    [
      [1, ALICE, 101, 0],
      [2, PRIVY, 101, 0],
      [3, OUTSIDE, 101, 0],
      [4, ALICE, 103, 1],
      [5, BOB, 101, 1],
    ],
  );
  assert.ok(plan.warnings.some((w) => w.includes("outside Gachard")));
});

test("burned, never minted and other-contract cards are left out with a reason", async () => {
  const cards = [
    card({ tokenId: 1, status: "Burned", ownerAddress: ALICE }),
    card({ tokenId: null, status: "pending", ownerAddress: ALICE }),
    card({ tokenId: 9, status: "Digital", ownerAddress: ALICE, contractAddress: OLD }),
  ];
  const plan = await planSnapshot({ cards, chain: fakeChain({}), templateMap: MAP, v1Contract: V1 });
  assert.equal(plan.entries.length, 0);
  assert.deepEqual(
    plan.excluded.map((x) => x.reason.split(" (")[0]),
    ["burned", "never minted", "belongs to another contract"],
  );
});

test("the chain decides: a holder or status mismatch is left out, not guessed", async () => {
  const cards = [
    card({ tokenId: 1, status: "Digital", ownerAddress: ALICE }), // moved to Bob on chain
    card({ tokenId: 2, status: "Digital", ownerAddress: ALICE }), // vaulted on chain
  ];
  const chain = fakeChain({ 1: { status: 0, holder: BOB }, 2: { status: 1, holder: ALICE } });
  const plan = await planSnapshot({ cards, chain, templateMap: MAP, v1Contract: V1 });
  assert.equal(plan.entries.length, 0);
  assert.match(plan.excluded[0].reason, /does not hold it on chain/);
  assert.match(plan.excluded[1].reason, /chain says Vaulted but the database says Digital/);
});

test("a duplicate tokenId is caught rather than migrated twice", async () => {
  const cards = [
    card({ tokenId: 1, status: "Digital", ownerAddress: ALICE }),
    card({ cardId: "DUP", tokenId: 1, status: "Digital", ownerAddress: ALICE }),
  ];
  const plan = await planSnapshot({
    cards,
    chain: fakeChain({ 1: { status: 0, holder: ALICE } }),
    templateMap: MAP,
    v1Contract: V1,
  });
  assert.equal(plan.entries.length, 1);
  assert.match(plan.excluded[0].reason, /duplicate tokenId/);
});

test("an unmapped template stops the snapshot", async () => {
  const cards = [card({ tokenId: 1, status: "Digital", ownerAddress: ALICE, templateId: "epic-9" })];
  await assert.rejects(
    planSnapshot({ cards, chain: fakeChain({}), templateMap: MAP, v1Contract: V1 }),
    /No v2 template id for: epic-9/,
  );
});

test("listed cards produce a warning", async () => {
  const cards = [card({ tokenId: 1, status: "Digital", ownerAddress: ALICE, isListed: true })];
  const plan = await planSnapshot({
    cards,
    chain: fakeChain({ 1: { status: 0, holder: ALICE } }),
    templateMap: MAP,
    v1Contract: V1,
  });
  assert.match(plan.warnings[0], /Cancel listings/);
});

test("the planned entries build a tree whose every proof verifies", async () => {
  const cards = [1, 2, 3, 4, 5, 6, 7].map((i) => card({ tokenId: i, status: "Digital", ownerAddress: ALICE }));
  const state = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [i, { status: 0, holder: ALICE }]));
  const plan = await planSnapshot({ cards, chain: fakeChain(state), templateMap: MAP, v1Contract: V1 });
  const leaves = plan.entries.map(migrationLeaf);
  const tree = buildMerkle(leaves);
  leaves.forEach((leaf, i) => assert.ok(verifyMerkle(tree.proofs[i], tree.root, leaf)));
});
