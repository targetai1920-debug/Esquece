import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight, parseJsonBody } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";
import { cancelAppointmentRequestSchema } from "@/lib/http/publicApiSchemas";

export const POST = publicApiRoute(
  { rateLimit: RATE_LIMITS.mutation, rateLimitKey: "public:appointments:cancel", enforceOrigin: true },
  async (request, context) => {
    const { reference } = await context.params;
    const input = await parseJsonBody(request, cancelAppointmentRequestSchema);
    return getCrmClient().cancelAppointment({
      reference,
      managementToken: input.managementToken,
      reason: input.reason,
      actor: { type: "customer" },
    });
  },
);

export const OPTIONS = publicApiPreflight();
