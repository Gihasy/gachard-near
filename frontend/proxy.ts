/**
 * The single auth gate. Next 16 renamed middleware to proxy. A proxy always runs
 * on the Node.js runtime, and setting the `runtime` config option here throws.
 *
 * Route handlers check the user again. This gate only keeps signed-out visitors
 * away from pages that have nothing to show them.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/collection/:path*",
    "/crystal/:path*",
    "/pack/:path*",
    "/api/creator/:path*",
    "/api/packs/:path*",
    "/api/cards/:path*",
  ],
};
