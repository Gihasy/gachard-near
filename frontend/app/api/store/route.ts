import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { v2StoreEnabled } from "@/lib/v2/flag";
import { activeItems, storeDeps } from "@/lib/v2/store-deps";
import { getStore } from "@/lib/v2/store-service";
import { catalogView } from "@/lib/v2/store-view";

/**
 * The user's store for the current rotation (docs/PLAN-STORE-V2.md phase 1).
 *
 * The first request of a rotation starts it, which sends two transactions and
 * waits for both; ADR-018's 10 seconds covers that on Monad. Until the seed
 * arrives the answer is `preparing`, and the page asks again.
 */
export const maxDuration = 10;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!v2StoreEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.walletAddress) {
    return NextResponse.json({ error: "Your account is still being set up. Try again in a moment." }, { status: 409 });
  }

  const userId = user._id.toString();
  const nowSeconds = Math.floor(Date.now() / 1000);
  try {
    const deps = await storeDeps();
    const items = await activeItems(userId, nowSeconds);
    const result = await getStore(deps, { userId, holder: user.walletAddress }, { nowSeconds, ...items });
    return NextResponse.json({ ...result, catalog: catalogView(deps.catalog), items }, { headers: NO_STORE });
  } catch (error) {
    // Usually a rotation start that has not finished; the next request carries it on.
    console.error("[store] GET failed:", error);
    return NextResponse.json(
      { status: "preparing", error: "The store is being prepared." },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "3" } },
    );
  }
}
