import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

/**
 * Generator (factory/create-client.mjs) tests. Every case runs the real CLI
 * as a subprocess against a temp config + temp output dir — never a
 * reimplementation of its logic. See
 * .claude/skills/barbershop-crm-builder/references/factory-mode-and-client-onboarding.md.
 *
 * Test list mapping (Fase interna 14's required 23 cases):
 *  1-11, 15-16: this file, directly.
 *  12-14: this file ("optional modules" describe block).
 *  17-18 (build/typecheck of a generated project): intentionally NOT run
 *    here — a full npm ci + build cycle per test case would make the fast
 *    unit suite impractically slow and would require network access from
 *    every CI run of `npm test`. Exercised instead as a real, one-time,
 *    manual generation + full validation (see the repo root
 *    generated/reemplazar-slug/ project and the task's final report for its
 *    actual lint/typecheck/test/build results). This is a deliberate,
 *    documented scope decision, not a gap presented as tested.
 *  19-23 (configurable flow, CRM init, availability/double-booking, fresh
 *    signature per retry, Unicode HMAC vectors): these exercise the
 *    template's own engine, not the generator — already covered by
 *    templates/barbershop-booking/tests/{booking-engine,signing,config-schema}.test.ts,
 *    which run as part of that project's own `npm test`.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const CLI = path.join(REPO_ROOT, "factory", "create-client.mjs");
const SCAN_CLI = path.join(REPO_ROOT, "factory", "scan-contamination.mjs");

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-test-"));
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
        breaks: [] as { days: string[]; start: string; end: string }[],
      },
    ],
    content: { heroTitle: "Welcome", heroSubtitle: "", aboutTitle: "About", aboutText: "", bookingTitle: "Book", confirmationMessage: "Booked!", cancellationPolicy: "", footerText: "" },
    features: { publicBookingWebsite: true, adminDashboard: true, whatsapp: false, aiAssistant: false, reminders: false, googleCalendar: false, emailNotifications: false, promotions: false, faqs: false },
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
    const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("factory/create-client.mjs", () => {
  it("1. generates a project from a valid configuration", () => {
    const dir = makeTmpDir();
    const configFile = writeConfig(dir, validConfig());
    const output = path.join(dir, "out");
    const result = runCli(["--config", configFile, "--output", output]);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(output, "client-config.json"))).toBe(true);
    expect(fs.existsSync(path.join(output, "package.json"))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(output, "package.json"), "utf8"));
    expect(pkg.name).toBe("test-shop");
  });

  it("2. refuses to generate when a required field is missing", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    // @ts-expect-error deliberately malformed
    delete config.business.name;
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(dir, "out"))).toBe(false);
  });

  it("3. refuses to generate with a duplicate id", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.staff.push({ ...config.staff[0] });
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/duplicad/);
  });

  it("4. refuses to generate with a duplicate service", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.services.push({ ...config.services[0] });
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
  });

  it("5. refuses to generate when staff references a nonexistent service", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.staff[0].serviceIds = ["does-not-exist"];
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/does-not-exist/);
  });

  it("6. refuses to generate with a negative price", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.services[0].price = -1;
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
  });

  it("7. refuses to generate with an invalid duration", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.services[0].durationMinutes = 0;
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
  });

  it("8. refuses to generate with an invalid working hours entry (end before start)", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.staff[0].workingHours.monday = { start: "17:00", end: "09:00" };
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
  });

  it("9. refuses to generate with an invalid break (outside working hours)", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.staff[0].breaks = [{ days: ["monday"], start: "20:00", end: "20:30" }];
    const configFile = writeConfig(dir, config);
    const result = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(result.status).not.toBe(0);
  });

  it("10. warns (does not block) on a nonexistent logo file in default mode, but blocks in --strict mode", () => {
    const dir = makeTmpDir();
    const config = validConfig();
    config.branding.logo = "missing-logo.png";
    const configFile = writeConfig(dir, config);
    const normal = runCli(["--config", configFile, "--output", path.join(dir, "out")]);
    expect(normal.status).toBe(0);
    expect(normal.stdout).toMatch(/no existe todavía/);

    const strict = runCli(["--config", configFile, "--output", path.join(dir, "out-strict"), "--strict"]);
    expect(strict.status).not.toBe(0);
  });

  it("11. refuses to overwrite an existing output folder without --force", () => {
    const dir = makeTmpDir();
    const configFile = writeConfig(dir, validConfig());
    const output = path.join(dir, "out");
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, "sentinel.txt"), "pre-existing");
    const result = runCli(["--config", configFile, "--output", output]);
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(output, "sentinel.txt"))).toBe(true); // untouched

    const forced = runCli(["--config", configFile, "--output", output, "--force"]);
    expect(forced.status).toBe(0);
    expect(fs.existsSync(path.join(output, "sentinel.txt"))).toBe(false); // replaced
  });

  describe("optional modules", () => {
    it("12. generates successfully with every optional module disabled", () => {
      const dir = makeTmpDir();
      const configFile = writeConfig(dir, validConfig());
      const output = path.join(dir, "out");
      const result = runCli(["--config", configFile, "--output", output]);
      expect(result.status).toBe(0);
      const generated = JSON.parse(fs.readFileSync(path.join(output, "client-config.json"), "utf8"));
      expect(generated.features.whatsapp).toBe(false);
      expect(generated.features.aiAssistant).toBe(false);
      const credentials = fs.readFileSync(path.join(output, "CREDENTIALS_PENDING.md"), "utf8");
      expect(credentials).not.toMatch(/WHATSAPP_ACCESS_TOKEN/);
    });

    it("13. generates successfully with WhatsApp enabled and lists its required credentials", () => {
      const dir = makeTmpDir();
      const config = validConfig({ features: { ...validConfig().features, whatsapp: true } });
      const configFile = writeConfig(dir, config);
      const output = path.join(dir, "out");
      const result = runCli(["--config", configFile, "--output", output]);
      expect(result.status).toBe(0);
      const credentials = fs.readFileSync(path.join(output, "CREDENTIALS_PENDING.md"), "utf8");
      expect(credentials).toMatch(/WHATSAPP_ACCESS_TOKEN/);
    });

    it("14. generates successfully with the AI assistant enabled and lists its required credentials", () => {
      const dir = makeTmpDir();
      const config = validConfig({ features: { ...validConfig().features, aiAssistant: true } });
      const configFile = writeConfig(dir, config);
      const output = path.join(dir, "out");
      const result = runCli(["--config", configFile, "--output", output]);
      expect(result.status).toBe(0);
      const credentials = fs.readFileSync(path.join(output, "CREDENTIALS_PENDING.md"), "utf8");
      expect(credentials).toMatch(/ANTHROPIC_API_KEY/);
    });
  });

  it("15. the contamination scanner detects injected legacy identity", () => {
    const dir = makeTmpDir();
    const configFile = writeConfig(dir, validConfig());
    const output = path.join(dir, "out");
    runCli(["--config", configFile, "--output", output]);
    // Inject a leftover trace of a previous client to prove the scanner actually catches it.
    fs.writeFileSync(path.join(output, "leftover.md"), "This mentions Esquece and TargetAI by mistake.");
    expect(() => execFileSync("node", [SCAN_CLI, "--dir", output], { encoding: "utf8" })).toThrow();
  });

  it("16. a freshly generated project contains no secret-shaped values", () => {
    const dir = makeTmpDir();
    const configFile = writeConfig(dir, validConfig());
    const output = path.join(dir, "out");
    runCli(["--config", configFile, "--output", output]);
    const result = execFileSync("node", [SCAN_CLI, "--dir", output], { encoding: "utf8" });
    expect(result).toMatch(/OK/);
    // Only variable NAMES matching a secret-shaped pattern must stay empty —
    // safe non-secret defaults (NODE_ENV, CRM_PROVIDER=local, etc.) are fine.
    const envExample = fs.readFileSync(path.join(output, ".env.example"), "utf8");
    const secretNamePattern = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS/i;
    for (const line of envExample.split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const [name, ...rest] = line.split("=");
      if (secretNamePattern.test(name)) {
        expect(rest.join("=").trim()).toBe("");
      }
    }
  });
});
