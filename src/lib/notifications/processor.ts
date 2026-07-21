import "server-only";
import type { Appointment, CrmClient, Notification, NotificationType } from "@/lib/crm/types";
import { CrmError } from "@/lib/crm/errors";
import type { WhatsAppProvider } from "@/lib/whatsapp/types";
import { getWhatsAppTemplates } from "@/lib/env/server";
import { logger } from "@/lib/logging/logger";

/**
 * Processes due notifications — master spec §21. Claims each atomically
 * (never sends the same one twice, even under concurrent cron
 * invocations), skips notifications for appointments that are no longer
 * valid, respects WhatsApp's 24-hour customer-service window (falling back
 * to an approved template outside it — failing safely, not silently, when
 * no template is configured), and applies an exponential-backoff retry
 * policy up to a fixed attempt limit before giving up permanently.
 */

const CUSTOMER_SERVICE_WINDOW_HOURS = 24;
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MINUTES = [5, 15, 30, 60, 120];

export type NotificationOutcome = "sent" | "skipped_duplicate" | "skipped_stale" | "failed_retry" | "failed";

export interface NotificationProcessResult {
  notificationId: string;
  type: NotificationType;
  outcome: NotificationOutcome;
  detail?: string;
}

export async function processDueNotifications(crm: CrmClient, whatsapp: WhatsAppProvider): Promise<NotificationProcessResult[]> {
  const due = await crm.listDueNotifications();
  const results: NotificationProcessResult[] = [];
  for (const notification of due) {
    results.push(await processOne(crm, whatsapp, notification));
  }
  return results;
}

async function processOne(crm: CrmClient, whatsapp: WhatsAppProvider, notification: Notification): Promise<NotificationProcessResult> {
  let claimed: Notification;
  try {
    claimed = await crm.claimNotification(notification.notificationId);
  } catch (err) {
    if (err instanceof CrmError && err.code === "IDEMPOTENCY_CONFLICT") {
      // Already claimed by a concurrent cron invocation — not an error, just not ours to process.
      return { notificationId: notification.notificationId, type: notification.type, outcome: "skipped_duplicate" };
    }
    logger.error("Failed to claim notification", { notificationId: notification.notificationId, error: err instanceof Error ? err.message : String(err) });
    return { notificationId: notification.notificationId, type: notification.type, outcome: "failed", detail: "claim_error" };
  }

  try {
    if (claimed.channel !== "whatsapp") {
      // e.g. INTERNAL_ALERT (channel "admin") — nothing to send over WhatsApp; the admin dashboard already surfaces it.
      await crm.markNotificationSent(claimed.notificationId);
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "sent" };
    }

    if (!claimed.appointmentId) {
      await crm.markNotificationFailed(claimed.notificationId, "MISSING_APPOINTMENT", "La notificación no tiene una cita asociada.");
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed", detail: "missing_appointment" };
    }

    const appointment = await crm.getAppointment({ appointmentId: claimed.appointmentId }).catch(() => null);
    if (!appointment) {
      await crm.markNotificationFailed(claimed.notificationId, "APPOINTMENT_NOT_FOUND", "La cita referenciada ya no existe.");
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed", detail: "appointment_not_found" };
    }

    if (claimed.type === "REMINDER" && appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
      // The appointment was cancelled/completed after this reminder was scheduled — never remind about a stale appointment.
      await crm.cancelNotification(claimed.notificationId);
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "skipped_stale", detail: appointment.status };
    }

    if (!claimed.customerId) {
      await crm.markNotificationFailed(claimed.notificationId, "MISSING_CUSTOMER", "La notificación no tiene un cliente asociado.");
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed", detail: "missing_customer" };
    }
    const customer = await crm.getCustomer(claimed.customerId).catch(() => null);
    if (!customer) {
      await crm.markNotificationFailed(claimed.notificationId, "CUSTOMER_NOT_FOUND", "El cliente referenciado ya no existe.");
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed", detail: "customer_not_found" };
    }

    // A non-creating lookup on purpose — getOrCreateConversation would default a
    // brand-new row's lastInboundMessageAt to "now", which would incorrectly read
    // as "within the 24h window" for a customer who never actually messaged us
    // (e.g. a booking made through the website, with no WhatsApp conversation at all).
    const conversation = await crm.findConversationByPhone(customer.phoneE164);
    const withinServiceWindow = conversation ? isWithinCustomerServiceWindow(conversation.lastInboundMessageAt) : false;

    if (withinServiceWindow) {
      await whatsapp.sendText(customer.phoneE164, buildMessageBody(claimed.type, appointment));
    } else {
      const template = templateForType(claimed.type);
      if (!template.name) {
        // Never send free-form outside the 24h window, and never silently drop — fail safely with a clear, actionable reason.
        await crm.markNotificationFailed(claimed.notificationId, "TEMPLATE_REQUIRED", `Fuera de la ventana de 24 horas y no hay una plantilla aprobada configurada para ${claimed.type}.`);
        return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed", detail: "template_required" };
      }
      await whatsapp.sendTemplate(customer.phoneE164, template.name, template.language, [appointment.localDate, appointment.localStartTime]);
    }

    await crm.markNotificationSent(claimed.notificationId);
    return { notificationId: claimed.notificationId, type: claimed.type, outcome: "sent" };
  } catch (err) {
    const attempt = claimed.attemptCount;
    const message = err instanceof Error ? err.message : String(err);
    if (attempt < MAX_ATTEMPTS) {
      const retryAfterMinutes = RETRY_BACKOFF_MINUTES[Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];
      await crm.markNotificationFailed(claimed.notificationId, "SEND_ERROR", message, retryAfterMinutes).catch(() => undefined);
      return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed_retry", detail: message };
    }
    await crm.markNotificationFailed(claimed.notificationId, "SEND_ERROR", message).catch(() => undefined);
    return { notificationId: claimed.notificationId, type: claimed.type, outcome: "failed", detail: message };
  }
}

function isWithinCustomerServiceWindow(lastInboundMessageAt: string): boolean {
  if (!lastInboundMessageAt) return false;
  return Date.now() - new Date(lastInboundMessageAt).getTime() < CUSTOMER_SERVICE_WINDOW_HOURS * 3_600_000;
}

function buildMessageBody(type: NotificationType, appointment: Appointment): string {
  const when = `${appointment.localDate} a las ${appointment.localStartTime}`;
  switch (type) {
    case "CONFIRMATION":
      return `Tu cita de ${appointment.serviceNameSnapshot} el ${when} quedó confirmada. Referencia: ${appointment.reference}.`;
    case "REMINDER":
      return `Te recordamos tu cita de ${appointment.serviceNameSnapshot} el ${when}.`;
    case "CANCELLATION":
      return `Tu cita de ${appointment.serviceNameSnapshot} el ${when} fue cancelada.`;
    case "RESCHEDULE":
      return `Tu cita fue reprogramada: ${appointment.serviceNameSnapshot} el ${when}.`;
    default:
      return `Actualización sobre tu cita ${appointment.reference}.`;
  }
}

function templateForType(type: NotificationType): { name: string | null; language: string } {
  const templates = getWhatsAppTemplates();
  if (type === "REMINDER") return { name: templates.reminderName, language: templates.reminderLanguage };
  if (type === "CANCELLATION") return { name: templates.cancellationName, language: templates.reminderLanguage };
  if (type === "RESCHEDULE") return { name: templates.rescheduleName, language: templates.reminderLanguage };
  return { name: null, language: templates.reminderLanguage };
}
