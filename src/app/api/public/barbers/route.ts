import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";

/** `?serviceId=...` filters to barbers eligible for that service — same query the booking flow needs after picking a service. */
export const GET = publicApiRoute({ rateLimit: RATE_LIMITS.read, rateLimitKey: "public:barbers" }, async (request) => {
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const crm = getCrmClient();
  return serviceId ? crm.listBarbersForService(serviceId) : crm.listBarbers();
});

export const OPTIONS = publicApiPreflight();
