import { readCard, serialForHolder } from "@/lib/cards";
import { printPdf } from "@/lib/pdf";
import { currentUser, failure } from "@/lib/users";

/** The print file, for the current holder. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const card = await readCard(id);
    const serial = card && (await serialForHolder(user, card));
    if (!card || !serial) return Response.json({ error: "No print to download." }, { status: 404 });
    const pdf = await printPdf({
      tokenId: id,
      cardName: card.cardName,
      seriesName: card.seriesName,
      media: card.media,
      serial,
      printCycle: card.print_cycle,
      origin: new URL(request.url).origin,
    });
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="gachard-card-${id}-demo-print.pdf"`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}

// Waits for a transaction to land.
export const maxDuration = 30;
