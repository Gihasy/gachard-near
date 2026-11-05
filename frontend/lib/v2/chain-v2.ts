/**
 * Off-chain half of the v2 contracts (ADR-040, docs/CONTRACT-V2-SPEC.md).
 *
 * Everything the backend computes that a v2 contract later checks lives here:
 * - EIP-712 domains and types for the signed actions;
 * - v2 redeem codes and their print commitments;
 * - rotation secrets and the store derivation;
 * - purchase ids and nonces;
 * - the migration Merkle tree.
 *
 * Nothing here is wired into a route yet; the deployed contracts are still v1.
 *
 * Kept to one file that imports only `ethers`, so the cross-language test
 * (`scripts/v2-vectors.mjs`) can load it with Node's type stripping, and the
 * Solidity suite (`contracts/test/v2/V2Vectors.t.sol`) can check its output
 * against the real contracts. That test exists because of v1's redeem hash:
 * commented as keccak256, computed with sha3-256, and never caught because
 * nothing compared the two sides.
 */
import {
  AbiCoder,
  concat,
  getBytes,
  hexlify,
  keccak256,
  randomBytes,
  toUtf8Bytes,
  type Signer,
  type TypedDataDomain,
  type TypedDataField,
} from "ethers";

const abi = AbiCoder.defaultAbiCoder();

// ═══ EIP-712 ═════════════════════════════════════════════════════════════

export const V2_DOMAIN_NAMES = {
  cards: "GachardCards",
  store: "GachardStore",
  albums: "GachardAlbums",
} as const;

export type V2Contract = keyof typeof V2_DOMAIN_NAMES;

export function v2Domain(contract: V2Contract, chainId: bigint | number, verifyingContract: string): TypedDataDomain {
  return { name: V2_DOMAIN_NAMES[contract], version: "1", chainId, verifyingContract };
}

/** Must match the *_TYPEHASH strings in contracts/src/v2 exactly. */
export const V2_TYPES = {
  TransferBatch: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "ids", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  BurnBatch: [
    { name: "holder", type: "address" },
    { name: "ids", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  PrintRequest: [
    { name: "holder", type: "address" },
    { name: "id", type: "uint256" },
    { name: "commit", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  PrintCancel: [
    { name: "holder", type: "address" },
    { name: "id", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Purchase: [
    { name: "purchaseId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "rotationId", type: "uint256" },
    { name: "templateIds", type: "uint32[]" },
    { name: "deadline", type: "uint256" },
  ],
  AlbumPlace: [
    { name: "holder", type: "address" },
    { name: "seasonId", type: "uint256" },
    { name: "ids", type: "uint256[]" },
    { name: "slots", type: "uint16[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Wish: [
    { name: "holder", type: "address" },
    { name: "seasonId", type: "uint256" },
    { name: "slot", type: "uint16" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  RewardClaim: [
    { name: "holder", type: "address" },
    { name: "seasonId", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} satisfies Record<string, TypedDataField[]>;

export type V2PrimaryType = keyof typeof V2_TYPES;

/** The contracts refuse a deadline more than an hour ahead (MAX_SIGNATURE_TTL). */
export const MAX_SIGNATURE_TTL_SECONDS = 3600;

/**
 * Sign a v2 action.
 * - Custodial users: the backend signs with the custodial key (ADR-020), so the
 *   user signs nothing.
 * - Self-custody users: this runs in Privy.
 */
export function signV2(
  signer: Signer,
  domain: TypedDataDomain,
  primaryType: V2PrimaryType,
  value: Record<string, unknown>,
): Promise<string> {
  return signer.signTypedData(domain, { [primaryType]: V2_TYPES[primaryType] }, value);
}

/** Unordered nonce: random 256 bits, so parallel requests never collide (ADR-018). */
export function newNonce(): bigint {
  return BigInt(hexlify(randomBytes(32)));
}

export function deadlineIn(seconds: number, nowSeconds = Math.floor(Date.now() / 1000)): bigint {
  if (seconds <= 0 || seconds > MAX_SIGNATURE_TTL_SECONDS) {
    throw new Error(`deadline must be 1–${MAX_SIGNATURE_TTL_SECONDS} s ahead`);
  }
  return BigInt(nowSeconds + seconds);
}

/** Idempotency key for GachardStore.purchase: a retry with the same id reverts instead of minting twice. */
export function newPurchaseId(): string {
  return hexlify(randomBytes(32));
}

// ═══ Redeem codes (v2) ═══════════════════════════════════════════════════

/** Crockford base32: upper case, no I, L, O or U, so a scratch panel reads cleanly (decision D4). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REDEEM_CODE_LENGTH = 16; // 80 bits

/** 16 Crockford characters from 10 random bytes. */
export function generateRedeemCodeV2(): string {
  return encodeCrockford(randomBytes(10));
}

export function encodeCrockford(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The one canonical form of a code. It is what is committed and what is
 * redeemed, so a user typing "k7q2-9xmp…" or "O" for "0" still matches.
 */
export function normalizeRedeemCode(input: string): string {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (code.length !== REDEEM_CODE_LENGTH || [...code].some((c) => !CROCKFORD.includes(c))) {
    throw new Error("Invalid redeem code");
  }
  return code;
}

/** "K7Q29XMP4RTWH8NC" → "K7Q2-9XMP-4RTW-H8NC", as printed. */
export function formatRedeemCode(code: string): string {
  return normalizeRedeemCode(code).match(/.{4}/g)!.join("-");
}

/** The bytes passed to GachardCards.redeem(tokenId, code, recipient). */
export function redeemCodeBytes(code: string): string {
  return hexlify(toUtf8Bytes(normalizeRedeemCode(code)));
}

/**
 * keccak256(abi.encode(tokenId, printCycle, bytes(code))), as GachardCards checks it.
 * `printCycle` is the cycle the request creates: the card's current cycle + 1.
 * keccak256 from ethers, never Node's "sha3-256" (ADR-040).
 */
export function printCommit(tokenId: bigint, printCycle: number, code: string): string {
  return printCommitForBytes(tokenId, printCycle, redeemCodeBytes(code));
}

/** The same commitment over raw code bytes. */
export function printCommitForBytes(tokenId: bigint, printCycle: number, codeBytes: string): string {
  return keccak256(abi.encode(["uint256", "uint32", "bytes"], [tokenId, printCycle, codeBytes]));
}

/**
 * A code printed under v1: 16 base64url characters from randomBytes(12)
 * (lib/redeem-code.ts), kept AES-encrypted in `redeem_codes`. It is
 * case-sensitive and may contain "-" and "_", so it is used byte for byte,
 * never normalised: normalising would strip a "-" that is part of the code.
 * The card's own record says which kind of code it carries (spec §17).
 */
export function legacyRedeemCodeBytes(code: string): string {
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) throw new Error("Invalid v1 redeem code");
  return hexlify(toUtf8Bytes(code));
}

// ═══ Store rotations (docs/CONTRACT-V2-SPEC.md §7) ═══════════════════════

/** A fresh server secret for one rotation. Kept secret until the rotation's reveal. */
export function newRotationSecret(): string {
  return hexlify(randomBytes(32));
}

/** What GachardStore.commitRotation stores: keccak256(abi.encode(secret)). */
export function rotationSecretHash(secret: string): string {
  return keccak256(abi.encode(["bytes32"], [secret]));
}

/**
 * The i-th random number of one holder's store in one rotation. Counter-mode
 * keccak over (seed, secret, holder, rotationId, i): anyone can recompute it
 * once the secret is revealed, and nobody can before.
 */
export function storeRandom(seed: string, secret: string, holder: string, rotationId: bigint, index: number): bigint {
  return BigInt(
    keccak256(
      abi.encode(["bytes32", "bytes32", "address", "uint256", "uint256"], [seed, secret, holder, rotationId, index]),
    ),
  );
}

/** Index into `weights` chosen by `rand`. Weights are integers, for example odds in basis points. */
export function pickWeighted(rand: bigint, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error("weights must sum above zero");
  let r = Number(rand % BigInt(total));
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  throw new Error("unreachable");
}

/** Slots 0–2 are the base shelf; slots 3–4 exist only with Expansion. */
export const BASE_SLOTS = 3;
export const EXPANSION_SLOTS = 2;
/** A slot shows its opening pack plus at most this many replacements per rotation (ADR-038 amendment, 15 October 2026). */
export const MAX_REFILLS_PER_SLOT = 2;
/**
 * The unit of a limited card's chance: parts per million. Basis points were
 * too coarse: a store share of 5 cards over 90 days is under one basis point
 * per card, which rounds to zero and would hold every limited card back to the
 * last days of the season.
 */
export const PPM = 1_000_000n;

export interface LimitedOffer {
  templateId: number;
  /** Chance per card in parts per million, from the server's daily pacing of the store share (store-catalog.ts). */
  chancePpm: number;
  /** The season setting `limitedInRefills` (ADR-038 amendment, 15 October 2026). */
  inRefills: boolean;
}

export interface StoreDerivation {
  seed: string; // from Pyth, GachardStore.rotation(r).seed
  secret: string; // this rotation's server secret
  holder: string; // the holder's address
  rotationId: bigint;
  cardsPerPack: number; // 5
  rarityWeights: readonly number[]; // e.g. [7000, 2000, 800, 200] for 70/20/8/2
  templatesByRarity: readonly (readonly number[])[]; // template ids per rarity
  limited?: LimitedOffer;
}

/** Card c of the pack at (slot, depth). A fixed layout, so every verifier reads the same randomness. */
function cardIndex(slot: number, depth: number, c: number, cardsPerPack: number): number {
  return (slot * (MAX_REFILLS_PER_SLOT + 1) + depth) * cardsPerPack + c;
}

/**
 * One pack of a slot's queue. Depth 0 is the opening pack; depths 1 and 2 are
 * the replacements that appear as packs are bought. The whole queue is fixed
 * when the rotation starts, so buying uncovers a pack but draws nothing.
 *
 * Card k (cardIndex) uses three random numbers:
 * - 3k picks its rarity;
 * - 3k + 1 picks a template of that rarity;
 * - 3k + 2 decides whether it is the season's limited card instead.
 *
 * A limited card can appear only in a base slot, never in an Expansion slot
 * (ADR-038). In a replacement pack it appears only when the season allows it
 * (`inRefills`). The function is pure, so a published copy verifies any store
 * after the reveal.
 */
export function derivePack(d: StoreDerivation, slot: number, depth: number): number[] {
  if (!Number.isInteger(slot) || slot < 0 || slot >= BASE_SLOTS + EXPANSION_SLOTS) throw new Error(`no slot ${slot}`);
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_REFILLS_PER_SLOT) throw new Error(`no depth ${depth}`);
  const limited = d.limited;
  const limitedHere =
    limited !== undefined && limited.chancePpm > 0 && slot < BASE_SLOTS && (depth === 0 || limited.inRefills);

  const pack: number[] = [];
  for (let c = 0; c < d.cardsPerPack; c++) {
    const k = cardIndex(slot, depth, c, d.cardsPerPack);
    if (limitedHere && storeRandom(d.seed, d.secret, d.holder, d.rotationId, 3 * k + 2) % PPM < BigInt(limited.chancePpm)) {
      pack.push(limited.templateId);
      continue;
    }
    const rarity = pickWeighted(storeRandom(d.seed, d.secret, d.holder, d.rotationId, 3 * k), d.rarityWeights);
    const pool = d.templatesByRarity[rarity];
    if (!pool || pool.length === 0) throw new Error(`no templates for rarity ${rarity}`);
    const pick = storeRandom(d.seed, d.secret, d.holder, d.rotationId, 3 * k + 1) % BigInt(pool.length);
    pack.push(pool[Number(pick)]);
  }
  return pack;
}

/** The opening shelf: the first pack of each slot. 3 slots, or 5 with Expansion. */
export function deriveStore(d: StoreDerivation, slots: number = BASE_SLOTS): number[][] {
  return Array.from({ length: slots }, (_, slot) => derivePack(d, slot, 0));
}

// ═══ Migration Merkle tree (MigrationMinter) ═════════════════════════════

export interface MigrationEntry {
  v1TokenId: bigint;
  holder: string;
  templateId: number;
  kind: 0 | 1; // 0 Digital, 1 printed on v1 (migrates after its v1 redeem)
}

/** OpenZeppelin StandardMerkleTree leaf: keccak256(bytes.concat(keccak256(abi.encode(...)))). */
export function migrationLeaf(e: MigrationEntry): string {
  return keccak256(
    concat([
      keccak256(abi.encode(["uint256", "address", "uint32", "uint8"], [e.v1TokenId, e.holder, e.templateId, e.kind])),
    ]),
  );
}

function hashPair(a: string, b: string): string {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

/**
 * Root and one proof per leaf, with sorted-pair hashing as OpenZeppelin's
 * MerkleProof expects. An odd node at the end of a layer is carried up
 * unchanged, so its proof simply skips that layer.
 */
export function buildMerkle(leaves: readonly string[]): { root: string; proofs: string[][] } {
  if (leaves.length === 0) throw new Error("no leaves");
  const proofs: string[][] = leaves.map(() => []);
  let layer = leaves.map((leaf, i) => ({ hash: leaf, members: [i] }));
  while (layer.length > 1) {
    const next: { hash: string; members: number[] }[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1];
      if (!right) {
        next.push(left);
        continue;
      }
      for (const m of left.members) proofs[m].push(right.hash);
      for (const m of right.members) proofs[m].push(left.hash);
      next.push({ hash: hashPair(left.hash, right.hash), members: [...left.members, ...right.members] });
    }
    layer = next;
  }
  return { root: layer[0].hash, proofs };
}

/** Checks a proof the way MerkleProof.verify does. */
export function verifyMerkle(proof: readonly string[], root: string, leaf: string): boolean {
  return proof.reduce((acc, sibling) => hashPair(acc, sibling), leaf) === root;
}

/** Bytes helper for callers that hold a code as a string. */
export function codeToBytes(code: string): Uint8Array {
  return getBytes(redeemCodeBytes(code));
}
