import { getCollection } from "../lib/mongodb";

async function main() {
  try {
    console.log("=== LANGKAH 1: Recent transactions with entropy data ===\n");
    
    const txCollection = await getCollection("transactions");
    const recentTxs = await txCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    
    if (recentTxs.length === 0) {
      console.log("No transactions found in database.\n");
    } else {
      console.log(`Found ${recentTxs.length} transactions:\n`);
      for (const tx of recentTxs) {
        console.log(`--- Transaction ${tx._id} ---`);
        console.log(`  Status: ${tx.status}`);
        console.log(`  Type: ${tx.type}`);
        console.log(`  TxHash: ${tx.txHash || "NULL"}`);
        console.log(`  EntropySeqNum: ${tx.entropySequenceNumber ?? "NULL"}`);
        console.log(`  EntropySeed: ${tx.entropySeed || "NULL"}`);
        console.log(`  RarityHash: ${tx.rarityHash || "NULL"}`);
        console.log(`  Rarities: ${JSON.stringify(tx.rarities)}`);
        console.log(`  Created: ${tx.createdAt}`);
        console.log(`  Updated: ${tx.updatedAt}`);
        console.log("");
      }
    }

    console.log("=== Cards with their rarities ===\n");
    const cardsCollection = await getCollection("cards");
    const recentCards = await cardsCollection.find({}).sort({ createdAt: -1 }).limit(20).toArray();
    
    if (recentCards.length === 0) {
      console.log("No cards found in database.\n");
    } else {
      console.log(`Found ${recentCards.length} cards:\n`);
      for (const card of recentCards) {
        console.log(`  CardID: ${card.cardId} | Rarity: ${card.rarity} | Status: ${card.status} | TxID: ${card.txId}`);
      }
    }

    console.log("\n=== PackEntropy contract balance check ===\n");
    // We'll check this via cast call separately

  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}

main();
