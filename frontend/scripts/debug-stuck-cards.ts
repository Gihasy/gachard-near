/**
 * Check recent cards for stuck status after bulkWrite optimization.
 * Run: cd frontend && npx tsx scripts/debug-stuck-cards.ts
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

  console.log("=== Debug Stuck Cards ===\n");

  // 1. Find cards with status "pending" but rarity > 0
  console.log("--- Cards with status='pending' but rarity > 0 ---");
  const stuckCards = await cardsCollection
    .find({ status: "pending", rarity: { $gt: 0 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  if (stuckCards.length === 0) {
    console.log("  None found.\n");
  } else {
    for (const c of stuckCards) {
      console.log(`  cardId=${c.cardId} tokenId=${c.tokenId ?? "NULL"} rarity=${c.rarity} templateId=${c.templateId} status=${c.status} txId=${c.txId}`);
    }
    console.log();
  }

  // 2. Find cards with tokenId=null but status="Digital"
  console.log("--- Cards with status='Digital' but tokenId=null ---");
  const digitalNoToken = await cardsCollection
    .find({ status: "Digital", tokenId: null })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  if (digitalNoToken.length === 0) {
    console.log("  None found.\n");
  } else {
    for (const c of digitalNoToken) {
      console.log(`  cardId=${c.cardId} tokenId=${c.tokenId ?? "NULL"} rarity=${c.rarity} templateId=${c.templateId} status=${c.status} txId=${c.txId}`);
    }
    console.log();
  }

  // 3. Find most recent confirmed transactions and check their cards
  console.log("--- Most recent 5 confirmed transactions + their cards ---");
  const recentConfirmed = await txCollection
    .find({ status: "confirmed" })
    .sort({ updatedAt: -1 })
    .limit(5)
    .toArray();

  for (const tx of recentConfirmed) {
    const txId = tx._id.toString();
    const cards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
    const hasStuck = cards.some((c: Record<string, unknown>) => c.status !== "Digital" || c.tokenId == null);
    console.log(`  txId=${txId} seq=${tx.entropySequenceNumber ?? "N/A"} updatedAt=${tx.updatedAt} stuck=${hasStuck}`);
    if (hasStuck) {
      for (const c of cards) {
        const isOk = c.status === "Digital" && c.tokenId != null;
        if (!isOk) {
          console.log(`    [STUCK] pickIndex=${c.pickIndex} cardId=${c.cardId} tokenId=${c.tokenId ?? "NULL"} rarity=${c.rarity} status=${c.status} templateId=${c.templateId}`);
        }
      }
    }
  }

  // 4. Overall stats
  console.log("\n--- Stats ---");
  const totalCards = await cardsCollection.countDocuments();
  const pendingCards = await cardsCollection.countDocuments({ status: "pending" });
  const digitalCards = await cardsCollection.countDocuments({ status: "Digital" });
  const nullTokenId = await cardsCollection.countDocuments({ tokenId: null });
  const stuckVariant = await cardsCollection.countDocuments({ status: "pending", rarity: { $gt: 0 } });
  console.log(`Total cards: ${totalCards}`);
  console.log(`status=pending: ${pendingCards}`);
  console.log(`status=Digital: ${digitalCards}`);
  console.log(`tokenId=null: ${nullTokenId}`);
  console.log(`status=pending + rarity>0 (stuck): ${stuckVariant}`);

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
