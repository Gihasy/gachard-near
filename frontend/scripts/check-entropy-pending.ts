/**
 * Check and recover all entropy_pending transactions.
 * Simulates what /api/admin/confirm-all does with the new on-chain-first logic.
 *
 * Run: cd frontend && npx tsx scripts/check-entropy-pending.ts
 */

import { ethers } from "ethers";
import { MongoClient, ObjectId } from "mongodb";
import * as fs from "fs";
import * as path from "path";

// Load .env.local
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
const ENTROPY_ADDRESS = process.env.ENTROPY_CONTRACT_ADDRESS!.trim();
const MONGODB_URL = process.env.MONGODB_URL!;
const DATABASE_NAME = process.env.DATABASE_NAME!;

const PACK_ENTROPY_ABI = [
  "function requests(uint64) external view returns (address userAddr, uint8 packSize, uint8 guaranteed, bool fulfilled)",
  "function getSeed(uint64 sequenceNumber) external view returns (bytes32)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const entropyContract = new ethers.Contract(ENTROPY_ADDRESS, PACK_ENTROPY_ABI, provider);

  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DATABASE_NAME);
  const txCollection = db.collection("transactions");

  console.log("=== Check All Entropy Pending Transactions ===\n");

  // Find all entropy_pending transactions
  const entropyPendingTxs = await txCollection
    .find({ status: "entropy_pending" })
    .toArray();

  console.log(`Found ${entropyPendingTxs.length} entropy_pending transactions\n`);

  if (entropyPendingTxs.length === 0) {
    console.log("No entropy_pending transactions — nothing to process.");
    await client.close();
    return;
  }

  const results: Array<{
    txId: string;
    seqNum: number;
    action: string;
    details: string;
  }> = [];

  for (const tx of entropyPendingTxs) {
    const txId = tx._id.toString();
    const seqNum = tx.entropySequenceNumber;

    console.log(`--- Transaction ${txId} (seq=${seqNum}) ---`);
    console.log(`  Created: ${tx.createdAt}`);
    console.log(`  User: ${tx.toAddress}`);
    console.log(`  Amount: ${tx.amount} Credits`);

    if (!seqNum && seqNum !== 0) {
      console.log(`  → SKIP: no sequence number\n`);
      results.push({ txId, seqNum, action: "skip", details: "no sequence number" });
      continue;
    }

    try {
      // Check on-chain state
      const reqData = await entropyContract.requests(seqNum);
      const fulfilled = reqData[3] as boolean;
      const seed = await entropyContract.getSeed(seqNum);
      const seedAvailable = seed !== "0x0000000000000000000000000000000000000000000000000000000000000000";

      console.log(`  On-chain: fulfilled=${fulfilled}, seed=${seedAvailable ? "available" : "not yet"}`);

      if (fulfilled) {
        console.log(`  → ALREADY FULFILLED on-chain — needs recovery\n`);
        results.push({ txId, seqNum, action: "recover", details: "already fulfilled on-chain, needs sync" });
      } else if (seedAvailable) {
        console.log(`  → SEED READY — can fulfill\n`);
        results.push({ txId, seqNum, action: "fulfill", details: "seed available, can fulfill" });
      } else {
        console.log(`  → WAITING for seed\n`);
        results.push({ txId, seqNum, action: "wait", details: "waiting for entropy seed" });
      }
    } catch (err: any) {
      console.log(`  → ERROR: ${err.message}\n`);
      results.push({ txId, seqNum, action: "error", details: err.message });
    }
  }

  // Summary
  console.log("=== SUMMARY ===");
  const recover = results.filter(r => r.action === "recover").length;
  const fulfill = results.filter(r => r.action === "fulfill").length;
  const wait = results.filter(r => r.action === "wait").length;
  const skip = results.filter(r => r.action === "skip").length;
  const errors = results.filter(r => r.action === "error").length;

  console.log(`Total: ${results.length}`);
  console.log(`  Already fulfilled (needs recovery): ${recover}`);
  console.log(`  Seed ready (can fulfill): ${fulfill}`);
  console.log(`  Waiting for seed: ${wait}`);
  console.log(`  Skipped (no seq num): ${skip}`);
  console.log(`  Errors: ${errors}`);

  if (recover > 0) {
    console.log(`\n${recover} transaction(s) need recovery — these will be fixed by the updated confirm-all endpoint.`);
  }
  if (fulfill > 0) {
    console.log(`\n${fulfill} transaction(s) can be fulfilled — these will be processed by confirm-all.`);
  }

  await client.close();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
