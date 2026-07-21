import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminUpdateBarberRequestSchema } from "@/lib/http/adminApiSchemas";

export const PATCH = adminApiRoute({ enforceOrigin: true }, async (request, context) => {
  const { barberId } = await context.params;
  const patch = await parseJsonBody(request, adminUpdateBarberRequestSchema);
  return getCrmClient().adminUpdateBarber(barberId, patch);
});
