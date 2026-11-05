import { revealCard } from "@/lib/packs";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { index } = await request.json();
    return Response.json(await revealCard(user.id, (await ctx.params).id, index));
  } catch (error) {
    return failure(error);
  }
}
