/**
 * Fix stuck cards: status=pending, tokenId=null from confirmed transactions.
 * Root cause: tx.contractAddress was old address, event loop found 0 events.
 *
 * This script re-parses the fulfill receipt with the CORRECT contract address
 * and updates card tokenId + status.
 *
 * Usage:
 *   cd frontend && npx tsx scripts/fix-stuck-cards.ts           # dry-run
 *   cd frontend && npx tsx scripts/fix-stuck-cards.ts --apply   # execute
 */

import { ethers } from "ethers";
import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

const APPLY = process.argv.includes("--apply");
const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

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
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const CORRECT_CONTRACT = process.env.CONTRACT_ADDRESS!.trim().toLowerCase();

  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME!);
  const cardsCollection = db.collection("cards");
  const txCollection = db.collection("transactions");

  console.log(`=== Fix Stuck Cards ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);
  console.log(`Correct contract: ${CORRECT_CONTRACT}\n`);

  // Find confirmed transactions with stuck cards
  const confirmedTxs = await txCollection
    .find({ status: "confirmed", txHash: { $ne: null } })
    .toArray();

  let totalFixed = 0;
  let totalErrors = 0;

  for (const tx of confirmedTxs) {
    const txId = tx._id.toString();
    const stuckCards = await cardsCollection
      .find({ txId, status: "pending", tokenId: null })
      .toArray();

    if (stuckCards.length === 0) continue;

    console.log(`--- txId=${txId} seq=${tx.entropySequenceNumber} stuckCards=${stuckCards.length} ---`);
    console.log(`  txHash: ${tx.txHash}`);
    console.log(`  tx.contractAddress (WRONG): ${tx.contractAddress}`);

    // Parse receipt with CORRECT contract address
    const receipt = await provider.getTransactionReceipt(tx.txHash);
    if (!receipt || receipt.status !== 1) {
      console.log(`  Receipt not found or failed — skipping`);
      continue;
    }

    const tokenIds: number[] = [];
    const rarityMap = new Map<number, number>(); // pickIndex → rarity from event
    let mintIndex = 0;

    for (const log of receipt.logs) {
      if (log.topics[0] === CARD_MINTED_TOPIC && log.address.toLowerCase() === CORRECT_CONTRACT) {
        const tokenId = parseInt(log.topics[1], 16);
        const logData = log.data.slice(2);
        const rarity = parseInt(logData.slice(64, 128), 16);
        tokenIds.push(tokenId);
        rarityMap.set(mintIndex, rarity);
        mintIndex++;
      }
    }

    console.log(`  Events found: ${tokenIds.length} CardMinted`);
    if (tokenIds.length === 0) {
      console.log(`  No events — skipping`);
      continue;
    }

    // Match events to stuck cards by pickIndex
    for (const card of stuckCards) {
      const idx = card.pickIndex;
      const tokenId = tokenIds[idx];
      const eventRarity = rarityMap.get(idx);

      if (tokenId === undefined) {
        console.log(`  [${idx}] cardId=${card.cardId} — no matching event, skipping`);
        continue;
      }

      console.log(`  [${idx}] cardId=${card.cardId} rarity=${RARITY_NAMES[card.rarity]} → tokenId=${tokenId} eventRarity=${RARITY_NAMES[eventRarity ?? 0]}`);

      if (APPLY) {
        try {
          await cardsCollection.updateOne(
            { _id: card._id },
            {
              $set: {
                tokenId,
                status: "Digital",
                lastOnChainSync: new Date().toISOString(),
              },
            }
          );
          totalFixed++;
        } catch (err) {
          console.log(`    ERROR: ${(err as Error).message}`);
          totalErrors++;
        }
      } else {
        totalFixed++;
      }
    }
    console.log();
  }

  console.log(`\n=== SUMMARY ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log(`Cards ${APPLY ? "fixed" : "to fix"}: ${totalFixed}`);
  console.log(`Errors: ${totalErrors}`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] No changes made. Run with --apply to execute.`);
  }

  await client.close();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
