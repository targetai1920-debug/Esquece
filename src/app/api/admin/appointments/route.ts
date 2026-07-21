import type { AppointmentStatus } from "@/lib/crm/types";
import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminCreateAppointmentRequestSchema } from "@/lib/http/adminApiSchemas";

const APPOINTMENT_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export const GET = adminApiRoute({}, async (request) => {
  const params = request.nextUrl.searchParams;
  const localDate = params.get("localDate") || undefined;
  const barberId = params.get("barberId") || undefined;
  const statusParam = params.get("status");
  const status = statusParam && APPOINTMENT_STATUSES.includes(statusParam as AppointmentStatus) ? (statusParam as AppointmentStatus) : undefined;
  return getCrmClient().listAppointments({ localDate, barberId, status });
});

/** Manual booking entered by staff — uses the same createAppointment path (and re-validation under lock) as the website and WhatsApp. */
export const POST = adminApiRoute({ enforceOrigin: true }, async (request) => {
  const input = await parseJsonBody(request, adminCreateAppointmentRequestSchema);
  const idempotencyKey = `admin_${crypto.randomUUID()}`;
  return getCrmClient().createAppointment({ ...input, idempotencyKey, source: "ADMIN" });
});
