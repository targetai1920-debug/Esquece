import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminSetBarberServicesRequestSchema } from "@/lib/http/adminApiSchemas";

export const GET = adminApiRoute({}, async (_request, context) => {
  const { barberId } = await context.params;
  const serviceIds = await getCrmClient().adminGetBarberServices(barberId);
  return { serviceIds };
});

/** Replaces the full set of services this barber is eligible for. */
export const PUT = adminApiRoute({ enforceOrigin: true }, async (request, context) => {
  const { barberId } = await context.params;
  const input = await parseJsonBody(request, adminSetBarberServicesRequestSchema);
  await getCrmClient().adminSetBarberServices(barberId, input.serviceIds);
  return { ok: true };
});
