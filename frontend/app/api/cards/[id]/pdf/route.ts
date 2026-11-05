import { codeForHolder, readCard } from "@/lib/cards";
import { printPdf } from "@/lib/pdf";
import { currentUser, failure } from "@/lib/users";

/** Only the current holder gets the PDF, because it shows the redeem code. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const card = await readCard(id);
    const code = card && codeForHolder(user, card);
    if (!card || !code) return Response.json({ error: "No print to download." }, { status: 404 });
    const pdf = await printPdf({
      tokenId: id,
      cardName: card.cardName,
      seriesName: card.seriesName,
      media: card.media,
      code,
      printCycle: card.print_cycle,
      scanUrl: `${new URL(request.url).origin}/scan/${id}`,
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
