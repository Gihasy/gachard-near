/**
 * The single auth gate. Next 16 renamed middleware to proxy. A proxy always runs
 * on the Node.js runtime, and setting the `runtime` config option here throws.
 *
 * Route handlers check the user again. This gate keeps signed-out visitors away from
 * pages that have nothing to show them, and refuses writes sent from another site.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// A SameSite cookie stops a site acting as a signed-in visitor, but not signing them in
// to an account of its choosing. Browsers send Origin with every write. A request with
// none is not a browser's, so no visitor's cookies are at stake.
function fromAnotherSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

const SIGNED_IN_ONLY = /^\/(collection|crystal|pack|api\/creator|api\/packs|api\/cards)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const writes = request.method !== "GET" && request.method !== "HEAD";
  if (pathname.startsWith("/api/") && writes && fromAnotherSite(request)) {
    return NextResponse.json({ error: "This request came from another site." }, { status: 403 });
  }
  if (!SIGNED_IN_ONLY.test(pathname) || verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/collection/:path*",
    "/crystal/:path*",
    "/pack/:path*",
    "/api/:path*",
  ],
};
