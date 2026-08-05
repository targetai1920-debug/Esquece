import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setClientConfigForTests } from "@/config/loadConfig";
import { __resetCrmClientForTests, getCrmClient } from "@/lib/crm/factory";
import { LocalCrmClient } from "@/lib/crm/localClient";
import { AppsScriptCrmClient } from "@/lib/crm/appsScriptClient";
import { clientConfigSchema } from "@/config/schema";

/**
 * §1/§2 of the factory continuation brief: provider selection must be
 * driven entirely by config.crm.provider, must read real credentials only
 * from the env var NAMES the config points at, and must never let a
 * production config silently fall back to the in-memory CRM — even if
 * that combination reached runtime by some path other than the generator
 * (e.g. a hand-edited client-config.json), since src/config/validate.ts's
 * block only runs at generation time, not at app startup.
 */

function baseConfig(overrides: Record<string, unknown> = {}) {
  return clientConfigSchema.parse({
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
    ...overrides,
  });
}

const ENV_KEYS = ["CRM_WEB_APP_URL", "CRM_API_KEY", "CRM_SIGNING_SECRET"];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  __resetCrmClientForTests();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  __resetCrmClientForTests();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("CRM provider selection (src/lib/crm/factory.ts)", () => {
  it("selects LocalCrmClient when crm.provider is local", () => {
    __setClientConfigForTests(baseConfig({ crm: { provider: "local" } }));
    expect(getCrmClient()).toBeInstanceOf(LocalCrmClient);
  });

  it("selects AppsScriptCrmClient when crm.provider is google-sheets-apps-script and every env var is set", () => {
    process.env.CRM_WEB_APP_URL = "https://script.google.com/macros/s/fake/exec";
    process.env.CRM_API_KEY = "fake-api-key";
    process.env.CRM_SIGNING_SECRET = "fake-signing-secret";
    __setClientConfigForTests(baseConfig({ environment: "staging", crm: { provider: "google-sheets-apps-script" } }));
    expect(getCrmClient()).toBeInstanceOf(AppsScriptCrmClient);
  });

  it("fails safely with a clear message when the Web App URL env var is missing", () => {
    delete process.env.CRM_WEB_APP_URL;
    process.env.CRM_API_KEY = "fake-api-key";
    process.env.CRM_SIGNING_SECRET = "fake-signing-secret";
    __setClientConfigForTests(baseConfig({ environment: "staging", crm: { provider: "google-sheets-apps-script" } }));
    expect(() => getCrmClient()).toThrowError(/CRM_WEB_APP_URL/);
  });

  it("fails safely with a clear message when the API key env var is missing", () => {
    process.env.CRM_WEB_APP_URL = "https://script.google.com/macros/s/fake/exec";
    delete process.env.CRM_API_KEY;
    process.env.CRM_SIGNING_SECRET = "fake-signing-secret";
    __setClientConfigForTests(baseConfig({ environment: "staging", crm: { provider: "google-sheets-apps-script" } }));
    expect(() => getCrmClient()).toThrowError(/CRM_API_KEY/);
  });

  it("fails safely with a clear message when the signing secret env var is missing", () => {
    process.env.CRM_WEB_APP_URL = "https://script.google.com/macros/s/fake/exec";
    process.env.CRM_API_KEY = "fake-api-key";
    delete process.env.CRM_SIGNING_SECRET;
    __setClientConfigForTests(baseConfig({ environment: "staging", crm: { provider: "google-sheets-apps-script" } }));
    expect(() => getCrmClient()).toThrowError(/CRM_SIGNING_SECRET/);
  });

  it("respects custom env var names from crm.webAppUrlEnv/apiKeyEnv/signingSecretEnv", () => {
    process.env.CUSTOM_URL = "https://script.google.com/macros/s/fake/exec";
    process.env.CUSTOM_KEY = "fake-api-key";
    process.env.CUSTOM_SECRET = "fake-signing-secret";
    __setClientConfigForTests(
      baseConfig({
        environment: "staging",
        crm: { provider: "google-sheets-apps-script", webAppUrlEnv: "CUSTOM_URL", apiKeyEnv: "CUSTOM_KEY", signingSecretEnv: "CUSTOM_SECRET" },
      }),
    );
    expect(getCrmClient()).toBeInstanceOf(AppsScriptCrmClient);
    delete process.env.CUSTOM_URL;
    delete process.env.CUSTOM_KEY;
    delete process.env.CUSTOM_SECRET;
  });

  it("refuses to build a local CRM client at runtime when environment=production, even bypassing the generator's own check", () => {
    // Simulates a hand-edited client-config.json reaching the running app
    // directly — src/config/validate.ts's block only runs inside
    // factory/create-client.mjs at generation time, so this is the
    // defense-in-depth check inside factory.ts itself (see its comment).
    __setClientConfigForTests(baseConfig({ environment: "production", crm: { provider: "local" } }));
    expect(() => getCrmClient()).toThrowError(/environment está configurado como "production"/);
  });
});
