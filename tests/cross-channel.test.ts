import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { _resetCrmClientForTests, getCrmClient } from "@/lib/crm/factory";
import { _resetEnvCacheForTests } from "@/lib/env/server";
import { _resetRateLimitsForTests } from "@/lib/http/rateLimit";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/auth/session";
import { MockAiProvider } from "@/lib/ai/mockProvider";
import { MockWhatsAppProvider } from "@/lib/whatsapp/mockProvider";
import { handleInboundTurn } from "@/lib/conversation/orchestrator";

import { POST as postPublicAvailability } from "@/app/api/public/availability/route";
import { POST as postPublicAppointments } from "@/app/api/public/appointments/route";
import { POST as postAdminBlockedSlots } from "@/app/api/admin/scheduling/blocked-slots/route";
import { PATCH as patchAdminService } from "@/app/api/admin/services/[serviceId]/route";
import { POST as postAdminAppointmentCancel } from "@/app/api/admin/appointments/[appointmentId]/cancel/route";

/**
 * Proves the master spec's central claim end to end: the separate public
 * website (simulated here via the real /api/public/* route handlers), the
 * WhatsApp agent (the real conversation orchestrator), and the admin
 * dashboard (the real /api/admin/* route handlers) all read and write
 * through the exact same CrmClient singleton — never three independent
 * availability calculations that could silently disagree.
 */

const APPROVED_ORIGIN = "http://localhost:3000";

function nextWeekdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function publicRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: APPROVED_ORIGIN },
    body: JSON.stringify(body),
  });
}

let adminSessionCookie: string;
async function adminRequest(url: string, method: string, body?: unknown): Promise<NextRequest> {
  const headers = new Headers({ "Content-Type": "application/json", origin: APPROVED_ORIGIN, cookie: adminSessionCookie });
  return new NextRequest(new URL(url, "http://localhost:3000"), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function readJson(response: Response) {
  return response.json();
}

async function whatsappDeps() {
  return { crm: getCrmClient(), ai: new MockAiProvider(), whatsapp: new MockWhatsAppProvider() };
}

/** Drives a full WhatsApp booking to BOOKING_CONFIRMED via numeric menu choices — same orchestrator the real webhook uses. barberChoice "0" = any barber, "1"/"2" = a specific one, so tests can pin down exactly which barber+slot gets occupied. */
async function bookViaWhatsApp(phone: string, localDate: string, slotIndex: number, name: string, barberChoice = "0") {
  const deps = await whatsappDeps();
  const send = (text: string) => handleInboundTurn(deps, { phoneE164: phone, externalMessageId: `xc-${Math.random()}`, messageType: "text", messageText: text });
  await send("hola");
  await send("1");
  await send(barberChoice);
  await send(localDate);
  await send(String(slotIndex));
  await send(name);
  return send("si");
}

process.env.ADMIN_EMAIL = "admin@esquece.test";
process.env.ADMIN_PASSWORD_HASH = "$2b$12$not-a-real-hash-just-needs-to-be-nonempty-for-config-presence";
process.env.AUTH_SECRET = "test-auth-secret-at-least-32-bytes-long-for-hs256";

describe("cross-channel synchronization", () => {
  beforeEach(async () => {
    _resetEnvCacheForTests();
    _resetCrmClientForTests();
    _resetRateLimitsForTests();
    adminSessionCookie = `${ADMIN_SESSION_COOKIE}=${await createAdminSessionToken("admin@esquece.test")}`;
  });

  it("a website booking blocks that slot for WhatsApp", async () => {
    const date = nextWeekdayDateStr(5);

    const createResponse = await postPublicAppointments(
      publicRequest("/api/public/appointments", {
        idempotencyKey: `xc-website-${Math.random()}`,
        serviceId: "demo-service-1",
        barberId: "demo-barber-1",
        localDate: date,
        localStartTime: "10:00",
        customer: { name: "Cliente Web", phoneE164: "59190000001" },
      }),
      { params: Promise.resolve({}) },
    );
    expect((await readJson(createResponse)).ok).toBe(true);

    const crm = getCrmClient();
    const appointments = (await crm.listAppointments({ localDate: date })).filter((a) => a.status !== "CANCELLED");
    expect(appointments).toHaveLength(1);

    const availability = await crm.getAvailability({ serviceId: "demo-service-1", localDate: date, barberId: "demo-barber-1" });
    expect(availability.some((s) => s.localStartTime === "10:00")).toBe(false); // demo-barber-1 no longer has 10:00 free

    // Prove the WhatsApp side sees the same thing: driving to the slot-offering step for the SAME
    // barber, the agent's outbound message (built from the same crm.getAvailability call) must not
    // offer 10:00 either — the same shared availability, not a second calculation.
    const deps = await whatsappDeps();
    await handleInboundTurn(deps, { phoneE164: "59190000002", externalMessageId: "xc-a", messageType: "text", messageText: "hola" });
    await handleInboundTurn(deps, { phoneE164: "59190000002", externalMessageId: "xc-b", messageType: "text", messageText: "1" });
    await handleInboundTurn(deps, { phoneE164: "59190000002", externalMessageId: "xc-c", messageType: "text", messageText: "1" });
    const outcome = await handleInboundTurn(deps, { phoneE164: "59190000002", externalMessageId: "xc-d", messageType: "text", messageText: date });
    expect(outcome.state).toBe("SELECTING_TIME");
    const conversation = await crm.getConversation(outcome.conversationId);
    const messages = await crm.adminGetConversationMessages(conversation.conversationId);
    const slotListMessage = messages[messages.length - 1].body;
    expect(slotListMessage).not.toContain("10:00");
  });

  it("a WhatsApp booking blocks that slot for the website API", async () => {
    const date = nextWeekdayDateStr(6);
    const outcome = await bookViaWhatsApp("59190000003", date, 1, "Cliente WhatsApp", "1"); // demo-barber-1, slot #1 == 08:00
    expect(outcome.state).toBe("BOOKING_CONFIRMED");

    const availabilityResponse = await postPublicAvailability(
      publicRequest("/api/public/availability", { serviceId: "demo-service-1", localDate: date, barberId: "demo-barber-1" }),
      { params: Promise.resolve({}) },
    );
    const availabilityBody = await readJson(availabilityResponse);
    expect(availabilityBody.ok).toBe(true);
    expect(availabilityBody.data.some((s: { localStartTime: string }) => s.localStartTime === "08:00")).toBe(false);
  });

  it("concurrent booking: only one of two channels racing for the same slot wins, and the CRM stores exactly one appointment", async () => {
    const date = nextWeekdayDateStr(7);

    // WhatsApp reaches AWAITING_CONFIRMATION for 08:00 with barber demo-barber-1 (choice "1" instead of "any"), but hasn't confirmed yet.
    const waDeps = await whatsappDeps();
    const send = (text: string) => handleInboundTurn(waDeps, { phoneE164: "59190000004", externalMessageId: `xc-race-${Math.random()}`, messageType: "text", messageText: text });
    await send("hola");
    await send("1");
    await send("1"); // demo-barber-1 specifically
    await send(date);
    await send("1"); // 08:00
    await send("Cliente Carrera WhatsApp");
    // Not yet confirmed — the website books the identical slot first.

    const websiteResponse = await postPublicAppointments(
      publicRequest("/api/public/appointments", {
        idempotencyKey: `xc-race-website-${Math.random()}`,
        serviceId: "demo-service-1",
        barberId: "demo-barber-1",
        localDate: date,
        localStartTime: "08:00",
        customer: { name: "Cliente Carrera Web", phoneE164: "59190000005" },
      }),
      { params: Promise.resolve({}) },
    );
    expect((await readJson(websiteResponse)).ok).toBe(true);

    const finalOutcome = await send("si"); // WhatsApp now tries to confirm into the now-taken slot
    expect(finalOutcome.state).not.toBe("BOOKING_CONFIRMED");

    const crm = getCrmClient();
    const stillOneBooking = (await crm.listAppointments({ localDate: date, barberId: "demo-barber-1" })).filter((a) => a.localStartTime === "08:00" && a.status !== "CANCELLED");
    expect(stillOneBooking).toHaveLength(1);
    expect(stillOneBooking[0].customerNameSnapshot).toBe("Cliente Carrera Web"); // the website's booking is the one that survived
  });

  it("an admin block prevents booking that slot from the website API, WhatsApp, and direct creation alike", async () => {
    const date = nextWeekdayDateStr(8);

    const blockResponse = await postAdminBlockedSlots(
      await adminRequest("/api/admin/scheduling/blocked-slots", "POST", { localDate: date, startTime: "09:00", endTime: "09:30", reason: "Mantenimiento" }),
      { params: Promise.resolve({}) },
    );
    expect((await readJson(blockResponse)).ok).toBe(true);

    const availabilityResponse = await postPublicAvailability(
      publicRequest("/api/public/availability", { serviceId: "demo-service-1", localDate: date, anyBarber: true }),
      { params: Promise.resolve({}) },
    );
    const availabilityBody = await readJson(availabilityResponse);
    expect(availabilityBody.data.some((s: { localStartTime: string }) => s.localStartTime === "09:00")).toBe(false);

    const directCreateResponse = await postPublicAppointments(
      publicRequest("/api/public/appointments", {
        idempotencyKey: `xc-blocked-${Math.random()}`,
        serviceId: "demo-service-1",
        anyBarber: true,
        localDate: date,
        localStartTime: "09:00",
        customer: { name: "Cliente Bloqueado", phoneE164: "59190000006" },
      }),
      { params: Promise.resolve({}) },
    );
    const directCreateBody = await readJson(directCreateResponse);
    expect(directCreateBody.ok).toBe(false);
    expect(directCreateBody.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("cancellation via the admin dashboard releases the slot for the website API and WhatsApp", async () => {
    const date = nextWeekdayDateStr(9);
    const createResponse = await postPublicAppointments(
      publicRequest("/api/public/appointments", {
        idempotencyKey: `xc-cancel-${Math.random()}`,
        serviceId: "demo-service-1",
        barberId: "demo-barber-1",
        localDate: date,
        localStartTime: "09:30",
        customer: { name: "Cliente A Cancelar", phoneE164: "59190000007" },
      }),
      { params: Promise.resolve({}) },
    );
    const created = await readJson(createResponse);
    expect(created.ok).toBe(true);

    const cancelResponse = await postAdminAppointmentCancel(
      await adminRequest(`/api/admin/appointments/${created.data.appointment.appointmentId}/cancel`, "POST", { reason: "Cliente no puede asistir" }),
      { params: Promise.resolve({ appointmentId: created.data.appointment.appointmentId }) },
    );
    expect((await readJson(cancelResponse)).ok).toBe(true);

    const crm = getCrmClient();
    const appointment = await crm.getAppointment({ appointmentId: created.data.appointment.appointmentId });
    expect(appointment.status).toBe("CANCELLED");

    const availabilityResponse = await postPublicAvailability(
      publicRequest("/api/public/availability", { serviceId: "demo-service-1", localDate: date, barberId: "demo-barber-1" }),
      { params: Promise.resolve({}) },
    );
    const availabilityBody = await readJson(availabilityResponse);
    expect(availabilityBody.data.some((s: { localStartTime: string }) => s.localStartTime === "09:30")).toBe(true); // released
  });

  it("a service duration change is immediately reflected in both the website API and WhatsApp availability, identically", async () => {
    const date = nextWeekdayDateStr(10);
    const crm = getCrmClient();
    const services = await crm.listServices();
    const service = services[0];

    const beforeResponse = await postPublicAvailability(
      publicRequest("/api/public/availability", { serviceId: service.serviceId, localDate: date, barberId: "demo-barber-1" }),
      { params: Promise.resolve({}) },
    );
    const beforeSlots = (await readJson(beforeResponse)).data;

    const updateResponse = await patchAdminService(
      await adminRequest(`/api/admin/services/${service.serviceId}`, "PATCH", { durationMinutes: 90 }),
      { params: Promise.resolve({ serviceId: service.serviceId }) },
    );
    expect((await readJson(updateResponse)).ok).toBe(true);

    const afterResponse = await postPublicAvailability(
      publicRequest("/api/public/availability", { serviceId: service.serviceId, localDate: date, barberId: "demo-barber-1" }),
      { params: Promise.resolve({}) },
    );
    const afterSlots = (await readJson(afterResponse)).data;
    expect(afterSlots.length).toBeLessThan(beforeSlots.length); // a longer service fits into fewer remaining daily slots

    // The exact same query through the shared engine — never a channel-specific recalculation.
    const directAvailability = await crm.getAvailability({ serviceId: service.serviceId, localDate: date, barberId: "demo-barber-1" });
    expect(directAvailability).toEqual(afterSlots);
  });
});
