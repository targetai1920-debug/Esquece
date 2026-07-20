import { describe, expect, it, beforeEach } from "vitest";
import { MockCrmClient } from "@/lib/crm/mockClient";
import { CrmError } from "@/lib/crm/errors";

/**
 * MockCrmClient must enforce the same business rules as the real Apps
 * Script engine (BOOKING_RULES.md) — this is what makes it safe to use
 * for local dev, the WhatsApp simulator, and the public-API tests in
 * Phase F. Mirrors the coverage of apps-script/Tests.gs's Phase D cases.
 */

function nextWeekdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = new Date(d.getTime() + 86400000);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function nextSaturdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() !== 6) d = new Date(d.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

describe("MockCrmClient", () => {
  let crm: MockCrmClient;
  const weekday = nextWeekdayDateStr(3);
  const saturday = nextSaturdayDateStr(3);

  beforeEach(() => {
    crm = new MockCrmClient();
  });

  it("lists seeded demo services and barbers", async () => {
    const services = await crm.listServices();
    const barbers = await crm.listBarbers();
    expect(services.length).toBeGreaterThan(0);
    expect(barbers.length).toBeGreaterThan(0);
  });

  it("returns availability for a weekday and none for Saturday", async () => {
    const weekdaySlots = await crm.getAvailability({ serviceId: "demo-service-1", anyBarber: true, localDate: weekday });
    const saturdaySlots = await crm.getAvailability({ serviceId: "demo-service-1", anyBarber: true, localDate: saturday });
    expect(weekdaySlots.length).toBeGreaterThan(0);
    expect(weekdaySlots[0].localStartTime).toBe("08:00");
    expect(saturdaySlots).toHaveLength(0);
  });

  it("validateSlot rejects Saturday with WEEKEND_CLOSED", async () => {
    const result = await crm.validateSlot({ serviceId: "demo-service-1", barberId: "demo-barber-1", localDate: saturday, localStartTime: "10:00" });
    expect(result).toEqual({ valid: false, reason: "WEEKEND_CLOSED" });
  });

  it("validateSlot accepts a service ending exactly at closing and rejects one minute later", async () => {
    const exact = await crm.validateSlot({ serviceId: "demo-service-1", barberId: "demo-barber-1", localDate: weekday, localStartTime: "15:30" });
    const late = await crm.validateSlot({ serviceId: "demo-service-1", barberId: "demo-barber-1", localDate: weekday, localStartTime: "15:45" });
    expect(exact.valid).toBe(true);
    expect(late).toEqual({ valid: false, reason: "OUTSIDE_BUSINESS_HOURS" });
  });

  it("prevents double-booking the same barber+slot — only one of two requests succeeds", async () => {
    const first = await crm.createAppointment({
      idempotencyKey: "key-a", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "09:00", customer: { name: "Cliente A", phoneE164: "+59171111111" },
    });
    expect(first.appointment.status).toBe("CONFIRMED");

    await expect(
      crm.createAppointment({
        idempotencyKey: "key-b", source: "WHATSAPP", serviceId: "demo-service-1", barberId: "demo-barber-1",
        localDate: weekday, localStartTime: "09:00", customer: { name: "Cliente B", phoneE164: "+59172222222" },
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" } satisfies Partial<CrmError>);

    const confirmed = (await crm.listAppointments({ localDate: weekday, barberId: "demo-barber-1", status: "CONFIRMED" }));
    expect(confirmed).toHaveLength(1);
  });

  it("retrying createAppointment with the same idempotency key returns the original, not a duplicate", async () => {
    const params = {
      idempotencyKey: "key-retry", source: "WEBSITE" as const, serviceId: "demo-service-1", barberId: "demo-barber-2",
      localDate: weekday, localStartTime: "09:00", customer: { name: "Cliente", phoneE164: "+59173333333" },
    };
    const first = await crm.createAppointment(params);
    const retry = await crm.createAppointment(params);
    expect(retry.appointment.appointmentId).toBe(first.appointment.appointmentId);
    expect(retry.idempotent).toBe(true);
  });

  it("rejects reused idempotency key with different request data", async () => {
    await crm.createAppointment({
      idempotencyKey: "key-conflict", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-2",
      localDate: weekday, localStartTime: "09:00", customer: { name: "Cliente", phoneE164: "+59174444444" },
    });
    await expect(
      crm.createAppointment({
        idempotencyKey: "key-conflict", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-2",
        localDate: weekday, localStartTime: "10:00", customer: { name: "Otro Cliente", phoneE164: "+59175555555" },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it('"any barber" picks the barber with fewer same-day appointments', async () => {
    await crm.createAppointment({
      idempotencyKey: "k1", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "09:00", customer: { name: "A", phoneE164: "+59176666666" },
    });
    await crm.createAppointment({
      idempotencyKey: "k2", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "10:00", customer: { name: "B", phoneE164: "+59177777777" },
    });
    const anyBarberResult = await crm.createAppointment({
      idempotencyKey: "k3", source: "WEBSITE", serviceId: "demo-service-1", anyBarber: true,
      localDate: weekday, localStartTime: "11:00", customer: { name: "C", phoneE164: "+59178888888" },
    });
    expect(anyBarberResult.appointment.barberId).toBe("demo-barber-2");
  });

  it("cancellation is idempotent and frees the slot for rebooking", async () => {
    const created = await crm.createAppointment({
      idempotencyKey: "k-cancel", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "13:00", customer: { name: "Cliente", phoneE164: "+59179999999" },
    });
    const cancelled = await crm.cancelAppointment({ appointmentId: created.appointment.appointmentId, actor: { type: "admin" } });
    expect(cancelled.status).toBe("CANCELLED");

    const cancelledAgain = await crm.cancelAppointment({ appointmentId: created.appointment.appointmentId, actor: { type: "admin" } });
    expect(cancelledAgain.status).toBe("CANCELLED");

    const rebooked = await crm.createAppointment({
      idempotencyKey: "k-rebook", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "13:00", customer: { name: "Otro", phoneE164: "+59170000001" },
    });
    expect(rebooked.appointment.status).toBe("CONFIRMED");
  });

  it("reschedule fails into a taken slot without touching the original appointment", async () => {
    const a = await crm.createAppointment({
      idempotencyKey: "k-a", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "08:00", customer: { name: "A", phoneE164: "+59170000002" },
    });
    await crm.createAppointment({
      idempotencyKey: "k-b", source: "WEBSITE", serviceId: "demo-service-1", barberId: "demo-barber-1",
      localDate: weekday, localStartTime: "14:00", customer: { name: "B", phoneE164: "+59170000003" },
    });

    await expect(
      crm.rescheduleAppointment({ appointmentId: a.appointment.appointmentId, actor: { type: "admin" }, newLocalDate: weekday, newLocalStartTime: "14:00" }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    const stillOriginal = await crm.getAppointment({ appointmentId: a.appointment.appointmentId });
    expect(stillOriginal.localStartTime).toBe("08:00");
    expect(stillOriginal.status).toBe("CONFIRMED");

    const rescheduled = await crm.rescheduleAppointment({ appointmentId: a.appointment.appointmentId, actor: { type: "admin" }, newLocalDate: weekday, newLocalStartTime: "11:00" });
    expect(rescheduled.localStartTime).toBe("11:00");
  });

  it("conversations: version conflict is detected, human handoff persists and silences replies", async () => {
    const conversation = await crm.getOrCreateConversation("59171112222");
    await crm.applyConversationTurn({ conversationId: conversation.conversationId, expectedVersion: conversation.version, newState: "SELECTING_SERVICE" });

    await expect(
      crm.applyConversationTurn({ conversationId: conversation.conversationId, expectedVersion: conversation.version, newState: "SELECTING_BARBER" }),
    ).rejects.toMatchObject({ code: "CONVERSATION_CONFLICT" });

    const handoff = await crm.activateHumanHandoff({ conversationId: conversation.conversationId, reason: "queja del cliente" });
    const afterHandoff = await crm.getConversation(conversation.conversationId);
    expect(afterHandoff.humanHandoffActive).toBe(true);
    expect(afterHandoff.state).toBe("HUMAN_HANDOFF");

    const resolved = await crm.resolveHumanHandoff({ handoffId: handoff.handoffId, reactivateBot: true });
    expect(resolved.status).toBe("RESOLVED");
    const afterResolve = await crm.getConversation(conversation.conversationId);
    expect(afterResolve.humanHandoffActive).toBe(false);
    expect(afterResolve.state).toBe("IDLE");
  });

  it("webhook event registration deduplicates", async () => {
    const first = await crm.registerWebhookEvent({ externalEventId: "wamid-1", eventType: "message" });
    const second = await crm.registerWebhookEvent({ externalEventId: "wamid-1", eventType: "message" });
    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(true);
  });

  it("two different phone numbers get isolated conversations", async () => {
    const convoA = await crm.getOrCreateConversation("59171110001");
    const convoB = await crm.getOrCreateConversation("59171110002");
    expect(convoA.conversationId).not.toBe(convoB.conversationId);

    await crm.applyConversationTurn({ conversationId: convoA.conversationId, expectedVersion: convoA.version, newState: "AWAITING_CONFIRMATION" });
    const refetchedB = await crm.getConversation(convoB.conversationId);
    expect(refetchedB.state).toBe("IDLE");
  });
});
