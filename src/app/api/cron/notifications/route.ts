import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCronSecret } from "@/lib/env/server";
import { getCrmClient } from "@/lib/crm/factory";
import { getWhatsAppClient } from "@/lib/whatsapp/factory";
import { processDueNotifications } from "@/lib/notifications/processor";
import { logger } from "@/lib/logging/logger";

/**
 * Protected notification-processing endpoint — master spec §21. Intended
 * to be hit on a schedule (Render cron job, external scheduler) with
 * `Authorization: Bearer <CRON_SECRET>`. Not tied to any particular HTTP
 * method — schedulers vary in which they use, and this endpoint has no
 * side effect that isn't already idempotent per-notification (claim-then-
 * process), so GET and POST behave identically.
 */

function isAuthorized(request: NextRequest): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (providedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(providedBuf, secretBuf);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, requestId: "n/a", data: null, error: { code: "UNAUTHORIZED", message: "Invalid or missing cron secret.", retryable: false } },
      { status: 401 },
    );
  }

  const crm = getCrmClient();
  const whatsapp = getWhatsAppClient();
  const results = await processDueNotifications(crm, whatsapp);
  logger.info("Processed due notifications", { count: results.length });
  return NextResponse.json({ ok: true, requestId: "n/a", data: { processed: results.length, results }, error: null });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
