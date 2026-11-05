/**
 * Parse actual receipt to debug event matching.
 * Run: cd frontend && npx tsx scripts/debug-receipt-parse.ts
 */

import { ethers } from "ethers";
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
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const CONTRACT = process.env.CONTRACT_ADDRESS!.trim();
  const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

  console.log("=== Receipt Parse Debug ===\n");
  console.log(`CONTRACT_ADDRESS: "${CONTRACT}"`);
  console.log(`CONTRACT lower: "${CONTRACT.toLowerCase()}"`);
  console.log(`CARD_MINTED_TOPIC: "${CARD_MINTED_TOPIC}"\n`);

  const txHash = "0xb3d23a8440d126efa36d2819e4a36014c28471c4598e7156290d75a533921889";
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("Receipt not found");
    return;
  }

  console.log(`Receipt status: ${receipt.status}`);
  console.log(`Logs count: ${receipt.logs.length}\n`);

  let matchCount = 0;
  for (const log of receipt.logs) {
    const topicMatch = log.topics[0] === CARD_MINTED_TOPIC;
    const addrMatch = log.address.toLowerCase() === CONTRACT.toLowerCase();

    if (topicMatch) {
      console.log(`  TOPIC MATCH: address="${log.address}" lower="${log.address.toLowerCase()}"`);
      console.log(`    addrMatch: ${addrMatch}`);
      console.log(`    log.address === CONTRACT: ${log.address === CONTRACT}`);
      console.log(`    log.address.toLowerCase() === CONTRACT.toLowerCase(): ${log.address.toLowerCase() === CONTRACT.toLowerCase()}`);

      if (addrMatch) {
        matchCount++;
        const tokenId = parseInt(log.topics[1], 16);
        const logData = log.data.slice(2);
        const rarity = parseInt(logData.slice(64, 128), 16);
        console.log(`    → CardMinted: tokenId=${tokenId} rarity=${rarity}`);
      }
    }
  }

  console.log(`\nTotal matches: ${matchCount}`);

  // Also test what the fulfill endpoint would do
  const contractAddress = CONTRACT;
  const cleanContractAddress = contractAddress.trim().toLowerCase();
  console.log(`\ncleanContractAddress: "${cleanContractAddress}"`);
  let fulfillMatchCount = 0;
  for (const log of receipt.logs) {
    if (log.topics[0] === CARD_MINTED_TOPIC && log.address.toLowerCase() === cleanContractAddress) {
      fulfillMatchCount++;
    }
  }
  console.log(`Fulfill endpoint would find: ${fulfillMatchCount} events`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
