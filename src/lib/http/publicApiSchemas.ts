import { z } from "zod";

/**
 * Request validation for /api/public/* routes. Kept separate from
 * lib/crm/schemas.ts (which validates CRM *responses*) — these validate
 * what the separate website sends *in*.
 */

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const availabilityRequestSchema = z
  .object({
    serviceId: z.string().min(1),
    localDate: z.string().regex(localDatePattern, "Formato esperado YYYY-MM-DD"),
    barberId: z.string().min(1).optional(),
    anyBarber: z.boolean().optional(),
  })
  .refine((v) => v.anyBarber || v.barberId, { message: "Debes indicar barberId o anyBarber=true" });

export const validateSlotRequestSchema = z.object({
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  localDate: z.string().regex(localDatePattern, "Formato esperado YYYY-MM-DD"),
  localStartTime: z.string().regex(localTimePattern, "Formato esperado HH:mm"),
});

const customerSchema = z.object({
  name: z.string().min(1).max(200),
  phoneE164: z.string().min(6).max(20),
});

export const createAppointmentRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    serviceId: z.string().min(1),
    barberId: z.string().min(1).optional(),
    anyBarber: z.boolean().optional(),
    localDate: z.string().regex(localDatePattern),
    localStartTime: z.string().regex(localTimePattern),
    customer: customerSchema,
    customerNotes: z.string().max(1000).optional(),
  })
  .refine((v) => v.anyBarber || v.barberId, { message: "Debes indicar barberId o anyBarber=true" });

export const cancelAppointmentRequestSchema = z.object({
  managementToken: z.string().min(10),
  reason: z.string().max(500).optional(),
});

export const rescheduleAppointmentRequestSchema = z.object({
  managementToken: z.string().min(10),
  newLocalDate: z.string().regex(localDatePattern),
  newLocalStartTime: z.string().regex(localTimePattern),
});
