/**
 * Take the v1 → v2 migration snapshot (docs/CONTRACT-V2-SPEC.md §17).
 *
 * Reads every card from MongoDB and checks each one against the v1 contract
 * at a single block. It writes the entries, their Merkle proofs and the root
 * that MigrationMinter is deployed with, and lists every card left out and why.
 *
 *   cd frontend
 *   MONGODB_URL=... node scripts/v2-migration-snapshot.mjs --templates ../path/to/template-map.json
 *
 * Environment:
 *   MONGODB_URL      required (never hardcode it here)
 *   DATABASE_NAME    default "gachard"
 *   MONAD_RPC_URL    default https://testnet-rpc.monad.xyz
 *   V1_CONTRACT      default CONTRACT_ADDRESS, then the deployed v1 address
 *
 * --templates is a JSON object mapping each v1 template name to its v2
 * template id, e.g. { "common-1": 101 }. Every template must be mapped.
 *
 * Output goes to frontend/.migration/ (git-ignored: it lists wallet addresses).
 * The file is never overwritten: the snapshot is the append-only record that
 * recovery depends on (ADR-036). Keep a copy outside the database's environment.
 *
 * Read-only: this script writes nothing to MongoDB and sends no transaction.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider } from "ethers";
import { MongoClient } from "mongodb";
import { buildMerkle, migrationLeaf, verifyMerkle } from "../lib/v2/chain-v2.ts";
import { planSnapshot } from "../lib/v2/migration-snapshot.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DEPLOYED_V1 = "0x2a05a2e3b0e7355b97de593e354063e9474c9d08";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const templatesPath = arg("--templates");
if (!templatesPath) throw new Error("--templates <map.json> is required");
const templateMap = JSON.parse(readFileSync(resolve(process.cwd(), templatesPath), "utf8"));

const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) throw new Error("MONGODB_URL is not set");
const dbName = process.env.DATABASE_NAME || "gachard";
const rpcUrl = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const v1Address = (process.env.V1_CONTRACT || process.env.CONTRACT_ADDRESS || DEPLOYED_V1).trim();

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
const block = await provider.getBlock("latest");
if (!block) throw new Error("could not read the latest block");
const blockTag = block.number;

const v1 = new Contract(
  v1Address,
  [
    "function cardStatus(uint256 tokenId) view returns (uint8)",
    "function balanceOf(address account, uint256 id) view returns (uint256)",
  ],
  provider,
);
const chain = {
  cardStatus: async (tokenId) => Number(await v1.cardStatus(tokenId, { blockTag })),
  balanceOf: async (holder, tokenId) => BigInt(await v1.balanceOf(holder, tokenId, { blockTag })),
};

const client = new MongoClient(mongoUrl);
let cards;
try {
  await client.connect();
  cards = await client
    .db(dbName)
    .collection("cards")
    .find(
      {},
      {
        projection: {
          _id: 0,
          cardId: 1,
          tokenId: 1,
          templateId: 1,
          status: 1,
          ownerAddress: 1,
          privyWalletAddress: 1,
          releasedTo: 1,
          contractAddress: 1,
          isListed: 1,
        },
      },
    )
    .toArray();
} finally {
  await client.close();
}

const plan = await planSnapshot({ cards, chain, templateMap, v1Contract: v1Address });
if (plan.entries.length === 0) throw new Error("no card qualifies for migration; nothing to write");

const leaves = plan.entries.map(migrationLeaf);
const tree = buildMerkle(leaves);
leaves.forEach((leaf, i) => {
  if (!verifyMerkle(tree.proofs[i], tree.root, leaf)) throw new Error(`proof ${i} does not verify`);
});

const snapshot = {
  note: "v1 → v2 migration snapshot. Append-only: never edit; take a new one instead.",
  createdAt: new Date().toISOString(),
  chainId: Number(network.chainId),
  block: { number: block.number, hash: block.hash, timestamp: block.timestamp },
  v1Contract: v1Address,
  database: dbName,
  root: tree.root,
  counts: { cards: cards.length, entries: plan.entries.length, excluded: plan.excluded.length },
  entries: plan.entries.map((e, i) => ({
    v1TokenId: e.v1TokenId.toString(),
    holder: e.holder,
    templateId: e.templateId,
    kind: e.kind,
    cardId: e.cardId,
    dbStatus: e.dbStatus,
    leaf: leaves[i],
    proof: tree.proofs[i],
  })),
  excluded: plan.excluded,
  warnings: plan.warnings,
};

const outDir = resolve(here, "../.migration");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `snapshot-${snapshot.chainId}-${block.number}.json`);
if (existsSync(outFile)) throw new Error(`${outFile} already exists; snapshots are never overwritten`);
const body = JSON.stringify(snapshot, null, 2) + "\n";
writeFileSync(outFile, body, { flag: "wx" });

console.log(`Snapshot at block ${block.number} (${block.hash})`);
console.log(`  ${plan.entries.length} entries, ${plan.excluded.length} excluded, ${plan.warnings.length} warnings`);
console.log(`  root    ${tree.root}`);
console.log(`  sha256  ${createHash("sha256").update(body).digest("hex")}`);
console.log(`  file    ${outFile}`);
if (plan.excluded.length) console.log("Review every excluded card before deploying MigrationMinter.");
