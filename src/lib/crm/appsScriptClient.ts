import "server-only";
import { z } from "zod";
import { getCrmConfig } from "@/lib/env/server";
import { logger } from "@/lib/logging/logger";
import { CrmError, isCrmErrorCode, messageForCrmError, type CrmErrorCode } from "./errors";
import { buildSignedRequest } from "./signing";
import * as schemas from "./schemas";
import type {
  ActivateHandoffInput,
  AdminCreateBarberInput,
  AdminCreateBlockedSlotInput,
  AdminCreateBreakInput,
  AdminCreateServiceInput,
  AdminCreateTimeOffInput,
  AdminSetWorkingHoursInput,
  AdminUpdateBarberInput,
  AdminUpdateServiceInput,
  ApplyConversationTurnInput,
  AppointmentStatus,
  AvailabilityInput,
  AvailableSlot,
  Barber,
  BlockedSlotRecord,
  BreakRecord,
  BusinessSettings,
  CancelAppointmentInput,
  Conversation,
  ConversationMessage,
  CreateAppointmentInput,
  CreateAppointmentResult,
  CreateNotificationInput,
  CrmClient,
  CrmHealth,
  Customer,
  DashboardSummary,
  Faq,
  GetAppointmentInput,
  HumanHandoff,
  MessageDirection,
  Notification,
  NotificationStatus,
  Promotion,
  RegisterWebhookEventInput,
  RegisterWebhookEventResult,
  RescheduleAppointmentInput,
  ResolveHandoffInput,
  Service,
  SlotValidationResult,
  TimeOffRecord,
  UpsertCustomerInput,
  ValidateSlotInput,
  Appointment,
  AuditEntry,
  WorkingHours,
} from "./types";

const responseEnvelopeSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().nullable(),
  data: z.unknown().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
      details: z.unknown().nullable().optional(),
    })
    .nullable(),
  meta: z.object({ version: z.string() }).optional(),
});

interface CallOptions {
  retrySafe?: boolean;
}

export class AppsScriptCrmClient implements CrmClient {
  private async call<T>(action: string, payload: unknown, responseSchema: z.ZodType<T>, options: CallOptions = {}): Promise<T> {
    const config = getCrmConfig();
    const envelope = buildSignedRequest(action, payload, config.apiKey, config.signingSecret);
    const start = Date.now();

    const attempt = async (): Promise<T> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      let httpResponse: Response;
      try {
        httpResponse = await fetch(config.appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        throw new CrmError(
          isAbort ? "CRM_TIMEOUT" : "CRM_UNREACHABLE",
          isAbort ? "El sistema tardó demasiado en responder." : "No se pudo conectar con el sistema.",
          true,
        );
      } finally {
        clearTimeout(timeout);
      }

      let rawBody: unknown;
      try {
        rawBody = await httpResponse.json();
      } catch {
        throw new CrmError("CRM_INVALID_RESPONSE", "Respuesta inválida del sistema.", false);
      }

      const envelopeParse = responseEnvelopeSchema.safeParse(rawBody);
      if (!envelopeParse.success) {
        throw new CrmError("CRM_INVALID_RESPONSE", "Respuesta inválida del sistema.", false);
      }
      const parsedEnvelope = envelopeParse.data;

      if (!parsedEnvelope.ok) {
        const errorCode: CrmErrorCode = parsedEnvelope.error && isCrmErrorCode(parsedEnvelope.error.code)
          ? (parsedEnvelope.error.code as CrmErrorCode)
          : "INTERNAL_ERROR";
        throw new CrmError(
          errorCode,
          parsedEnvelope.error?.message || messageForCrmError(errorCode),
          parsedEnvelope.error?.retryable ?? false,
          parsedEnvelope.error?.details,
        );
      }

      const dataParse = responseSchema.safeParse(parsedEnvelope.data);
      if (!dataParse.success) {
        logger.error("CRM response failed schema validation", { provider: "appscript", operation: action });
        throw new CrmError("CRM_INVALID_RESPONSE", "Respuesta inválida del sistema.", false);
      }
      return dataParse.data;
    };

    try {
      const result = await attempt();
      logger.info("CRM call succeeded", { provider: "appscript", operation: action, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      const crmError = err instanceof CrmError ? err : new CrmError("INTERNAL_ERROR", "Error interno.", false);
      const canRetry = options.retrySafe && crmError.retryable;
      if (canRetry) {
        logger.warn("CRM call failed, retrying once", { provider: "appscript", operation: action, errorCode: crmError.code });
        try {
          const result = await attempt();
          logger.info("CRM retry succeeded", { provider: "appscript", operation: action, durationMs: Date.now() - start });
          return result;
        } catch (retryErr) {
          logger.error("CRM retry failed", { provider: "appscript", operation: action, errorCode: retryErr instanceof CrmError ? retryErr.code : "INTERNAL_ERROR" });
          throw retryErr;
        }
      }
      logger.error("CRM call failed", { provider: "appscript", operation: action, errorCode: crmError.code, durationMs: Date.now() - start });
      throw crmError;
    }
  }

  health(): Promise<CrmHealth> {
    return this.call("health", {}, schemas.crmHealthSchema, { retrySafe: true });
  }

  getApiVersion(): Promise<{ apiVersion: string; schemaVersion: string }> {
    return this.call(
      "getApiVersion",
      {},
      z.object({ apiVersion: z.string(), schemaVersion: z.string() }),
      { retrySafe: true },
    );
  }

  async getBusinessSettings(): Promise<BusinessSettings> {
    return this.call("getBusinessSettings", {}, schemas.businessSettingsSchema as z.ZodType<BusinessSettings>, { retrySafe: true });
  }

  async listServices(): Promise<Service[]> {
    const result = await this.call(
      "listServices", {}, z.object({ services: z.array(schemas.serviceSchema) }), { retrySafe: true },
    );
    return result.services;
  }

  getService(serviceId: string): Promise<Service> {
    return this.call(
      "getService", { serviceId }, z.object({ service: schemas.serviceSchema }), { retrySafe: true },
    ).then((r) => r.service);
  }

  async listBarbers(): Promise<Barber[]> {
    const result = await this.call(
      "listBarbers", {}, z.object({ barbers: z.array(schemas.barberSchema) }), { retrySafe: true },
    );
    return result.barbers;
  }

  getBarber(barberId: string): Promise<Barber> {
    return this.call(
      "getBarber", { barberId }, z.object({ barber: schemas.barberSchema }), { retrySafe: true },
    ).then((r) => r.barber);
  }

  async listBarbersForService(serviceId: string): Promise<Barber[]> {
    const result = await this.call(
      "listBarbersForService", { serviceId }, z.object({ barbers: z.array(schemas.barberSchema) }), { retrySafe: true },
    );
    return result.barbers;
  }

  async listFaqs(): Promise<Faq[]> {
    const result = await this.call("listFaqs", {}, z.object({ faqs: z.array(schemas.faqSchema) }), { retrySafe: true });
    return result.faqs;
  }

  async listPromotions(): Promise<Promotion[]> {
    const result = await this.call(
      "listPromotions", {}, z.object({ promotions: z.array(schemas.promotionSchema) }), { retrySafe: true },
    );
    return result.promotions;
  }

  async getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]> {
    const result = await this.call(
      "getAvailability", input,
      z.object({ localDate: z.string(), serviceId: z.string(), slots: z.array(schemas.availableSlotSchema) }),
      { retrySafe: true },
    );
    return result.slots;
  }

  validateSlot(input: ValidateSlotInput): Promise<SlotValidationResult> {
    return this.call("validateSlot", input, schemas.slotValidationResultSchema, { retrySafe: true });
  }

  async findCustomerByPhone(phoneE164: string): Promise<Customer | null> {
    const result = await this.call(
      "findCustomerByPhone", { phoneE164 }, z.object({ customer: schemas.customerSchema.nullable() }), { retrySafe: true },
    );
    return result.customer;
  }

  upsertCustomer(input: UpsertCustomerInput): Promise<Customer> {
    // Not marked retrySafe: a retried upsert with the same input is
    // idempotent in effect (upsertCustomer dedupes by phone), but this
    // client doesn't assume that at the transport layer — Apps Script's
    // own upsert logic is what makes a retry safe, not blind assumption.
    return this.call(
      "upsertCustomer", input, z.object({ customer: schemas.customerSchema }),
    ).then((r) => r.customer);
  }

  getCustomer(customerId: string): Promise<Customer> {
    return this.call(
      "getCustomer", { customerId }, z.object({ customer: schemas.customerSchema }), { retrySafe: true },
    ).then((r) => r.customer);
  }

  async listCustomers(search?: string): Promise<Customer[]> {
    const result = await this.call(
      "listCustomers", { search }, z.object({ customers: z.array(schemas.customerSchema) }), { retrySafe: true },
    );
    return result.customers;
  }

  getCustomerHistory(customerId: string): Promise<{ customer: Customer; appointments: Appointment[] }> {
    return this.call(
      "getCustomerHistory", { customerId },
      z.object({ customer: schemas.customerSchema, appointments: z.array(schemas.appointmentSchema) }),
      { retrySafe: true },
    );
  }

  createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    // Safe to retry: requires an idempotencyKey, and Apps Script's
    // createAppointment returns the original appointment (not a
    // duplicate) for a repeated key — see BOOKING_RULES.md §3.
    return this.call("createAppointment", input, schemas.createAppointmentResultSchema, { retrySafe: true });
  }

  getAppointment(input: GetAppointmentInput): Promise<Appointment> {
    return this.call(
      "getAppointment", input, z.object({ appointment: schemas.appointmentSchema }), { retrySafe: true },
    ).then((r) => r.appointment);
  }

  getAppointmentByReference(reference: string, managementToken?: string): Promise<Appointment> {
    return this.call(
      "getAppointmentByReference", { reference, managementToken },
      z.object({ appointment: schemas.appointmentSchema }), { retrySafe: true },
    ).then((r) => r.appointment);
  }

  async listAppointments(filter?: { localDate?: string; barberId?: string; status?: AppointmentStatus }): Promise<Appointment[]> {
    const result = await this.call(
      "listAppointments", filter || {}, z.object({ appointments: z.array(schemas.appointmentSchema) }), { retrySafe: true },
    );
    return result.appointments;
  }

  async listCustomerAppointments(customerId: string): Promise<Appointment[]> {
    const result = await this.call(
      "listCustomerAppointments", { customerId }, z.object({ appointments: z.array(schemas.appointmentSchema) }), { retrySafe: true },
    );
    return result.appointments;
  }

  cancelAppointment(input: CancelAppointmentInput): Promise<Appointment> {
    // Cancellation is idempotent in Apps Script itself (cancelling an
    // already-cancelled appointment succeeds without error), so a retry
    // after a network failure is safe.
    return this.call(
      "cancelAppointment", input, z.object({ appointment: schemas.appointmentSchema }), { retrySafe: true },
    ).then((r) => r.appointment);
  }

  rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment> {
    // Not retried automatically: a reschedule is not idempotent by itself
    // (no idempotency key), and a blind retry after an ambiguous network
    // failure could attempt to reschedule an already-rescheduled
    // appointment. Left to the caller to re-check appointment state and
    // decide, rather than the transport layer guessing.
    return this.call(
      "rescheduleAppointment", input, z.object({ appointment: schemas.appointmentSchema }),
    ).then((r) => r.appointment);
  }

  updateAppointmentStatus(appointmentId: string, status: AppointmentStatus, actor: { type: "customer" | "admin" | "system"; id?: string }): Promise<Appointment> {
    return this.call(
      "updateAppointmentStatus", { appointmentId, status, actor },
      z.object({ appointment: schemas.appointmentSchema }),
    ).then((r) => r.appointment);
  }

  getOrCreateConversation(phoneE164: string): Promise<Conversation> {
    return this.call(
      "getOrCreateConversation", { phoneE164 }, schemas.conversationSchema as z.ZodType<Conversation>, { retrySafe: true },
    );
  }

  async findConversationByPhone(phoneE164: string): Promise<Conversation | null> {
    const result = await this.call(
      "findConversationByPhone", { phoneE164 },
      z.object({ conversation: (schemas.conversationSchema as z.ZodType<Conversation>).nullable() }),
      { retrySafe: true },
    );
    return result.conversation;
  }

  getConversation(conversationId: string): Promise<Conversation> {
    return this.call(
      "getConversation", { conversationId }, schemas.conversationSchema as z.ZodType<Conversation>, { retrySafe: true },
    );
  }

  applyConversationTurn(input: ApplyConversationTurnInput): Promise<Conversation> {
    return this.call("applyConversationTurn", input, schemas.conversationSchema as z.ZodType<Conversation>);
  }

  resetConversation(conversationId: string): Promise<Conversation> {
    return this.call("resetConversation", { conversationId }, schemas.conversationSchema as z.ZodType<Conversation>);
  }

  async appendConversationMessage(
    conversationId: string,
    message: { direction: MessageDirection; messageType: string; body?: string; externalMessageId?: string },
  ): Promise<void> {
    await this.call("appendConversationMessage", { conversationId, ...message }, z.object({}).passthrough());
  }

  registerWebhookEvent(input: RegisterWebhookEventInput): Promise<RegisterWebhookEventResult> {
    return this.call(
      "registerWebhookEvent", input,
      z.object({ isDuplicate: z.boolean(), eventId: z.string() }),
    );
  }

  async markWebhookEventProcessed(externalEventId: string): Promise<void> {
    await this.call("markWebhookEventProcessed", { externalEventId }, z.object({}).passthrough());
  }

  async markWebhookEventFailed(externalEventId: string, errorCode: string): Promise<void> {
    await this.call("markWebhookEventFailed", { externalEventId, errorCode }, z.object({}).passthrough());
  }

  activateHumanHandoff(input: ActivateHandoffInput): Promise<HumanHandoff> {
    return this.call("activateHumanHandoff", input, schemas.humanHandoffSchema as z.ZodType<HumanHandoff>);
  }

  resolveHumanHandoff(input: ResolveHandoffInput): Promise<HumanHandoff> {
    return this.call("resolveHumanHandoff", input, schemas.humanHandoffSchema as z.ZodType<HumanHandoff>);
  }

  async listOpenHumanHandoffs(): Promise<HumanHandoff[]> {
    const result = await this.call(
      "listOpenHumanHandoffs", {}, z.object({ handoffs: z.array(schemas.humanHandoffSchema) }), { retrySafe: true },
    );
    return result.handoffs;
  }

  createNotification(input: CreateNotificationInput): Promise<Notification> {
    return this.call(
      "createNotification", input, z.object({ notification: schemas.notificationSchema }),
    ).then((r) => r.notification);
  }

  async listDueNotifications(): Promise<Notification[]> {
    const result = await this.call(
      "listDueNotifications", {}, z.object({ notifications: z.array(schemas.notificationSchema) }), { retrySafe: true },
    );
    return result.notifications;
  }

  claimNotification(notificationId: string): Promise<Notification> {
    return this.call(
      "claimNotification", { notificationId }, z.object({ notification: schemas.notificationSchema }),
    ).then((r) => r.notification);
  }

  markNotificationSent(notificationId: string): Promise<Notification> {
    return this.call(
      "markNotificationSent", { notificationId }, z.object({ notification: schemas.notificationSchema }), { retrySafe: true },
    ).then((r) => r.notification);
  }

  markNotificationFailed(notificationId: string, errorCode: string, errorMessage: string, retryAfterMinutes?: number): Promise<Notification> {
    return this.call(
      "markNotificationFailed", { notificationId, errorCode, errorMessage, retryAfterMinutes },
      z.object({ notification: schemas.notificationSchema }), { retrySafe: true },
    ).then((r) => r.notification);
  }

  cancelNotification(notificationId: string): Promise<Notification> {
    return this.call(
      "cancelNotification", { notificationId }, z.object({ notification: schemas.notificationSchema }), { retrySafe: true },
    ).then((r) => r.notification);
  }

  async createAuditEntry(input: { actorType: string; actorId?: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: unknown }): Promise<void> {
    await this.call("createAuditEntry", input, z.object({}).passthrough(), { retrySafe: true });
  }

  async listAuditEntries(filter?: { entityType?: string; entityId?: string }): Promise<AuditEntry[]> {
    const result = await this.call(
      "listAuditEntries", filter || {}, z.object({ entries: z.array(schemas.auditEntrySchema) }), { retrySafe: true },
    );
    return result.entries;
  }

  // --- Admin (Phase G) ---

  async adminListServices(): Promise<Service[]> {
    const result = await this.call("adminListServices", {}, z.object({ services: z.array(schemas.serviceSchema) }), { retrySafe: true });
    return result.services;
  }
  adminCreateService(input: AdminCreateServiceInput): Promise<Service> {
    return this.call("adminCreateService", input, z.object({ service: schemas.serviceSchema })).then((r) => r.service);
  }
  adminUpdateService(serviceId: string, patch: AdminUpdateServiceInput): Promise<Service> {
    return this.call("adminUpdateService", { serviceId, ...patch }, z.object({ service: schemas.serviceSchema })).then((r) => r.service);
  }

  async adminListBarbers(): Promise<Barber[]> {
    const result = await this.call("adminListBarbers", {}, z.object({ barbers: z.array(schemas.barberSchema) }), { retrySafe: true });
    return result.barbers;
  }
  adminCreateBarber(input: AdminCreateBarberInput): Promise<Barber> {
    return this.call("adminCreateBarber", input, z.object({ barber: schemas.barberSchema })).then((r) => r.barber);
  }
  adminUpdateBarber(barberId: string, patch: AdminUpdateBarberInput): Promise<Barber> {
    return this.call("adminUpdateBarber", { barberId, ...patch }, z.object({ barber: schemas.barberSchema })).then((r) => r.barber);
  }
  async adminSetBarberServices(barberId: string, serviceIds: string[]): Promise<void> {
    await this.call("adminSetBarberServices", { barberId, serviceIds }, z.object({}).passthrough());
  }
  async adminGetBarberServices(barberId: string): Promise<string[]> {
    const result = await this.call(
      "adminGetBarberServices", { barberId }, z.object({ serviceIds: z.array(z.string()) }), { retrySafe: true },
    );
    return result.serviceIds;
  }

  async adminListWorkingHours(barberId?: string): Promise<WorkingHours[]> {
    const result = await this.call(
      "adminListWorkingHours", { barberId }, z.object({ workingHours: z.array(schemas.workingHoursSchema) }), { retrySafe: true },
    );
    return result.workingHours;
  }
  adminSetWorkingHours(input: AdminSetWorkingHoursInput): Promise<WorkingHours> {
    return this.call("adminSetWorkingHours", input, z.object({ workingHours: schemas.workingHoursSchema })).then((r) => r.workingHours);
  }

  async adminListBreaks(barberId?: string): Promise<BreakRecord[]> {
    const result = await this.call(
      "adminListBreaks", { barberId }, z.object({ breaks: z.array(schemas.breakRecordSchema) }), { retrySafe: true },
    );
    return result.breaks;
  }
  adminCreateBreak(input: AdminCreateBreakInput): Promise<BreakRecord> {
    return this.call("adminCreateBreak", input, z.object({ break: schemas.breakRecordSchema })).then((r) => r.break);
  }
  async adminDeleteBreak(breakId: string): Promise<void> {
    await this.call("adminDeleteBreak", { breakId }, z.object({}).passthrough());
  }

  async adminListTimeOff(barberId?: string): Promise<TimeOffRecord[]> {
    const result = await this.call(
      "adminListTimeOff", { barberId }, z.object({ timeOff: z.array(schemas.timeOffRecordSchema) }), { retrySafe: true },
    );
    return result.timeOff;
  }
  adminCreateTimeOff(input: AdminCreateTimeOffInput): Promise<TimeOffRecord> {
    return this.call("adminCreateTimeOff", input, z.object({ timeOff: schemas.timeOffRecordSchema })).then((r) => r.timeOff);
  }
  async adminDeleteTimeOff(timeOffId: string): Promise<void> {
    await this.call("adminDeleteTimeOff", { timeOffId }, z.object({}).passthrough());
  }

  async adminListBlockedSlots(barberId?: string): Promise<BlockedSlotRecord[]> {
    const result = await this.call(
      "adminListBlockedSlots", { barberId }, z.object({ blockedSlots: z.array(schemas.blockedSlotRecordSchema) }), { retrySafe: true },
    );
    return result.blockedSlots;
  }
  adminCreateBlockedSlot(input: AdminCreateBlockedSlotInput): Promise<BlockedSlotRecord> {
    return this.call("adminCreateBlockedSlot", input, z.object({ blockedSlot: schemas.blockedSlotRecordSchema })).then((r) => r.blockedSlot);
  }
  async adminDeleteBlockedSlot(blockedSlotId: string): Promise<void> {
    await this.call("adminDeleteBlockedSlot", { blockedSlotId }, z.object({}).passthrough());
  }

  async adminListNotifications(status?: NotificationStatus): Promise<Notification[]> {
    const result = await this.call(
      "adminListNotifications", { status }, z.object({ notifications: z.array(schemas.notificationSchema) }), { retrySafe: true },
    );
    return result.notifications;
  }
  async adminListConversations(handoffActiveOnly?: boolean): Promise<Conversation[]> {
    const result = await this.call(
      "adminListConversations", { handoffActiveOnly },
      z.object({ conversations: z.array(schemas.conversationSchema) as unknown as z.ZodType<Conversation[]> }),
      { retrySafe: true },
    );
    return result.conversations;
  }
  async adminGetConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    const result = await this.call(
      "adminGetConversationMessages", { conversationId }, z.object({ messages: z.array(schemas.conversationMessageSchema) }), { retrySafe: true },
    );
    return result.messages;
  }

  adminGetDashboardSummary(): Promise<DashboardSummary> {
    return this.call("adminGetDashboardSummary", {}, schemas.dashboardSummarySchema, { retrySafe: true });
  }
}
