import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ART_DIR } from "@/lib/catalog";

export async function GET(_: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[0-9a-f]{64}\.webp$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    return new Response(readFileSync(join(ART_DIR, file)), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
