import { printCard } from "@/lib/cards";
import { currentUser, failure } from "@/lib/users";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    await printCard(user, (await ctx.params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
