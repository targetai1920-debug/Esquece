import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth/session";

/**
 * Protects every /admin/* page and /api/admin/* route (SECURITY.md).
 * Login and logout stay reachable without a session; everything else
 * redirects (pages) or returns 401 JSON (API routes) when the session
 * cookie is missing or invalid. Route handlers re-verify the session
 * themselves too (lib/auth/adminRoute.ts) — this is the first line of
 * defense, not the only one.
 */

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/auth/login", "/api/admin/auth/logout"]);

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await verifyAdminSessionToken(token) : null;

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json(
      {
        ok: false,
        requestId: crypto.randomUUID(),
        data: null,
        error: { code: "UNAUTHORIZED", message: "Sesión inválida o expirada.", retryable: false },
      },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
