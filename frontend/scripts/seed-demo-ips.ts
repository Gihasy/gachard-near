// Publishes the four fictional demo series drawn by make-series-art.mjs, each from its own
// creator account, through the same functions a creator's upload uses. Names and art
// hashes go on chain for good. Then it hides the series they replace. Their cards stay
// valid and can still be scanned. Safe to run again: it adds only what is missing.
// With MONGODB_URL set it seeds that database. Run from frontend:
//   node --env-file=.env.local scripts/seed-demo-ips.ts
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addCard, createSeries } from "../lib/catalog.ts";
import { readDb, usesMongo, withDb, type User } from "../lib/db.ts";
import { createUserAccount } from "../lib/near.ts";
import { FILES, SERIES } from "./series-data.mjs";

const REPLACED = [
  "Crystal Night: Starter Set",
  "Mochi Puffs (fictional IP)",
  "Aika Nova (fictional VTuber)",
  "Noa Vantor (fictional actor)",
];

async function creatorFor(username: string): Promise<User> {
  const existing = (await readDb()).users.find((u) => u.username === username);
  if (existing) return existing;
  const id = randomBytes(12).toString("hex");
  const creator: User = {
    id,
    username,
    provider: "demo",
    ...(await createUserAccount(id)),
    credits: 0,
    approvedCreator: false,
    createdAt: new Date().toISOString(),
  };
  await withDb((d) => d.users.push(creator));
  return creator;
}

console.log(`Demo series: seeding ${usesMongo() ? "MongoDB" : "the local file"}...`);
for (const ip of SERIES) {
  const creator = await creatorFor(ip.username);
  const existing = (await readDb()).series.find((s) => s.name === ip.name);
  const series = existing ?? (await createSeries(creator, ip.name, [7000, 2000, 800, 200], [40, 120, 360, 1200], ip.category));
  const logo = `/cards/series/${ip.prefix}-logo.png`;
  await withDb((d) => {
    const row = d.series.find((s) => s.id === series.id);
    if (row) row.logo = logo;
  });
  for (const [index, [file, rarity]] of FILES.entries()) {
    const [name] = ip.cards[index];
    if (series.templates.some((t) => t.name === name)) continue;
    const art = readFileSync(join(process.cwd(), "public", "cards", "series", `${ip.prefix}-${file}.jpg`));
    await addCard((await readDb()).users.find((u) => u.id === creator.id)!, series.id, name, rarity as number, art);
    console.log(`Demo series: added ${name}`);
  }
  console.log(`Demo series: series ${series.id} is live: ${ip.name}`);
}

await withDb((d) => {
  for (const row of d.series) if (REPLACED.includes(row.name)) row.hidden = true;
});
console.log(`Demo series: hid ${REPLACED.join(", ")}`);
// A MongoDB connection would otherwise keep the process open.
process.exit(0);
