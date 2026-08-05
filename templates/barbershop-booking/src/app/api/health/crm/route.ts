import { getCrmClient } from "@/lib/crm/factory";
import { okResponse, errorResponse } from "@/lib/http/envelope";

/**
 * The ONLY source of truth for "is the CRM connected" — see §4 of the
 * factory continuation brief. Never infer connectivity from config having
 * a webAppUrl set, or from a previous successful call; this route always
 * performs a live call to the configured CrmClient (health() on
 * LocalCrmClient resolves immediately; on AppsScriptCrmClient it makes a
 * real signed HTTP round-trip to the deployed Web App). Used by
 * factory/prepare-crm.mjs's connect guide and by an operator confirming a
 * new deployment is actually wired up, not just configured.
 */
export async function GET() {
  try {
    const result = await getCrmClient().health();
    return okResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con el CRM.";
    return errorResponse("CRM_UNREACHABLE", message, 503, true);
  }
}
