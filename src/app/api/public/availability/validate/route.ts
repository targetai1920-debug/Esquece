import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight, parseJsonBody } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";
import { validateSlotRequestSchema } from "@/lib/http/publicApiSchemas";

/** Lightweight "is this still free?" check — a UX nicety, not the final word (same caveat as /availability). */
export const POST = publicApiRoute({ rateLimit: RATE_LIMITS.availability, rateLimitKey: "public:availability:validate" }, async (request) => {
  const input = await parseJsonBody(request, validateSlotRequestSchema);
  return getCrmClient().validateSlot(input);
});

export const OPTIONS = publicApiPreflight();
