import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminSetWorkingHoursRequestSchema } from "@/lib/http/adminApiSchemas";

export const GET = adminApiRoute({}, async (request) => {
  const barberId = request.nextUrl.searchParams.get("barberId") || undefined;
  return getCrmClient().adminListWorkingHours(barberId);
});

/** Creates or updates (by barberId + dayOfWeek) — see Availability.gs's effective-hours intersection logic. */
export const POST = adminApiRoute({ enforceOrigin: true }, async (request) => {
  const input = await parseJsonBody(request, adminSetWorkingHoursRequestSchema);
  return getCrmClient().adminSetWorkingHours(input);
});
