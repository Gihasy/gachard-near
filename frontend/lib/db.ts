/**
 * App data that does not belong on chain: sessions' users, encrypted custodial
 * keys, simulated Credits, pack offers and redeem codes.
 *
 * A JSON file, so the demo runs with no database account (ADR-043). Writes are
 * serialised and replace the file atomically. This suits one Node process, which
 * is what the local demo is; it would not suit serverless hosting.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DATA_DIR = process.env.GACHARD_DATA_DIR ?? join(process.cwd(), ".data");
const DB_FILE = join(DATA_DIR, "db.json");

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
}

export interface SeriesRow {
  id: number;
  ownerUserId: string;
  creatorAccount: string;
  name: string;
  ratesBps: number[];
  prices: number[];
  templates: TemplateRow[];
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

const EMPTY: Data = { users: [], series: [], offers: [], prints: {}, txs: {} };

function load(): Data {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(DB_FILE, "utf8")) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw error;
  }
}

function save(data: Data) {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 1));
  renameSync(temp, DB_FILE);
}

// Next can load a module more than once, so the queue lives on globalThis.
const shared = globalThis as unknown as { gachardDbQueue?: Promise<unknown> };

/** Reads and writes one at a time. Keep chain calls outside `fn`. */
export function withDb<T>(fn: (data: Data) => T): Promise<T> {
  const run = (shared.gachardDbQueue ?? Promise.resolve()).then(() => {
    const data = load();
    const result = fn(data);
    save(data);
    return result;
  });
  shared.gachardDbQueue = run.catch(() => undefined);
  return run;
}

export function readDb(): Data {
  return load();
}
