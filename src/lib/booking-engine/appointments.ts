import {
  cancelAppointmentInputSchema,
  createAppointmentInputSchema,
  rescheduleAppointmentInputSchema,
} from "./schemas";
import { NotImplementedError } from "./errors";
import type {
  CancelAppointmentInput,
  CancelAppointmentResult,
  CreateAppointmentInput,
  CreateAppointmentResult,
  RescheduleAppointmentInput,
  RescheduleAppointmentResult,
} from "./types";

/**
 * The only sanctioned way to create an appointment. Must run inside a
 * database transaction, re-validate the slot from scratch (BOOKING_RULES.md
 * #3), and rely on the Postgres EXCLUDE constraint (ARCHITECTURE.md #5) —
 * not just the application-level check — as the actual anti-double-booking
 * guarantee. No caller may call `prisma.appointment.create` directly.
 *
 * STUB — not implemented. Always throws.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  createAppointmentInputSchema.parse(input);
  throw new NotImplementedError("createAppointment");
}

/**
 * Cancels an appointment (BOOKING_RULES.md #5) and writes an AuditLog entry.
 *
 * STUB — not implemented. Always throws.
 */
export async function cancelAppointment(
  input: CancelAppointmentInput,
): Promise<CancelAppointmentResult> {
  cancelAppointmentInputSchema.parse(input);
  throw new NotImplementedError("cancelAppointment");
}

/**
 * Reschedules an appointment. Must validate the new slot with the full
 * createAppointment path *before* releasing the old slot (BOOKING_RULES.md
 * #5) — a failed reschedule must never leave the customer with no
 * appointment at all.
 *
 * STUB — not implemented. Always throws.
 */
export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
): Promise<RescheduleAppointmentResult> {
  rescheduleAppointmentInputSchema.parse(input);
  throw new NotImplementedError("rescheduleAppointment");
}
