import { randomUUID } from "node:crypto";
import { CrmError } from "./errors";
import type {
  ActivateHandoffInput,
  ApplyConversationTurnInput,
  Appointment,
  AppointmentStatus,
  AuditEntry,
  AvailabilityInput,
  AvailableSlot,
  Barber,
  BusinessSettings,
  CancelAppointmentInput,
  Conversation,
  ConversationState,
  CreateAppointmentInput,
  CreateAppointmentResult,
  CreateNotificationInput,
  CrmClient,
  CrmHealth,
  Customer,
  Faq,
  GetAppointmentInput,
  HumanHandoff,
  MessageDirection,
  Notification,
  Promotion,
  RegisterWebhookEventInput,
  RegisterWebhookEventResult,
  RescheduleAppointmentInput,
  ResolveHandoffInput,
  Service,
  SlotValidationResult,
  UpsertCustomerInput,
  ValidateSlotInput,
} from "./types";

/**
 * In-memory CrmClient for local development, automated tests, and the
 * WhatsApp simulator (`/dev/whatsapp-simulator`). Enforces the SAME
 * business rules as apps-script/Availability.gs + Appointments.gs
 * (BOOKING_RULES.md) — necessarily a second implementation in a different
 * language (there is no way to call a real Google Apps Script deployment
 * from an offline/local environment), not a second source of truth:
 * production always uses AppsScriptCrmClient (see factory.ts), and this
 * class exists specifically so the whole booking flow is demonstrable
 * with zero external credentials, per ARCHITECTURE.md §2.
 *
 * Never selected in production without the explicit escape hatch —
 * factory.ts refuses CRM_PROVIDER=mock in production unless
 * ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true is also set.
 */

const DAY_OPEN_KEYS = ["SUNDAY_OPEN", "MONDAY_OPEN", "TUESDAY_OPEN", "WEDNESDAY_OPEN", "THURSDAY_OPEN", "FRIDAY_OPEN", "SATURDAY_OPEN"] as const;

function minutesFromMidnight(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Every public method returns a clone, never a live reference into this
 * class's internal arrays — a real CrmClient (AppsScriptCrmClient) can
 * only ever hand back a freshly-parsed JSON object, so a caller mutating
 * what it receives, or holding onto a field like `.version` across calls
 * while the store changes underneath it, must behave identically here.
 * Internal helpers (checkSlotValidity, etc.) still read/write the live
 * arrays directly — only the boundary back to the caller is defensive.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}
function weekdayOf(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function parseLocalDateTimeToUtc(localDate: string, localTime: string, timezone: string): Date {
  // Simplified: assumes a fixed, non-DST offset resolved once per call via
  // Intl — adequate for America/La_Paz (UTC-4, no DST) and good enough for
  // a mock. Real conversion logic lives in Apps Script's DateTime.gs.
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh, mm] = localTime.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offsetMinutes = getTimezoneOffsetMinutes(utcGuess, timezone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

interface WorkingHoursRow { barberId: string | null; dayOfWeek: number; openingTime: string; closingTime: string; active: boolean }
interface BarberServiceRow { barberId: string; serviceId: string; active: boolean }

export class MockCrmClient implements CrmClient {
  private settings: BusinessSettings;
  private services: Service[] = [];
  private barbers: Barber[] = [];
  private barberServices: BarberServiceRow[] = [];
  private workingHours: WorkingHoursRow[] = [];
  private customers: Customer[] = [];
  private appointments: Appointment[] = [];
  private conversations: Conversation[] = [];
  private handoffs: HumanHandoff[] = [];
  private notifications: Notification[] = [];
  private auditEntries: AuditEntry[] = [];
  private webhookEvents = new Map<string, "PROCESSING" | "PROCESSED" | "FAILED">();
  /**
   * appointmentId -> raw management token. A real deployment only ever
   * stores the hash (Appointments.gs's managementTokenHash) — this mock
   * keeps the raw value in memory purely to verify it back, which is fine
   * for a process-local, never-persisted-to-disk mock but would not be
   * an acceptable pattern for the real Apps Script implementation.
   */
  private managementTokens = new Map<string, string>();

  constructor() {
    this.settings = {
      BUSINESS_NAME: "Esquece Barber Studio",
      BUSINESS_TIMEZONE: "America/La_Paz",
      CURRENCY: "BOB",
      OPENING_TIME: "08:00",
      CLOSING_TIME: "16:00",
      SLOT_INTERVAL_MINUTES: 30,
      MIN_BOOKING_NOTICE_MINUTES: 60,
      MAX_ADVANCE_BOOKING_DAYS: 60,
      SESSION_TIMEOUT_MINUTES: 60,
      MONDAY_OPEN: true,
      TUESDAY_OPEN: true,
      WEDNESDAY_OPEN: true,
      THURSDAY_OPEN: true,
      FRIDAY_OPEN: true,
      SATURDAY_OPEN: false,
      SUNDAY_OPEN: false,
      DEFAULT_BUFFER_MINUTES: 0,
      ALLOW_ANY_BARBER: true,
      ENABLE_REMINDERS: false,
      ENABLE_CALENDAR_SYNC: false,
      BUSINESS_ADDRESS: "",
      GOOGLE_MAPS_URL: "",
      INSTAGRAM_URL: "https://instagram.com/esquece.barber.studio",
      WHATSAPP_DISPLAY_NUMBER: "",
      PAYMENT_METHODS: "",
      CANCELLATION_POLICY: "",
      LATE_ARRIVAL_POLICY: "",
      NO_SHOW_POLICY: "",
      REMINDER_HOURS_BEFORE: 24,
      CRM_SCHEMA_VERSION: "1",
    };
    this.seedDemoData();
  }

  private seedDemoData() {
    const now = new Date().toISOString();
    this.services = [
      { serviceId: "demo-service-1", name: "Servicio demo — reemplazar", description: "", price: 50, currency: "BOB", durationMinutes: 30, bufferMinutes: 0, category: "demo", imageUrl: "", active: true, displayOrder: 1, demo: true, createdAt: now, updatedAt: now },
      { serviceId: "demo-service-2", name: "Servicio demo 2 — reemplazar", description: "", price: 80, currency: "BOB", durationMinutes: 45, bufferMinutes: 0, category: "demo", imageUrl: "", active: true, displayOrder: 2, demo: true, createdAt: now, updatedAt: now },
    ];
    this.barbers = [
      { barberId: "demo-barber-1", name: "Barbero demo 1 — reemplazar", biography: "", specialties: "", photoUrl: "", phoneE164: "", active: true, publicBooking: true, displayOrder: 1, calendarId: "", demo: true, createdAt: now, updatedAt: now },
      { barberId: "demo-barber-2", name: "Barbero demo 2 — reemplazar", biography: "", specialties: "", photoUrl: "", phoneE164: "", active: true, publicBooking: true, displayOrder: 2, calendarId: "", demo: true, createdAt: now, updatedAt: now },
    ];
    this.barberServices = this.barbers.flatMap((b) => this.services.map((s) => ({ barberId: b.barberId, serviceId: s.serviceId, active: true })));
    this.workingHours = this.barbers.flatMap((b) =>
      [1, 2, 3, 4, 5].map((day) => ({ barberId: b.barberId, dayOfWeek: day, openingTime: "08:00", closingTime: "16:00", active: true })),
    );
  }

  /** Mirrors Apps Script's verifyManagementTokenOrThrow_ — see Appointments.gs. */
  private requireManagementToken(appointmentId: string, providedToken: string | undefined) {
    const expected = this.managementTokens.get(appointmentId);
    if (!providedToken || providedToken !== expected) {
      throw new CrmError("UNAUTHORIZED", "Token de gestión inválido.", false);
    }
  }

  private requireActiveService(serviceId: string): Service {
    const service = this.services.find((s) => s.serviceId === serviceId);
    if (!service) throw new CrmError("SERVICE_NOT_FOUND", "Servicio no encontrado.", false);
    if (!service.active) throw new CrmError("SERVICE_INACTIVE", "Este servicio ya no está disponible.", false);
    return service;
  }

  private requireActiveBarber(barberId: string): Barber {
    const barber = this.barbers.find((b) => b.barberId === barberId);
    if (!barber) throw new CrmError("BARBER_NOT_FOUND", "Barbero no encontrado.", false);
    if (!barber.active) throw new CrmError("BARBER_INACTIVE", "Este barbero ya no está disponible.", false);
    return barber;
  }

  private eligibleBarberIdsForService(serviceId: string): string[] {
    return this.barberServices.filter((bs) => bs.serviceId === serviceId && bs.active).map((bs) => bs.barberId);
  }

  private requireBarberEligible(barberId: string, serviceId: string) {
    if (!this.eligibleBarberIdsForService(serviceId).includes(barberId)) {
      throw new CrmError("BARBER_NOT_ELIGIBLE", "Este barbero no realiza ese servicio.", false);
    }
  }

  private workingIntervalsFor(barberId: string, dayOfWeek: number): { start: number; end: number }[] {
    return this.workingHours
      .filter((w) => w.barberId === barberId && w.dayOfWeek === dayOfWeek && w.active)
      .map((w) => ({ start: minutesFromMidnight(w.openingTime), end: minutesFromMidnight(w.closingTime) }));
  }

  private activeAppointmentIntervals(barberId: string, localDate: string, excludeAppointmentId?: string) {
    return this.appointments
      .filter((a) => a.barberId === barberId && a.localDate === localDate && (a.status === "PENDING" || a.status === "CONFIRMED") && a.appointmentId !== excludeAppointmentId)
      .map((a) => ({ start: minutesFromMidnight(a.localStartTime), end: minutesFromMidnight(a.localEndTime) }));
  }

  private checkSlotValidity(params: { barberId: string; localDate: string; localStartTime: string; totalDurationMinutes: number; excludeAppointmentId?: string; now?: Date }): SlotValidationResult {
    const dayOfWeek = weekdayOf(params.localDate);
    if (!this.settings[DAY_OPEN_KEYS[dayOfWeek]]) {
      return { valid: false, reason: dayOfWeek === 0 || dayOfWeek === 6 ? "WEEKEND_CLOSED" : "BUSINESS_CLOSED" };
    }

    const startMin = minutesFromMidnight(params.localStartTime);
    const endMin = startMin + params.totalDurationMinutes;
    const openingMin = minutesFromMidnight(String(this.settings.OPENING_TIME));
    const closingMin = minutesFromMidnight(String(this.settings.CLOSING_TIME));
    if (startMin < openingMin || endMin > closingMin) {
      return { valid: false, reason: "OUTSIDE_BUSINESS_HOURS" };
    }

    const startUtc = parseLocalDateTimeToUtc(params.localDate, params.localStartTime, String(this.settings.BUSINESS_TIMEZONE));
    const now = params.now || new Date();
    if (startUtc.getTime() <= now.getTime()) return { valid: false, reason: "DATE_IN_PAST" };
    if (startUtc.getTime() - now.getTime() < Number(this.settings.MIN_BOOKING_NOTICE_MINUTES) * 60000) {
      return { valid: false, reason: "BOOKING_TOO_SOON" };
    }
    if (startUtc.getTime() - now.getTime() > Number(this.settings.MAX_ADVANCE_BOOKING_DAYS) * 86400000) {
      return { valid: false, reason: "BOOKING_TOO_FAR_IN_ADVANCE" };
    }

    const workingIntervals = this.workingIntervalsFor(params.barberId, dayOfWeek);
    if (!workingIntervals.some((i) => i.start <= startMin && endMin <= i.end)) {
      return { valid: false, reason: "OUTSIDE_BUSINESS_HOURS" };
    }

    const appointmentIntervals = this.activeAppointmentIntervals(params.barberId, params.localDate, params.excludeAppointmentId);
    if (appointmentIntervals.some((i) => overlaps(startMin, endMin, i.start, i.end))) {
      return { valid: false, reason: "SLOT_UNAVAILABLE" };
    }

    return { valid: true };
  }

  async health(): Promise<CrmHealth> {
    return { status: "ok", schemaVersion: "1", apiVersion: "1", timestamp: new Date().toISOString() };
  }
  async getApiVersion() {
    return { apiVersion: "1", schemaVersion: "1" };
  }

  async getBusinessSettings(): Promise<BusinessSettings> {
    return { ...this.settings };
  }
  async listServices(): Promise<Service[]> {
    return clone(this.services.filter((s) => s.active).sort((a, b) => a.displayOrder - b.displayOrder));
  }
  async getService(serviceId: string): Promise<Service> {
    return clone(this.requireActiveService(serviceId));
  }
  async listBarbers(): Promise<Barber[]> {
    return clone(this.barbers.filter((b) => b.active && b.publicBooking).sort((a, b) => a.displayOrder - b.displayOrder));
  }
  async getBarber(barberId: string): Promise<Barber> {
    return clone(this.requireActiveBarber(barberId));
  }
  async listBarbersForService(serviceId: string): Promise<Barber[]> {
    this.requireActiveService(serviceId);
    const eligible = this.eligibleBarberIdsForService(serviceId);
    return clone(this.barbers.filter((b) => b.active && eligible.includes(b.barberId)).sort((a, b) => a.displayOrder - b.displayOrder));
  }
  async listFaqs(): Promise<Faq[]> {
    return [];
  }
  async listPromotions(): Promise<Promotion[]> {
    return [];
  }

  async getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]> {
    const service = this.requireActiveService(input.serviceId);
    const totalDuration = service.durationMinutes + (service.bufferMinutes || Number(this.settings.DEFAULT_BUFFER_MINUTES));
    let barberIds: string[];
    if (input.anyBarber) {
      barberIds = this.eligibleBarberIdsForService(input.serviceId);
    } else {
      if (!input.barberId) throw new CrmError("INVALID_PAYLOAD", "Falta barberId.", false);
      this.requireActiveBarber(input.barberId);
      this.requireBarberEligible(input.barberId, input.serviceId);
      barberIds = [input.barberId];
    }

    const slotsByTime = new Map<string, AvailableSlot>();
    const dayOfWeek = weekdayOf(input.localDate);
    const step = Number(this.settings.SLOT_INTERVAL_MINUTES) || 30;

    for (const barberId of barberIds) {
      const barber = this.barbers.find((b) => b.barberId === barberId);
      if (!barber || !barber.active) continue;
      const intervals = this.workingIntervalsFor(barberId, dayOfWeek);
      if (intervals.length === 0) continue;
      const earliest = Math.min(...intervals.map((i) => i.start));
      const latest = Math.max(...intervals.map((i) => i.end));
      for (let start = earliest; start + totalDuration <= latest; start += step) {
        const localStartTime = minutesToTime(start);
        const result = this.checkSlotValidity({ barberId, localDate: input.localDate, localStartTime, totalDurationMinutes: totalDuration });
        if (result.valid) {
          const key = localStartTime;
          if (!slotsByTime.has(key)) {
            slotsByTime.set(key, { localStartTime, localEndTime: minutesToTime(start + totalDuration), barberIds: [] });
          }
          slotsByTime.get(key)!.barberIds.push(barberId);
        }
      }
    }

    return [...slotsByTime.values()].sort((a, b) => a.localStartTime.localeCompare(b.localStartTime));
  }

  async validateSlot(input: ValidateSlotInput): Promise<SlotValidationResult> {
    const service = this.requireActiveService(input.serviceId);
    this.requireActiveBarber(input.barberId);
    this.requireBarberEligible(input.barberId, input.serviceId);
    const totalDuration = service.durationMinutes + (service.bufferMinutes || Number(this.settings.DEFAULT_BUFFER_MINUTES));
    return this.checkSlotValidity({ barberId: input.barberId, localDate: input.localDate, localStartTime: input.localStartTime, totalDurationMinutes: totalDuration });
  }

  async findCustomerByPhone(phoneE164: string): Promise<Customer | null> {
    const customer = this.customers.find((c) => c.phoneE164 === phoneE164);
    return customer ? clone(customer) : null;
  }

  async upsertCustomer(input: UpsertCustomerInput): Promise<Customer> {
    const now = new Date().toISOString();
    const existing = this.customers.find((c) => c.phoneE164 === input.phoneE164);
    if (existing) {
      if (input.name) existing.name = input.name;
      if (input.whatsappId) existing.whatsappId = input.whatsappId;
      if (input.email) existing.email = input.email;
      if (input.notes) existing.notes = input.notes;
      if (input.source) existing.source = input.source;
      existing.lastContactAt = now;
      existing.updatedAt = now;
      return clone(existing);
    }
    const created: Customer = {
      customerId: `cus_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      name: input.name || "",
      phoneE164: input.phoneE164,
      whatsappId: input.whatsappId || "",
      email: input.email || "",
      source: input.source || "",
      status: "ACTIVE",
      firstContactAt: now,
      lastContactAt: now,
      totalAppointments: 0,
      confirmedAppointments: 0,
      completedAppointments: 0,
      cancelledAppointments: 0,
      noShowAppointments: 0,
      notes: input.notes || "",
      demo: false,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.push(created);
    return clone(created);
  }

  async getCustomer(customerId: string): Promise<Customer> {
    const customer = this.customers.find((c) => c.customerId === customerId);
    if (!customer) throw new CrmError("CUSTOMER_NOT_FOUND", "Cliente no encontrado.", false);
    return clone(customer);
  }

  async listCustomers(search?: string): Promise<Customer[]> {
    if (!search) return clone(this.customers);
    const needle = search.toLowerCase();
    return clone(this.customers.filter((c) => c.name.toLowerCase().includes(needle) || c.phoneE164.includes(needle)));
  }

  async getCustomerHistory(customerId: string) {
    const customer = await this.getCustomer(customerId); // already a clone
    const appointments = this.appointments
      .filter((a) => a.customerId === customerId)
      .sort((a, b) => b.startUtc.localeCompare(a.startUtc));
    return { customer, appointments: clone(appointments) };
  }

  private pickBarberForAnyAvailable(eligibleBarberIds: string[], localDate: string, localStartTime: string, totalDuration: number): Barber | null {
    const candidates = eligibleBarberIds
      .map((id) => this.barbers.find((b) => b.barberId === id))
      .filter((b): b is Barber => !!b && b.active)
      .filter((b) => this.checkSlotValidity({ barberId: b.barberId, localDate, localStartTime, totalDurationMinutes: totalDuration }).valid);

    if (candidates.length === 0) return null;

    const withCounts = candidates.map((b) => ({ barber: b, count: this.activeAppointmentIntervals(b.barberId, localDate).length }));
    withCounts.sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      if (a.barber.displayOrder !== b.barber.displayOrder) return a.barber.displayOrder - b.barber.displayOrder;
      return a.barber.name.localeCompare(b.barber.name);
    });
    return withCounts[0].barber;
  }

  async createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    const existingByKey = this.appointments.find((a) => a.idempotencyKey === input.idempotencyKey);
    if (existingByKey) {
      const sameRequest =
        existingByKey.serviceId === input.serviceId &&
        existingByKey.localDate === input.localDate &&
        existingByKey.localStartTime === input.localStartTime &&
        existingByKey.customerPhoneSnapshot === input.customer.phoneE164;
      if (!sameRequest) {
        throw new CrmError("IDEMPOTENCY_CONFLICT", "Esta clave de idempotencia ya se usó con datos distintos.", false);
      }
      return { appointment: clone(existingByKey), managementToken: null, idempotent: true };
    }

    const service = this.requireActiveService(input.serviceId);
    const totalDuration = service.durationMinutes + (service.bufferMinutes || Number(this.settings.DEFAULT_BUFFER_MINUTES));

    let barber: Barber | null;
    if (input.anyBarber) {
      if (!this.settings.ALLOW_ANY_BARBER) {
        throw new CrmError("INVALID_PAYLOAD", '"Cualquiera disponible" no está habilitado.', false);
      }
      barber = this.pickBarberForAnyAvailable(this.eligibleBarberIdsForService(input.serviceId), input.localDate, input.localStartTime, totalDuration);
      if (!barber) throw new CrmError("SLOT_UNAVAILABLE", "El horario ya no está disponible.", false);
    } else {
      if (!input.barberId) throw new CrmError("INVALID_PAYLOAD", "Falta barberId (o anyBarber=true).", false);
      barber = this.requireActiveBarber(input.barberId);
      this.requireBarberEligible(input.barberId, input.serviceId);
      const validity = this.checkSlotValidity({ barberId: input.barberId, localDate: input.localDate, localStartTime: input.localStartTime, totalDurationMinutes: totalDuration });
      if (!validity.valid) throw new CrmError("SLOT_UNAVAILABLE", "El horario ya no está disponible.", false);
    }

    const customer = await this.upsertCustomer({ phoneE164: input.customer.phoneE164, name: input.customer.name, source: input.source });

    const timezone = String(this.settings.BUSINESS_TIMEZONE);
    const startUtc = parseLocalDateTimeToUtc(input.localDate, input.localStartTime, timezone);
    const localEndTime = minutesToTime(minutesFromMidnight(input.localStartTime) + totalDuration);
    const endUtc = parseLocalDateTimeToUtc(input.localDate, localEndTime, timezone);
    const now = new Date().toISOString();
    const rawManagementToken = randomUUID() + randomUUID();

    const appointment: Appointment = {
      appointmentId: `apt_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      reference: `ESQ-${input.localDate.replace(/-/g, "")}-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`,
      idempotencyKey: input.idempotencyKey,
      customerId: customer.customerId,
      customerNameSnapshot: input.customer.name,
      customerPhoneSnapshot: input.customer.phoneE164,
      serviceId: input.serviceId,
      serviceNameSnapshot: service.name,
      servicePriceSnapshot: service.price,
      serviceDurationSnapshot: service.durationMinutes,
      serviceBufferSnapshot: service.bufferMinutes,
      barberId: barber.barberId,
      barberNameSnapshot: barber.name,
      localDate: input.localDate,
      localStartTime: input.localStartTime,
      localEndTime,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      timezone,
      status: "CONFIRMED",
      source: input.source,
      customerNotes: input.customerNotes || "",
      internalNotes: "",
      calendarEventId: "",
      calendarSyncStatus: "",
      cancellationReason: "",
      createdAt: now,
      updatedAt: now,
      cancelledAt: "",
      completedAt: "",
      demo: false,
    };
    this.appointments.push(appointment);
    this.managementTokens.set(appointment.appointmentId, rawManagementToken);

    this.auditEntries.push({
      auditId: randomUUID(), requestId: null,
      actorType: input.source === "ADMIN" ? "admin" : "system", actorId: null,
      action: "appointment.create", entityType: "Appointment", entityId: appointment.appointmentId,
      beforeJson: null, afterJson: JSON.stringify(appointment), metadataJson: null, createdAt: now,
    });

    this.notifications.push(this.buildNotification({ appointmentId: appointment.appointmentId, customerId: customer.customerId, type: "CONFIRMATION" }));

    return { appointment: clone(appointment), managementToken: rawManagementToken, idempotent: false };
  }

  private buildNotification(params: { appointmentId?: string; customerId?: string; conversationId?: string; type: Notification["type"] }): Notification {
    const now = new Date().toISOString();
    return {
      notificationId: `ntf_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      appointmentId: params.appointmentId || null,
      customerId: params.customerId || null,
      conversationId: params.conversationId || null,
      type: params.type,
      channel: "whatsapp",
      scheduledAt: now,
      status: "PENDING",
      attemptCount: 0,
      lastAttemptAt: "",
      sentAt: "",
      errorCode: "",
      errorMessage: "",
      idempotencyKey: randomUUID(),
      payloadJson: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getAppointment(input: GetAppointmentInput): Promise<Appointment> {
    const appointment = input.appointmentId
      ? this.appointments.find((a) => a.appointmentId === input.appointmentId)
      : this.appointments.find((a) => a.reference === input.reference);
    if (!appointment) throw new CrmError("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", false);
    return clone(appointment);
  }

  async getAppointmentByReference(reference: string, managementToken?: string): Promise<Appointment> {
    const appointment = this.appointments.find((a) => a.reference === reference);
    if (!appointment) throw new CrmError("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", false);
    // Verified only when a token is actually supplied — mirrors Apps Script's
    // actionGetAppointmentByReference_ (Appointments.gs): callers that don't
    // need a token (e.g. an authenticated admin, once Phase G exists) aren't
    // required to pass one. The public API (Phase F) always passes one.
    if (managementToken !== undefined) {
      this.requireManagementToken(appointment.appointmentId, managementToken);
    }
    return clone(appointment);
  }

  async listAppointments(filter?: { localDate?: string; barberId?: string; status?: AppointmentStatus }): Promise<Appointment[]> {
    return clone(
      this.appointments
        .filter((a) => (!filter?.localDate || a.localDate === filter.localDate) && (!filter?.barberId || a.barberId === filter.barberId) && (!filter?.status || a.status === filter.status))
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
    );
  }

  async listCustomerAppointments(customerId: string): Promise<Appointment[]> {
    return clone(this.appointments.filter((a) => a.customerId === customerId).sort((a, b) => b.startUtc.localeCompare(a.startUtc)));
  }

  async cancelAppointment(input: CancelAppointmentInput): Promise<Appointment> {
    const appointment = input.appointmentId
      ? this.appointments.find((a) => a.appointmentId === input.appointmentId)
      : this.appointments.find((a) => a.reference === input.reference);
    if (!appointment) throw new CrmError("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", false);
    if (input.actor.type === "customer") {
      this.requireManagementToken(appointment.appointmentId, input.managementToken);
    }
    if (appointment.status === "COMPLETED") throw new CrmError("APPOINTMENT_NOT_CHANGEABLE", "Esta cita ya fue completada.", false);
    if (appointment.status === "CANCELLED") return clone(appointment);

    appointment.status = "CANCELLED";
    appointment.cancellationReason = input.reason || "";
    appointment.cancelledAt = new Date().toISOString();
    appointment.updatedAt = appointment.cancelledAt;

    this.notifications.push(this.buildNotification({ appointmentId: appointment.appointmentId, customerId: appointment.customerId, type: "CANCELLATION" }));
    return clone(appointment);
  }

  async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment> {
    const appointment = this.appointments.find((a) => a.appointmentId === input.appointmentId);
    if (!appointment) throw new CrmError("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", false);
    if (input.actor.type === "customer") {
      this.requireManagementToken(appointment.appointmentId, input.managementToken);
    }
    if (appointment.status === "COMPLETED") throw new CrmError("APPOINTMENT_NOT_CHANGEABLE", "Esta cita ya fue completada.", false);
    if (appointment.status === "CANCELLED") throw new CrmError("APPOINTMENT_ALREADY_CANCELLED", "Esta cita ya fue cancelada.", false);

    const service = this.requireActiveService(appointment.serviceId);
    const totalDuration = service.durationMinutes + (service.bufferMinutes || Number(this.settings.DEFAULT_BUFFER_MINUTES));
    const validity = this.checkSlotValidity({
      barberId: appointment.barberId, localDate: input.newLocalDate, localStartTime: input.newLocalStartTime,
      totalDurationMinutes: totalDuration, excludeAppointmentId: appointment.appointmentId,
    });
    if (!validity.valid) throw new CrmError("SLOT_UNAVAILABLE", "El nuevo horario no está disponible.", false);

    const timezone = String(this.settings.BUSINESS_TIMEZONE);
    const newLocalEndTime = minutesToTime(minutesFromMidnight(input.newLocalStartTime) + totalDuration);
    appointment.localDate = input.newLocalDate;
    appointment.localStartTime = input.newLocalStartTime;
    appointment.localEndTime = newLocalEndTime;
    appointment.startUtc = parseLocalDateTimeToUtc(input.newLocalDate, input.newLocalStartTime, timezone).toISOString();
    appointment.endUtc = parseLocalDateTimeToUtc(input.newLocalDate, newLocalEndTime, timezone).toISOString();
    appointment.updatedAt = new Date().toISOString();

    this.notifications.push(this.buildNotification({ appointmentId: appointment.appointmentId, customerId: appointment.customerId, type: "RESCHEDULE" }));
    return clone(appointment);
  }

  async updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<Appointment> {
    const appointment = this.appointments.find((a) => a.appointmentId === appointmentId);
    if (!appointment) throw new CrmError("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", false);
    appointment.status = status;
    appointment.updatedAt = new Date().toISOString();
    if (status === "COMPLETED") appointment.completedAt = appointment.updatedAt;
    return clone(appointment);
  }

  /** Internal — returns the LIVE record so mutations persist. Public getConversation() clones it. */
  private findConversationOrThrow(conversationId: string): Conversation {
    const conversation = this.conversations.find((c) => c.conversationId === conversationId);
    if (!conversation) throw new CrmError("NOT_FOUND", "Conversación no encontrada.", false);
    return conversation;
  }

  async getOrCreateConversation(phoneE164: string): Promise<Conversation> {
    let conversation = this.conversations.find((c) => c.phoneE164 === phoneE164);
    if (!conversation) {
      const now = new Date().toISOString();
      conversation = {
        conversationId: `conv_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
        customerId: null as unknown as string,
        phoneE164, state: "IDLE", scratchDataJson: "{}", humanHandoffActive: false, version: 1,
        lastInboundMessageAt: now, lastOutboundMessageAt: "", sessionExpiresAt: null as unknown as string,
        createdAt: now, updatedAt: now,
      };
      this.conversations.push(conversation);
    }
    return clone(conversation);
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return clone(this.findConversationOrThrow(conversationId));
  }

  async applyConversationTurn(input: ApplyConversationTurnInput): Promise<Conversation> {
    const conversation = this.findConversationOrThrow(input.conversationId);
    if (conversation.version !== input.expectedVersion) {
      throw new CrmError("CONVERSATION_CONFLICT", "La conversación cambió, intenta de nuevo.", false);
    }
    if (input.newState) conversation.state = input.newState as ConversationState;
    if (input.newScratchData) conversation.scratchDataJson = JSON.stringify(input.newScratchData);
    if (input.sessionExpiresAt) conversation.sessionExpiresAt = input.sessionExpiresAt;
    conversation.version += 1;
    conversation.updatedAt = new Date().toISOString();
    if (input.inboundMessage) conversation.lastInboundMessageAt = conversation.updatedAt;
    if (input.outboundMessage) conversation.lastOutboundMessageAt = conversation.updatedAt;
    return clone(conversation);
  }

  async resetConversation(conversationId: string): Promise<Conversation> {
    const conversation = this.findConversationOrThrow(conversationId);
    conversation.state = "IDLE";
    conversation.scratchDataJson = "{}";
    conversation.humanHandoffActive = false;
    conversation.version += 1;
    conversation.updatedAt = new Date().toISOString();
    return clone(conversation);
  }

  async appendConversationMessage(conversationId: string, message: { direction: MessageDirection; messageType: string; body?: string; externalMessageId?: string }): Promise<void> {
    this.findConversationOrThrow(conversationId); // ensures it exists; mock doesn't persist message rows separately
    void message;
  }

  async registerWebhookEvent(input: RegisterWebhookEventInput): Promise<RegisterWebhookEventResult> {
    const existing = this.webhookEvents.get(input.externalEventId);
    if (existing) return { isDuplicate: true, eventId: input.externalEventId };
    this.webhookEvents.set(input.externalEventId, "PROCESSING");
    return { isDuplicate: false, eventId: input.externalEventId };
  }
  async markWebhookEventProcessed(externalEventId: string): Promise<void> {
    this.webhookEvents.set(externalEventId, "PROCESSED");
  }
  async markWebhookEventFailed(externalEventId: string): Promise<void> {
    this.webhookEvents.set(externalEventId, "FAILED");
  }

  async activateHumanHandoff(input: ActivateHandoffInput): Promise<HumanHandoff> {
    const conversation = this.findConversationOrThrow(input.conversationId);
    conversation.humanHandoffActive = true;
    conversation.state = "HUMAN_HANDOFF";
    conversation.updatedAt = new Date().toISOString();
    const handoff: HumanHandoff = {
      handoffId: `hnd_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      conversationId: input.conversationId, customerId: conversation.customerId || "", phoneE164: conversation.phoneE164,
      reason: input.reason, status: "OPEN", assignedTo: "", startedAt: new Date().toISOString(), resolvedAt: "",
      resolutionNotes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    this.handoffs.push(handoff);
    this.notifications.push(this.buildNotification({ conversationId: input.conversationId, type: "INTERNAL_ALERT" }));
    return clone(handoff);
  }

  async resolveHumanHandoff(input: ResolveHandoffInput): Promise<HumanHandoff> {
    const handoff = this.handoffs.find((h) => h.handoffId === input.handoffId);
    if (!handoff) throw new CrmError("NOT_FOUND", "Handoff no encontrado.", false);
    handoff.status = "RESOLVED";
    handoff.resolutionNotes = input.resolutionNotes || "";
    handoff.resolvedAt = new Date().toISOString();
    handoff.updatedAt = handoff.resolvedAt;
    if (input.reactivateBot) {
      const conversation = this.conversations.find((c) => c.conversationId === handoff.conversationId);
      if (conversation) {
        conversation.humanHandoffActive = false;
        conversation.state = "IDLE";
        conversation.updatedAt = new Date().toISOString();
      }
    }
    return clone(handoff);
  }

  async listOpenHumanHandoffs(): Promise<HumanHandoff[]> {
    return clone(this.handoffs.filter((h) => h.status === "OPEN"));
  }

  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const notification = this.buildNotification({ appointmentId: input.appointmentId, customerId: input.customerId, conversationId: input.conversationId, type: input.type });
    this.notifications.push(notification);
    return clone(notification);
  }
  async listDueNotifications(): Promise<Notification[]> {
    const now = new Date().toISOString();
    return clone(this.notifications.filter((n) => n.status === "PENDING" && n.scheduledAt <= now));
  }
  async claimNotification(notificationId: string): Promise<Notification> {
    const notification = this.notifications.find((n) => n.notificationId === notificationId);
    if (!notification) throw new CrmError("NOT_FOUND", "Notificación no encontrada.", false);
    if (notification.status !== "PENDING") throw new CrmError("IDEMPOTENCY_CONFLICT", "Esta notificación ya fue reclamada.", false);
    notification.status = "PROCESSING";
    notification.attemptCount += 1;
    notification.lastAttemptAt = new Date().toISOString();
    return clone(notification);
  }
  async markNotificationSent(notificationId: string): Promise<Notification> {
    const notification = this.notifications.find((n) => n.notificationId === notificationId);
    if (!notification) throw new CrmError("NOT_FOUND", "Notificación no encontrada.", false);
    notification.status = "SENT";
    notification.sentAt = new Date().toISOString();
    return clone(notification);
  }
  async markNotificationFailed(notificationId: string, errorCode: string, errorMessage: string): Promise<Notification> {
    const notification = this.notifications.find((n) => n.notificationId === notificationId);
    if (!notification) throw new CrmError("NOT_FOUND", "Notificación no encontrada.", false);
    notification.status = "FAILED";
    notification.errorCode = errorCode;
    notification.errorMessage = errorMessage;
    return clone(notification);
  }
  async cancelNotification(notificationId: string): Promise<Notification> {
    const notification = this.notifications.find((n) => n.notificationId === notificationId);
    if (!notification) throw new CrmError("NOT_FOUND", "Notificación no encontrada.", false);
    if (notification.status !== "SENT") notification.status = "CANCELLED";
    return clone(notification);
  }

  async createAuditEntry(input: { actorType: string; actorId?: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: unknown }): Promise<void> {
    this.auditEntries.push({
      auditId: randomUUID(), requestId: null, actorType: input.actorType, actorId: input.actorId || null,
      action: input.action, entityType: input.entityType, entityId: input.entityId,
      beforeJson: input.before !== undefined ? JSON.stringify(input.before) : null,
      afterJson: input.after !== undefined ? JSON.stringify(input.after) : null,
      metadataJson: input.metadata !== undefined ? JSON.stringify(input.metadata) : null,
      createdAt: new Date().toISOString(),
    });
  }

  async listAuditEntries(filter?: { entityType?: string; entityId?: string }): Promise<AuditEntry[]> {
    return clone(
      this.auditEntries
        .filter((e) => (!filter?.entityType || e.entityType === filter.entityType) && (!filter?.entityId || e.entityId === filter.entityId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
}
