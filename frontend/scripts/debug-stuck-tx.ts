/**
 * Check transaction tokenIds and on-chain state for stuck transactions.
 * Run: cd frontend && npx tsx scripts/debug-stuck-tx.ts
 */

import { MongoClient, ObjectId } from "mongodb";
import { ethers } from "ethers";
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

async function main() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME!);
  const txCollection = db.collection("transactions");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const CONTRACT = process.env.CONTRACT_ADDRESS!.trim().toLowerCase();
  const ENTROPY = process.env.ENTROPY_CONTRACT_ADDRESS!.trim().toLowerCase();

  console.log("=== Debug Stuck Transactions ===\n");

  const stuckTxs = await txCollection
    .find({ status: "confirmed" })
    .sort({ updatedAt: -1 })
    .limit(5)
    .toArray();

  for (const tx of stuckTxs) {
    const txId = tx._id.toString();
    console.log(`--- txId=${txId} seq=${tx.entropySequenceNumber} ---`);
    console.log(`  txHash: ${tx.txHash}`);
    console.log(`  tokenIds in DB: ${JSON.stringify(tx.tokenIds)}`);
    console.log(`  rarities in DB: ${JSON.stringify(tx.rarities)}`);

    if (tx.txHash) {
      try {
        const receipt = await provider.getTransactionReceipt(tx.txHash);
        if (receipt) {
          console.log(`  Receipt status: ${receipt.status}`);
          console.log(`  Logs count: ${receipt.logs.length}`);

          const CARD_MINTED = ethers.id("CardMinted(uint256,address,uint8,uint8)");
          const PACK_FULFILLED = ethers.id("PackFulfilled(uint64,address,bytes32)");
          let cardMintedCount = 0;
          let packFulfilledCount = 0;

          for (const log of receipt.logs) {
            if (log.topics[0] === CARD_MINTED && log.address.toLowerCase() === CONTRACT) {
              cardMintedCount++;
            }
            if (log.topics[0] === PACK_FULFILLED && log.address.toLowerCase() === ENTROPY) {
              packFulfilledCount++;
            }
          }
          console.log(`  CardMinted events (GachardCard): ${cardMintedCount}`);
          console.log(`  PackFulfilled events (PackEntropy): ${packFulfilledCount}`);

          // Check if txHash is the fulfill tx or the request tx
          if (packFulfilledCount > 0) {
            console.log(`  → This IS the fulfill transaction`);
          } else {
            console.log(`  → This is NOT the fulfill transaction (probably request entropy tx)`);
          }
        } else {
          console.log(`  Receipt: null (not found)`);
        }
      } catch (err: any) {
        console.log(`  Error: ${err.message}`);
      }
    }
    console.log();
  }

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
