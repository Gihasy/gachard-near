// Check MongoDB odds collection for overrides
const { MongoClient } = require("mongodb");

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) throw new Error("MONGODB_URL is not set");
const DATABASE_NAME = process.env.DATABASE_NAME || "gachard";

async function main() {
  const client = new MongoClient(MONGODB_URL);
  
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    
    // Check odds collection
    console.log("=== Checking 'odds' collection ===\n");
    
    const oddsCollection = db.collection("odds");
    const allOdds = await oddsCollection.find({}).toArray();
    
    if (allOdds.length === 0) {
      console.log("No documents found in 'odds' collection.");
      console.log("Using DEFAULT_ODDS from odds.ts:\n");
      console.log("  Common:    70%");
      console.log("  Rare:      20%");
      console.log("  Epic:       8%");
      console.log("  Legendary:  2%");
    } else {
      console.log(`Found ${allOdds.length} document(s) in 'odds' collection:\n`);
      for (const doc of allOdds) {
        console.log(`  Name: ${doc.name}`);
        console.log(`  Entries:`);
        if (doc.entries && Array.isArray(doc.entries)) {
          for (const entry of doc.entries) {
            console.log(`    ${entry.label || entry.rarity}: weight=${entry.weight}`);
          }
        }
        console.log("");
      }
    }
    
    // Check recent transactions for entropy_pending status
    console.log("=== Recent transactions (last 5) ===\n");
    const txCollection = db.collection("transactions");
    const recentTxs = await txCollection.find({}).sort({ createdAt: -1 }).limit(5).toArray();
    
    for (const tx of recentTxs) {
      console.log(`  ID: ${tx._id}`);
      console.log(`  Type: ${tx.type}`);
      console.log(`  Status: ${tx.status}`);
      console.log(`  Rarities: ${JSON.stringify(tx.rarities)}`);
      console.log(`  Entropy Seq#: ${tx.entropySequenceNumber || "N/A"}`);
      console.log(`  Created: ${tx.createdAt}`);
      console.log("");
    }
    
    // Check recent cards
    console.log("=== Recent cards (last 10) ===\n");
    const cardsCollection = db.collection("cards");
    const recentCards = await cardsCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    
    for (const card of recentCards) {
      console.log(`  CardID: ${card.cardId}, Rarity: ${card.rarity}, Status: ${card.status}, TxID: ${card.txId}`);
    }
    
  } finally {
    await client.close();
  }
}

main().catch(console.error);
