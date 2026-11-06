import { createUser, failure, visitorKey, withSession } from "@/lib/users";

/** A fresh account with starter Credits, so a judge needs no Google login. */
export async function POST() {
  if (process.env.ENABLE_DEMO_LOGIN !== "true") {
    return Response.json({ error: "Demo accounts are disabled." }, { status: 403 });
  }
  try {
    const user = await createUser("demo", await visitorKey());
    return withSession({ ok: true }, user.id);
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
