import { describe, expect, it, beforeEach } from "vitest";
import { MockCrmClient } from "@/lib/crm/mockClient";
import { MockWhatsAppProvider } from "@/lib/whatsapp/mockProvider";
import { _resetEnvCacheForTests } from "@/lib/env/server";
import { processDueNotifications } from "@/lib/notifications/processor";

/**
 * Exercises the real notification processor (the same code the
 * /api/cron/notifications route calls) against a fresh MockCrmClient/
 * MockWhatsAppProvider — atomic claiming, the 24h customer-service window
 * (using a non-creating conversation lookup so a customer who never
 * messaged us is correctly treated as outside the window), template
 * fallback and its safe failure when unconfigured, stale-appointment
 * skipping, non-WhatsApp channels, and the retry-with-backoff policy.
 */

const PAST = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

function nextWeekdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

let crm: MockCrmClient;
let whatsapp: MockWhatsAppProvider;

beforeEach(() => {
  crm = new MockCrmClient();
  whatsapp = new MockWhatsAppProvider();
  delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  delete process.env.WHATSAPP_CANCELLATION_TEMPLATE_NAME;
  delete process.env.WHATSAPP_RESCHEDULE_TEMPLATE_NAME;
  _resetEnvCacheForTests();
});

describe("notification processor", () => {
  it("sends a CONFIRMATION as free-form text when the customer is within the 24h service window", async () => {
    const phone = "59180000001";
    const created = await crm.createAppointment({
      idempotencyKey: `notif-inwindow-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: nextWeekdayDateStr(5),
      localStartTime: "09:00",
      customer: { name: "Cliente Ventana", phoneE164: phone },
    });
    await crm.getOrCreateConversation(phone); // simulates the customer having an active/recent conversation

    const results = await processDueNotifications(crm, whatsapp);
    const confirmation = results.find((r) => r.notificationId && r.type === "CONFIRMATION");
    expect(confirmation?.outcome).toBe("sent");
    expect(whatsapp.sentMessages.some((m) => m.kind === "text" && m.to === phone)).toBe(true);
    void created;
  });

  it("fails safely (never sends free-form) when outside the window and no template is configured", async () => {
    const phone = "59180000002";
    await crm.createAppointment({
      idempotencyKey: `notif-notemplate-${Math.random()}`,
      source: "WEBSITE",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: nextWeekdayDateStr(6),
      localStartTime: "09:00",
      customer: { name: "Cliente Sin Plantilla", phoneE164: phone },
    });
    // No conversation created — this customer never messaged us via WhatsApp.

    const results = await processDueNotifications(crm, whatsapp);
    const confirmation = results.find((r) => r.type === "CONFIRMATION");
    expect(confirmation?.outcome).toBe("failed");
    expect(confirmation?.detail).toBe("template_required");
    expect(whatsapp.sentMessages).toHaveLength(0);
  });

  it("sends via an approved template when outside the window and a template is configured", async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = "cita_recordatorio";
    process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE = "es";
    _resetEnvCacheForTests();

    const phone = "59180000003";
    const created = await crm.createAppointment({
      idempotencyKey: `notif-template-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: nextWeekdayDateStr(7),
      localStartTime: "09:00",
      customer: { name: "Cliente Plantilla", phoneE164: phone },
    });
    await crm.createNotification({ appointmentId: created.appointment.appointmentId, customerId: created.appointment.customerId, type: "REMINDER", scheduledAt: PAST(1) });
    // No conversation — outside the window, must use the template.

    const results = await processDueNotifications(crm, whatsapp);
    const reminder = results.find((r) => r.type === "REMINDER");
    expect(reminder?.outcome).toBe("sent");
    expect(whatsapp.sentMessages.some((m) => m.kind === "template" && m.body.includes("cita_recordatorio"))).toBe(true);
  });

  it("skips (cancels) a REMINDER whose appointment is no longer PENDING/CONFIRMED", async () => {
    const phone = "59180000004";
    const created = await crm.createAppointment({
      idempotencyKey: `notif-stale-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: nextWeekdayDateStr(8),
      localStartTime: "09:00",
      customer: { name: "Cliente Obsoleto", phoneE164: phone },
    });
    await crm.cancelAppointment({ appointmentId: created.appointment.appointmentId, actor: { type: "system" } });
    // Manually create a reminder anyway, bypassing the create/cancel auto-scheduling hooks, to test the processor's own defense-in-depth check.
    await crm.createNotification({ appointmentId: created.appointment.appointmentId, customerId: created.appointment.customerId, type: "REMINDER", scheduledAt: PAST(1) });

    const results = await processDueNotifications(crm, whatsapp);
    const reminder = results.find((r) => r.type === "REMINDER");
    expect(reminder?.outcome).toBe("skipped_stale");
    expect(whatsapp.sentMessages).toHaveLength(0);
  });

  it("marks a non-WhatsApp-channel notification (e.g. INTERNAL_ALERT) sent without attempting to send it", async () => {
    await crm.createNotification({ type: "INTERNAL_ALERT", channel: "admin", scheduledAt: PAST(1) });
    const results = await processDueNotifications(crm, whatsapp);
    expect(results.some((r) => r.type === "INTERNAL_ALERT" && r.outcome === "sent")).toBe(true);
    expect(whatsapp.sentMessages).toHaveLength(0);
  });

  it("retries with backoff on a WhatsApp send failure instead of failing permanently on the first attempt", async () => {
    const phone = "59180000005";
    await crm.createAppointment({
      idempotencyKey: `notif-retry-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: nextWeekdayDateStr(9),
      localStartTime: "09:00",
      customer: { name: "Cliente Reintento", phoneE164: phone },
    });
    await crm.getOrCreateConversation(phone);
    whatsapp.failNextSend = true;

    const results = await processDueNotifications(crm, whatsapp);
    const confirmation = results.find((r) => r.type === "CONFIRMATION");
    expect(confirmation?.outcome).toBe("failed_retry");

    // Immediately due again? No — backoff pushed scheduledAt into the future, so it must not be picked up again right away.
    const dueNow = await crm.listDueNotifications();
    expect(dueNow.find((n) => n.notificationId === confirmation?.notificationId)).toBeUndefined();
  });

  it("never processes the same notification twice in one run, even if listed twice", async () => {
    const phone = "59180000006";
    await crm.createAppointment({
      idempotencyKey: `notif-oncecheck-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: nextWeekdayDateStr(10),
      localStartTime: "09:00",
      customer: { name: "Cliente Unico", phoneE164: phone },
    });
    await crm.getOrCreateConversation(phone);

    await processDueNotifications(crm, whatsapp);
    const secondRun = await processDueNotifications(crm, whatsapp);
    expect(secondRun).toHaveLength(0); // already SENT — no longer PENDING, never picked up again
    expect(whatsapp.sentMessages).toHaveLength(1);
  });
});
