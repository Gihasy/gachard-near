import { removeDraft, updateDraft } from "@/lib/catalog";
import { currentUser, failure } from "@/lib/users";

type Context = { params: Promise<{ id: string; draft: string }> };

export async function POST(request: Request, ctx: Context) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id, draft } = await ctx.params;
  try {
    const form = await request.formData();
    const file = form.get("art");
    await updateDraft(user, Number(id), draft, {
      name: String(form.get("name") ?? "").trim(),
      rarity: Number(form.get("rarity")),
      ...(file instanceof File && file.size ? { art: Buffer.from(await file.arrayBuffer()) } : {}),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id, draft } = await ctx.params;
  try {
    await removeDraft(user, Number(id), draft);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
