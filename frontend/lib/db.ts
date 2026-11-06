/**
 * App data that does not belong on chain: users, encrypted custodial keys,
 * simulated Credits, pack offers and print serials.
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
import type { HandoffRow } from "./handoff.ts";

export const DATA_DIR = process.env.GACHARD_DATA_DIR ?? join(process.cwd(), ".data");
const DB_FILE = join(DATA_DIR, "db.json");
const MAX_WRITE_ATTEMPTS = 12;

export interface User {
  id: string;
  /** Unique, public, off chain (ADR-045). Accounts from before it have none. */
  username?: string;
  provider: "demo" | "google";
  googleSub?: string;
  accountId: string;
  keyEncrypted: string;
  credits: number;
  /** Made only by burning a card (ADR-046). Accounts from before it have none. */
  crystal?: number;
  /** Cards the collector has locked against dismantling, as "series:template". Off chain. */
  lockedDesigns?: string[];
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

/** A card a creator is still working on. Off chain until its series is published. */
export interface DraftCard {
  id: string;
  name: string;
  rarity: number;
  media: string;
  mediaHash: string;
  createdAt: string;
  /** The line of text in its frame, if it has one. */
  flavor?: string;
  /** The art before framing. Set only on a framed card, so its frame can be redrawn. */
  sourceMedia?: string;
  /** What the frame was drawn from: see frameKeyOf in lib/card-frame.ts. */
  frameKey?: string;
  /** Set while a publish is writing it to the chain, so two publishes cannot both write it. */
  claimedAt?: string;
}

export interface SeriesRow {
  id: number;
  ownerUserId: string;
  creatorAccount: string;
  name: string;
  /** Off chain, for browsing. Series from before it count as Other. */
  category?: string;
  /** Off chain. The series' logo, for its pack and in lists. */
  logo?: string;
  /** Off chain. A sentence or two about the series. */
  description?: string;
  /** When the creator last changed the odds, so a page can say so. */
  oddsChangedAt?: string;
  /** Off chain. Off the listing and sells no new packs. Its cards stay valid. */
  hidden?: boolean;
  /** When its creator deleted it. Off their studio and their series count, and it can no longer change. */
  deletedAt?: string;
  ratesBps: number[];
  prices: number[];
  templates: TemplateRow[];
  /** Off chain and changeable. Series from before drafts have none. */
  drafts?: DraftCard[];
  createdAt: string;
}

export interface PackOffer {
  id: string;
  userId: string;
  seriesId: number;
  templateIds: number[];
  revealed: boolean[];
  /** `unresolved`: the mint's outcome is unknown, so Credits stay held. */
  /** "open" and "skipped" are packs from before ADR-048, which were never charged. */
  status: "open" | "minting" | "bought" | "skipped" | "refunded" | "unresolved";
  tokenIds: string[];
  price: number;
  /** Set when the pack was paid for in Crystal, which is not a sale (ADR-048). */
  crystalPrice?: number;
  createdAt: string;
}

export interface PrintRow {
  cycle: number;
  /** Not a secret: it is printed in the card's QR code. */
  serial: string;
}

export interface DismantleRow {
  userId: string;
  crystal: number;
  at: string;
}

export interface Data {
  users: User[];
  series: SeriesRow[];
  offers: PackOffer[];
  /** token id -> its latest print. */
  prints: Record<string, PrintRow>;
  /** token id -> transaction hash per history entry, oldest first. */
  txs: Record<string, string[]>;
  /** token id -> the Crystal it gave. Makes crediting a burn safe to repeat. */
  dismantled: Record<string, DismantleRow>;
  /** Requests to take a printed card from its holder, while they wait. See lib/handoff.ts. */
  handoffs?: HandoffRow[];
  /** Recent use of each hourly limit, as [unix seconds, amount]. See lib/limits.ts. */
  limits?: Record<string, [number, number][]>;
}

const emptyData = (): Data => ({ users: [], series: [], offers: [], prints: {}, txs: {}, dismantled: {} });

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
  // Saved before a field existed, a document fills it in here.
  return doc ? { ...doc, data: { ...emptyData(), ...doc.data } } : { _id: "state", version: 0, data: emptyData() };
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
