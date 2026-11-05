/**
 * Query MongoDB directly for card documents from sequences #3850 and #3851.
 * Shows ALL fields to identify mismatches.
 *
 * Run: cd frontend && npx tsx scripts/debug-cards.ts
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

const EXPECTED_RARITIES_3850 = [0, 1, 0, 0, 0, 0, 0, 2, 0, 1]; // Common,Rare,Common,...,Epic,...,Rare
const EXPECTED_RARITIES_3851 = [2, 0, 0, 0, 2, 0, 0, 1, 0, 1]; // Epic,Common,...,Epic,...,Rare,Rare
const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME!);
  const cardsCollection = db.collection("cards");
  const txCollection = db.collection("transactions");
  const templatesCollection = db.collection("card_templates");

  // Get transaction IDs
  const tx3850 = await txCollection.findOne({ entropySequenceNumber: 3850 });
  const tx3851 = await txCollection.findOne({ entropySequenceNumber: 3851 });

  console.log("=== Transaction IDs ===");
  console.log(`#3850: ${tx3850?._id} (status: ${tx3850?.status})`);
  console.log(`#3851: ${tx3851?._id} (status: ${tx3851?.status})\n`);

  for (const [label, txId, expectedRarities] of [
    ["#3850", tx3850?._id?.toString(), EXPECTED_RARITIES_3850],
    ["#3851", tx3851?._id?.toString(), EXPECTED_RARITIES_3851],
  ] as [string, string | undefined, number[]][]) {
    if (!txId) { console.log(`${label}: transaction not found\n`); continue; }

    const cards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
    console.log(`=== Cards for ${label} (${cards.length} cards) ===`);

    for (const c of cards) {
      const expected = expectedRarities[c.pickIndex];
      const rarityMatch = c.rarity === expected;
      const template = await templatesCollection.findOne({ templateId: c.templateId });
      const templateRarity = template?.rarity;
      const templateMatch = templateRarity === c.rarity;

      console.log(`\n  [${c.pickIndex}] cardId=${c.cardId} tokenId=${c.tokenId ?? "NULL"}`);
      console.log(`      rarity: ${c.rarity} (${RARITY_NAMES[c.rarity]}) ${rarityMatch ? "✓" : "✗ expected " + expected}`);
      console.log(`      status: ${c.status}`);
      console.log(`      templateId: ${c.templateId}`);
      console.log(`      template.rarity: ${templateRarity} (${RARITY_NAMES[templateRarity ?? 0]}) ${templateMatch ? "✓" : "✗ MISMATCH — image will be wrong!"}`);
      console.log(`      artworkUrl: ${template?.artworkUrl || "N/A"}`);
      console.log(`      fulfillmentStatus: ${c.fulfillmentStatus ?? "NULL"}`);
      console.log(`      tokenId present: ${c.tokenId != null}`);
    }
    console.log();
  }

  // Also show all card_templates for reference
  console.log("=== Card Templates ===");
  const allTemplates = await templatesCollection.find({}).toArray();
  for (const t of allTemplates) {
    console.log(`  ${t.templateId} → rarity=${t.rarity} (${RARITY_NAMES[t.rarity]}) artworkUrl=${t.artworkUrl}`);
  }

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
