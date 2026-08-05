import { describe, expect, it } from "vitest";
import { validateClientConfig, toStrictResult } from "@/config/validate";
import type { ClientConfig } from "@/config/schema";

function baseConfig(): ClientConfig {
  return {
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
      instagram: "",
      mapsUrl: "",
    },
    branding: {
      logo: "",
      primaryColor: "#111111",
      secondaryColor: "#222222",
      backgroundColor: "#ffffff",
      headingFont: "",
      bodyFont: "",
      visualPreset: "classic",
      styleDescription: "",
    },
    booking: {
      flowOrder: ["service", "staff", "datetime", "customer", "confirmation"],
      minimumNoticeMinutes: 60,
      maximumAdvanceDays: 60,
      slotIntervalMinutes: 30,
      allowAnyStaff: true,
      cancellationNoticeHours: 24,
      customerFields: { name: true, phone: true, email: false, notes: false },
    },
    services: [
      { id: "svc-1", name: "Cut", description: "", price: 20, durationMinutes: 30, bufferMinutes: 0, active: true, image: "" },
    ],
    staff: [
      {
        id: "staff-1",
        name: "Jamie",
        biography: "",
        photo: "",
        active: true,
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
        breaks: [],
      },
    ],
    content: {
      heroTitle: "Welcome",
      heroSubtitle: "",
      aboutTitle: "About",
      aboutText: "",
      bookingTitle: "Book",
      confirmationMessage: "Booked!",
      cancellationPolicy: "",
      footerText: "",
    },
    features: {
      publicBookingWebsite: true,
      adminDashboard: true,
      whatsapp: false,
      aiAssistant: false,
      reminders: false,
      googleCalendar: false,
      emailNotifications: false,
      promotions: false,
      faqs: false,
    },
  };
}

describe("validateClientConfig", () => {
  it("1. accepts a fully valid configuration with no errors or warnings", () => {
    const result = validateClientConfig(baseConfig());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("2. reports a missing required field", () => {
    const config = baseConfig();
    // @ts-expect-error deliberately malformed for the test
    delete config.business.name;
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes("business.name"))).toBe(true);
  });

  it("3. reports a duplicate service id", () => {
    const config = baseConfig();
    config.services.push({ ...config.services[0] });
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicado"))).toBe(true);
  });

  it("reports a duplicate staff id", () => {
    const config = baseConfig();
    config.staff.push({ ...config.staff[0] });
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('id de trabajador "staff-1" está duplicado'))).toBe(true);
  });

  it("5. reports a staff member referencing a nonexistent service", () => {
    const config = baseConfig();
    config.staff[0].serviceIds = ["does-not-exist"];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('el servicio "does-not-exist"'))).toBe(true);
  });

  it("6. reports a negative price", () => {
    const config = baseConfig();
    config.services[0].price = -5;
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("precio negativo"))).toBe(true);
  });

  it("7. reports an invalid duration", () => {
    const config = baseConfig();
    config.services[0].durationMinutes = 0;
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duración inválida"))).toBe(true);
  });

  it("reports an invalid buffer", () => {
    const config = baseConfig();
    config.services[0].bufferMinutes = -10;
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("buffer inválido"))).toBe(true);
  });

  it("8. reports working hours with end before start", () => {
    const config = baseConfig();
    config.staff[0].workingHours.monday = { start: "17:00", end: "09:00" };
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("hora final"))).toBe(true);
  });

  it("reports a day marked both closed and with hours", () => {
    const config = baseConfig();
    config.staff[0].workingHours.monday = { closed: true, start: "09:00", end: "17:00" };
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("cerrado y con horario a la vez"))).toBe(true);
  });

  it("9. reports a break outside working hours", () => {
    const config = baseConfig();
    config.staff[0].breaks = [{ days: ["monday"], start: "18:00", end: "18:30" }];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("fuera de su horario laboral"))).toBe(true);
  });

  it("reports a break falling on a day the staff member is closed", () => {
    const config = baseConfig();
    config.staff[0].breaks = [{ days: ["saturday"], start: "10:00", end: "10:30" }];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("está cerrado"))).toBe(true);
  });

  it("reports an invalid timezone", () => {
    const config = baseConfig();
    config.business.timezone = "Not/A_Real_Zone";
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === "business.timezone")).toBe(true);
  });

  it("reports an invalid currency", () => {
    const config = baseConfig();
    config.business.currency = "NOTREAL";
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === "business.currency")).toBe(true);
  });

  it("reports an invalid locale", () => {
    const config = baseConfig();
    config.business.locale = "not_a_locale!!";
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === "business.locale")).toBe(true);
  });

  it("reports an invalid color", () => {
    const config = baseConfig();
    config.branding.primaryColor = "blue";
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === "branding.primaryColor")).toBe(true);
  });

  it("reports a business with no active services", () => {
    const config = baseConfig();
    config.services[0].active = false;
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ningún servicio activo"))).toBe(true);
  });

  it("reports a business with no active staff", () => {
    const config = baseConfig();
    config.staff[0].active = false;
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ningún trabajador activo"))).toBe(true);
  });

  it("reports a staff member with no services", () => {
    const config = baseConfig();
    config.staff[0].serviceIds = [];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no tiene ningún servicio asignado"))).toBe(true);
  });

  it("reports an invalid booking flow order (missing step)", () => {
    const config = baseConfig();
    config.booking.flowOrder = ["service", "datetime", "customer", "confirmation"];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === "booking.flowOrder")).toBe(true);
  });

  it("reports an invalid booking flow order (confirmation not last)", () => {
    const config = baseConfig();
    config.booking.flowOrder = ["confirmation", "service", "staff", "datetime", "customer"];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("último paso"))).toBe(true);
  });

  it("accepts a reordered but still valid flow (staff before service)", () => {
    const config = baseConfig();
    config.booking.flowOrder = ["staff", "service", "datetime", "customer", "confirmation"];
    const result = validateClientConfig(config);
    expect(result.ok).toBe(true);
  });

  it("treats a REEMPLAZAR_ placeholder as a warning, not a blocking error, in default (non-strict) mode", () => {
    const config = baseConfig();
    config.business.timezone = "REEMPLAZAR_ZONA_HORARIA";
    const result = validateClientConfig(config);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.path === "business.timezone")).toBe(true);
  });

  it("promotes placeholder warnings to blocking errors in strict mode", () => {
    const config = baseConfig();
    config.business.timezone = "REEMPLAZAR_ZONA_HORARIA";
    const result = toStrictResult(validateClientConfig(config));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === "business.timezone")).toBe(true);
  });
});
