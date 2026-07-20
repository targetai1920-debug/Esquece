import { NextResponse } from "next/server";
import { getCrmClient } from "@/lib/crm/factory";
import { CrmError } from "@/lib/crm/errors";
import { getCrmProvider } from "@/lib/env/server";

/**
 * CRM-specific health: reachability, authentication, schema-version
 * compatibility. Short timeout inherited from CRM_REQUEST_TIMEOUT_MS —
 * this route doesn't add its own on top.
 */
export async function GET() {
  const provider = getCrmProvider();
  try {
    const crm = getCrmClient();
    const health = await crm.health();
    return NextResponse.json({
      ok: true,
      provider,
      crmStatus: health.status,
      schemaVersion: health.schemaVersion,
      apiVersion: health.apiVersion,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const code = err instanceof CrmError ? err.code : "INTERNAL_ERROR";
    return NextResponse.json(
      { ok: false, provider, error: { code }, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
