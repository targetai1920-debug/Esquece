import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";

export const GET = publicApiRoute({ rateLimit: RATE_LIMITS.read, rateLimitKey: "public:barber" }, async (_request, context) => {
  const { barberId } = await context.params;
  return getCrmClient().getBarber(barberId);
});

export const OPTIONS = publicApiPreflight();
