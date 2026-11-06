import { publishSeries } from "@/lib/catalog";
import { currentUser, failure } from "@/lib/users";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    return Response.json(await publishSeries(user, Number((await ctx.params).id)));
  } catch (error) {
    return failure(error);
  }
}

// Waits for transactions to land.
export const maxDuration = 30;
