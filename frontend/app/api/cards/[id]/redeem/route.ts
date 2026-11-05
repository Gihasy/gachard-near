import { redeemCard } from "@/lib/cards";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { code } = await request.json();
    await redeemCard(user, (await ctx.params).id, String(code ?? ""));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
