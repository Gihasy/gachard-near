import { getCollection } from "../lib/mongodb";

async function main() {
  try {
    console.log("=== odds collection ===");
    const odds = await getCollection("odds");
    const docs = await odds.find({}).toArray();
    console.log("Count:", docs.length);
    if (docs.length > 0) {
      for (const doc of docs) {
        console.log("Name:", doc.name);
        console.log("Entries:", JSON.stringify(doc.entries, null, 2));
      }
    } else {
      console.log("EMPTY - using DEFAULT_ODDS (70/20/8/2)");
    }

    console.log("");
    console.log("=== recent transactions (last 3) ===");
    const txs = await getCollection("transactions");
    const recentTxs = await txs.find({}).sort({ createdAt: -1 }).limit(3).toArray();
    if (recentTxs.length === 0) {
      console.log("No transactions found");
    }
    for (const tx of recentTxs) {
      console.log("Status:", tx.status, "| Type:", tx.type, "| Rarities:", JSON.stringify(tx.rarities), "| EntropySeq:", tx.entropySequenceNumber || "N/A");
    }

    console.log("");
    console.log("=== recent cards (last 5) ===");
    const cards = await getCollection("cards");
    const recentCards = await cards.find({}).sort({ createdAt: -1 }).limit(5).toArray();
    if (recentCards.length === 0) {
      console.log("No cards found");
    }
    for (const c of recentCards) {
      console.log("Card:", c.cardId, "| Rarity:", c.rarity, "| Status:", c.status);
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}

main();
