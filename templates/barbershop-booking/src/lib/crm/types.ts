/**
 * Generic CRM entity model and the CrmClient interface — see
 * .claude/skills/barbershop-crm-builder/references/crm-data-model.md.
 * Storage-agnostic: LocalJsonCrmClient (localClient.ts) is one
 * implementation; a networked backend (spreadsheet+script, or a database)
 * would implement the same interface without any consumer code changing.
 */

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type AppointmentSource = "WEBSITE" | "ADMIN" | "WHATSAPP" | "OTHER";

export interface BusinessSettings {
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  address: string;
  phone: string;
  email: string;
  instagram: string;
  mapsUrl: string;
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  allowAnyStaff: boolean;
  cancellationNoticeHours: number;
  cancellationPolicy: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationMinutes: number;
  bufferMinutes: number;
  active: boolean;
  image: string;
}

export interface WorkingDay {
  closed: boolean;
  start?: string;
  end?: string;
}

export interface Staff {
  id: string;
  name: string;
  biography: string;
  photo: string;
  active: boolean;
  publicBooking: boolean;
  serviceIds: string[];
  workingHours: Partial<Record<string, WorkingDay>>;
  breaks: { days: string[]; start: string; end: string }[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  reference: string;
  idempotencyKey: string;
  serviceId: string;
  serviceNameSnapshot: string;
  servicePriceSnapshot: number;
  serviceDurationSnapshot: number;
  serviceBufferSnapshot: number;
  staffId: string;
  staffNameSnapshot: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  customerNotes?: string;
  managementTokenHash: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface AvailableSlot {
  localStartTime: string;
  localEndTime: string;
  staffIds: string[];
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: "customer" | "admin" | "system";
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  active: boolean;
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
}

export const BLOCKING_STATUSES: readonly AppointmentStatus[] = ["PENDING", "CONFIRMED"];

export interface CreateAppointmentInput {
  idempotencyKey: string;
  serviceId: string;
  staffId?: string;
  anyStaff?: boolean;
  localDate: string;
  localStartTime: string;
  customer: { name: string; phone: string; email?: string };
  customerNotes?: string;
  source: AppointmentSource;
}

export interface CreateAppointmentResult {
  appointment: Appointment;
  managementToken: string | null;
  idempotent: boolean;
}

export interface ValidateSlotInput {
  serviceId: string;
  staffId: string;
  localDate: string;
  localStartTime: string;
}

export interface AvailabilityInput {
  serviceId: string;
  localDate: string;
  staffId?: string;
  anyStaff?: boolean;
}

export interface RescheduleInput {
  appointmentId: string;
  managementToken: string;
  newLocalDate: string;
  newLocalStartTime: string;
}

export interface CancelInput {
  appointmentId: string;
  managementToken: string;
  reason?: string;
}

/** Every consumer (public API, admin dashboard, optional channels) depends on this interface only. */
export interface CrmClient {
  getBusinessSettings(): Promise<BusinessSettings>;
  listServices(): Promise<Service[]>;
  listStaff(): Promise<Staff[]>;
  listStaffForService(serviceId: string): Promise<Staff[]>;
  listFaqs(): Promise<Faq[]>;
  listPromotions(): Promise<Promotion[]>;

  getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]>;
  validateSlot(input: ValidateSlotInput): Promise<{ valid: boolean; reason?: string }>;

  createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult>;
  getAppointmentByReference(reference: string, managementToken: string): Promise<Appointment | null>;
  cancelAppointment(input: CancelInput): Promise<Appointment>;
  rescheduleAppointment(input: RescheduleInput): Promise<Appointment>;

  // Admin-facing, still routed through the exact same engine as any other caller.
  listAppointments(filter?: { localDate?: string; staffId?: string; status?: AppointmentStatus }): Promise<Appointment[]>;
  listAuditLog(): Promise<AuditEntry[]>;
}
