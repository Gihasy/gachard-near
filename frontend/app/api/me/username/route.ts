import { currentUser, failure, setUsername } from "@/lib/users";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { username } = await request.json();
    return Response.json({ username: await setUsername(user, String(username ?? "")) });
  } catch (error) {
    return failure(error);
  }
}
