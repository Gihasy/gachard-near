import { tradeForCard } from "@/lib/economy";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { seriesId, templateId } = await request.json();
    return Response.json(await tradeForCard(user, Number(seriesId), Number(templateId)));
  } catch (error) {
    return failure(error);
  }
}
