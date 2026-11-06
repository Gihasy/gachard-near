import { approveHandoff, declineHandoff, readHandoffs, requestHandoff } from "@/lib/handoff";
import { currentUser, failure } from "@/lib/users";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, ctx: Context) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  return Response.json(await readHandoffs(user, (await ctx.params).id));
}

export async function POST(request: Request, ctx: Context) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const tokenId = (await ctx.params).id;
  if (!/^[0-9]+$/.test(tokenId)) return Response.json({ error: "Card not found." }, { status: 404 });
  try {
    const { action, id, code } = await request.json();
    if (action === "request") return Response.json(await requestHandoff(user, tokenId));
    if (action === "decline") await declineHandoff(user, tokenId, String(id ?? ""));
    else if (action === "approve") await approveHandoff(user, tokenId, String(id ?? ""), String(code ?? "").trim());
    else return Response.json({ error: "Unknown action." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
