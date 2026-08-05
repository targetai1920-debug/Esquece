import { z } from "zod";
import { getCrmClient } from "@/lib/crm/factory";
import { okResponse, errorResponse, crmErrorToResponse } from "@/lib/http/envelope";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const createAppointmentRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    serviceId: z.string().min(1),
    staffId: z.string().min(1).optional(),
    anyStaff: z.boolean().optional(),
    localDate: z.string().regex(localDatePattern),
    localStartTime: z.string().regex(localTimePattern),
    customer: z.object({ name: z.string().min(1).max(200), phone: z.string().min(6).max(20), email: z.string().email().optional() }),
    customerNotes: z.string().max(1000).optional(),
  })
  .refine((v) => v.anyStaff || v.staffId, { message: "Debes indicar staffId o anyStaff=true" });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createAppointmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_PAYLOAD", "Solicitud de reserva inválida.", 400);
  }
  try {
    const result = await getCrmClient().createAppointment({ ...parsed.data, source: "WEBSITE" });
    return okResponse(result, 201);
  } catch (err) {
    return crmErrorToResponse(err);
  }
}
