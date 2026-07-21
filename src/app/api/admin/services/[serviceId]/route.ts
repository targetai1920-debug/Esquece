import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminUpdateServiceRequestSchema } from "@/lib/http/adminApiSchemas";

export const PATCH = adminApiRoute({ enforceOrigin: true }, async (request, context) => {
  const { serviceId } = await context.params;
  const patch = await parseJsonBody(request, adminUpdateServiceRequestSchema);
  return getCrmClient().adminUpdateService(serviceId, patch);
});
