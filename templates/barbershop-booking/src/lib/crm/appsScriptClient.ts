import "server-only";
import { buildSignedRequest } from "./signing";
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

export interface AppsScriptCrmConfig {
  webAppUrl: string;
  apiKey: string;
  signingSecret: string;
  requestTimeoutMs: number;
}

interface ResponseEnvelope<T> {
  ok: boolean;
  requestId: string | null;
  data: T | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

const RETRY_SAFE_ACTIONS = new Set([
  "health", "getApiVersion", "getBusinessSettings", "listServices", "adminListServices",
  "listStaff", "listStaffForService", "adminListStaff", "listFaqs", "listPromotions",
  "getAvailability", "validateSlot", "getAppointmentByReference", "listAppointments",
  "listBlockedSlots", "listTimeOff", "listAuditLog",
  // createAppointment is safe to retry ONLY because it requires and enforces
  // an idempotency key end-to-end (Appointments.gs's actionCreateAppointment_
  // returns the original appointment for a repeated key, never a duplicate).
  "createAppointment",
]);

/**
 * Networked CrmClient implementation — calls a deployed Apps Script Web
 * App via signed HTTP requests. See
 * .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md.
 * Never holds a credential value beyond what's passed into its
 * constructor (read from environment variables named per client-config.json's
 * crm.webAppUrlEnv/apiKeyEnv/signingSecretEnv — see factory.ts) — this
 * class itself never reads process.env directly, so it stays trivially
 * testable with fake credentials.
 */
export class AppsScriptCrmClient implements CrmClient {
  constructor(private config: AppsScriptCrmConfig) {}

  private async call<T>(action: string, payload: unknown = {}): Promise<T> {
    const retrySafe = RETRY_SAFE_ACTIONS.has(action);

    // Every physical HTTP attempt gets a FRESH signed envelope (new nonce/
    // timestamp/requestId/signature) — the receiving side's replay
    // protection must reject a reused nonce, so a retry can never resend
    // the first attempt's envelope. The business payload (and any
    // idempotency key inside it) is identical across attempts.
    const attempt = async (): Promise<T> => {
      const envelope = buildSignedRequest(action, payload, this.config.apiKey, this.config.signingSecret);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      let response: Response;
      try {
        response = await fetch(this.config.webAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        throw new CrmError(isAbort ? "CRM_TIMEOUT" : "CRM_UNREACHABLE", isAbort ? "The CRM took too long to respond." : "Could not reach the CRM.", true);
      } finally {
        clearTimeout(timeout);
      }

      let body: ResponseEnvelope<T>;
      try {
        body = await response.json();
      } catch {
        throw new CrmError("CRM_INVALID_RESPONSE", "Invalid response from the CRM.", false);
      }

      if (!body.ok) {
        throw new CrmError(body.error?.code ?? "INTERNAL_ERROR", body.error?.message ?? "CRM call failed.", body.error?.retryable ?? false);
      }
      return body.data as T;
    };

    try {
      return await attempt();
    } catch (err) {
      const crmError = err instanceof CrmError ? err : new CrmError("INTERNAL_ERROR", "Internal error.", false);
      if (retrySafe && crmError.retryable) {
        return attempt();
      }
      throw crmError;
    }
  }

  async health(): Promise<{ status: "live"; schemaVersion: string }> {
    return this.call("health");
  }

  async getBusinessSettings(): Promise<BusinessSettings> {
    return this.call("getBusinessSettings");
  }

  async listServices(): Promise<Service[]> {
    const result = await this.call<{ services: Service[] }>("listServices");
    return result.services;
  }

  async adminListServices(): Promise<Service[]> {
    const result = await this.call<{ services: Service[] }>("adminListServices");
    return result.services;
  }

  async listStaff(): Promise<Staff[]> {
    const result = await this.call<{ staff: Staff[] }>("listStaff");
    return result.staff;
  }

  async adminListStaff(): Promise<Staff[]> {
    const result = await this.call<{ staff: Staff[] }>("adminListStaff");
    return result.staff;
  }

  async listStaffForService(serviceId: string): Promise<Staff[]> {
    const result = await this.call<{ staff: Staff[] }>("listStaffForService", { serviceId });
    return result.staff;
  }

  async listFaqs(): Promise<Faq[]> {
    const result = await this.call<{ faqs: Faq[] }>("listFaqs");
    return result.faqs;
  }

  async listPromotions(): Promise<Promotion[]> {
    const result = await this.call<{ promotions: Promotion[] }>("listPromotions");
    return result.promotions;
  }

  async getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]> {
    const result = await this.call<{ slots: AvailableSlot[] }>("getAvailability", input);
    return result.slots;
  }

  async validateSlot(input: ValidateSlotInput): Promise<{ valid: boolean; reason?: string }> {
    return this.call("validateSlot", input);
  }

  async createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    return this.call("createAppointment", input);
  }

  async getAppointmentByReference(reference: string, managementToken: string): Promise<Appointment | null> {
    try {
      const result = await this.call<{ appointment: Appointment }>("getAppointmentByReference", { reference, managementToken });
      return result.appointment;
    } catch (err) {
      if (err instanceof CrmError && err.code === "APPOINTMENT_NOT_FOUND") return null;
      throw err;
    }
  }

  async cancelAppointment(input: CancelInput): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("cancelAppointment", {
      appointmentId: input.appointmentId,
      managementToken: input.managementToken,
      reason: input.reason,
    });
    return result.appointment;
  }

  async rescheduleAppointment(input: RescheduleInput): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("rescheduleAppointment", input);
    return result.appointment;
  }

  async listAppointments(filter?: { localDate?: string; staffId?: string; status?: AppointmentStatus }): Promise<Appointment[]> {
    const result = await this.call<{ appointments: Appointment[] }>("listAppointments", filter ?? {});
    return result.appointments;
  }

  async confirmAppointment(appointmentId: string): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("confirmAppointment", { appointmentId });
    return result.appointment;
  }
  async completeAppointment(appointmentId: string): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("completeAppointment", { appointmentId });
    return result.appointment;
  }
  async markNoShow(appointmentId: string): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("markNoShow", { appointmentId });
    return result.appointment;
  }
  async adminCancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("adminCancelAppointment", { appointmentId, reason });
    return result.appointment;
  }
  async adminRescheduleAppointment(appointmentId: string, newLocalDate: string, newLocalStartTime: string): Promise<Appointment> {
    const result = await this.call<{ appointment: Appointment }>("adminRescheduleAppointment", { appointmentId, newLocalDate, newLocalStartTime });
    return result.appointment;
  }

  async listBlockedSlots(): Promise<BlockedSlot[]> {
    const result = await this.call<{ blockedSlots: BlockedSlot[] }>("listBlockedSlots");
    return result.blockedSlots;
  }
  async createBlockedSlot(input: { staffId?: string; localDate: string; startTime: string; endTime: string; reason?: string }): Promise<BlockedSlot> {
    const result = await this.call<{ blockedSlot: BlockedSlot }>("createBlockedSlot", input);
    return result.blockedSlot;
  }
  async deleteBlockedSlot(id: string): Promise<void> {
    await this.call("deleteBlockedSlot", { blockedSlotId: id });
  }

  async listTimeOff(): Promise<TimeOff[]> {
    const result = await this.call<{ timeOff: TimeOff[] }>("listTimeOff");
    return result.timeOff;
  }
  async createTimeOff(input: { staffId: string; startDate: string; endDate: string; reason?: string }): Promise<TimeOff> {
    const result = await this.call<{ timeOff: TimeOff }>("createTimeOff", input);
    return result.timeOff;
  }
  async deleteTimeOff(id: string): Promise<void> {
    await this.call("deleteTimeOff", { timeOffId: id });
  }

  async adminSetServiceActive(serviceId: string, active: boolean): Promise<Service> {
    const result = await this.call<{ service: Service }>("adminSetServiceActive", { serviceId, active });
    return result.service;
  }
  async adminSetServicePrice(serviceId: string, price: number): Promise<Service> {
    const result = await this.call<{ service: Service }>("adminSetServicePrice", { serviceId, price });
    return result.service;
  }
  async adminSetStaffActive(staffId: string, active: boolean): Promise<Staff> {
    const result = await this.call<{ staff: Staff }>("adminSetStaffActive", { staffId, active });
    return result.staff;
  }

  async listAuditLog(): Promise<AuditEntry[]> {
    const result = await this.call<{ entries: AuditEntry[] }>("listAuditLog");
    return result.entries;
  }
}
