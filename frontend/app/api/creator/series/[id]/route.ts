import { deleteSeries, updateSeries } from "@/lib/catalog";
import { cleanCategory } from "@/lib/categories";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { name, ratesPct, prices, category, description } = await request.json();
    await updateSeries(user, Number((await ctx.params).id), {
      name: String(name).trim(),
      ratesBps: (ratesPct as number[]).map((r) => Math.round(Number(r) * 100)),
      prices: (prices as number[]).map(Number),
      category: cleanCategory(category),
      description: typeof description === "string" ? description.trim().slice(0, 200) : "",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    await deleteSeries(user, Number((await ctx.params).id));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
