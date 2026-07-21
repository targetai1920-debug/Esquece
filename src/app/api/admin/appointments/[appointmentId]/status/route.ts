import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminUpdateAppointmentStatusRequestSchema } from "@/lib/http/adminApiSchemas";

/** For staff marking an appointment CONFIRMED/COMPLETED/NO_SHOW directly — cancellation has its own route (uses cancelAppointment, not this). */
export const POST = adminApiRoute({ enforceOrigin: true }, async (request, context, admin) => {
  const { appointmentId } = await context.params;
  const input = await parseJsonBody(request, adminUpdateAppointmentStatusRequestSchema);
  return getCrmClient().updateAppointmentStatus(appointmentId, input.status, { type: "admin", id: admin.email });
});
