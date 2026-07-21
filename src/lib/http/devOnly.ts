import { NextResponse } from "next/server";

/** Guard for dev-only routes (the WhatsApp simulator, the API test page's routes) — 404s in production. */
export function devOnlyGuard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, requestId: "n/a", data: null, error: { code: "NOT_FOUND", message: "Not available in production.", retryable: false } }, { status: 404 });
  }
  return null;
}
