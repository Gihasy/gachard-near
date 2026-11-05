import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
for (const l of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0) {
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, i).trim()] = v;
  }
}

import {
  buildExportIntentDomain,
  EXPORT_BATCH_TYPES,
  recoverExportBatchSigner,
  type ExportBatchIntent,
} from "../lib/export-intent";

(async () => {
  const wallet = ethers.Wallet.createRandom();
  const domain = buildExportIntentDomain();
  const types = EXPORT_BATCH_TYPES as unknown as Record<string, ethers.TypedDataField[]>;

  const tokenIds = [901, 902, 903];
  const nonce = "b7b0a3e2-0000-4000-8000-000000000001";
  const deadline = Math.floor(Date.now() / 1000) + 600;

  // Exactly the shape the browser sends: uint256 values as strings.
  const clientMessage = {
    tokenIds: tokenIds.map(String),
    to: wallet.address,
    userId: "6ab2000000000000000000aa",
    nonce,
    deadline: String(deadline),
  };
  const signature = await wallet.signTypedData(domain, types, clientMessage);

  // Exactly the shape the server rebuilds: numbers.
  const serverIntent: ExportBatchIntent = {
    tokenIds,
    to: ethers.getAddress(wallet.address),
    userId: "6ab2000000000000000000aa",
    nonce,
    deadline,
  };

  const ok = recoverExportBatchSigner(serverIntent, signature);
  console.log("1. strings signed, numbers verified :", ok === wallet.address ? "MATCH" : "MISMATCH " + ok);

  const reordered = recoverExportBatchSigner({ ...serverIntent, tokenIds: [903, 902, 901] }, signature);
  console.log("2. reordered tokenIds rejected      :", reordered !== wallet.address ? "yes" : "NO — ACCEPTED");

  const extended = recoverExportBatchSigner({ ...serverIntent, tokenIds: [...tokenIds, 999] }, signature);
  console.log("3. extra tokenId appended rejected  :", extended !== wallet.address ? "yes" : "NO — ACCEPTED");

  const swapped = recoverExportBatchSigner({ ...serverIntent, tokenIds: [901, 902, 999] }, signature);
  console.log("4. one tokenId swapped rejected     :", swapped !== wallet.address ? "yes" : "NO — ACCEPTED");

  const other = ethers.Wallet.createRandom();
  const wrongDest = recoverExportBatchSigner({ ...serverIntent, to: other.address }, signature);
  console.log("5. destination changed rejected     :", wrongDest !== wallet.address ? "yes" : "NO — ACCEPTED");

  const single = await wallet.signTypedData(domain, types, { ...clientMessage, tokenIds: ["901"] });
  const singleOk = recoverExportBatchSigner({ ...serverIntent, tokenIds: [901] }, single);
  console.log("6. batch of one still works         :", singleOk === wallet.address ? "MATCH" : "MISMATCH");
})();
