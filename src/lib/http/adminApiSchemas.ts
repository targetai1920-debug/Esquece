import { z } from "zod";

/**
 * Request validation for /api/admin/* routes — the admin dashboard's own
 * mutations (services, barbers, scheduling, appointments, handoffs). Kept
 * separate from publicApiSchemas.ts (a different trust boundary: these
 * routes require an authenticated admin session, not just an approved
 * website origin).
 */

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const adminCreateAppointmentRequestSchema = z
  .object({
    serviceId: z.string().min(1),
    barberId: z.string().min(1).optional(),
    anyBarber: z.boolean().optional(),
    localDate: z.string().regex(localDatePattern),
    localStartTime: z.string().regex(localTimePattern),
    customer: z.object({ name: z.string().min(1).max(200), phoneE164: z.string().min(6).max(20) }),
    customerNotes: z.string().max(1000).optional(),
  })
  .refine((v) => v.anyBarber || v.barberId, { message: "Debes indicar barberId o anyBarber=true" });

export const adminCancelAppointmentRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const adminRescheduleAppointmentRequestSchema = z.object({
  newLocalDate: z.string().regex(localDatePattern),
  newLocalStartTime: z.string().regex(localTimePattern),
});

/** CANCELLED is deliberately excluded — use POST /api/admin/appointments/[id]/cancel instead, which records cancelledAt/reason and enforces idempotency. */
export const adminUpdateAppointmentStatusRequestSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"]),
});

export const adminCreateServiceRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().nonnegative(),
  currency: z.string().min(1).max(10).optional(),
  durationMinutes: z.number().int().positive(),
  bufferMinutes: z.number().int().nonnegative().optional(),
  category: z.string().max(100).optional(),
  imageUrl: z.string().max(2000).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export const adminUpdateServiceRequestSchema = adminCreateServiceRequestSchema.partial();

export const adminCreateBarberRequestSchema = z.object({
  name: z.string().min(1).max(200),
  biography: z.string().max(2000).optional(),
  specialties: z.string().max(500).optional(),
  photoUrl: z.string().max(2000).optional(),
  phoneE164: z.string().max(20).optional(),
  active: z.boolean().optional(),
  publicBooking: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  calendarId: z.string().max(500).optional(),
});

export const adminUpdateBarberRequestSchema = adminCreateBarberRequestSchema.partial();

export const adminSetBarberServicesRequestSchema = z.object({
  serviceIds: z.array(z.string().min(1)),
});

export const adminSetWorkingHoursRequestSchema = z.object({
  barberId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  openingTime: z.string().regex(localTimePattern),
  closingTime: z.string().regex(localTimePattern),
});

export const adminCreateBreakRequestSchema = z.object({
  barberId: z.string().min(1),
  startTime: z.string().regex(localTimePattern),
  endTime: z.string().regex(localTimePattern),
  recurring: z.boolean(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  date: z.string().regex(localDatePattern).optional(),
  reason: z.string().max(500).optional(),
});

export const adminCreateTimeOffRequestSchema = z.object({
  barberId: z.string().min(1),
  startDate: z.string().regex(localDatePattern),
  endDate: z.string().regex(localDatePattern),
  allDay: z.boolean().optional(),
  startTime: z.string().regex(localTimePattern).optional(),
  endTime: z.string().regex(localTimePattern).optional(),
  reason: z.string().max(500).optional(),
});

export const adminCreateBlockedSlotRequestSchema = z.object({
  barberId: z.string().min(1).optional(),
  localDate: z.string().regex(localDatePattern),
  startTime: z.string().regex(localTimePattern),
  endTime: z.string().regex(localTimePattern),
  reason: z.string().max(500).optional(),
});

export const adminResolveHandoffRequestSchema = z.object({
  resolutionNotes: z.string().max(1000).optional(),
  reactivateBot: z.boolean().optional(),
});
