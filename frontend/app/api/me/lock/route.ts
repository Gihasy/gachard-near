import { withDb } from "@/lib/db";
import { ContractRefused } from "@/lib/near";
import { currentUser, failure } from "@/lib/users";

const MAX_LOCKS = 200;

/** A collector's own safety catch: a locked card cannot be dismantled. It stays off chain. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { design, locked } = await request.json();
    if (typeof design !== "string" || !/^\d{1,9}:\d{1,9}$/.test(design)) {
      return Response.json({ error: "There is no such card." }, { status: 400 });
    }
    const [seriesId, templateId] = design.split(":").map(Number);
    const lockedDesigns = await withDb((d) => {
      const row = d.users.find((u) => u.id === user.id)!;
      const rest = (row.lockedDesigns ?? []).filter((item) => item !== design);
      if (locked) {
        const real = d.series.find((s) => s.id === seriesId)?.templates.some((t) => t.id === templateId);
        if (!real) throw new ContractRefused("There is no such card.");
        if (rest.length >= MAX_LOCKS) throw new ContractRefused(`You can lock up to ${MAX_LOCKS} cards.`);
      }
      row.lockedDesigns = locked ? [...rest, design] : rest;
      return row.lockedDesigns;
    });
    return Response.json({ lockedDesigns });
  } catch (error) {
    return failure(error);
  }
}
