import { buyPack } from "@/lib/packs";
import { currentUser, failure } from "@/lib/users";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    return Response.json({ tokenIds: await buyPack(user.id, (await ctx.params).id) });
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
