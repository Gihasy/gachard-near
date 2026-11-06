import { buyPack } from "@/lib/packs";
import { currentUser, failure, visitorKey } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { seriesId, pay } = await request.json();
    return Response.json(await buyPack(user.id, Number(seriesId), pay === "crystal" ? "crystal" : "credits", await visitorKey()));
  } catch (error) {
    return failure(error);
  }
}
