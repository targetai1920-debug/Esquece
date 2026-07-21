import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminCancelAppointmentRequestSchema } from "@/lib/http/adminApiSchemas";

export const POST = adminApiRoute({ enforceOrigin: true }, async (request, context, admin) => {
  const { appointmentId } = await context.params;
  const input = await parseJsonBody(request, adminCancelAppointmentRequestSchema);
  return getCrmClient().cancelAppointment({ appointmentId, actor: { type: "admin", id: admin.email }, reason: input.reason });
});
