import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminRescheduleAppointmentRequestSchema } from "@/lib/http/adminApiSchemas";

export const POST = adminApiRoute({ enforceOrigin: true }, async (request, context, admin) => {
  const { appointmentId } = await context.params;
  const input = await parseJsonBody(request, adminRescheduleAppointmentRequestSchema);
  return getCrmClient().rescheduleAppointment({
    appointmentId,
    actor: { type: "admin", id: admin.email },
    newLocalDate: input.newLocalDate,
    newLocalStartTime: input.newLocalStartTime,
  });
});
