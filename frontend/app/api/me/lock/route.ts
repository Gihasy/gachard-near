import { withDb } from "@/lib/db";
import { currentUser, failure } from "@/lib/users";

/** A collector's own safety catch: a locked card cannot be dismantled. It stays off chain. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { design, locked } = await request.json();
    if (typeof design !== "string" || !/^\d+:\d+$/.test(design)) {
      return Response.json({ error: "There is no such card." }, { status: 400 });
    }
    const lockedDesigns = await withDb((d) => {
      const row = d.users.find((u) => u.id === user.id)!;
      const rest = (row.lockedDesigns ?? []).filter((item) => item !== design);
      row.lockedDesigns = locked ? [...rest, design] : rest;
      return row.lockedDesigns;
    });
    return Response.json({ lockedDesigns });
  } catch (error) {
    return failure(error);
  }
}
