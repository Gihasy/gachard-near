import { createSeries } from "@/lib/catalog";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { name, ratesPct, prices } = await request.json();
    const ratesBps = (ratesPct as number[]).map((r) => Math.round(Number(r) * 100));
    const series = await createSeries(user, String(name).trim(), ratesBps, (prices as number[]).map(Number));
    return Response.json({ id: series.id });
  } catch (error) {
    return failure(error);
  }
}
