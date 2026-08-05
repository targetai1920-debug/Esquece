import { beforeEach, describe, expect, it } from "vitest";
import { __setClientConfigForTests } from "@/config/loadConfig";
import { __resetCrmClientForTests } from "@/lib/crm/factory";
import { clientConfigSchema } from "@/config/schema";
import { GET as getServices } from "@/app/api/public/services/route";
import { GET as getStaff } from "@/app/api/public/staff/route";
import { GET as getSettings } from "@/app/api/public/settings/route";
import { POST as postAvailability } from "@/app/api/public/availability/route";
import { POST as postAppointment } from "@/app/api/public/appointments/route";

/** A weekday (Mon-Fri) far enough in the future to never be "in the past" or below minimum notice, regardless of when this test runs. */
function nextWeekday(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const TEST_DATE = nextWeekday(10);

const testConfig = clientConfigSchema.parse({
  business: {
    name: "Test Shop",
    slug: "test-shop",
    country: "Testland",
    city: "Test City",
    timezone: "UTC",
    locale: "en-US",
    currency: "USD",
    address: "1 Test St",
    phone: "+10000000000",
    email: "test@example.com",
  },
  branding: { primaryColor: "#111111", secondaryColor: "#222222", backgroundColor: "#ffffff", visualPreset: "classic" },
  booking: {
    flowOrder: ["service", "staff", "datetime", "customer", "confirmation"],
    minimumNoticeMinutes: 0,
    maximumAdvanceDays: 60,
    slotIntervalMinutes: 30,
    customerFields: { name: true, phone: true, email: false, notes: false },
  },
  services: [{ id: "svc-1", name: "Cut", price: 20, durationMinutes: 30 }],
  staff: [
    {
      id: "staff-1",
      name: "Alex",
      serviceIds: ["svc-1"],
      workingHours: {
        monday: { start: "09:00", end: "17:00" },
        tuesday: { start: "09:00", end: "17:00" },
        wednesday: { start: "09:00", end: "17:00" },
        thursday: { start: "09:00", end: "17:00" },
        friday: { start: "09:00", end: "17:00" },
        saturday: { closed: true },
        sunday: { closed: true },
      },
    },
  ],
  content: { heroTitle: "Welcome" },
  features: {},
});

beforeEach(() => {
  __setClientConfigForTests(testConfig);
  __resetCrmClientForTests();
});

describe("public API route handlers", () => {
  it("GET /api/public/services returns active services", async () => {
    const response = await getServices();
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("svc-1");
  });

  it("GET /api/public/staff?serviceId= filters by eligible staff", async () => {
    const response = await getStaff(new Request("http://localhost/api/public/staff?serviceId=svc-1"));
    const body = await response.json();
    expect(body.data).toHaveLength(1);
  });

  it("POST /api/public/availability returns a stable error envelope for an invalid payload", async () => {
    const response = await postAvailability(new Request("http://localhost/api/public/availability", { method: "POST", body: JSON.stringify({}) }));
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_PAYLOAD");
  });

  it("POST /api/public/appointments creates a booking end to end through the real route handler", async () => {
    const response = await postAppointment(
      new Request("http://localhost/api/public/appointments", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "e2e-key-1",
          serviceId: "svc-1",
          staffId: "staff-1",
          localDate: TEST_DATE,
          localStartTime: "09:00",
          customer: { name: "Jordan", phone: "+15550000000" },
        }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.appointment.status).toBe("CONFIRMED");
  });

  it("POST /api/public/appointments returns SLOT_UNAVAILABLE with a stable code on conflict", async () => {
    const payload = {
      idempotencyKey: "conflict-a",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TEST_DATE,
      localStartTime: "10:00",
      customer: { name: "Jordan", phone: "+15550000001" },
    };
    await postAppointment(new Request("http://localhost/api/public/appointments", { method: "POST", body: JSON.stringify(payload) }));
    const second = await postAppointment(
      new Request("http://localhost/api/public/appointments", {
        method: "POST",
        body: JSON.stringify({ ...payload, idempotencyKey: "conflict-b", customer: { name: "Taylor", phone: "+15550000002" } }),
      }),
    );
    const body = await second.json();
    expect(second.status).toBe(409);
    expect(body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("GET /api/public/settings never exposes CRM credentials or credential env var names", async () => {
    const response = await getSettings();
    const body = await response.json();
    expect(body.ok).toBe(true);
    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["apikey", "signingsecret", "webappurl", "crm_api_key", "crm_signing_secret", "crm_web_app_url"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
