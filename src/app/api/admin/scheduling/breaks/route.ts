import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminCreateBreakRequestSchema } from "@/lib/http/adminApiSchemas";

export const GET = adminApiRoute({}, async (request) => {
  const barberId = request.nextUrl.searchParams.get("barberId") || undefined;
  return getCrmClient().adminListBreaks(barberId);
});

export const POST = adminApiRoute({ enforceOrigin: true }, async (request) => {
  const input = await parseJsonBody(request, adminCreateBreakRequestSchema);
  return getCrmClient().adminCreateBreak(input);
});
