/**
 * Integration test: the v2 backend modules against the real contracts on a
 * local anvil chain (docs/PLAN-STORE-V2.md phase 0).
 *
 *   cd frontend && node --test scripts/v2-local.test.mjs
 *
 * Needs anvil and forge on PATH (Foundry). Starts its own anvil on port 8548,
 * deploys with contracts/script/v2/LocalDevV2.s.sol, and stops anvil at the end.
 * Uses only anvil's public development keys.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, Fragment, Interface, JsonRpcProvider, Wallet } from "ethers";
import {
  ALBUMS_ABI,
  CARDS_ABI,
  STORE_ABI,
  V2Error,
  V2Relayer,
  isAlreadyDone,
} from "../lib/v2/relayer.ts";
import { custodialSigner } from "../lib/v2/custodial.ts";
import { SEASON_0 } from "../lib/v2/store-catalog.ts";
import { relayerStoreChain } from "../lib/v2/store-chain.ts";
import { MemoryStoreRepo } from "../lib/v2/store-repo-memory.ts";
import { getStore, revealDue } from "../lib/v2/store-service.ts";
import { rotationIdAt, rotationWindow } from "../lib/v2/rotation-clock.ts";
import { newNonce, newPurchaseId, newRotationSecret, rotationSecretHash, signV2, v2Domain } from "../lib/v2/chain-v2.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CONTRACTS = resolve(here, "../../contracts");
const PORT = 8548;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 31337;
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RELAYER_KEYS = [
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // anvil 3
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // anvil 4
];

let anvil;
let provider;
let addresses;
let relayer;

/** A custodial user as MongoDB stores it, with a stub cipher standing in for lib/crypto.ts. */
function custodialUser() {
  const wallet = Wallet.createRandom();
  return { walletAddress: wallet.address, walletPrivateKey: "enc:" + wallet.privateKey };
}
const decrypt = (packed) => packed.replace(/^enc:/, "");

async function chainNow() {
  return (await provider.getBlock("latest")).timestamp;
}

before(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
  provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  for (let i = 0; i < 60; i++) {
    try {
      await provider.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  execFileSync("forge", ["script", "script/v2/LocalDevV2.s.sol", "--rpc-url", RPC, "--broadcast"], {
    cwd: CONTRACTS,
    env: { ...process.env, FOUNDRY_PROFILE: "v2" },
    stdio: "ignore",
  });
  addresses = JSON.parse(readFileSync(resolve(CONTRACTS, "deployments/local-v2.json"), "utf8"));
  relayer = new V2Relayer(
    { rpcUrl: RPC, cards: addresses.cards, store: addresses.store, albums: addresses.albums, relayerKeys: RELAYER_KEYS },
    provider,
  );
});

after(() => {
  anvil?.kill();
});

test("relayer ABI fragments match the compiled contracts", () => {
  const artifact = (name) =>
    new Interface(JSON.parse(readFileSync(resolve(CONTRACTS, `out/${name}.sol/${name}.json`), "utf8")).abi);
  for (const [abi, name] of [
    [CARDS_ABI, "GachardCards"],
    [STORE_ABI, "GachardStore"],
    [ALBUMS_ABI, "GachardAlbums"],
  ]) {
    const compiled = artifact(name);
    for (const line of abi) {
      const fragment = Fragment.from(line);
      if (fragment.type === "function") {
        const real = compiled.getFunction(fragment.selector);
        assert.ok(real, `${name}: no function ${fragment.format("sighash")}`);
        assert.deepEqual(
          real.outputs.map((o) => o.format("sighash")),
          fragment.outputs.map((o) => o.format("sighash")),
          `${name}: outputs of ${fragment.name} differ`,
        );
      } else if (fragment.type === "event") {
        assert.ok(compiled.getEvent(fragment.topicHash), `${name}: no event ${fragment.format("sighash")}`);
      } else if (fragment.type === "error") {
        assert.ok(compiled.getError(fragment.selector), `${name}: no error ${fragment.format("sighash")}`);
      }
    }
  }
});

let rotationId;
let buyer;

test("a rotation commits, gets its seed, and sells a pack", async () => {
  const now = await chainNow();
  rotationId = Math.floor(now / 21600);
  const secret = newRotationSecret();
  await relayer.sendAndWait("store", "commitRotation", [rotationId, rotationSecretHash(secret), now + 6 * 3600, now + 30 * 3600]);
  const { events } = await relayer.sendAndWait("store", "requestRotationEntropy", [rotationId]);
  const sequence = events.find((e) => e.name === "RotationEntropyRequested").args.sequence;

  const deployer = new Wallet(DEPLOYER_KEY, provider);
  const entropy = new Contract(addresses.entropy, ["function mockReveal(address provider, uint64 sequenceNumber, bytes32 randomNumber)"], deployer);
  await (await entropy.mockReveal(deployer.address, sequence, "0x" + "5e".repeat(32))).wait();

  buyer = custodialUser();
  const purchaseId = newPurchaseId();
  const bought = await relayer.sendAndWait("store", "purchase", [purchaseId, buyer.walletAddress, rotationId, [101, 103], 0, "0x"]);
  const first = bought.events.find((e) => e.name === "Purchased").args.firstTokenId;
  assert.equal(await relayer.read("cards", "holderOf", [first]), buyer.walletAddress);
  assert.equal(await relayer.read("cards", "templateOf", [first + 1n]), 103n);

  // The retry an RPC hiccup would cause: it reverts, decoded, and is recognised as done.
  await assert.rejects(
    relayer.send("store", "purchase", [purchaseId, buyer.walletAddress, rotationId, [101, 103], 0, "0x"]),
    (err) => err instanceof V2Error && err.errorName === "PurchaseAlreadyRecorded" && isAlreadyDone(err),
  );
});

test("a custodial holder's signature moves a card; a forged one is refused before gas", async () => {
  const bought = await relayer.sendAndWait("store", "purchase", [newPurchaseId(), buyer.walletAddress, rotationId, [102], 0, "0x"]);
  const id = bought.events.find((e) => e.name === "Purchased").args.firstTokenId;
  const to = Wallet.createRandom().address;
  const deadline = (await chainNow()) + 600;
  const nonce = newNonce();
  const domain = v2Domain("cards", CHAIN_ID, addresses.cards);
  const value = { from: buyer.walletAddress, to, ids: [id], nonce, deadline };

  const forged = await signV2(new Wallet(RELAYER_KEYS[0]), domain, "TransferBatch", value);
  await assert.rejects(
    relayer.send("cards", "transferWithSig", [buyer.walletAddress, to, [id], nonce, deadline, forged]),
    (err) => err instanceof V2Error && err.errorName === "BadSignature",
  );

  const signature = await signV2(custodialSigner(buyer, decrypt), domain, "TransferBatch", value);
  await relayer.sendAndWait("cards", "transferWithSig", [buyer.walletAddress, to, [id], nonce, deadline, signature]);
  assert.equal(await relayer.read("cards", "holderOf", [id]), to);
});

test("a custodial key that does not match the record is refused", () => {
  const user = custodialUser();
  user.walletAddress = Wallet.createRandom().address;
  assert.throws(() => custodialSigner(user, decrypt), /does not match/);
});

test("cards go into the Season 0 album with the holder's signature", async () => {
  await provider.send("evm_increaseTime", [180]); // the season starts two minutes after deploy
  await provider.send("evm_mine", []);
  const first = 1n; // the first purchase minted tokens 1 (template 101) and 2 (template 103)
  assert.equal(await relayer.read("cards", "templateOf", [first]), 101n);

  const deadline = (await chainNow()) + 600;
  const nonce = newNonce();
  const value = { holder: buyer.walletAddress, seasonId: 1, ids: [1n, 2n], slots: [0, 2], nonce, deadline };
  const signature = await signV2(custodialSigner(buyer, decrypt), v2Domain("albums", CHAIN_ID, addresses.albums), "AlbumPlace", value);
  await relayer.sendAndWait("albums", "placeInAlbum", [buyer.walletAddress, 1, [1n, 2n], [0, 2], nonce, deadline, signature]);
  assert.equal(await relayer.read("albums", "filledCount", [1, buyer.walletAddress]), 2n);
  const card = await relayer.read("cards", "cardOf", [1n]);
  assert.equal(card.status, 2n, "AlbumLocked");
});

// ── The store service on the real contracts (phase 1) ───────────────────
// Last in the file: the reveal test moves the chain's clock forward a day.

let storeDeps;
let storeNow;
const STORE_USER = { userId: "u-local", holder: Wallet.createRandom().address };

async function deliverSeed(rotationId) {
  const { sequence } = await relayer.read("store", "rotation", [rotationId]);
  const deployer = new Wallet(DEPLOYER_KEY, provider);
  const entropy = new Contract(addresses.entropy, ["function mockReveal(address provider, uint64 sequenceNumber, bytes32 randomNumber)"], deployer);
  await (await entropy.mockReveal(deployer.address, sequence, "0x" + "7a".repeat(32))).wait();
}

test("the store service starts a rotation on chain and opens once the seed arrives", async () => {
  storeDeps = {
    repo: new MemoryStoreRepo(),
    chain: relayerStoreChain(relayer),
    catalog: SEASON_0,
    encrypt: (s) => "enc:" + s,
    decrypt: (p) => p.slice(4),
    limitedRemaining: async () => Number(await relayer.read("cards", "remaining", [SEASON_0.limited.templateId, 0])),
    async seasonDaysLeft(now) {
      const season = await relayer.read("albums", "season", [SEASON_0.seasonId]);
      assert.equal(season.exists, true);
      return Math.max(0, Math.ceil((Number(season.endsAt) - now) / 86400));
    },
    expectedEligibleCardsPerRotation: 300,
  };
  // A rotation a day ahead, so it cannot meet the one the first test committed.
  storeNow = (await chainNow()) + 86400;
  const id = rotationIdAt(storeNow);

  const first = await getStore(storeDeps, STORE_USER, { nowSeconds: storeNow, expansion: false, detection: false });
  assert.equal(first.status, "preparing");
  const stored = storeDeps.repo.rotations.get(id);
  const onChain = await relayer.read("store", "rotation", [id]);
  assert.equal(onChain.secretHash, stored.secretHash);
  assert.equal(onChain.seedRequested, true);
  assert.equal(Number(onChain.endsAt), rotationWindow(id).endsAt);
  assert.equal(Number(onChain.revealAfter), rotationWindow(id).revealAfter);
  assert.ok(stored.limitedChancePpm > 0, "Season 0's store share paces to a chance above zero");

  await deliverSeed(id);
  const ready = await getStore(storeDeps, STORE_USER, { nowSeconds: storeNow, expansion: false, detection: false });
  assert.equal(ready.status, "ready");
  assert.equal(storeDeps.repo.rotations.get(id).seed, "0x" + "7a".repeat(32));
  assert.equal(ready.view.slots.length, 3);
});

test("a repeated commit or seed request is recognised as done, and a different secret is not", async () => {
  const id = rotationIdAt(storeNow);
  const { secretHash } = storeDeps.repo.rotations.get(id);
  const w = rotationWindow(id);
  assert.equal(await storeDeps.chain.commitRotation(id, secretHash, w.endsAt, w.revealAfter), "already");
  assert.equal(await storeDeps.chain.requestEntropy(id), "already");
  const other = rotationSecretHash(newRotationSecret());
  await assert.rejects(storeDeps.chain.commitRotation(id, other, w.endsAt, w.revealAfter), /different secret/);
});

test("a rotation's secret is published once its reveal time passes", async () => {
  const id = rotationIdAt(storeNow);
  const { revealAfter } = rotationWindow(id);
  assert.deepEqual(await revealDue(storeDeps, revealAfter - 1), [], "not before its time");

  await provider.send("evm_setNextBlockTimestamp", [revealAfter + 1]);
  await provider.send("evm_mine", []);
  assert.deepEqual(await revealDue(storeDeps, revealAfter + 1), [id]);
  const onChain = await relayer.read("store", "rotation", [id]);
  assert.equal(onChain.revealed, true);
  assert.equal(onChain.secret, storeDeps.repo.rotations.get(id).revealedSecret);
  assert.equal(await storeDeps.chain.revealRotation(id, onChain.secret), "already");
});
