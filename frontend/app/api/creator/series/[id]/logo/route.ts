import { storeArt } from "@/lib/art";
import { readDb, withDb } from "@/lib/db";
import { currentUser, failure } from "@/lib/users";

/** A series' logo. It is app data, so unlike a card's art it stays off chain. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const seriesId = Number((await ctx.params).id);
  if ((await readDb()).series.find((s) => s.id === seriesId)?.ownerUserId !== user.id) {
    return Response.json({ error: "This is not your series." }, { status: 403 });
  }
  try {
    const file = (await request.formData()).get("logo");
    if (!(file instanceof File)) return Response.json({ error: "Choose an image." }, { status: 400 });
    const { media } = await storeArt(Buffer.from(await file.arrayBuffer()));
    await withDb((d) => {
      const row = d.series.find((s) => s.id === seriesId);
      if (row) row.logo = media;
    });
    return Response.json({ logo: media });
  } catch (error) {
    return failure(error);
  }
}
