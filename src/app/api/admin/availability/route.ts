import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { availabilityRequestSchema } from "@/lib/http/publicApiSchemas";

/** Same getAvailability() the website/WhatsApp use — for the manual-booking form's slot picker. */
export const POST = adminApiRoute({}, async (request) => {
  const input = await parseJsonBody(request, availabilityRequestSchema);
  return getCrmClient().getAvailability(input);
});
