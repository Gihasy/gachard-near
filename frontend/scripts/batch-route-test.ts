/** Exercises the new batch checks in /api/privy/export/prepare. Throwaway. */
import { ethers } from "ethers";
import { MongoClient, ObjectId } from "mongodb";
import { createHmac } from "crypto";
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

import { buildExportIntentDomain, EXPORT_BATCH_TYPES } from "../lib/export-intent";

const BASE = "http://localhost:3000";
const EMAIL = "batch-probe@gachard.test";
const OWNER = "0x00000000000000000000000000000000batchpr";

(async () => {
  const wallet = ethers.Wallet.createRandom();
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME || "gachard");

  await db.collection("cards").deleteMany({ ownerAddress: OWNER });
  await db.collection("users").deleteMany({ email: EMAIL });
  await db.collection("privy_nonces").deleteMany({ userId: { $exists: true }, cardId: /^batch-probe-/ });

  const userId = new ObjectId();
  await db.collection("users").insertOne({
    _id: userId, email: EMAIL, username: "batch-probe", walletAddress: OWNER,
    privyUserId: "did:privy:batchprobe", privyWalletAddress: wallet.address,
    advancedMode: true, createdAt: new Date().toISOString(),
  });
  const tpl = await db.collection("card_templates").find({}).limit(3).toArray();
  const now = new Date().toISOString();
  await db.collection("cards").insertMany([0, 1, 2].map((i) => ({
    cardId: `batch-probe-${i}`, tokenId: 950000 + i, templateId: tpl[i].templateId,
    rarity: tpl[i].rarity ?? 0, ownerAddress: OWNER, status: "Digital",
    fulfillmentStatus: null, isListed: false, viewed: true, createdAt: now,
  })));

  const ts = Math.floor(Date.now() / 1000);
  const payload = `${userId.toString()}.${ts}`;
  const cookie = `gachard_session=${payload}.${createHmac("sha256", Buffer.from(process.env.ENCRYPTION_SECRET_KEY!, "utf8")).update(payload).digest("hex")}`;

  const domain = buildExportIntentDomain();
  const types = EXPORT_BATCH_TYPES as unknown as Record<string, ethers.TypedDataField[]>;
  const uid = userId.toString();

  const sign = async (tokenIds: number[], nonce: string, deadline: number) =>
    wallet.signTypedData(domain, types, {
      tokenIds: tokenIds.map(String), to: wallet.address, userId: uid, nonce, deadline: String(deadline),
    });

  const post = async (body: unknown) => {
    const r = await fetch(`${BASE}/api/privy/export/prepare`, {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const all = [950000, 950001, 950002];
  const dl = Math.floor(Date.now() / 1000) + 600;
  const show = (n: string, r: { status: number; body: { error?: string } | null }) =>
    console.log(`${n.padEnd(42)} ${r.status}  ${(r.body?.error ?? "ok").slice(0, 58)}`);

  // A. a card that is NOT in the signed set
  let nonce = crypto.randomUUID();
  let sig = await sign([950000, 950001], nonce, dl);
  show("A. card outside the signed set", await post({ cardId: "batch-probe-2", tokenIds: [950000, 950001], signature: sig, nonce, deadline: dl }));

  // B. tokenIds reordered after signing
  nonce = crypto.randomUUID();
  sig = await sign(all, nonce, dl);
  show("B. tokenIds reordered after signing", await post({ cardId: "batch-probe-0", tokenIds: [950002, 950001, 950000], signature: sig, nonce, deadline: dl }));

  // C. batch larger than the cap
  nonce = crypto.randomUUID();
  const big = Array.from({ length: 21 }, (_, i) => 950000 + i);
  sig = await sign(big, nonce, dl);
  show("C. batch over MAX_EXPORT_BATCH", await post({ cardId: "batch-probe-0", tokenIds: big, signature: sig, nonce, deadline: dl }));

  // D. missing tokenIds entirely
  nonce = crypto.randomUUID();
  sig = await sign(all, nonce, dl);
  show("D. tokenIds omitted", await post({ cardId: "batch-probe-0", signature: sig, nonce, deadline: dl }));

  // E. a genuine batch: card 0 then card 1 share one signature
  nonce = crypto.randomUUID();
  sig = await sign(all, nonce, dl);
  show("E1. valid, card 0 of the batch", await post({ cardId: "batch-probe-0", tokenIds: all, signature: sig, nonce, deadline: dl }));
  show("E2. valid, card 1, same signature", await post({ cardId: "batch-probe-1", tokenIds: all, signature: sig, nonce, deadline: dl }));
  show("E3. replay of card 0, same signature", await post({ cardId: "batch-probe-0", tokenIds: all, signature: sig, nonce, deadline: dl }));

  console.log("\nnonce rows written:", await db.collection("privy_nonces").countDocuments({ batchNonce: nonce }),
    "(expect 2: one per card)   markers:", await db.collection("privy_nonces").countDocuments({ nonce, batchMarker: true }), "(expect 1)");

  await db.collection("cards").deleteMany({ ownerAddress: OWNER });
  await db.collection("users").deleteMany({ email: EMAIL });
  await db.collection("privy_nonces").deleteMany({ userId: uid });
  await db.collection("rate_limits").deleteMany({ userId: uid });
  console.log("cleaned up");
  await client.close();
})();
