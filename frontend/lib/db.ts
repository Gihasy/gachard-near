/**
 * App data that does not belong on chain: users, encrypted custodial keys,
 * simulated Credits, pack offers and redeem codes.
 *
 * Two stores behind one interface. Without MONGODB_URL it is a JSON file, so the
 * local demo needs no database account (ADR-043). With MONGODB_URL it is MongoDB,
 * because serverless hosting has no disk that lasts (ADR-044).
 *
 * MongoDB holds everything as one versioned document. A write that lost a race
 * reruns, so a function passed to withDb must only change `data`, and must not
 * call the chain or anything else outside it.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MongoClient, type Collection, type Document } from "mongodb";

export const DATA_DIR = process.env.GACHARD_DATA_DIR ?? join(process.cwd(), ".data");
const DB_FILE = join(DATA_DIR, "db.json");
const MAX_WRITE_ATTEMPTS = 12;

export interface User {
  id: string;
  provider: "demo" | "google";
  googleSub?: string;
  accountId: string;
  keyEncrypted: string;
  credits: number;
  approvedCreator: boolean;
  createdAt: string;
}

export interface TemplateRow {
  id: number;
  name: string;
  rarity: number;
  media: string;
  mediaHash: string;
  createdAt: string;
}

export interface SeriesRow {
  id: number;
  ownerUserId: string;
  creatorAccount: string;
  name: string;
  ratesBps: number[];
  prices: number[];
  templates: TemplateRow[];
  createdAt: string;
}

export interface PackOffer {
  id: string;
  userId: string;
  seriesId: number;
  templateIds: number[];
  revealed: boolean[];
  /** `unresolved`: the mint's outcome is unknown, so Credits stay held. */
  status: "open" | "minting" | "bought" | "skipped" | "unresolved";
  tokenIds: string[];
  price: number;
  createdAt: string;
}

export interface PrintRow {
  cycle: number;
  codeEncrypted: string;
}

export interface Data {
  users: User[];
  series: SeriesRow[];
  offers: PackOffer[];
  /** token id -> redeem code of its current print cycle. */
  prints: Record<string, PrintRow>;
  /** token id -> transaction hash per history entry, oldest first. */
  txs: Record<string, string[]>;
}

const emptyData = (): Data => ({ users: [], series: [], offers: [], prints: {}, txs: {} });

// ---- MongoDB ----

// Next can load a module more than once, so shared state lives on globalThis.
const shared = globalThis as unknown as {
  gachardDbQueue?: Promise<unknown>;
  gachardMongo?: Promise<MongoClient>;
};

export const usesMongo = () => Boolean(process.env.MONGODB_URL);

export async function mongoCollection<T extends Document>(name: string): Promise<Collection<T>> {
  shared.gachardMongo ??= new MongoClient(process.env.MONGODB_URL!).connect();
  const client = await shared.gachardMongo;
  return client.db(process.env.MONGODB_DB ?? "gachard_near").collection<T>(name);
}

interface StateDoc {
  _id: string;
  version: number;
  data: Data;
}

async function mongoRead(): Promise<StateDoc> {
  const states = await mongoCollection<StateDoc>("state");
  const doc = await states.findOne({ _id: "state" });
  return doc ?? { _id: "state", version: 0, data: emptyData() };
}

async function mongoWrite<T>(fn: (data: Data) => T): Promise<T> {
  const states = await mongoCollection<StateDoc>("state");
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { version, data } = await mongoRead();
    const result = fn(data);
    try {
      // Upsert on the first write. If two race, the duplicate _id loses and reruns.
      const written = await states.updateOne(
        { _id: "state", version },
        { $set: { version: version + 1, data } },
        { upsert: true },
      );
      if (written.matchedCount === 1 || written.upsertedCount === 1) return result;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("Could not save after several attempts.");
}

// ---- JSON file ----

function fileRead(): Data {
  try {
    return { ...emptyData(), ...JSON.parse(readFileSync(DB_FILE, "utf8")) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
    throw error;
  }
}

function fileWrite<T>(fn: (data: Data) => T): Promise<T> {
  const run = (shared.gachardDbQueue ?? Promise.resolve()).then(() => {
    const data = fileRead();
    const result = fn(data);
    mkdirSync(dirname(DB_FILE), { recursive: true });
    const temp = `${DB_FILE}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 1));
    renameSync(temp, DB_FILE);
    return result;
  });
  shared.gachardDbQueue = run.catch(() => undefined);
  return run;
}

// ---- The interface ----

/** Reads, changes and saves. `fn` may run more than once. Keep chain calls out of it. */
export function withDb<T>(fn: (data: Data) => T): Promise<T> {
  return usesMongo() ? mongoWrite(fn) : fileWrite(fn);
}

export async function readDb(): Promise<Data> {
  return usesMongo() ? (await mongoRead()).data : fileRead();
}
