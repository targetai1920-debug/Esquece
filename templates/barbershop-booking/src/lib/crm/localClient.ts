import { randomUUID, createHash } from "node:crypto";
import {
  checkSlotValidity,
  getAvailableSlotsAnyStaff,
  getAvailableSlotsForStaff,
  pickStaffForAnyAvailable,
  type AvailabilityContext,
} from "../booking/availability";
import { withLock } from "../booking/lock";
import { CrmError } from "./errors";
import type {
  Appointment,
  AppointmentStatus,
  AuditEntry,
  AvailabilityInput,
  AvailableSlot,
  BlockedSlot,
  BusinessSettings,
  CancelInput,
  Customer,
  CreateAppointmentInput,
  CreateAppointmentResult,
  CrmClient,
  Faq,
  Promotion,
  RescheduleInput,
  Service,
  Staff,
  TimeOff,
  ValidateSlotInput,
} from "./types";

export interface LocalCrmSeed {
  settings: BusinessSettings;
  services: Service[];
  staff: Staff[];
  faqs: Faq[];
  promotions: Promotion[];
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Generic, storage-agnostic CRM implementation backed by an in-memory
 * store, seeded once from a client configuration. Implements exactly the
 * CrmClient interface every consumer (public API, admin dashboard) uses —
 * swapping this for a networked backend (a spreadsheet+script CRM, or a
 * database) means writing a new class with the same interface, never
 * touching a consumer. See
 * .claude/skills/barbershop-crm-builder/references/architecture-and-decisions.md.
 */
export class LocalCrmClient implements CrmClient {
  private settings: BusinessSettings;
  private services: Service[];
  private staff: Staff[];
  private faqs: Faq[];
  private promotions: Promotion[];
  private appointments: Appointment[] = [];
  private customers: Customer[] = [];
  private auditLog: AuditEntry[] = [];
  private timeOff: TimeOff[] = [];
  private blockedSlots: BlockedSlot[] = [];
  private idempotencyIndex = new Map<string, string>(); // key -> appointmentId
  private managementTokens = new Map<string, string>(); // appointmentId -> tokenHash
  private now: () => Date;

  constructor(seed: LocalCrmSeed, now: () => Date = () => new Date()) {
    this.settings = seed.settings;
    this.services = seed.services;
    this.staff = seed.staff;
    this.faqs = seed.faqs;
    this.promotions = seed.promotions;
    this.now = now;
  }

  private nowLocalString(): string {
    const d = this.now();
    return d.toISOString().slice(0, 16).replace("Z", "");
  }

  private buildContext(): AvailabilityContext {
    return {
      settings: this.settings,
      services: this.services,
      staff: this.staff,
      appointments: this.appointments,
      timeOff: this.timeOff,
      blockedSlots: this.blockedSlots,
      nowLocal: this.nowLocalString(),
    };
  }

  private audit(entry: Omit<AuditEntry, "id" | "createdAt">) {
    this.auditLog.push({ ...entry, id: randomUUID(), createdAt: new Date().toISOString() });
  }

  async getBusinessSettings(): Promise<BusinessSettings> {
    return this.settings;
  }

  async listServices(): Promise<Service[]> {
    return this.services.filter((s) => s.active);
  }

  async adminListServices(): Promise<Service[]> {
    return [...this.services];
  }

  async listStaff(): Promise<Staff[]> {
    return this.staff.filter((s) => s.active && s.publicBooking);
  }

  async adminListStaff(): Promise<Staff[]> {
    return [...this.staff];
  }

  async listStaffForService(serviceId: string): Promise<Staff[]> {
    return this.staff.filter((s) => s.active && s.publicBooking && s.serviceIds.includes(serviceId));
  }

  async listFaqs(): Promise<Faq[]> {
    return this.faqs.filter((f) => f.active);
  }

  async listPromotions(): Promise<Promotion[]> {
    const nowIso = this.now().toISOString().slice(0, 10);
    return this.promotions.filter((p) => p.active && p.validFrom <= nowIso && nowIso <= p.validUntil);
  }

  async getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]> {
    const ctx = this.buildContext();
    if (input.staffId) {
      return getAvailableSlotsForStaff(ctx, { serviceId: input.serviceId, staffId: input.staffId, localDate: input.localDate });
    }
    return getAvailableSlotsAnyStaff(ctx, { serviceId: input.serviceId, localDate: input.localDate });
  }

  async validateSlot(input: ValidateSlotInput): Promise<{ valid: boolean; reason?: string }> {
    const ctx = this.buildContext();
    const result = checkSlotValidity(ctx, input);
    return result.valid ? { valid: true } : { valid: false, reason: result.reason };
  }

  private upsertCustomer(input: { name: string; phone: string; email?: string }): Customer {
    const normalized = normalizePhone(input.phone);
    const existing = this.customers.find((c) => normalizePhone(c.phone) === normalized);
    if (existing) {
      existing.name = input.name || existing.name;
      existing.email = input.email ?? existing.email;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }
    const created: Customer = {
      id: randomUUID(),
      name: input.name,
      phone: input.phone,
      email: input.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.customers.push(created);
    return created;
  }

  async createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    return withLock(() => {
      // Idempotent retry: same key returns the original result.
      const existingId = this.idempotencyIndex.get(input.idempotencyKey);
      if (existingId) {
        const existing = this.appointments.find((a) => a.id === existingId)!;
        return { appointment: existing, managementToken: null, idempotent: true };
      }

      const ctx = this.buildContext(); // rebuilt inside the lock — never reused from before acquisition
      const service = this.services.find((s) => s.id === input.serviceId && s.active);
      if (!service) throw new CrmError("SERVICE_NOT_FOUND", "El servicio no existe o no está activo.");

      let staffId = input.staffId;
      if (!staffId) {
        if (!input.anyStaff) throw new CrmError("STAFF_REQUIRED", "Debes indicar un profesional o anyStaff=true.");
        const eligible = this.staff.filter((s) => s.active && s.serviceIds.includes(service.id));
        const available = eligible.filter(
          (s) =>
            checkSlotValidity(ctx, {
              serviceId: service.id,
              staffId: s.id,
              localDate: input.localDate,
              localStartTime: input.localStartTime,
            }).valid,
        );
        if (available.length === 0) throw new CrmError("SLOT_UNAVAILABLE", "El horario ya no está disponible.");
        staffId = pickStaffForAnyAvailable(ctx, available.map((s) => s.id), input.localDate);
      }

      const staff = this.staff.find((s) => s.id === staffId && s.active);
      if (!staff) throw new CrmError("STAFF_NOT_FOUND", "El profesional no existe o no está activo.");

      const check = checkSlotValidity(ctx, {
        serviceId: service.id,
        staffId: staff.id,
        localDate: input.localDate,
        localStartTime: input.localStartTime,
      });
      if (!check.valid) throw new CrmError(check.reason, "El horario ya no está disponible.");

      const customer = this.upsertCustomer(input.customer);
      const endMinutes =
        toMinutes(input.localStartTime) + service.durationMinutes + service.bufferMinutes;

      const managementToken = randomUUID() + randomUUID();
      const appointment: Appointment = {
        id: randomUUID(),
        reference: generateReference(input.localDate),
        idempotencyKey: input.idempotencyKey,
        serviceId: service.id,
        serviceNameSnapshot: service.name,
        servicePriceSnapshot: service.price,
        serviceDurationSnapshot: service.durationMinutes,
        serviceBufferSnapshot: service.bufferMinutes,
        staffId: staff.id,
        staffNameSnapshot: staff.name,
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        localDate: input.localDate,
        localStartTime: input.localStartTime,
        localEndTime: toHHMM(endMinutes),
        status: "CONFIRMED",
        source: input.source,
        customerNotes: input.customerNotes,
        managementTokenHash: hashToken(managementToken),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.appointments.push(appointment);
      this.idempotencyIndex.set(input.idempotencyKey, appointment.id);
      this.managementTokens.set(appointment.id, appointment.managementTokenHash!);
      this.audit({ action: "createAppointment", entityType: "Appointment", entityId: appointment.id, actorType: input.source === "ADMIN" ? "admin" : "customer" });

      return { appointment, managementToken, idempotent: false };
    });
  }

  private verifyManagementToken(appointmentId: string, token: string): boolean {
    const expected = this.managementTokens.get(appointmentId);
    if (!expected) return false;
    return expected === hashToken(token);
  }

  async getAppointmentByReference(reference: string, managementToken: string): Promise<Appointment | null> {
    const appt = this.appointments.find((a) => a.reference === reference);
    if (!appt) return null;
    if (!this.verifyManagementToken(appt.id, managementToken)) throw new CrmError("UNAUTHORIZED", "Token de gestión inválido.");
    return appt;
  }

  async cancelAppointment(input: CancelInput): Promise<Appointment> {
    return withLock(() => {
      const appt = this.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new CrmError("APPOINTMENT_NOT_FOUND", "La cita no existe.");
      if (!this.verifyManagementToken(appt.id, input.managementToken)) throw new CrmError("UNAUTHORIZED", "Token de gestión inválido.");
      if (appt.status === "CANCELLED") return appt; // idempotent
      if (appt.status === "COMPLETED") throw new CrmError("APPOINTMENT_NOT_CHANGEABLE", "La cita ya fue completada.");
      appt.status = "CANCELLED";
      appt.cancelledAt = new Date().toISOString();
      appt.cancellationReason = input.reason;
      appt.updatedAt = new Date().toISOString();
      this.audit({ action: "cancelAppointment", entityType: "Appointment", entityId: appt.id, actorType: "customer" });
      return appt;
    });
  }

  async rescheduleAppointment(input: RescheduleInput): Promise<Appointment> {
    return withLock(() => {
      const appt = this.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new CrmError("APPOINTMENT_NOT_FOUND", "La cita no existe.");
      if (!this.verifyManagementToken(appt.id, input.managementToken)) throw new CrmError("UNAUTHORIZED", "Token de gestión inválido.");
      if (appt.status !== "PENDING" && appt.status !== "CONFIRMED") {
        throw new CrmError("APPOINTMENT_NOT_CHANGEABLE", "La cita no puede reprogramarse en su estado actual.");
      }

      const ctx = this.buildContext();
      const check = checkSlotValidity(ctx, {
        serviceId: appt.serviceId,
        staffId: appt.staffId,
        localDate: input.newLocalDate,
        localStartTime: input.newLocalStartTime,
        excludeAppointmentId: appt.id, // the old slot must not block validating the new one
      });
      if (!check.valid) throw new CrmError(check.reason, "El nuevo horario no está disponible.");

      // Only touch the appointment after the new slot's validity is confirmed.
      const endMinutes = toMinutes(input.newLocalStartTime) + appt.serviceDurationSnapshot + appt.serviceBufferSnapshot;
      appt.localDate = input.newLocalDate;
      appt.localStartTime = input.newLocalStartTime;
      appt.localEndTime = toHHMM(endMinutes);
      appt.updatedAt = new Date().toISOString();
      this.audit({ action: "rescheduleAppointment", entityType: "Appointment", entityId: appt.id, actorType: "customer" });
      return appt;
    });
  }

  async listAppointments(filter?: { localDate?: string; staffId?: string; status?: AppointmentStatus }): Promise<Appointment[]> {
    return this.appointments.filter(
      (a) =>
        (!filter?.localDate || a.localDate === filter.localDate) &&
        (!filter?.staffId || a.staffId === filter.staffId) &&
        (!filter?.status || a.status === filter.status),
    );
  }

  async listAuditLog(): Promise<AuditEntry[]> {
    return this.auditLog;
  }

  async health(): Promise<{ status: "live"; schemaVersion: string }> {
    return { status: "live", schemaVersion: "1" };
  }

  private setAppointmentStatus(appointmentId: string, status: AppointmentStatus, action: string): Appointment {
    const appt = this.appointments.find((a) => a.id === appointmentId);
    if (!appt) throw new CrmError("APPOINTMENT_NOT_FOUND", "La cita no existe.");
    appt.status = status;
    appt.updatedAt = new Date().toISOString();
    this.audit({ action, entityType: "Appointment", entityId: appt.id, actorType: "admin" });
    return appt;
  }

  async confirmAppointment(appointmentId: string): Promise<Appointment> {
    return this.setAppointmentStatus(appointmentId, "CONFIRMED", "confirmAppointment");
  }

  async completeAppointment(appointmentId: string): Promise<Appointment> {
    return this.setAppointmentStatus(appointmentId, "COMPLETED", "completeAppointment");
  }

  async markNoShow(appointmentId: string): Promise<Appointment> {
    return this.setAppointmentStatus(appointmentId, "NO_SHOW", "markNoShow");
  }

  async adminCancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    return withLock(() => {
      const appt = this.appointments.find((a) => a.id === appointmentId);
      if (!appt) throw new CrmError("APPOINTMENT_NOT_FOUND", "La cita no existe.");
      if (appt.status === "CANCELLED") return appt;
      if (appt.status === "COMPLETED") throw new CrmError("APPOINTMENT_NOT_CHANGEABLE", "La cita ya fue completada.");
      appt.status = "CANCELLED";
      appt.cancelledAt = new Date().toISOString();
      appt.cancellationReason = reason;
      appt.updatedAt = new Date().toISOString();
      this.audit({ action: "adminCancelAppointment", entityType: "Appointment", entityId: appt.id, actorType: "admin" });
      return appt;
    });
  }

  async adminRescheduleAppointment(appointmentId: string, newLocalDate: string, newLocalStartTime: string): Promise<Appointment> {
    return withLock(() => {
      const appt = this.appointments.find((a) => a.id === appointmentId);
      if (!appt) throw new CrmError("APPOINTMENT_NOT_FOUND", "La cita no existe.");
      if (appt.status !== "PENDING" && appt.status !== "CONFIRMED") {
        throw new CrmError("APPOINTMENT_NOT_CHANGEABLE", "La cita no puede reprogramarse en su estado actual.");
      }
      const ctx = this.buildContext();
      const check = checkSlotValidity(ctx, {
        serviceId: appt.serviceId,
        staffId: appt.staffId,
        localDate: newLocalDate,
        localStartTime: newLocalStartTime,
        excludeAppointmentId: appt.id,
      });
      if (!check.valid) throw new CrmError(check.reason, "El nuevo horario no está disponible.");
      const endMinutes = toMinutes(newLocalStartTime) + appt.serviceDurationSnapshot + appt.serviceBufferSnapshot;
      appt.localDate = newLocalDate;
      appt.localStartTime = newLocalStartTime;
      appt.localEndTime = toHHMM(endMinutes);
      appt.updatedAt = new Date().toISOString();
      this.audit({ action: "adminRescheduleAppointment", entityType: "Appointment", entityId: appt.id, actorType: "admin" });
      return appt;
    });
  }

  async listBlockedSlots(): Promise<BlockedSlot[]> {
    return this.blockedSlots;
  }

  async createBlockedSlot(input: { staffId?: string; localDate: string; startTime: string; endTime: string; reason?: string }): Promise<BlockedSlot> {
    const created: BlockedSlot = { id: randomUUID(), active: true, ...input };
    this.blockedSlots.push(created);
    this.audit({ action: "createBlockedSlot", entityType: "BlockedSlot", entityId: created.id, actorType: "admin" });
    return created;
  }

  async deleteBlockedSlot(id: string): Promise<void> {
    const block = this.blockedSlots.find((b) => b.id === id);
    if (block) block.active = false;
    this.audit({ action: "deleteBlockedSlot", entityType: "BlockedSlot", entityId: id, actorType: "admin" });
  }

  async listTimeOff(): Promise<TimeOff[]> {
    return this.timeOff;
  }

  async createTimeOff(input: { staffId: string; startDate: string; endDate: string; reason?: string }): Promise<TimeOff> {
    const created: TimeOff = { id: randomUUID(), active: true, ...input };
    this.timeOff.push(created);
    this.audit({ action: "createTimeOff", entityType: "TimeOff", entityId: created.id, actorType: "admin" });
    return created;
  }

  async deleteTimeOff(id: string): Promise<void> {
    const off = this.timeOff.find((t) => t.id === id);
    if (off) off.active = false;
    this.audit({ action: "deleteTimeOff", entityType: "TimeOff", entityId: id, actorType: "admin" });
  }

  async adminSetServiceActive(serviceId: string, active: boolean): Promise<Service> {
    const service = this.services.find((s) => s.id === serviceId);
    if (!service) throw new CrmError("SERVICE_NOT_FOUND", "El servicio no existe.");
    service.active = active;
    this.audit({ action: "adminSetServiceActive", entityType: "Service", entityId: serviceId, actorType: "admin", metadata: { active } });
    return service;
  }

  async adminSetServicePrice(serviceId: string, price: number): Promise<Service> {
    const service = this.services.find((s) => s.id === serviceId);
    if (!service) throw new CrmError("SERVICE_NOT_FOUND", "El servicio no existe.");
    service.price = price;
    this.audit({ action: "adminSetServicePrice", entityType: "Service", entityId: serviceId, actorType: "admin", metadata: { price } });
    return service;
  }

  async adminSetStaffActive(staffId: string, active: boolean): Promise<Staff> {
    const staff = this.staff.find((s) => s.id === staffId);
    if (!staff) throw new CrmError("STAFF_NOT_FOUND", "El profesional no existe.");
    staff.active = active;
    this.audit({ action: "adminSetStaffActive", entityType: "Staff", entityId: staffId, actorType: "admin", metadata: { active } });
    return staff;
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(total: number): string {
  const h = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
function generateReference(localDate: string): string {
  const datePart = localDate.replace(/-/g, "");
  const randomPart = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `REF-${datePart}-${randomPart}`;
}
