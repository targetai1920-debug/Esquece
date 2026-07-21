import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { _resetCrmClientForTests } from "@/lib/crm/factory";
import { _resetRateLimitsForTests } from "@/lib/http/rateLimit";

import { GET as getServices } from "@/app/api/public/services/route";
import { GET as getBarbers } from "@/app/api/public/barbers/route";
import { POST as postAvailability, OPTIONS as availabilityOptions } from "@/app/api/public/availability/route";
import { POST as postAppointments } from "@/app/api/public/appointments/route";
import { GET as getAppointmentByReference } from "@/app/api/public/appointments/[reference]/route";
import { POST as postCancel } from "@/app/api/public/appointments/[reference]/cancel/route";
import { POST as postReschedule } from "@/app/api/public/appointments/[reference]/reschedule/route";

/**
 * Exercises the actual exported route handler functions — the same
 * functions Next.js itself calls for a real HTTP request — not a
 * re-implementation of their logic. Complements the manual curl-based
 * end-to-end check documented in IMPLEMENTATION_STATUS.md (this suite is
 * what CI/future sessions can re-run automatically).
 */

function nextWeekdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const weekday = nextWeekdayDateStr(3);
const APPROVED_ORIGIN = "http://localhost:3000";

function makeRequest(url: string, init?: { method?: string; headers?: HeadersInit; body?: string; origin?: string }): NextRequest {
  const headers = new Headers(init?.headers);
  if (init?.origin) headers.set("origin", init.origin);
  return new NextRequest(new URL(url, "http://localhost:3000"), { method: init?.method, body: init?.body, headers });
}

function jsonRequest(url: string, body: unknown, origin = APPROVED_ORIGIN): NextRequest {
  return makeRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    origin,
  });
}

async function readJson(response: Response) {
  return response.json();
}

describe("public booking API", () => {
  beforeEach(() => {
    _resetCrmClientForTests();
    _resetRateLimitsForTests();
  });

  it("GET /api/public/services returns the standard envelope with demo services", async () => {
    const response = await getServices(makeRequest("/api/public/services"), { params: Promise.resolve({}) });
    const body = await readJson(response);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(typeof body.requestId).toBe("string");
  });

  it("GET /api/public/barbers?serviceId= filters to eligible barbers", async () => {
    const response = await getBarbers(makeRequest("/api/public/barbers?serviceId=demo-service-1"), { params: Promise.resolve({}) });
    const body = await readJson(response);
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("POST /api/public/availability rejects Saturday with an empty slot list, not an error", async () => {
    let saturday = new Date();
    while (saturday.getUTCDay() !== 6) saturday = new Date(saturday.getTime() + 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const saturdayStr = `${saturday.getUTCFullYear()}-${pad(saturday.getUTCMonth() + 1)}-${pad(saturday.getUTCDate())}`;

    const response = await postAvailability(
      jsonRequest("/api/public/availability", { serviceId: "demo-service-1", anyBarber: true, localDate: saturdayStr }),
      { params: Promise.resolve({}) },
    );
    const body = await readJson(response);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  it("POST /api/public/availability validates the request body and returns INVALID_PAYLOAD for garbage", async () => {
    const response = await postAvailability(
      jsonRequest("/api/public/availability", { nonsense: true }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects an oversized request body before ever parsing it (Phase K request-size limit)", async () => {
    const hugeNotes = "x".repeat(200_000);
    const response = await postAvailability(
      jsonRequest("/api/public/availability", { serviceId: "demo-service-1", localDate: weekday, anyBarber: true, customerNotes: hugeNotes }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("full booking lifecycle: create, reject duplicate slot, get by reference requires token, reschedule, cancel", async () => {
    const createBody = {
      idempotencyKey: "api-test-key-1",
      serviceId: "demo-service-1",
      barberId: "demo-barber-1",
      localDate: weekday,
      localStartTime: "09:00",
      customer: { name: "Cliente API Test", phoneE164: "+59171112223" },
    };

    const createResponse = await postAppointments(jsonRequest("/api/public/appointments", createBody), { params: Promise.resolve({}) });
    const created = await readJson(createResponse);
    expect(created.ok).toBe(true);
    expect(created.data.appointment.status).toBe("CONFIRMED");
    expect(typeof created.data.managementToken).toBe("string");
    const { reference } = created.data.appointment;
    const managementToken = created.data.managementToken;

    // Same slot, different customer — must be rejected.
    const conflictResponse = await postAppointments(
      jsonRequest("/api/public/appointments", { ...createBody, idempotencyKey: "api-test-key-2", customer: { name: "Otro", phoneE164: "+59171112224" } }),
      { params: Promise.resolve({}) },
    );
    const conflict = await readJson(conflictResponse);
    expect(conflictResponse.status).toBe(409);
    expect(conflict.error.code).toBe("SLOT_UNAVAILABLE");

    // No token — must be rejected, not just quietly return data.
    const noTokenResponse = await getAppointmentByReference(makeRequest(`/api/public/appointments/${reference}`), { params: Promise.resolve({ reference }) });
    expect(noTokenResponse.status).toBe(401);

    // With token — succeeds.
    const withTokenResponse = await getAppointmentByReference(
      makeRequest(`/api/public/appointments/${reference}?token=${managementToken}`),
      { params: Promise.resolve({ reference }) },
    );
    const withToken = await readJson(withTokenResponse);
    expect(withToken.ok).toBe(true);
    expect(withToken.data.reference).toBe(reference);

    // Reschedule.
    const rescheduleResponse = await postReschedule(
      jsonRequest(`/api/public/appointments/${reference}/reschedule`, { managementToken, newLocalDate: weekday, newLocalStartTime: "11:00" }),
      { params: Promise.resolve({ reference }) },
    );
    const rescheduled = await readJson(rescheduleResponse);
    expect(rescheduled.ok).toBe(true);
    expect(rescheduled.data.localStartTime).toBe("11:00");

    // Wrong token on cancel — rejected.
    const wrongTokenCancel = await postCancel(
      jsonRequest(`/api/public/appointments/${reference}/cancel`, { managementToken: "wrong-token-value" }),
      { params: Promise.resolve({ reference }) },
    );
    expect(wrongTokenCancel.status).toBe(401);

    // Correct token — cancel succeeds.
    const cancelResponse = await postCancel(
      jsonRequest(`/api/public/appointments/${reference}/cancel`, { managementToken, reason: "prueba" }),
      { params: Promise.resolve({ reference }) },
    );
    const cancelled = await readJson(cancelResponse);
    expect(cancelled.ok).toBe(true);
    expect(cancelled.data.status).toBe("CANCELLED");
  });

  it("CORS: OPTIONS preflight allows the approved dev origin and rejects an unapproved one", async () => {
    const allowed = await availabilityOptions(makeRequest("/api/public/availability", { method: "OPTIONS", origin: APPROVED_ORIGIN }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(APPROVED_ORIGIN);

    const rejected = await availabilityOptions(makeRequest("/api/public/availability", { method: "OPTIONS", origin: "https://evil.example.com" }));
    expect(rejected.status).toBe(403);
  });

  it("mutation routes reject an unapproved Origin even on the actual POST, not just preflight", async () => {
    const response = await postAppointments(
      jsonRequest(
        "/api/public/appointments",
        { idempotencyKey: "api-test-origin", serviceId: "demo-service-1", barberId: "demo-barber-1", localDate: weekday, localStartTime: "13:00", customer: { name: "X", phoneE164: "+59170000009" } },
        "https://evil.example.com",
      ),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
    const body = await readJson(response);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("requests with no Origin header at all (server-to-server) are not blocked by origin enforcement", async () => {
    const noOriginRequest = makeRequest("/api/public/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "api-test-no-origin", serviceId: "demo-service-1", barberId: "demo-barber-2", localDate: weekday, localStartTime: "14:30", customer: { name: "Z", phoneE164: "+59170000011" } }),
    });
    const response = await postAppointments(noOriginRequest, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
  });

  it("rate limiting: exceeding the mutation limit returns RATE_LIMITED with Retry-After", async () => {
    const config = { limit: 20, windowMs: 60_000 };
    // Exhaust the bucket directly rather than firing 21 real requests, to keep this test fast
    // and deterministic — same checkRateLimit() function the route itself calls. Key must match
    // getClientIp()'s actual fallback ("unknown") for a request with no x-forwarded-for/x-real-ip
    // header, which is what a bare NextRequest in this test environment has.
    const { checkRateLimit } = await import("@/lib/http/rateLimit");
    for (let i = 0; i < config.limit; i++) {
      checkRateLimit("public:appointments:create:unknown", config);
    }

    const request = jsonRequest("/api/public/appointments", {
      idempotencyKey: "api-test-rate-limited",
      serviceId: "demo-service-1",
      barberId: "demo-barber-1",
      localDate: weekday,
      localStartTime: "15:00",
      customer: { name: "RL", phoneE164: "+59170000012" },
    });
    // Ensure the request resolves to the same rate-limit key (127.0.0.1 is NextRequest's default
    // when no x-forwarded-for header is present in this test environment).
    const response = await postAppointments(request, { params: Promise.resolve({}) });
    const body = await readJson(response);
    expect(response.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
