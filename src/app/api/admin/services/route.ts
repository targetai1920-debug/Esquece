import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminCreateServiceRequestSchema } from "@/lib/http/adminApiSchemas";

export const GET = adminApiRoute({}, async () => {
  return getCrmClient().adminListServices();
});

export const POST = adminApiRoute({ enforceOrigin: true }, async (request) => {
  const input = await parseJsonBody(request, adminCreateServiceRequestSchema);
  return getCrmClient().adminCreateService(input);
});
