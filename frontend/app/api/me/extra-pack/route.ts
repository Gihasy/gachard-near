import { buyExtraPack } from "@/lib/economy";
import { currentUser, failure } from "@/lib/users";

export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { crystal, extraPacks } = await buyExtraPack(user);
    return Response.json({ crystal, extraPacks });
  } catch (error) {
    return failure(error);
  }
}
