import { openPack } from "@/lib/packs";
import { currentUser, failure } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { seriesId } = await request.json();
    const offer = await openPack(user.id, Number(seriesId));
    return Response.json({ id: offer.id });
  } catch (error) {
    return failure(error);
  }
}
