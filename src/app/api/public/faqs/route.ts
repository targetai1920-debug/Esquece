import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";

export const GET = publicApiRoute({ rateLimit: RATE_LIMITS.read, rateLimitKey: "public:faqs" }, async () => {
  return getCrmClient().listFaqs();
});

export const OPTIONS = publicApiPreflight();
