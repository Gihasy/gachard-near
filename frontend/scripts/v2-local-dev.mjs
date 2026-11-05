/**
 * The v2 store on your machine, with one command: anvil, the v2 contracts,
 * the seed keeper, and `next dev` with CHAIN_VERSION=v2.
 *
 *   cd frontend && node scripts/v2-local-dev.mjs
 *
 * Needs:
 * - Foundry (anvil, forge) on PATH;
 * - a local MongoDB. MONGODB_URL defaults to mongodb://127.0.0.1:27018, for
 *   example `docker run -d --name gachard-mongo-local -p 127.0.0.1:27018:27017 mongo:7.0`.
 *
 * Sign in with the demo account. Everything here is local and disposable:
 * - anvil's public development keys;
 * - an encryption key that protects only this local database;
 * - the database itself, emptied whenever a fresh chain is deployed.
 * The script refuses a remote database, or one whose name does not end in
 * `_local`, so none of this can touch real data.
 *
 * The values are passed as process environment, which wins over
 * frontend/.env.local, so a restored .env.local cannot point this at Atlas.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, "..");
const CONTRACTS = resolve(here, "../../contracts");
const ANVIL_PORT = 8545;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const WEB_PORT = process.env.PORT ?? "3001";
const MONGODB_URL = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27018";
const DATABASE_NAME = process.env.DATABASE_NAME ?? "gachard_v2_local";

const host = new URL(MONGODB_URL.replace(/^mongodb(\+srv)?:/, "http:")).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
  throw new Error(`MONGODB_URL must be a local database for v2 local development, not ${host}`);
}
if (!DATABASE_NAME.endsWith("_local")) throw new Error(`DATABASE_NAME must end in "_local", not ${DATABASE_NAME}`);

/** Foundry's binary: from FOUNDRY_BIN, else ~/.foundry/bin when PATH lacks it (the app's preview server does). */
function foundry(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const dir = process.env.FOUNDRY_BIN ?? resolve(homedir(), ".foundry/bin");
  return existsSync(resolve(dir, exe)) ? resolve(dir, exe) : name;
}

const children = [];
const stopAll = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

async function rpcUp() {
  try {
    await new JsonRpcProvider(RPC, 31337, { staticNetwork: true }).getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

if (await rpcUp()) {
  console.log(`local-dev: using the chain already on ${RPC}`);
} else {
  children.push(spawn(foundry("anvil"), ["--port", String(ANVIL_PORT), "--silent"], { stdio: "ignore" }));
  for (let i = 0; i < 60 && !(await rpcUp()); i++) await new Promise((r) => setTimeout(r, 250));
  console.log(`local-dev: anvil on ${RPC}`);
  execFileSync(foundry("forge"), ["script", "script/v2/LocalDevV2.s.sol", "--rpc-url", RPC, "--broadcast"], {
    cwd: CONTRACTS,
    env: { ...process.env, FOUNDRY_PROFILE: "v2" },
    stdio: "ignore",
  });
  console.log("local-dev: v2 contracts deployed (contracts/deployments/local-v2.json)");
  // A fresh chain knows no rotation, so a database kept from an earlier chain would claim
  // commits and seeds that are not there. Start it empty too.
  const { MongoClient } = await import("mongodb");
  const client = await new MongoClient(MONGODB_URL).connect();
  await client.db(DATABASE_NAME).dropDatabase();
  await client.close();
  console.log(`local-dev: fresh chain, so ${DATABASE_NAME} starts empty`);
}

const addresses = JSON.parse(readFileSync(resolve(CONTRACTS, "deployments/local-v2.json"), "utf8"));

children.push(spawn(process.execPath, [resolve(here, "v2-local-keeper.mjs"), RPC], { stdio: "inherit" }));

const env = {
  ...process.env,
  MONGODB_URL,
  DATABASE_NAME,
  ENCRYPTION_SECRET_KEY: "local-dev-only-key-protects-nothing-real",
  ENABLE_DEMO_LOGIN: "true",
  CHAIN_VERSION: "v2",
  V2_RPC_URL: RPC,
  V2_CARDS: addresses.cards,
  V2_STORE: addresses.store,
  V2_ALBUMS: addresses.albums,
  // anvil's public development keys 3 and 4, which LocalDevV2 makes relayers
  V2_RELAYER_KEYS: [
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  ].join(","),
};
// Next's own entry point, run with this Node: no shell, so no argument is ever re-parsed.
const next = spawn(process.execPath, [resolve(FRONTEND, "node_modules/next/dist/bin/next"), "dev", "-p", WEB_PORT], {
  cwd: FRONTEND,
  env,
  stdio: "inherit",
});
children.push(next);
next.on("exit", stopAll);
