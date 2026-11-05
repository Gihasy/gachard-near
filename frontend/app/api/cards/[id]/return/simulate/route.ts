import { simulateReturnAnswer } from "@/lib/cards";
import { currentUser, failure } from "@/lib/users";

/**
 * Stands in for Gachard receiving the physical card (ADR-045), so it exists only
 * where demo accounts do. In production a person would make this call.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (process.env.ENABLE_DEMO_LOGIN !== "true") {
    return Response.json({ error: "The simulation is disabled." }, { status: 403 });
  }
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { accepted } = await request.json();
    await simulateReturnAnswer(user, (await ctx.params).id, accepted === true);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
