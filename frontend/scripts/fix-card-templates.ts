/**
 * Fix card templateId mismatch for existing cards.
 *
 * Cards created during Entropy flow have templateId="common-*" regardless of
 * actual rarity, because templates were picked with placeholder rarity=0.
 * This script finds those mismatches and picks correct templates.
 *
 * Usage:
 *   cd frontend && npx tsx scripts/fix-card-templates.ts           # dry-run (default)
 *   cd frontend && npx tsx scripts/fix-card-templates.ts --apply   # execute updates
 */

import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

const APPLY = process.argv.includes("--apply");
const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];

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

interface CardTemplate {
  templateId: string;
  rarity: number;
  name: string;
  artworkUrl: string;
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME!);
  const cardsCollection = db.collection("cards");
  const templatesCollection = db.collection<CardTemplate>("card_templates");

  // Load all templates into a map for fast lookup
  const allTemplates = await templatesCollection.find({}).toArray();
  const templatesByRarity = new Map<number, CardTemplate[]>();
  for (const t of allTemplates) {
    if (!templatesByRarity.has(t.rarity)) templatesByRarity.set(t.rarity, []);
    templatesByRarity.get(t.rarity)!.push(t);
  }

  console.log(`=== Card Template Migration ${APPLY ? "(APPLY MODE)" : "(DRY RUN)"} ===\n`);
  console.log(`Templates loaded: ${allTemplates.length}`);
  for (const [r, ts] of templatesByRarity) {
    console.log(`  ${RARITY_NAMES[r]}: ${ts.map(t => t.templateId).join(", ")}`);
  }

  // Find all Digital cards (fulfilled, not placeholder)
  const cards = await cardsCollection
    .find({ status: "Digital" })
    .toArray();

  console.log(`\nCards to check: ${cards.length}\n`);

  let checked = 0;
  let mismatched = 0;
  let updated = 0;
  let errors = 0;
  const mismatches: Array<{
    cardId: string;
    tokenId: number | null;
    rarity: number;
    rarityName: string;
    oldTemplateId: string;
    newTemplateId: string;
    newArtworkUrl: string;
  }> = [];

  for (const card of cards) {
    checked++;
    const template = allTemplates.find(t => t.templateId === card.templateId);
    if (!template) continue;

    // Check mismatch: template.rarity !== card.rarity
    if (template.rarity !== card.rarity) {
      mismatched++;
      const targetTemplates = templatesByRarity.get(card.rarity);
      if (!targetTemplates || targetTemplates.length === 0) {
        console.log(`  [${card.cardId}] tokenId=${card.tokenId} rarity=${RARITY_NAMES[card.rarity]} — NO TEMPLATES for this rarity!`);
        errors++;
        continue;
      }

      // Pick a random template for the correct rarity
      const newTemplate = targetTemplates[Math.floor(Math.random() * targetTemplates.length)];

      mismatches.push({
        cardId: card.cardId,
        tokenId: card.tokenId,
        rarity: card.rarity,
        rarityName: RARITY_NAMES[card.rarity],
        oldTemplateId: card.templateId,
        newTemplateId: newTemplate.templateId,
        newArtworkUrl: newTemplate.artworkUrl,
      });

      if (APPLY) {
        try {
          await cardsCollection.updateOne(
            { _id: card._id },
            { $set: { templateId: newTemplate.templateId } }
          );
          updated++;
          console.log(`  [UPDATE] ${card.cardId} tokenId=${card.tokenId} ${card.templateId} → ${newTemplate.templateId} (${RARITY_NAMES[card.rarity]})`);
        } catch (err) {
          console.error(`  [ERROR] ${card.cardId}: ${(err as Error).message}`);
          errors++;
        }
      }
    }
  }

  // Summary
  console.log(`\n=== SUMMARY ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log(`Cards checked: ${checked}`);
  console.log(`Mismatches found: ${mismatched}`);

  if (mismatches.length > 0) {
    console.log(`\nAffected cards:`);
    console.log(`${"tokenId".padEnd(8)} ${"cardId".padEnd(8)} ${"rarity".padEnd(10)} ${"old templateId".padEnd(16)} → ${"new templateId".padEnd(16)} artworkUrl`);
    console.log("-".repeat(90));
    for (const m of mismatches) {
      console.log(`${String(m.tokenId).padEnd(8)} ${m.cardId.padEnd(8)} ${m.rarityName.padEnd(10)} ${m.oldTemplateId.padEnd(16)} → ${m.newTemplateId.padEnd(16)} ${m.newArtworkUrl}`);
    }
  }

  if (APPLY) {
    console.log(`\nUpdated: ${updated}`);
    console.log(`Errors: ${errors}`);
  } else {
    console.log(`\n[DRY RUN] No changes made. Run with --apply to execute.`);
  }

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
