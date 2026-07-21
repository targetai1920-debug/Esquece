import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { _resetCrmClientForTests } from "@/lib/crm/factory";
import { _resetEnvCacheForTests } from "@/lib/env/server";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/auth/session";

import { GET as getDashboard } from "@/app/api/admin/dashboard/route";
import { GET as getServices, POST as postServices } from "@/app/api/admin/services/route";
import { PATCH as patchService } from "@/app/api/admin/services/[serviceId]/route";

/**
 * Exercises the actual admin route handlers (not a re-implementation of
 * adminApiRoute's logic) — proves the session-cookie gate, the
 * enforceOrigin CSRF check, and a representative admin mutation flow
 * (service create/update via the SAME CrmClient the website/WhatsApp use).
 */

process.env.ADMIN_EMAIL = "admin@esquece.test";
process.env.ADMIN_PASSWORD_HASH = "$2b$12$not-a-real-hash-just-needs-to-be-nonempty-for-config-presence";
process.env.AUTH_SECRET = "test-auth-secret-at-least-32-bytes-long-for-hs256";

const APPROVED_ORIGIN = "http://localhost:3000";

function makeRequest(url: string, init?: { method?: string; headers?: HeadersInit; body?: string; origin?: string; cookie?: string }): NextRequest {
  const headers = new Headers(init?.headers);
  if (init?.origin) headers.set("origin", init.origin);
  if (init?.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(url, "http://localhost:3000"), { method: init?.method, body: init?.body, headers });
}

async function readJson(response: Response) {
  return response.json();
}

describe("admin API", () => {
  let sessionCookie: string;

  beforeEach(async () => {
    _resetEnvCacheForTests();
    _resetCrmClientForTests();
    const token = await createAdminSessionToken("admin@esquece.test");
    sessionCookie = `${ADMIN_SESSION_COOKIE}=${token}`;
  });

  it("rejects a request with no session cookie", async () => {
    const response = await getDashboard(makeRequest("/api/admin/dashboard"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
    const body = await readJson(response);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request with a tampered/invalid session cookie", async () => {
    const response = await getDashboard(
      makeRequest("/api/admin/dashboard", { cookie: `${ADMIN_SESSION_COOKIE}=not-a-valid-jwt` }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
  });

  it("returns the dashboard summary with a valid session", async () => {
    const response = await getDashboard(makeRequest("/api/admin/dashboard", { cookie: sessionCookie }), { params: Promise.resolve({}) });
    const body = await readJson(response);
    expect(body.ok).toBe(true);
    expect(typeof body.data.date).toBe("string");
    expect(typeof body.data.appointmentsToday).toBe("number");
  });

  it("rejects a mutation from an unapproved Origin even with a valid session", async () => {
    const response = await postServices(
      makeRequest("/api/admin/services", {
        method: "POST",
        cookie: sessionCookie,
        origin: "https://not-this-app.example.com",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Corte intento CSRF", price: 50, durationMinutes: 30 }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
    const body = await readJson(response);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("creates and updates a service through the same CrmClient the website/WhatsApp use, visible in adminListServices", async () => {
    const createResponse = await postServices(
      makeRequest("/api/admin/services", {
        method: "POST",
        cookie: sessionCookie,
        origin: APPROVED_ORIGIN,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Corte de prueba admin", price: 60, durationMinutes: 30 }),
      }),
      { params: Promise.resolve({}) },
    );
    const created = await readJson(createResponse);
    expect(created.ok).toBe(true);
    expect(created.data.active).toBe(true);

    const listResponse = await getServices(makeRequest("/api/admin/services", { cookie: sessionCookie }), { params: Promise.resolve({}) });
    const list = await readJson(listResponse);
    expect(list.data.some((s: { serviceId: string }) => s.serviceId === created.data.serviceId)).toBe(true);

    const updateResponse = await patchService(
      makeRequest(`/api/admin/services/${created.data.serviceId}`, {
        method: "PATCH",
        cookie: sessionCookie,
        origin: APPROVED_ORIGIN,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ serviceId: created.data.serviceId }) },
    );
    const updated = await readJson(updateResponse);
    expect(updated.ok).toBe(true);
    expect(updated.data.active).toBe(false);
  });
});
