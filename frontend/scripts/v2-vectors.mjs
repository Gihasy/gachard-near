/**
 * Cross-language test vectors for the v2 contracts (ADR-040).
 *
 * Runs the real backend code in lib/v2/chain-v2.ts with fixed keys and values,
 * and writes what it produces to contracts/test/v2/vectors/v2-vectors.json.
 * contracts/test/v2/V2Vectors.t.sol then feeds those exact signatures, commits,
 * hashes and proofs to the real contracts. If the two sides ever disagree, as
 * v1's sha3-256 redeem hash silently did with its keccak256 comment, that test
 * fails.
 *
 *   cd frontend && node scripts/v2-vectors.mjs
 *
 * Needs Node 22.18+ (type stripping on by default). Keys here are fixed test
 * keys with no value anywhere.
 */
import { Wallet } from "ethers";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMerkle,
  derivePack,
  deriveStore,
  encodeCrockford,
  formatRedeemCode,
  legacyRedeemCodeBytes,
  migrationLeaf,
  normalizeRedeemCode,
  printCommit,
  printCommitForBytes,
  redeemCodeBytes,
  rotationSecretHash,
  signV2,
  storeRandom,
  v2Domain,
  verifyMerkle,
} from "../lib/v2/chain-v2.ts";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../contracts/test/v2/vectors/v2-vectors.json");

const CHAIN_ID = 10143; // Monad Testnet
const T = 1_760_000_000;
const DEADLINE = T + 600;
const pad = (n) => "0x" + n.toString(16).padStart(64, "0");

// Same keys as contracts/test/v2/V2Base.t.sol.
const alice = new Wallet(pad(0xa1));
const bob = new Wallet(pad(0xb0b));
const attestor = new Wallet(pad(0xa77e57));

const CARDS = "0x00000000000000000000000000000000000C0DE1";
const STORE = "0x00000000000000000000000000000000000C0DE2";
const ALBUMS = "0x00000000000000000000000000000000000C0DE3";
const cards = v2Domain("cards", CHAIN_ID, CARDS);
const store = v2Domain("store", CHAIN_ID, STORE);
const albums = v2Domain("albums", CHAIN_ID, ALBUMS);

// ─── Ledger ───────────────────────────────────────────────────────────────
const transfer = { from: alice.address, to: bob.address, ids: [1], nonce: 11, deadline: DEADLINE };
transfer.signature = await signV2(alice, cards, "TransferBatch", transfer);

const burn = { holder: alice.address, ids: [2], nonce: 12, deadline: DEADLINE };
burn.signature = await signV2(alice, cards, "BurnBatch", burn);

const code = encodeCrockford(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
const typed = formatRedeemCode(code).toLowerCase().replace(/0/g, "o"); // how a person might type it
if (normalizeRedeemCode(typed) !== code) throw new Error("normalisation does not round-trip");
const print = {
  holder: alice.address,
  id: 3,
  printCycle: 1,
  code,
  codeBytes: redeemCodeBytes(typed),
  commit: printCommit(3n, 1, code),
  nonce: 13,
  deadline: DEADLINE,
};
print.signature = await signV2(alice, cards, "PrintRequest", {
  holder: print.holder,
  id: print.id,
  commit: print.commit,
  nonce: print.nonce,
  deadline: print.deadline,
});

// A v1 code, base64url, used byte for byte when a printed v1 card moves to v2.
const legacyCode = "aB3-_xYzQ9kL0p2W";
const legacy = { code: legacyCode, codeBytes: legacyRedeemCodeBytes(legacyCode) };
legacy.commit = printCommitForBytes(3n, 1, legacy.codeBytes);

// ─── Store ────────────────────────────────────────────────────────────────
const rotation = {
  rotationId: 7,
  secret: pad(0x5ec2e7),
  seed: pad(0x5eed),
};
rotation.secretHash = rotationSecretHash(rotation.secret);
rotation.storeRandom0 = pad(storeRandom(rotation.seed, rotation.secret, alice.address, 7n, 0));
const derivation = {
  seed: rotation.seed,
  secret: rotation.secret,
  holder: alice.address,
  rotationId: 7n,
  cardsPerPack: 5,
  rarityWeights: [7000, 2000, 800, 200],
  templatesByRarity: [[101, 102], [103], [103], [103]],
};
rotation.exampleStore = deriveStore(derivation);
// Slot 0's queue: the opening pack, then its two replacements.
rotation.exampleQueue = [0, 1, 2].map((depth) => derivePack(derivation, 0, depth));

const purchase = {
  purchaseId: pad(0x9a1d),
  buyer: alice.address,
  rotationId: 7,
  templateIds: [101, 103],
  deadline: DEADLINE,
};
purchase.attestation = await signV2(attestor, store, "Purchase", purchase);

// ─── Albums ───────────────────────────────────────────────────────────────
const place = { holder: alice.address, seasonId: 1, ids: [6, 7], slots: [0, 1], nonce: 14, deadline: DEADLINE };
place.signature = await signV2(alice, albums, "AlbumPlace", place);

const wish = { holder: alice.address, seasonId: 1, slot: 2, nonce: 15, deadline: DEADLINE };
wish.signature = await signV2(alice, albums, "Wish", wish);
wish.attestation = await signV2(attestor, albums, "Wish", wish);

const reward = { holder: alice.address, seasonId: 1, deadline: DEADLINE };
reward.attestation = await signV2(attestor, albums, "RewardClaim", reward);

// ─── Migration ────────────────────────────────────────────────────────────
const entries = [
  { v1TokenId: 1n, holder: alice.address, templateId: 101, kind: 0 },
  { v1TokenId: 2n, holder: bob.address, templateId: 102, kind: 0 },
  { v1TokenId: 3n, holder: alice.address, templateId: 103, kind: 1 },
  { v1TokenId: 4n, holder: bob.address, templateId: 101, kind: 0 },
  { v1TokenId: 5n, holder: alice.address, templateId: 102, kind: 0 }, // odd count: carried up a layer
];
const leaves = entries.map(migrationLeaf);
const tree = buildMerkle(leaves);
leaves.forEach((leaf, i) => {
  if (!verifyMerkle(tree.proofs[i], tree.root, leaf)) throw new Error(`proof ${i} does not verify in TS`);
});
const merkle = {
  root: tree.root,
  entries: entries.map((e, i) => ({
    v1TokenId: Number(e.v1TokenId),
    holder: e.holder,
    templateId: e.templateId,
    kind: e.kind,
    leaf: leaves[i],
    proof: tree.proofs[i],
  })),
};

const vectors = {
  note: "Generated by frontend/scripts/v2-vectors.mjs from lib/v2/chain-v2.ts. Do not edit by hand.",
  chainId: CHAIN_ID,
  timestamp: T,
  addresses: { cards: CARDS, store: STORE, albums: ALBUMS },
  accounts: { alice: alice.address, bob: bob.address, attestor: attestor.address },
  transfer,
  burn,
  print,
  legacy,
  rotation,
  purchase,
  place,
  wish,
  reward,
  merkle,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(vectors, null, 2) + "\n");
console.log(`wrote ${OUT}`);
