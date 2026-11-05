import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { v2StoreEnabled } from "@/lib/v2/flag";
import { storeDeps } from "@/lib/v2/store-deps";
import { revealDue } from "@/lib/v2/store-service";

/**
 * The daily backstop for rotation reveals (docs/PLAN-STORE-V2.md phase 1).
 * Store visits reveal due rotations as they go; on a quiet day nobody visits,
 * so Vercel Cron calls this once a day (vercel.json).
 *
 * proxy.ts lets /api/cron/ through without a session, because Vercel Cron has
 * none. This route checks `Authorization: Bearer <CRON_SECRET>` itself, and
 * refuses everything while CRON_SECRET is unset.
 */
export const maxDuration = 10;

/** Hashing first makes both sides the same length, so the compare leaks nothing about it. */
function sameSecret(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !sameSecret(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!v2StoreEnabled()) return NextResponse.json({ revealed: [], note: "v2 store is off" });

  try {
    const revealed = await revealDue(await storeDeps(), Math.floor(Date.now() / 1000));
    return NextResponse.json({ revealed });
  } catch (error) {
    // rotationOverdue on chain raises a late reveal to monitoring (spec §15).
    console.error("[cron] store reveal failed:", error);
    return NextResponse.json({ error: "Reveal failed" }, { status: 500 });
  }
}
