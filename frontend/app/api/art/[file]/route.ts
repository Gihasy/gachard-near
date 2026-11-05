import { readArt } from "@/lib/art";

export async function GET(_: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const bytes = await readArt(`/api/art/${file}`);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
