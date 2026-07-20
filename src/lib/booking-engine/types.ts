import type { AppointmentSource, AppointmentStatus } from "@prisma/client";

/**
 * Shared types for the booking-and-availability engine.
 * See ARCHITECTURE.md #5 and BOOKING_RULES.md for the rules these types support.
 *
 * NOTHING in this module talks to the database yet — these are the contracts
 * the Phase 2 implementation (see PROJECT_PLAN.md) will fulfill. Website,
 * WhatsApp handler, and admin dashboard are all meant to call these same
 * functions; none of them may reimplement availability logic on their own.
 */

export type BarberSelector = { barberId: string } | { anyAvailable: true };

export interface AvailabilityQuery {
  businessId: string;
  serviceId: string;
  barber: BarberSelector;
  /** Inclusive date range, in BUSINESS_TIMEZONE, not UTC. */
  dateRange: { from: Date; to: Date };
}

export interface TimeSlot {
  barberId: string;
  serviceId: string;
  /** UTC instants; the caller renders these in BUSINESS_TIMEZONE. */
  startTime: Date;
  endTime: Date;
}

export interface AvailabilityResult {
  slots: TimeSlot[];
  /** Set when the query itself is invalid (unknown service, no barbers linked, etc.). */
  error?: string;
}

export interface ValidateSlotInput {
  businessId: string;
  serviceId: string;
  barberId: string;
  startTime: Date;
}

export type SlotValidation =
  | { valid: true }
  | { valid: false; reason: string };

export interface CreateAppointmentInput {
  businessId: string;
  serviceId: string;
  barberId: string;
  startTime: Date;
  customer: {
    id?: string;
    name: string;
    phone: string;
  };
  source: AppointmentSource;
  comment?: string;
}

export interface AppointmentRecord {
  id: string;
  customerId: string;
  serviceId: string;
  barberId: string;
  startTime: Date;
  endTime: Date;
  priceAmount: string;
  currency: string;
  status: AppointmentStatus;
  source: AppointmentSource;
}

export type CreateAppointmentResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; reason: "slot_unavailable"; alternatives: TimeSlot[] }
  | { ok: false; reason: "validation_error"; message: string };

export interface CancelAppointmentInput {
  appointmentId: string;
  actor: { type: "customer" | "admin" | "system"; id?: string };
  reason?: string;
}

export type CancelAppointmentResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_cancelled" | "validation_error"; message?: string };

export interface RescheduleAppointmentInput {
  appointmentId: string;
  newStartTime: Date;
  actor: { type: "customer" | "admin" | "system"; id?: string };
}

export type RescheduleAppointmentResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; reason: "slot_unavailable"; alternatives: TimeSlot[] }
  | { ok: false; reason: "not_found" | "validation_error"; message?: string };
