import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

/**
 * factory/prepare-crm.mjs tests — §4/§8.14/§8.15 of the factory
 * continuation brief. Every case runs the real CLI as a subprocess, same
 * pattern as create-client.test.ts.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(REPO_ROOT, "factory", "prepare-crm.mjs");

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-crm-test-"));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function validConfig(overrides: Record<string, unknown> = {}) {
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
    services: [{ id: "svc-1", name: "Cut", description: "", price: 20, durationMinutes: 30, bufferMinutes: 0, active: true, image: "" }],
    staff: [
      {
        id: "staff-1",
        name: "Alex",
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
        breaks: [{ days: ["monday", "tuesday"], start: "12:00", end: "13:00" }],
      },
    ],
    content: { heroTitle: "Welcome", heroSubtitle: "", aboutTitle: "About", aboutText: "", bookingTitle: "Book", confirmationMessage: "Booked!", cancellationPolicy: "Cancel 24h before.", footerText: "" },
    features: { publicBookingWebsite: true, adminDashboard: true, whatsapp: false, aiAssistant: false, reminders: false, googleCalendar: false, emailNotifications: false, promotions: false, faqs: false },
    crm: { provider: "google-sheets-apps-script", webAppUrlEnv: "TEST_CRM_WEB_APP_URL", apiKeyEnv: "TEST_CRM_API_KEY", signingSecretEnv: "TEST_CRM_SIGNING_SECRET" },
    ...overrides,
  };
}

function writeConfig(dir: string, config: unknown): string {
  const file = path.join(dir, "client.yaml");
  fs.writeFileSync(file, YAML.stringify(config));
  return file;
}

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx/esm", CLI, ...args], { encoding: "utf8", cwd: REPO_ROOT });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("factory/prepare-crm.mjs", () => {
  it("generates seed.json, run-import-seed.mjs and APPS_SCRIPT_CONNECT_GUIDE.md for a google-sheets-apps-script client", () => {
    const dir = makeTmpDir();
    const configFile = writeConfig(dir, validConfig());
    const output = path.join(dir, "crm-init");
    const result = runCli(["--config", configFile, "--output", output]);
    expect(result.status).toBe(0);

    const seed = JSON.parse(fs.readFileSync(path.join(output, "seed.json"), "utf8"));
    expect(seed.services).toHaveLength(1);
    expect(seed.services[0].serviceId).toBe("svc-1");
    expect(seed.staff).toHaveLength(1);
    expect(seed.staff[0].staffId).toBe("staff-1");
    expect(seed.staffServices).toEqual([{ staffId: "staff-1", serviceId: "svc-1", active: true }]);
    expect(seed.workingHours).toHaveLength(5); // mon-fri, sat/sun closed
    expect(seed.breaks).toHaveLength(2); // monday + tuesday
    expect(seed.settings.find((s: { key: string }) => s.key === "businessName").value).toBe("Test Shop");
    expect(seed.settings.find((s: { key: string }) => s.key === "cancellationPolicy").value).toBe("Cancel 24h before.");

    expect(fs.existsSync(path.join(output, "run-import-seed.mjs"))).toBe(true);
    const importScript = fs.readFileSync(path.join(output, "run-import-seed.mjs"), "utf8");
    expect(importScript).toContain("TEST_CRM_WEB_APP_URL");
    expect(importScript).toContain("TEST_CRM_API_KEY");
    expect(importScript).toContain("TEST_CRM_SIGNING_SECRET");
    expect(importScript).toContain("importSeed");
    expect(importScript).toContain("health");

    const guide = fs.readFileSync(path.join(output, "APPS_SCRIPT_CONNECT_GUIDE.md"), "utf8");
    expect(guide).toContain("TEST_CRM_WEB_APP_URL");
    expect(guide).toContain("setupCRM");
    expect(guide).toMatch(/health/i);
    expect(guide).toMatch(/No consideres el CRM conectado/);
  });

  it("generates nothing and exits 0 for a local-provider client (no persistent CRM to prepare)", () => {
    const dir = makeTmpDir();
    const config = validConfig({ crm: { provider: "local" } });
    const configFile = writeConfig(dir, config);
    const output = path.join(dir, "crm-init");
    const result = runCli(["--config", configFile, "--output", output]);
    expect(result.status).toBe(0);
    expect(fs.existsSync(output)).toBe(false);
    expect(result.stdout).toMatch(/no requiere inicialización/);
  });

  it("refuses to prepare a CRM for an invalid configuration", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    // @ts-expect-error deliberately malformed
    delete config.business.name;
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "crm-init")]);
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(dir, "crm-init"))).toBe(false);
  });

  it("staff with no serviceIds in a break's applicable days produces no rows for those, and multiple staff produce independent working-hours rows", () => {
    const dir = makeTmpDir();
    const config = validConfig({
      staff: [
        {
          id: "staff-a",
          name: "A",
          serviceIds: ["svc-1"],
          workingHours: {
            monday: { start: "09:00", end: "12:00" },
            tuesday: { closed: true },
            wednesday: { closed: true },
            thursday: { closed: true },
            friday: { closed: true },
            saturday: { closed: true },
            sunday: { closed: true },
          },
          breaks: [],
        },
        {
          id: "staff-b",
          name: "B",
          serviceIds: ["svc-1"],
          workingHours: {
            monday: { closed: true },
            tuesday: { start: "09:00", end: "12:00" },
            wednesday: { closed: true },
            thursday: { closed: true },
            friday: { closed: true },
            saturday: { closed: true },
            sunday: { closed: true },
          },
          breaks: [],
        },
      ],
    });
    const configFile = writeConfig(dir, config);
    const output = path.join(dir, "crm-init");
    const result = runCli(["--config", configFile, "--output", output]);
    expect(result.status).toBe(0);
    const seed = JSON.parse(fs.readFileSync(path.join(output, "seed.json"), "utf8"));
    expect(seed.workingHours).toEqual([
      { staffId: "staff-a", dayOfWeek: "monday", openingTime: "09:00", closingTime: "12:00" },
      { staffId: "staff-b", dayOfWeek: "tuesday", openingTime: "09:00", closingTime: "12:00" },
    ]);
    expect(seed.breaks).toEqual([]);
  });
});
