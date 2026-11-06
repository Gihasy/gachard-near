import { buyPack } from "@/lib/packs";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { seriesId } = await request.json();
    return Response.json(await buyPack(user.id, Number(seriesId)));
  } catch (error) {
    return failure(error);
  }
}
