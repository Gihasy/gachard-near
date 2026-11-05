/**
 * Quick check: what contractAddress is stored on the latest tx?
 * Run: cd frontend && npx tsx scripts/debug-latest-tx.ts
 */

import { MongoClient } from "mongodb";
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

  const tx = await txCollection.findOne({}, { sort: { createdAt: -1 } });
  if (!tx) { console.log("No transactions found"); await client.close(); return; }

  console.log("=== Latest Transaction ===");
  console.log(`txId: ${tx._id}`);
  console.log(`seq: ${tx.entropySequenceNumber}`);
  console.log(`status: ${tx.status}`);
  console.log(`contractAddress: ${tx.contractAddress}`);
  console.log(`txHash: ${tx.txHash}`);
  console.log(`tokenIds: ${JSON.stringify(tx.tokenIds)}`);
  console.log(`createdAt: ${tx.createdAt}`);
  console.log(`updatedAt: ${tx.updatedAt}`);

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
