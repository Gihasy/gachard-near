import { addDraft } from "@/lib/catalog";
import { readDb } from "@/lib/db";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const seriesId = Number((await ctx.params).id);
  if ((await readDb()).series.find((s) => s.id === seriesId)?.ownerUserId !== user.id) {
    return Response.json({ error: "This is not your series." }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const file = form.get("art");
    if (!(file instanceof File)) return Response.json({ error: "Choose an image." }, { status: 400 });
    const draft = await addDraft(
      user,
      seriesId,
      String(form.get("name") ?? "").trim(),
      Number(form.get("rarity")),
      Buffer.from(await file.arrayBuffer()),
    );
    return Response.json(draft);
  } catch (error) {
    return failure(error);
  }
}
