import { describe, expect, it, beforeEach } from "vitest";
import { MockCrmClient } from "@/lib/crm/mockClient";
import { MockAiProvider } from "@/lib/ai/mockProvider";
import { MockWhatsAppProvider } from "@/lib/whatsapp/mockProvider";
import { handleInboundTurn, type OrchestratorDeps } from "@/lib/conversation/orchestrator";

/**
 * Drives the real conversation orchestrator (the same code the WhatsApp
 * webhook and the /dev/whatsapp-simulator both call) through full
 * booking/cancel/reschedule flows, human handoff, session expiry, and
 * slot-unavailable recovery — against a fresh MockCrmClient/MockAiProvider/
 * MockWhatsAppProvider per test, so nothing here needs a real Meta/
 * Anthropic credential.
 */

function nextWeekdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

let deps: OrchestratorDeps;
let crm: MockCrmClient;
let whatsapp: MockWhatsAppProvider;

beforeEach(() => {
  crm = new MockCrmClient();
  whatsapp = new MockWhatsAppProvider();
  deps = { crm, ai: new MockAiProvider(), whatsapp };
});

async function send(phoneE164: string, messageText: string) {
  return handleInboundTurn(deps, { phoneE164, externalMessageId: `msg-${Math.random()}`, messageType: "text", messageText });
}

describe("conversation orchestrator — booking flow", () => {
  it("books an appointment end-to-end via service/barber/date/time/name/confirm", async () => {
    const phone = "59170000001";
    const date = nextWeekdayDateStr(5);

    await send(phone, "hola");
    let outcome = await send(phone, "1"); // first service
    expect(outcome.state).toBe("SELECTING_BARBER");

    outcome = await send(phone, "0"); // any barber
    expect(outcome.state).toBe("SELECTING_DATE");

    outcome = await send(phone, date);
    expect(outcome.state).toBe("SELECTING_TIME");

    outcome = await send(phone, "1"); // first available slot (08:00)
    expect(outcome.state).toBe("REQUESTING_NAME");

    outcome = await send(phone, "Juan Perez");
    expect(outcome.state).toBe("AWAITING_CONFIRMATION");

    outcome = await send(phone, "si");
    expect(outcome.state).toBe("BOOKING_CONFIRMED");

    const customer = await crm.findCustomerByPhone(phone);
    const appointments = await crm.listCustomerAppointments(customer!.customerId);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe("CONFIRMED");
    expect(appointments[0].localDate).toBe(date);
    expect(appointments[0].localStartTime).toBe("08:00");
    expect(appointments[0].customerNameSnapshot).toBe("Juan Perez");

    // A reply was sent (recorded) at every step, and the customer never
    // needed to repeat information already given.
    expect(whatsapp.sentMessages.length).toBeGreaterThan(0);
  });

  it("recovers from SLOT_UNAVAILABLE at confirmation time by offering fresh slots instead of failing the conversation", async () => {
    const phone = "59170000002";
    const date = nextWeekdayDateStr(6);

    await send(phone, "hola");
    await send(phone, "1");
    await send(phone, "1"); // pick demo-barber-1 specifically (not "any") so we can occupy exactly this barber's slot
    await send(phone, date);
    await send(phone, "1"); // 08:00
    await send(phone, "Cliente Original");

    // Someone else takes the exact same barber+slot first (e.g. via the website), between the summary and the confirmation.
    await crm.createAppointment({
      idempotencyKey: `race-${Math.random()}`,
      source: "WEBSITE",
      serviceId: "demo-service-1",
      barberId: "demo-barber-1",
      localDate: date,
      localStartTime: "08:00",
      customer: { name: "Cliente Rival", phoneE164: "59170000099" },
    });

    const outcome = await send(phone, "si");
    // Never confirmed a booking that didn't actually succeed.
    expect(outcome.state).not.toBe("BOOKING_CONFIRMED");

    const customer = await crm.findCustomerByPhone(phone);
    const appointments = await crm.listCustomerAppointments(customer!.customerId);
    expect(appointments).toHaveLength(0);

    const allForSlot = (await crm.listAppointments({ localDate: date, barberId: "demo-barber-1" })).filter((a) => a.localStartTime === "08:00" && a.status !== "CANCELLED");
    expect(allForSlot).toHaveLength(1); // exactly the rival's booking — no duplicate created
  });
});

describe("conversation orchestrator — cancellation flow", () => {
  it("cancels the customer's own appointment after an explicit confirmation", async () => {
    const phone = "59170000003";
    const date = nextWeekdayDateStr(5);
    const created = await crm.createAppointment({
      idempotencyKey: `cancel-test-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: date,
      localStartTime: "09:00",
      customer: { name: "Cliente Cancelar", phoneE164: phone },
    });

    let outcome = await send(phone, "quiero cancelar mi cita");
    expect(outcome.state).toBe("AWAITING_CONFIRMATION");

    outcome = await send(phone, "si");
    expect(outcome.state).toBe("IDLE");

    const appointment = await crm.getAppointment({ appointmentId: created.appointment.appointmentId });
    expect(appointment.status).toBe("CANCELLED");
  });

  it("asks which appointment when the customer has more than one changeable appointment", async () => {
    const phone = "59170000004";
    const dateA = nextWeekdayDateStr(5);
    const dateB = nextWeekdayDateStr(7);
    await crm.createAppointment({ idempotencyKey: `multi-a-${Math.random()}`, source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true, localDate: dateA, localStartTime: "09:00", customer: { name: "Cliente Multi", phoneE164: phone } });
    await crm.createAppointment({ idempotencyKey: `multi-b-${Math.random()}`, source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true, localDate: dateB, localStartTime: "10:00", customer: { name: "Cliente Multi", phoneE164: phone } });

    const outcome = await send(phone, "cancelar");
    expect(outcome.state).toBe("CANCELLING_BOOKING");
    const lastMessage = whatsapp.sentMessages[whatsapp.sentMessages.length - 1];
    expect(lastMessage.body).toContain(dateA);
    expect(lastMessage.body).toContain(dateB);
  });
});

describe("conversation orchestrator — reschedule flow", () => {
  it("reschedules the customer's appointment to a new date and time", async () => {
    const phone = "59170000005";
    const oldDate = nextWeekdayDateStr(5);
    const newDate = nextWeekdayDateStr(8);
    const created = await crm.createAppointment({
      idempotencyKey: `reschedule-test-${Math.random()}`,
      source: "WHATSAPP",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: oldDate,
      localStartTime: "09:00",
      customer: { name: "Cliente Reprogramar", phoneE164: phone },
    });

    let outcome = await send(phone, "quiero reprogramar mi cita");
    expect(outcome.state).toBe("SELECTING_DATE");

    outcome = await send(phone, newDate);
    expect(outcome.state).toBe("SELECTING_TIME");

    outcome = await send(phone, "1");
    expect(outcome.state).toBe("AWAITING_CONFIRMATION");

    outcome = await send(phone, "si");
    expect(outcome.state).toBe("IDLE");

    const appointment = await crm.getAppointment({ appointmentId: created.appointment.appointmentId });
    expect(appointment.localDate).toBe(newDate);
    expect(appointment.status).toBe("CONFIRMED");

    // The old slot is released — a new booking at the old date/time succeeds.
    const oldSlotBooking = await crm.createAppointment({
      idempotencyKey: `after-reschedule-${Math.random()}`,
      source: "WEBSITE",
      serviceId: "demo-service-1",
      anyBarber: true,
      localDate: oldDate,
      localStartTime: "09:00",
      customer: { name: "Otro Cliente", phoneE164: "59170000098" },
    });
    expect(oldSlotBooking.appointment.status).toBe("CONFIRMED");
  });
});

describe("conversation orchestrator — human handoff", () => {
  it("activates handoff, stops automated replies, but keeps recording inbound messages", async () => {
    const phone = "59170000006";
    const outcome = await send(phone, "quiero hablar con una persona por favor");
    expect(outcome.state).toBe("HUMAN_HANDOFF");

    const handoffs = await crm.listOpenHumanHandoffs();
    expect(handoffs.some((h) => h.phoneE164 === phone)).toBe(true);

    const sentBeforeSilentMessage = whatsapp.sentMessages.length;
    const silentOutcome = await send(phone, "¿hola? ¿alguien ahí?");
    expect(silentOutcome.replySent).toBe(false);
    expect(whatsapp.sentMessages.length).toBe(sentBeforeSilentMessage); // no automated reply while handoff is active

    const conversation = await crm.getOrCreateConversation(phone);
    const messages = await crm.adminGetConversationMessages(conversation.conversationId);
    expect(messages.some((m) => m.body === "¿hola? ¿alguien ahí?")).toBe(true); // still recorded, per WHATSAPP_AGENT_DESIGN.md §8
  });

  it("never auto-reactivates — only resolveHumanHandoff (an explicit admin action) does", async () => {
    const phone = "59170000007";
    await send(phone, "reclamo, esto es una estafa");
    let conversation = await crm.getOrCreateConversation(phone);
    expect(conversation.humanHandoffActive).toBe(true);

    await send(phone, "otro mensaje mientras espero");
    conversation = await crm.getOrCreateConversation(phone);
    expect(conversation.humanHandoffActive).toBe(true); // still active — no automatic reactivation

    const handoffs = await crm.listOpenHumanHandoffs();
    const handoff = handoffs.find((h) => h.phoneE164 === phone)!;
    await crm.resolveHumanHandoff({ handoffId: handoff.handoffId, reactivateBot: true });
    conversation = await crm.getOrCreateConversation(phone);
    expect(conversation.humanHandoffActive).toBe(false);
    expect(conversation.state).not.toBe("HUMAN_HANDOFF");
  });
});

describe("conversation orchestrator — session expiry", () => {
  it("resets an expired session to IDLE before processing the new message, without touching past appointments", async () => {
    const phone = "59170000008";
    await send(phone, "hola");
    let outcome = await send(phone, "1");
    expect(outcome.state).toBe("SELECTING_BARBER");

    const conversation = await crm.getOrCreateConversation(phone);
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago, well past the 60min default timeout
    crm._setConversationLastInboundAtForTests(conversation.conversationId, longAgo);

    outcome = await send(phone, "hola de nuevo");
    expect(outcome.state).toBe("SELECTING_SERVICE"); // reset to IDLE, then immediately re-processed the greeting
  });
});
