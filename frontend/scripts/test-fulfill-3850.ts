/**
 * Standalone test: fulfill sequence #3850 on Monad testnet.
 *
 * Run: cd frontend && npx tsx scripts/test-fulfill-3850.ts
 */

import { ethers } from "ethers";
import { MongoClient, ObjectId } from "mongodb";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
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

const TX_ID = "6aa27492d6886e488304edde";
const SEQUENCE_NUMBER = 3850;
const USER_ADDR = "0xA03E99862F1bEeFbb9a52bA2E34303379713edCc";

const PACK_ENTROPY_ABI = [
  "function fulfillPack(uint64 sequenceNumber, address userAddr, uint8[] calldata rarities) external",
  "function requests(uint64) external view returns (address userAddr, uint8 packSize, uint8 guaranteed, bool fulfilled)",
  "function getSeed(uint64 sequenceNumber) external view returns (bytes32)",
  "function getRarityHash(uint64 sequenceNumber) external view returns (bytes32)",
  "event PackFulfilled(uint64 indexed sequenceNumber, address indexed userAddr, bytes32 rarityHash)",
];

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

function xorshift64(state: bigint): bigint {
  state ^= state << 13n;
  state ^= state >> 7n;
  state ^= state << 17n;
  return state & 0xFFFFFFFFFFFFFFFFn;
}

function buildPackRaritiesFromSeed(seed: string, packSize: number, guaranteed: number): number[] {
  const seedBytes = ethers.getBytes(seed);
  let state = BigInt(0);
  for (let i = 0; i < 8; i++) {
    state = (state << 8n) | BigInt(seedBytes[i]);
  }
  if (state === 0n) state = 1n;

  const rarities: number[] = [];
  for (let i = 0; i < packSize; i++) {
    state = xorshift64(state);
    const roll = Number(state % 100n);
    let rarity: number;
    if (roll < 60) rarity = 0;
    else if (roll < 85) rarity = 1;
    else if (roll < 96) rarity = 2;
    else rarity = 3;
    rarities.push(rarity);
  }

  const rarePlus = rarities.filter(r => r >= 1).length;
  if (rarePlus < guaranteed) {
    let needed = guaranteed - rarePlus;
    for (let i = 0; i < rarities.length && needed > 0; i++) {
      if (rarities[i] === 0) {
        rarities[i] = 1;
        needed--;
      }
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

  console.log("=== Verifikasi 2: Fulfill Sequence #3850 ===\n");

  // Step 1: MongoDB state
  console.log("--- Step 1: MongoDB state (BEFORE) ---");
  const tx = await txCollection.findOne({ _id: new ObjectId(TX_ID) });
  console.log(`Status: ${tx?.status}`);
  console.log(`EntropySeed: ${tx?.entropySeed || "NULL"}`);
  console.log(`Rarities: ${JSON.stringify(tx?.rarities)}`);

  const cardsBefore = await cardsCollection.find({ txId: TX_ID }).sort({ pickIndex: 1 }).toArray();
  console.log(`Cards (${cardsBefore.length}):`);
  for (const c of cardsBefore) {
    console.log(`  [${c.pickIndex}] cardId=${c.cardId} rarity=${c.rarity} tokenId=${c.tokenId || "NULL"}`);
  }

  // Step 2: On-chain state
  console.log("\n--- Step 2: On-chain state (BEFORE) ---");
  const reqData = await entropyContract.requests(SEQUENCE_NUMBER);
  console.log(`packSize: ${reqData[1]}, guaranteed: ${reqData[2]}, fulfilled: ${reqData[3]}`);
  const seed = await entropyContract.getSeed(SEQUENCE_NUMBER);
  console.log(`seed: ${seed}`);

  // Step 3: Compute rarities
  console.log("\n--- Step 3: Compute rarities ---");
  const rarities = buildPackRaritiesFromSeed(seed, 10, 2);
  const rarityNames = ["Common", "Rare", "Epic", "Legendary"];
  console.log(`rarities: [${rarities.map((r, i) => `${i}:${rarityNames[r]}`).join(", ")}]`);
  const rarePlusCount = rarities.filter(r => r >= 1).length;
  console.log(`Rare+ count: ${rarePlusCount} (guaranteed: 2) → ${rarePlusCount >= 2 ? "PASS" : "FAIL"}`);

  // Step 4: fulfillPack on-chain
  console.log("\n--- Step 4: fulfillPack() on-chain ---");
  let fulfillTxHash = "";
  let tokenIds: number[] = [];
  try {
    const nonce = await provider.getTransactionCount(wallet.address);
    const fulfillTx = await entropyContract.fulfillPack(SEQUENCE_NUMBER, USER_ADDR, rarities, { nonce });
    fulfillTxHash = fulfillTx.hash;
    console.log(`TX hash: ${fulfillTxHash}`);
    const receipt = await fulfillTx.wait();
    console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);

    for (const log of receipt.logs) {
      if (log.topics[0] === CARD_MINTED_TOPIC && log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
        const tokenId = parseInt(log.topics[1], 16);
        const logData = log.data.slice(2);
        const rarity = parseInt(logData.slice(64, 128), 16);
        tokenIds.push(tokenId);
        console.log(`  CardMinted: tokenId=${tokenId} rarity=${rarityNames[rarity]}`);
      }
    }
    console.log(`Token IDs: [${tokenIds.join(", ")}]`);
  } catch (err: any) {
    console.error(`fulfillPack FAILED: ${err.message}`);
    await client.close();
    process.exit(1);
  }

  // Step 5: Verify on-chain AFTER
  console.log("\n--- Step 5: On-chain state (AFTER) ---");
  const reqAfter = await entropyContract.requests(SEQUENCE_NUMBER);
  console.log(`fulfilled: ${reqAfter[3]}`);
  const hashAfter = await entropyContract.getRarityHash(SEQUENCE_NUMBER);
  console.log(`rarityHash: ${hashAfter}`);

  // Step 6: Update MongoDB
  console.log("\n--- Step 6: Update MongoDB ---");
  await txCollection.updateOne(
    { _id: new ObjectId(TX_ID) },
    {
      $set: {
        status: "confirmed",
        entropySeed: seed,
        txHash: fulfillTxHash,
        rarities,
        tokenIds,
        updatedAt: new Date().toISOString(),
      },
    }
  );
  for (let i = 0; i < rarities.length; i++) {
    await cardsCollection.updateOne(
      { txId: TX_ID, pickIndex: i },
      { $set: { rarity: rarities[i], tokenId: tokenIds[i] || null, status: "Digital" } }
    );
  }
  const txAfter = await txCollection.findOne({ _id: new ObjectId(TX_ID) });
  console.log(`Status: ${txAfter?.status}`);
  console.log(`TokenIds: [${txAfter?.tokenIds?.join(", ")}]`);

  // Step 7: Idempotency — try fulfillPack again on-chain
  console.log("\n--- Step 7: Idempotency test (on-chain) ---");
  try {
    const nonce2 = await provider.getTransactionCount(wallet.address);
    const tx2 = await entropyContract.fulfillPack(SEQUENCE_NUMBER, USER_ADDR, rarities, { nonce: nonce2 });
    await tx2.wait();
    console.log("[UNEXPECTED] Second fulfill succeeded!");
  } catch (err: any) {
    if (err.message.includes("Already fulfilled")) {
      console.log("[PASS] Contract reverted 'Already fulfilled'");
    } else {
      console.error(`[UNEXPECTED] ${err.message}`);
    }
  }

  // Step 8: Verify state unchanged
  console.log("\n--- Step 8: Final state verification ---");
  const reqFinal = await entropyContract.requests(SEQUENCE_NUMBER);
  const hashFinal = await entropyContract.getRarityHash(SEQUENCE_NUMBER);
  console.log(`fulfilled: ${reqFinal[3]} (expected: true)`);
  console.log(`rarityHash unchanged: ${hashAfter === hashFinal}`);
  console.log(`Seed unchanged: ${seed === (await entropyContract.getSeed(SEQUENCE_NUMBER))}`);

  console.log("\n=== DONE ===");
  await client.close();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
