/**
 * Full card document dump for stuck cards.
 * Run: cd frontend && npx tsx scripts/debug-card-fields.ts
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
  const cardsCollection = db.collection("cards");
  const txCollection = db.collection("transactions");

  // Get the most recent stuck transaction
  const tx = await txCollection
    .findOne({ status: "confirmed" }, { sort: { updatedAt: -1 } });

  if (!tx) { console.log("No confirmed tx found"); await client.close(); return; }

  const txId = tx._id.toString();
  console.log(`=== Transaction ${txId} ===`);
  console.log(JSON.stringify(tx, null, 2));

  console.log(`\n=== Cards for txId=${txId} ===`);
  const cards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
  for (const c of cards) {
    console.log(`\n  [${c.pickIndex}] cardId=${c.cardId}`);
    console.log(`    tokenId: ${c.tokenId ?? "NULL"}`);
    console.log(`    status: ${c.status}`);
    console.log(`    rarity: ${c.rarity}`);
    console.log(`    templateId: ${c.templateId}`);
    console.log(`    lastOnChainSync: ${c.lastOnChainSync ?? "NULL"}`);
    console.log(`    fulfillmentStatus: ${c.fulfillmentStatus ?? "NULL"}`);
    console.log(`    ownerAddress: ${c.ownerAddress}`);
    console.log(`    createdAt: ${c.createdAt}`);
    console.log(`    updatedAt: ${c.updatedAt ?? "NULL"}`);
  }

  // Also check: are there any cards with this txId that have DIFFERENT status?
  const statusCounts = await cardsCollection.aggregate([
    { $match: { txId } },
    { $group: { _id: { status: "$status", tokenId: "$tokenId" }, count: { $sum: 1 } } },
  ]).toArray();
  console.log(`\n=== Status distribution for txId=${txId} ===`);
  for (const s of statusCounts) {
    console.log(`  status=${s._id.status} tokenId=${s._id.tokenId ?? "NULL"} count=${s.count}`);
  }

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
