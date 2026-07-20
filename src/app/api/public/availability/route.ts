import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight, parseJsonBody } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";
import { availabilityRequestSchema } from "@/lib/http/publicApiSchemas";

/**
 * Read-only — ARCHITECTURE.md §4/§5: never trusted as the final word by
 * this route or its caller. createAppointment re-validates under the
 * Apps Script lock regardless of what this returned.
 */
export const POST = publicApiRoute({ rateLimit: RATE_LIMITS.availability, rateLimitKey: "public:availability" }, async (request) => {
  const input = await parseJsonBody(request, availabilityRequestSchema);
  return getCrmClient().getAvailability(input);
});

export const OPTIONS = publicApiPreflight();
