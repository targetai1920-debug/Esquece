import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminCreateBlockedSlotRequestSchema } from "@/lib/http/adminApiSchemas";

export const GET = adminApiRoute({}, async (request) => {
  const barberId = request.nextUrl.searchParams.get("barberId") || undefined;
  return getCrmClient().adminListBlockedSlots(barberId);
});

export const POST = adminApiRoute({ enforceOrigin: true }, async (request) => {
  const input = await parseJsonBody(request, adminCreateBlockedSlotRequestSchema);
  return getCrmClient().adminCreateBlockedSlot(input);
});
