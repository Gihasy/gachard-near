// Publishes the three fictional demo IPs drawn by make-demo-art.mjs, each from its own
// creator account, through the same functions a creator's upload uses. Names and art
// hashes go on chain for good. A series that already exists under its name is kept.
// With MONGODB_URL set it seeds that database. Run from frontend:
//   node --env-file=.env.local scripts/seed-demo-ips.ts
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addCard, createSeries } from "../lib/catalog.ts";
import { readDb, usesMongo, withDb, type User } from "../lib/db.ts";
import { createUserAccount } from "../lib/near.ts";

const IPS: { series: string; category: string; username: string; prefix: string; cards: string[] }[] = [
  { series: "Mochi Puffs (fictional IP)", category: "Characters", username: "mochi_puffs_demo", prefix: "mochi", cards: ["Vanilla Puff", "Berry Puff", "Moonlit Puff", "Crown Puff"] },
  { series: "Aika Nova (fictional VTuber)", category: "VTubers", username: "aika_nova_demo", prefix: "aika", cards: ["Morning Stream", "Midnight Stream", "Idol Stage", "Galaxy Diva"] },
  { series: "Noa Vantor (fictional actor)", category: "Actors & musicians", username: "noa_vantor_demo", prefix: "noa", cards: ["First Take", "City of Rain", "Red Carpet", "Golden Night"] },
];
const RARITY_FILES = ["common", "rare", "epic", "legendary"];

console.log(`Demo IPs: seeding ${usesMongo() ? "MongoDB" : "the local file"}...`);
for (const ip of IPS) {
  if ((await readDb()).series.some((s) => s.name === ip.series)) {
    console.log(`Demo IPs: ${ip.series} exists, keeping it.`);
    continue;
  }
  const id = randomBytes(12).toString("hex");
  const creator: User = {
    id,
    username: ip.username,
    provider: "demo",
    ...(await createUserAccount(id)),
    credits: 0,
    approvedCreator: false,
    createdAt: new Date().toISOString(),
  };
  await withDb((d) => d.users.push(creator));
  const series = await createSeries(creator, ip.series, [7000, 2000, 800, 200], [40, 120, 360, 1200], ip.category);
  for (const [rarity, name] of ip.cards.entries()) {
    const art = readFileSync(join(process.cwd(), "public", "cards", "demo", `${ip.prefix}-${RARITY_FILES[rarity]}.jpg`));
    await addCard(creator, series.id, name, rarity, art);
    console.log(`Demo IPs: added ${name}`);
  }
  console.log(`Demo IPs: series ${series.id} is live: ${ip.series}`);
}
// A MongoDB connection would otherwise keep the process open.
process.exit(0);
