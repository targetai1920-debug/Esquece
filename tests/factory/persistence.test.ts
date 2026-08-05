import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Formalizes the manually-verified "a restart does not lose data" proof
 * (§8.7/§8.8 of the factory continuation brief) as an automated test.
 *
 * Each `run-tests.mjs --exec` invocation below is a genuinely SEPARATE
 * `node` process — not an in-process simulation — against the SAME
 * `--persist-file` (a JSON-backed mock Spreadsheet). The Apps Script
 * bundle (apps-script/*.gs, unmodified) is reloaded from scratch into a
 * fresh vm context on every invocation, exactly as a real Apps Script
 * execution starts cold on every request. If an appointment created in
 * process #1 is visible and correctly mutable in process #2 and #3, that
 * is real cross-process persistence, not an artifact of a long-lived
 * in-memory object.
 *
 * This is a real integration test against the actual apps-script/*.gs
 * source (via the Node vm harness that stands in for the Apps Script
 * runtime) — it is NOT a test against a live Google Sheets deployment,
 * which this environment cannot reach. See the task's final report for
 * that distinction.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(REPO_ROOT, "templates", "barbershop-booking", "apps-script", "tests", "run-tests.mjs");

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "persistence-test-"));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

interface StepResult {
  ok: boolean;
  action: string;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

function runExec(persistFile: string, script: unknown[], seedExpr?: string): StepResult[] {
  const scriptPath = `${persistFile}.script-${Math.random().toString(36).slice(2)}.json`;
  fs.writeFileSync(scriptPath, JSON.stringify(script));
  const args = [RUNNER, "--persist-file", persistFile, "--exec", scriptPath];
  if (seedExpr) args.push("--seed", seedExpr);
  const stdout = execFileSync("node", args, { encoding: "utf8", cwd: REPO_ROOT });
  fs.rmSync(scriptPath);
  return JSON.parse(stdout);
}

describe("CRM persistence across process restarts (apps-script backend)", () => {
  it("an appointment created in one process is visible, cancellable, and stays cancelled in later separate processes", () => {
    const dir = makeTmpDir();
    const persistFile = path.join(dir, "spreadsheet.json");
    const seed = `seedTestServiceAndStaff_('persist')`;
    const localDate = nextMondayIso();

    // Process #1: seed fixtures + create an appointment.
    const step1 = runExec(
      persistFile,
      [
        { action: "createAppointment", payload: { idempotencyKey: "persist-key-1", serviceId: "svc-test-persist", staffId: "staff-test-persist", localDate, localStartTime: "09:00", customer: { name: "Persist Test", phone: "+15550001111" }, source: "WEBSITE" } },
      ],
      seed,
    );
    expect(step1[0].ok).toBe(true);
    const appointmentId = (step1[0].data!.appointment as { id: string }).id;
    expect(appointmentId).toBeTruthy();
    expect(fs.existsSync(persistFile)).toBe(true);

    // Process #2: a brand-new `node` invocation, fresh vm context, same
    // persist file — list appointments and confirm it's still there.
    const step2 = runExec(persistFile, [{ action: "listAppointments", payload: { localDate } }]);
    expect(step2[0].ok).toBe(true);
    const listed = (step2[0].data!.appointments as { id: string; status: string }[]).find((a) => a.id === appointmentId);
    expect(listed).toBeTruthy();
    expect(listed!.status).toBe("CONFIRMED");

    // Process #3: yet another fresh invocation — cancel it (admin path).
    const step3 = runExec(persistFile, [{ action: "adminCancelAppointment", payload: { appointmentId, reason: "test cancellation" } }]);
    expect(step3[0].ok).toBe(true);
    expect((step3[0].data!.appointment as { status: string }).status).toBe("CANCELLED");

    // Process #4: yet another fresh invocation — confirm the cancellation persisted.
    const step4 = runExec(persistFile, [{ action: "listAppointments", payload: { localDate } }]);
    const final = (step4[0].data!.appointments as { id: string; status: string }[]).find((a) => a.id === appointmentId);
    expect(final!.status).toBe("CANCELLED");
  });

  it("a reschedule made in one process is visible in a later separate process", () => {
    const dir = makeTmpDir();
    const persistFile = path.join(dir, "spreadsheet.json");
    const seed = `seedTestServiceAndStaff_('reschedule')`;
    const localDate = nextMondayIso();

    const created = runExec(
      persistFile,
      [{ action: "createAppointment", payload: { idempotencyKey: "persist-key-2", serviceId: "svc-test-reschedule", staffId: "staff-test-reschedule", localDate, localStartTime: "09:00", customer: { name: "Resched Test", phone: "+15550002222" }, source: "WEBSITE" } }],
      seed,
    );
    const appointmentId = (created[0].data!.appointment as { id: string }).id;

    const rescheduled = runExec(persistFile, [
      { action: "adminRescheduleAppointment", payload: { appointmentId, newLocalDate: localDate, newLocalStartTime: "10:00" } },
    ]);
    expect(rescheduled[0].ok).toBe(true);
    expect((rescheduled[0].data!.appointment as { localStartTime: string }).localStartTime).toBe("10:00");

    const verified = runExec(persistFile, [{ action: "listAppointments", payload: { localDate } }]);
    const final = (verified[0].data!.appointments as { id: string; localStartTime: string }[]).find((a) => a.id === appointmentId);
    expect(final!.localStartTime).toBe("10:00");
  });

  it("importSeed data (services/staff loaded from a client YAML) survives a process restart", () => {
    const dir = makeTmpDir();
    const persistFile = path.join(dir, "spreadsheet.json");
    const seedPayload = {
      services: [{ serviceId: "seed-persist-svc", name: "Seed Persist Cut", price: 20, currency: "USD", durationMinutes: 30, bufferMinutes: 0, active: true }],
      staff: [{ staffId: "seed-persist-staff", name: "Seed Persist Barber", active: true, publicBooking: true }],
    };

    const imported = runExec(persistFile, [{ action: "importSeed", payload: seedPayload }]);
    expect(imported[0].ok).toBe(true);
    expect((imported[0].data as Record<string, { inserted: number }>).services.inserted).toBe(1);

    // Fresh process: the imported service/staff must still be there, AND
    // importSeed must be idempotent against the same persisted state.
    const reImported = runExec(persistFile, [
      { action: "importSeed", payload: seedPayload },
      { action: "listServices", payload: {} },
    ]);
    expect((reImported[0].data as Record<string, { inserted: number; skipped: number }>).services.skipped).toBe(1);
    const services = (reImported[1].data!.services as { id: string }[]);
    expect(services.some((s) => s.id === "seed-persist-svc")).toBe(true);
  });
});

/** Next Monday, YYYY-MM-DD — matches Tests.gs's nextMondayLocalDate_() reasoning: comfortably inside any maxAdvanceDays, never a weekend. */
function nextMondayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
