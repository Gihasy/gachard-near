import { OAuth2Client } from "google-auth-library";
import { readDb } from "@/lib/db";
import { createUser, failure, withSession } from "@/lib/users";

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: "Google sign-in is not set up." }, { status: 404 });
  try {
    const { token } = await request.json();
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: token, audience: clientId });
    const sub = ticket.getPayload()?.sub;
    if (!sub) return Response.json({ error: "Sign-in failed." }, { status: 400 });
    // The Google id is all that is kept: no email, no name (ADR-032).
    const existing = readDb().users.find((u) => u.googleSub === sub);
    const user = existing ?? (await createUser("google", sub));
    return withSession({ ok: true }, user.id);
  } catch (error) {
    return failure(error);
  }
}
