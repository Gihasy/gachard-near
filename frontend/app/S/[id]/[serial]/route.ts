import { siteOrigin } from "@/lib/qr";

/**
 * Where a printed QR points. Capitals and digits fit in fewer QR modules than a normal
 * address (lib/qr-style.ts), so the address on paper is short and sends you to the card.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; serial: string }> }) {
  const { id, serial } = await params;
  if (!/^[0-9]+$/.test(id) || !/^[0-9A-F]{32}$/.test(serial)) return new Response("Not found", { status: 404 });
  return Response.redirect(`${await siteOrigin()}/scan/${id}?print=${serial.toLowerCase()}`, 307);
}
