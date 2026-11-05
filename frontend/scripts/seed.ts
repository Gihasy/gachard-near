// A live demo series, so a visitor has something to open straight away. It goes
// through the same functions a creator's upload does, with real transactions.
// Run after setup. If any series exists, nothing is changed. With MONGODB_URL set
// it seeds that database, which is how a hosted deployment gets its series.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { addCard, createSeries } from "../lib/catalog.ts";
import { readDb, usesMongo, withDb, type User } from "../lib/db.ts";
import { createUserAccount } from "../lib/near.ts";

const CARDS: [string, number, string][] = [
  ["Lunar Fang", 0, "common-1.webp"],
  ["Stonebind", 0, "common-2.webp"],
  ["Aquoris Sentinel", 1, "rare-1.webp"],
  ["Vexora Swarm", 1, "rare-2.webp"],
  ["Nyxthalon", 2, "epic-1.webp"],
  ["Pyravion Ascent", 2, "epic-2.webp"],
  ["Aurelia Nexus", 3, "legendary-1.webp"],
  ["Draconion Aurelis", 3, "legendary-2.webp"],
];

if ((await readDb()).series.length > 0) {
  console.log("Seed: a series exists, keeping it.");
  process.exit(0);
}

console.log(`Seed: creating the demo creator (${usesMongo() ? "MongoDB" : "local file"})...`);
const id = randomBytes(12).toString("hex");
const creator: User = {
  id,
  provider: "demo",
  ...(await createUserAccount(id)),
  credits: 0,
  approvedCreator: false,
  createdAt: new Date().toISOString(),
};
await withDb((d) => d.users.push(creator));

const series = await createSeries(creator, "Crystal Night: Starter Set", [7000, 2000, 800, 200], [40, 120, 360, 1200]);
for (const [name, rarity, file] of CARDS) {
  console.log(`Seed: adding ${name}...`);
  // The same conversion the upload form does in the browser.
  const art = await sharp(readFileSync(join(process.cwd(), "public", "cards", file)))
    .resize({ width: 1630, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  await addCard(creator, series.id, name, rarity, art);
}
console.log(`Seed: done, series ${series.id} is live.`);
// A MongoDB connection would otherwise keep the process open.
process.exit(0);
