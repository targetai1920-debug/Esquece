import { z } from "zod";
import { getCrmClient } from "@/lib/crm/factory";
import { okResponse, errorResponse } from "@/lib/http/envelope";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const availabilityRequestSchema = z
  .object({
    serviceId: z.string().min(1),
    localDate: z.string().regex(localDatePattern),
    staffId: z.string().min(1).optional(),
    anyStaff: z.boolean().optional(),
  })
  .refine((v) => v.anyStaff || v.staffId, { message: "Debes indicar staffId o anyStaff=true" });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = availabilityRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_PAYLOAD", "Solicitud de disponibilidad inválida.", 400);
  }
  const slots = await getCrmClient().getAvailability(parsed.data);
  return okResponse(slots);
}
