/**
 * Hourly limits, kept with the rest of the app's data so every server function sees
 * the same count. Global limits alone let one visitor use up everyone's allowance, so
 * each global limit here sits behind a tighter one per user or per visitor.
 */
import type { Data } from "./db.ts";

const HOUR_S = 3600;

export type Limit = { key: string; max: number; amount?: number };

/**
 * Counts every limit, or none if any would be passed. Call it inside withDb, which keeps
 * this atomic and reruns it if the write loses a race.
 */
export function spend(data: Data, limits: Limit[]): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ledger = data.limits ?? {};
  for (const key of Object.keys(ledger)) {
    ledger[key] = ledger[key].filter(([at]) => now - at < HOUR_S);
    if (!ledger[key].length) delete ledger[key];
  }
  data.limits = ledger;
  const used = (key: string) => (ledger[key] ?? []).reduce((sum, [, amount]) => sum + amount, 0);
  if (limits.some(({ key, max, amount = 1 }) => used(key) + amount > max)) return false;
  for (const { key, amount = 1 } of limits) (ledger[key] ??= []).push([now, amount]);
  return true;
}
