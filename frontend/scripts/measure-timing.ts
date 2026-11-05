/**
 * Measure timing of fulfill endpoint components independently.
 * Uses real MongoDB and blockchain connections.
 *
 * Run: cd frontend && npx tsx scripts/measure-timing.ts
 */

import { ethers } from "ethers";
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

const RPC_URL = process.env.RPC_URL!;
const ENTROPY_ADDRESS = process.env.ENTROPY_CONTRACT_ADDRESS!.trim();
const MONGODB_URL = process.env.MONGODB_URL!;
const DATABASE_NAME = process.env.DATABASE_NAME!;

const PACK_ENTROPY_ABI = [
  "function getSeed(uint64 sequenceNumber) external view returns (bytes32)",
  "function requests(uint64) external view returns (address,uint8,uint8,bool)",
];

async function main() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DATABASE_NAME);

  console.log("=== Component Timing Measurement ===\n");

  // 1. getEntropySeed
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const entropyContract = new ethers.Contract(ENTROPY_ADDRESS, PACK_ENTROPY_ABI, provider);

  const seqNum = 3850;
  console.log(`--- getEntropySeed(${seqNum}) ---`);
  const t1 = Date.now();
  await entropyContract.getSeed(seqNum);
  console.log(`  ${Date.now() - t1}ms\n`);

  // 2. pickCardTemplate (simulated — direct MongoDB query)
  const templatesCollection = db.collection("card_templates");
  for (const rarity of [0, 1, 2, 3]) {
    console.log(`--- pickCardTemplate(${rarity}) ---`);
    const t2 = Date.now();
    const templates = await templatesCollection.find({ rarity }).toArray();
    const picked = templates[Math.floor(Math.random() * templates.length)];
    console.log(`  ${Date.now() - t2}ms (${templates.length} templates found, picked: ${picked?.templateId})\n`);
  }

  // 3. pickCardTemplate × 10 (sequential — current pattern)
  console.log("--- pickCardTemplate × 10 (sequential) ---");
  const rarities10 = [0, 1, 0, 0, 0, 0, 0, 2, 0, 1]; // typical booster
  const t3 = Date.now();
  for (const r of rarities10) {
    const templates = await templatesCollection.find({ rarity: r }).toArray();
    templates[Math.floor(Math.random() * templates.length)];
  }
  console.log(`  ${Date.now() - t3}ms total\n`);

  // 4. enrichCardsWithTemplates (batch — current pattern)
  console.log("--- enrichCardsWithTemplates (batch) ---");
  const cardsCollection = db.collection("cards");
  const sampleCards = await cardsCollection.find({ status: "Digital" }).limit(10).toArray();
  const t4 = Date.now();
  const uniqueTemplateIds = [...new Set(sampleCards.map((c: Record<string, unknown>) => c.templateId).filter(Boolean))];
  const templates = await templatesCollection.find({ templateId: { $in: uniqueTemplateIds } }).toArray();
  const templateMap = new Map(templates.map((t: Record<string, unknown>) => [t.templateId, t]));
  for (const c of sampleCards) {
    templateMap.get(c.templateId as string);
  }
  console.log(`  ${Date.now() - t4}ms (${sampleCards.length} cards, ${uniqueTemplateIds.length} unique templates)\n`);

  // 5. MongoDB card update × 10 (sequential — current pattern)
  console.log("--- MongoDB card update × 10 (sequential, DRY RUN) ---");
  const t5 = Date.now();
  // Simulate without actually writing — just measure the findOne overhead
  for (let i = 0; i < 10; i++) {
    await cardsCollection.findOne({ pickIndex: i });
  }
  console.log(`  ${Date.now() - t5}ms (findOne × 10, approximate update overhead)\n`);

  // 6. waitForReceipt simulation — measure RPC latency
  console.log("--- getBlockNumber (RPC latency proxy) ---");
  const t6 = Date.now();
  await provider.getBlockNumber();
  console.log(`  ${Date.now() - t6}ms\n`);

  // 7. getTransactionReceipt (single call)
  console.log("--- getTransactionReceipt (single) ---");
  const t7 = Date.now();
  await provider.getTransactionReceipt("0xd2f7558e20a957f9a4b7825cc1f5e7ef219d6d1e63238f9d65270fedc5d3ea9f");
  console.log(`  ${Date.now() - t7}ms\n`);

  // Summary
  console.log("=== ESTIMATED FULFILL TIMING BREAKDOWN ===");
  console.log(`getEntropySeed:          ~${Date.now() - t1}ms`);
  console.log(`pickCardTemplate × 10:   ~${Date.now() - t3}ms (sequential)`);
  console.log(`enrichCardsWithTemplates: ~${Date.now() - t4}ms (batch)`);
  console.log(`MongoDB card updates:    ~${Date.now() - t5}ms (× 10 sequential)`);
  console.log(`RPC latency:             ~${Date.now() - t6}ms`);
  console.log(`fulfillPackEntropy:      ~1500-3000ms (on-chain tx, not measured)`);
  console.log(`waitForReceipt:          ~1000-5000ms (polling, not measured)`);
  console.log(`\nNOTE: fulfillPackEntropy and waitForReceipt are blockchain calls`);
  console.log(`that cannot be measured without a real transaction.`);

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
