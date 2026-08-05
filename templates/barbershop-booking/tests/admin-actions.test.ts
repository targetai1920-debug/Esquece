import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/headers's cookies() and next/cache's revalidatePath() both require a
// live Next.js request scope (AsyncLocalStorage) that a bare vitest unit
// test doesn't have — see the "cookies was called outside a request scope"
// error this mock avoids. Mocking them is the standard way to unit-test
// Server Actions outside of Next's own request lifecycle.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { __setClientConfigForTests } = await import("@/config/loadConfig");
const { __resetCrmClientForTests, getCrmClient } = await import("@/lib/crm/factory");
const { clientConfigSchema } = await import("@/config/schema");
const { ADMIN_COOKIE_NAME, createSessionToken } = await import("@/lib/admin/auth");
const {
  confirmAppointmentAction,
  adminCancelAppointmentAction,
  setServiceActiveAction,
  setServicePriceAction,
  setStaffActiveAction,
} = await import("@/lib/admin/actions");

/**
 * §8.12/§8.13 of the factory continuation brief: admin mutations must
 * require an authenticated session (checked here at the Server Action
 * layer, not just deeper in CrmClient) and must be visible through the
 * same CrmClient every other consumer reads from, with an audit trail.
 */

function nextWeekday(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const TEST_DATE = nextWeekday(10);

const testConfig = clientConfigSchema.parse({
  business: { name: "Test Shop", slug: "test-shop", country: "Testland", city: "Test City", timezone: "UTC", locale: "en-US", currency: "USD", address: "1 Test St", phone: "+10000000000", email: "test@example.com" },
  branding: { primaryColor: "#111111", secondaryColor: "#222222", backgroundColor: "#ffffff", visualPreset: "classic" },
  booking: { flowOrder: ["service", "staff", "datetime", "customer", "confirmation"], minimumNoticeMinutes: 0, maximumAdvanceDays: 60, slotIntervalMinutes: 30, customerFields: { name: true, phone: true, email: false, notes: false } },
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
  // Short on purpose (under the contamination scanner's secret-shaped-value
  // length threshold — see factory/scan-contamination.mjs) — this file
  // ships inside the generic template and gets scanned in every generated
  // project; a real secret is never this short, but the scanner's regex
  // can't tell "obviously fake test fixture" from "leaked value" by length
  // alone once past ~20 chars.
  process.env.AUTH_SECRET = "unit-test-fixture";
  __setClientConfigForTests(testConfig);
  __resetCrmClientForTests();
  cookieJar.clear();
});

afterEach(() => {
  cookieJar.clear();
});

async function signIn() {
  const token = await createSessionToken("admin@example.com");
  cookieJar.set(ADMIN_COOKIE_NAME, token);
}

describe("admin Server Actions (src/lib/admin/actions.ts)", () => {
  it("rejects a mutation with no session cookie", async () => {
    const result = await setServicePriceAction({ serviceId: "svc-1", price: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No autorizado/);
    const services = await getCrmClient().listServices();
    expect(services.find((s) => s.id === "svc-1")!.price).toBe(20); // unchanged
  });

  it("rejects a mutation with an invalid/garbage session cookie", async () => {
    cookieJar.set(ADMIN_COOKIE_NAME, "not-a-real-jwt");
    const result = await setServicePriceAction({ serviceId: "svc-1", price: 99 });
    expect(result.ok).toBe(false);
  });

  it("an authenticated price change is visible through the same CrmClient the public API reads", async () => {
    await signIn();
    const result = await setServicePriceAction({ serviceId: "svc-1", price: 35 });
    expect(result.ok).toBe(true);
    const services = await getCrmClient().listServices();
    expect(services.find((s) => s.id === "svc-1")!.price).toBe(35);
  });

  it("an authenticated staff toggle is visible through the same CrmClient the public API reads", async () => {
    await signIn();
    const result = await setStaffActiveAction({ staffId: "staff-1", active: false });
    expect(result.ok).toBe(true);
    const staff = await getCrmClient().adminListStaff();
    expect(staff.find((s) => s.id === "staff-1")!.active).toBe(false);
  });

  it("a deactivated staff member/service stays visible (and re-activatable) through adminListStaff/adminListServices, unlike the public-filtered listStaff/listServices", async () => {
    await signIn();
    await setStaffActiveAction({ staffId: "staff-1", active: false });
    await setServiceActiveAction({ serviceId: "svc-1", active: false });

    const publicStaff = await getCrmClient().listStaff();
    const publicServices = await getCrmClient().listServices();
    expect(publicStaff.find((s) => s.id === "staff-1")).toBeUndefined();
    expect(publicServices.find((s) => s.id === "svc-1")).toBeUndefined();

    const adminStaff = await getCrmClient().adminListStaff();
    const adminServices = await getCrmClient().adminListServices();
    expect(adminStaff.find((s) => s.id === "staff-1")).toBeTruthy();
    expect(adminServices.find((s) => s.id === "svc-1")).toBeTruthy();

    const reactivated = await setStaffActiveAction({ staffId: "staff-1", active: true });
    expect(reactivated.ok).toBe(true);
    const staffAfter = await getCrmClient().listStaff();
    expect(staffAfter.find((s) => s.id === "staff-1")).toBeTruthy();
  });

  it("confirming and then admin-cancelling an appointment through the action layer is reflected in listAppointments and the audit log", async () => {
    await signIn();
    const created = await getCrmClient().createAppointment({
      idempotencyKey: "admin-action-key-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TEST_DATE,
      localStartTime: "09:00",
      customer: { name: "Jordan", phone: "+15550000000" },
      source: "WEBSITE",
    });

    const confirmed = await confirmAppointmentAction(created.appointment.id);
    expect(confirmed.ok).toBe(true);

    const cancelled = await adminCancelAppointmentAction({ appointmentId: created.appointment.id, reason: "test reason" });
    expect(cancelled.ok).toBe(true);

    const appointments = await getCrmClient().listAppointments();
    const final = appointments.find((a) => a.id === created.appointment.id);
    expect(final!.status).toBe("CANCELLED");
    expect(final!.cancellationReason).toBe("test reason");

    const audit = await getCrmClient().listAuditLog();
    expect(audit.some((e) => e.action === "confirmAppointment" && e.entityId === created.appointment.id)).toBe(true);
    expect(audit.some((e) => e.action === "adminCancelAppointment" && e.entityId === created.appointment.id)).toBe(true);
  });

  it("rejects an invalid payload before it ever reaches the CrmClient", async () => {
    await signIn();
    const result = await setServicePriceAction({ serviceId: "svc-1", price: -10 });
    expect(result.ok).toBe(false);
    const services = await getCrmClient().listServices();
    expect(services.find((s) => s.id === "svc-1")!.price).toBe(20); // unchanged
  });
});
