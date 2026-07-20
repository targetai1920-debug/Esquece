import { getCrmClient } from "@/lib/crm/factory";
import { publicApiRoute, publicApiPreflight, parseJsonBody } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";
import { rescheduleAppointmentRequestSchema } from "@/lib/http/publicApiSchemas";

export const POST = publicApiRoute(
  { rateLimit: RATE_LIMITS.mutation, rateLimitKey: "public:appointments:reschedule", enforceOrigin: true },
  async (request, context) => {
    const { reference } = await context.params;
    const input = await parseJsonBody(request, rescheduleAppointmentRequestSchema);
    const crm = getCrmClient();

    // Resolve reference+token to an appointmentId first — this call alone
    // verifies the token (CrmClient.getAppointmentByReference) before any
    // mutation is attempted.
    const appointment = await crm.getAppointmentByReference(reference, input.managementToken);

    return crm.rescheduleAppointment({
      appointmentId: appointment.appointmentId,
      managementToken: input.managementToken,
      actor: { type: "customer" },
      newLocalDate: input.newLocalDate,
      newLocalStartTime: input.newLocalStartTime,
    });
  },
);

export const OPTIONS = publicApiPreflight();
