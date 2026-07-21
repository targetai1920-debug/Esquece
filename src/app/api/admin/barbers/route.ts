import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminCreateBarberRequestSchema } from "@/lib/http/adminApiSchemas";

export const GET = adminApiRoute({}, async () => {
  return getCrmClient().adminListBarbers();
});

export const POST = adminApiRoute({ enforceOrigin: true }, async (request) => {
  const input = await parseJsonBody(request, adminCreateBarberRequestSchema);
  return getCrmClient().adminCreateBarber(input);
});
