import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight, parseJsonBody } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";
import { createAppointmentRequestSchema } from "@/lib/http/publicApiSchemas";

/**
 * Requires idempotencyKey in the body (WEBSITE_INTEGRATION.md documents
 * this as the required field, not a header, for simplicity on the
 * website's side). Returns the raw managementToken once — only its hash
 * is ever persisted (SECURITY.md). The separate website constructs its
 * own management URL from `appointment.reference` + `managementToken`;
 * this API doesn't know the website's domain.
 */
export const POST = publicApiRoute(
  { rateLimit: RATE_LIMITS.mutation, rateLimitKey: "public:appointments:create", enforceOrigin: true },
  async (request) => {
    const input = await parseJsonBody(request, createAppointmentRequestSchema);
    return getCrmClient().createAppointment({ ...input, source: "WEBSITE" });
  },
);

export const OPTIONS = publicApiPreflight();
