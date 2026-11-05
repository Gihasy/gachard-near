import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/session";
import { v2StoreEnabled } from "@/lib/v2/flag";
import { activeItems, storeDeps } from "@/lib/v2/store-deps";
import { RevealError, revealCard } from "@/lib/v2/store-service";

/**
 * Reveal one card of one pack (spec §7 step 4). Free, and the only way a card
 * of the store reaches the browser: the response carries this card and the
 * store as the user now sees it, never a card still face down.
 */
export const maxDuration = 10;

const NO_STORE = { "Cache-Control": "no-store" };
/** A full shelf with Expansion is 25 cards; this leaves room for retries without letting a script hammer the store. */
const REVEALS_PER_MINUTE = 60;

export async function POST(request: Request) {
  if (!v2StoreEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.walletAddress) {
    return NextResponse.json({ error: "Your account is still being set up. Try again in a moment." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { slot?: unknown; card?: unknown } | null;
  const slot = body?.slot;
  const card = body?.card;
  if (!Number.isInteger(slot) || !Number.isInteger(card)) {
    return NextResponse.json({ error: "slot and card must be whole numbers" }, { status: 400 });
  }

  const userId = user._id.toString();
  const { allowed } = await checkRateLimit(userId, "store_reveal", REVEALS_PER_MINUTE);
  if (!allowed) return NextResponse.json({ error: "Too many reveals. Wait a moment." }, { status: 429 });

  const nowSeconds = Math.floor(Date.now() / 1000);
  try {
    const deps = await storeDeps();
    const items = await activeItems(userId, nowSeconds);
    const result = await revealCard(
      deps,
      { userId, holder: user.walletAddress },
      slot as number,
      card as number,
      { nowSeconds, ...items },
    );
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof RevealError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE });
    }
    console.error("[store] reveal failed:", error);
    return NextResponse.json({ error: "Could not reveal that card. Try again." }, { status: 500, headers: NO_STORE });
  }
}
