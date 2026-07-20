import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";

export const GET = publicApiRoute({ rateLimit: RATE_LIMITS.read, rateLimitKey: "public:service" }, async (_request, context) => {
  const { serviceId } = await context.params;
  return getCrmClient().getService(serviceId);
});

export const OPTIONS = publicApiPreflight();
