/**
 * Fulfill sequence #3851 (seed ready, not yet fulfilled).
 * Run: cd frontend && npx tsx scripts/fulfill-3851.ts
 */

import { ethers } from "ethers";
import { MongoClient, ObjectId } from "mongodb";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const RPC_URL = process.env.RPC_URL!;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;
const ENTROPY_ADDRESS = process.env.ENTROPY_CONTRACT_ADDRESS!.trim();
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!.trim();
const MONGODB_URL = process.env.MONGODB_URL!;
const DATABASE_NAME = process.env.DATABASE_NAME!;

const TX_ID = "6aa2789ecd3cce5810953fb9";
const SEQUENCE_NUMBER = 3851;
const USER_ADDR = "0xA03E99862F1bEeFbb9a52bA2E34303379713edCc";

const PACK_ENTROPY_ABI = [
  "function fulfillPack(uint64 sequenceNumber, address userAddr, uint8[] calldata rarities) external",
  "function requests(uint64) external view returns (address userAddr, uint8 packSize, uint8 guaranteed, bool fulfilled)",
  "function getSeed(uint64 sequenceNumber) external view returns (bytes32)",
  "function getRarityHash(uint64 sequenceNumber) external view returns (bytes32)",
];

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

function xorshift64(state: bigint): bigint {
  state ^= state << 13n; state ^= state >> 7n; state ^= state << 17n;
  return state & 0xFFFFFFFFFFFFFFFFn;
}

function buildPackRaritiesFromSeed(seed: string, packSize: number, guaranteed: number): number[] {
  const seedBytes = ethers.getBytes(seed);
  let state = BigInt(0);
  for (let i = 0; i < 8; i++) state = (state << 8n) | BigInt(seedBytes[i]);
  if (state === 0n) state = 1n;
  const rarities: number[] = [];
  for (let i = 0; i < packSize; i++) {
    state = xorshift64(state);
    const roll = Number(state % 100n);
    let rarity: number;
    if (roll < 60) rarity = 0; else if (roll < 85) rarity = 1; else if (roll < 96) rarity = 2; else rarity = 3;
    rarities.push(rarity);
  }
  const rarePlus = rarities.filter(r => r >= 1).length;
  if (rarePlus < guaranteed) {
    let needed = guaranteed - rarePlus;
    for (let i = 0; i < rarities.length && needed > 0; i++) {
      if (rarities[i] === 0) { rarities[i] = 1; needed--; }
    }
  }
  return rarities;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  const entropyContract = new ethers.Contract(ENTROPY_ADDRESS, PACK_ENTROPY_ABI, wallet);

  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DATABASE_NAME);
  const txCollection = db.collection("transactions");
  const cardsCollection = db.collection("cards");

  console.log("=== Fulfill Sequence #3851 ===\n");

  // Check state
  const tx = await txCollection.findOne({ _id: new ObjectId(TX_ID) });
  console.log(`Status: ${tx?.status}`);
  const reqData = await entropyContract.requests(SEQUENCE_NUMBER);
  console.log(`On-chain: fulfilled=${reqData[3]}, packSize=${reqData[1]}, guaranteed=${reqData[2]}`);

  if (reqData[3]) {
    console.log("Already fulfilled on-chain — skipping.");
    await client.close();
    return;
  }

  const seed = await entropyContract.getSeed(SEQUENCE_NUMBER);
  const rarities = buildPackRaritiesFromSeed(seed, Number(reqData[1]), Number(reqData[2]));
  const rarityNames = ["Common", "Rare", "Epic", "Legendary"];
  console.log(`Rarities: [${rarities.map((r, i) => `${i}:${rarityNames[r]}`).join(", ")}]`);
  console.log(`Rare+: ${rarities.filter(r => r >= 1).length} (guaranteed: ${reqData[2]})`);

  // Fulfill
  const nonce = await provider.getTransactionCount(wallet.address);
  const fulfillTx = await entropyContract.fulfillPack(SEQUENCE_NUMBER, USER_ADDR, rarities, { nonce });
  console.log(`TX: ${fulfillTx.hash}`);
  const receipt = await fulfillTx.wait();
  console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);

  const tokenIds: number[] = [];
  for (const log of receipt.logs) {
    if (log.topics[0] === CARD_MINTED_TOPIC && log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
      tokenIds.push(parseInt(log.topics[1], 16));
    }
  }
  console.log(`Token IDs: [${tokenIds.join(", ")}]`);

  // Update MongoDB
  await txCollection.updateOne(
    { _id: new ObjectId(TX_ID) },
    { $set: { status: "confirmed", entropySeed: seed, txHash: fulfillTx.hash, rarities, tokenIds, updatedAt: new Date().toISOString() } }
  );
  for (let i = 0; i < rarities.length; i++) {
    await cardsCollection.updateOne(
      { txId: TX_ID, pickIndex: i },
      { $set: { rarity: rarities[i], tokenId: tokenIds[i] || null, status: "Digital" } }
    );
  }
  console.log("\nMongoDB updated to confirmed.");

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
