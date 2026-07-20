import { z } from "zod";

/**
 * Zod schemas mirroring the types in types.ts. The Phase 2 implementation
 * must parse every booking-engine input with these before touching the
 * database — see SECURITY.md "Input validation": the engine validates its
 * own inputs independently of whatever validated the HTTP/WhatsApp/admin
 * request that called it.
 */

export const barberSelectorSchema = z.union([
  z.object({ barberId: z.string().min(1) }),
  z.object({ anyAvailable: z.literal(true) }),
]);

export const availabilityQuerySchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  barber: barberSelectorSchema,
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }),
});

export const validateSlotInputSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  startTime: z.date(),
});

export const createAppointmentInputSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  startTime: z.date(),
  customer: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    phone: z.string().min(6),
  }),
  source: z.enum(["WEBSITE", "WHATSAPP", "ADMIN"]),
  comment: z.string().optional(),
});

export const cancelAppointmentInputSchema = z.object({
  appointmentId: z.string().min(1),
  actor: z.object({
    type: z.enum(["customer", "admin", "system"]),
    id: z.string().optional(),
  }),
  reason: z.string().optional(),
});

export const rescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string().min(1),
  newStartTime: z.date(),
  actor: z.object({
    type: z.enum(["customer", "admin", "system"]),
    id: z.string().optional(),
  }),
});
