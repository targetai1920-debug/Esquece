import { NextResponse, type NextRequest } from "next/server";
import { getPublicWebsiteOrigin, isProduction } from "@/lib/env/server";

/**
 * CORS for /api/public/*. SECURITY.md / master spec §8: production must
 * never use `Access-Control-Allow-Origin: *` for mutation endpoints.
 * PUBLIC_WEBSITE_ORIGIN may be a comma-separated list, so multiple
 * approved origins (e.g. a staging + production website deployment) can
 * be configured without a code change.
 */

function configuredOrigins(): string[] {
  const raw = getPublicWebsiteOrigin();
  if (!raw) return [];
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function devOrigins(): string[] {
  if (isProduction()) return [];
  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return [...configuredOrigins(), ...devOrigins()].includes(origin);
}

export function corsHeaders(origin: string | null): HeadersInit {
  if (!isOriginAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function applyCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value as string);
  }
  return response;
}

/** Call from an OPTIONS handler to answer CORS preflight requests. */
export function handlePreflight(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: isOriginAllowed(origin) ? 204 : 403, headers: corsHeaders(origin) });
}
