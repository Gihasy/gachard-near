import { cleanCategory } from "@/lib/categories";
import { asNumbers, createSeries } from "@/lib/catalog";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { name, ratesPct, prices, category, description } = await request.json();
    const about = typeof description === "string" ? description.trim().slice(0, 200) : "";
    const series = await createSeries(user, String(name ?? "").trim(), asNumbers(ratesPct, 100), asNumbers(prices), cleanCategory(category), about);
    return Response.json({ id: series.id });
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
