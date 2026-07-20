"use client";

import { useState } from "react";

function nextWeekdayDateStr(daysFromNow: number): string {
  let d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

interface LogEntry {
  step: string;
  ok: boolean;
  data: unknown;
}

export function ApiTestClient() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  function append(step: string, ok: boolean, data: unknown) {
    setLog((prev) => [...prev, { step, ok, data }]);
  }

  async function call(method: string, path: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    return { httpStatus: response.status, ...json };
  }

  async function runFullFlow() {
    setRunning(true);
    setLog([]);
    try {
      const services = await call("GET", "/api/public/services");
      append("1. listServices", services.ok, services);
      const serviceId = services.data?.[0]?.serviceId;
      if (!serviceId) return append("stopped", false, "No demo services found.");

      const barbers = await call("GET", `/api/public/barbers?serviceId=${serviceId}`);
      append("2. listBarbersForService", barbers.ok, barbers);
      const barberId = barbers.data?.[0]?.barberId;
      if (!barberId) return append("stopped", false, "No eligible barbers found.");

      const localDate = nextWeekdayDateStr(3);
      const availability = await call("POST", "/api/public/availability", { serviceId, barberId, localDate });
      append("3. getAvailability", availability.ok, availability);
      const slot = availability.data?.[0];
      if (!slot) return append("stopped", false, "No slots available on the computed test date.");

      const idempotencyKey = `dev-test-${Date.now()}`;
      const created = await call("POST", "/api/public/appointments", {
        idempotencyKey,
        serviceId,
        barberId,
        localDate,
        localStartTime: slot.localStartTime,
        customer: { name: "Prueba dev/api-test", phoneE164: "+59170000099" },
      });
      append("4. createAppointment", created.ok, created);
      const reference = created.data?.appointment?.reference;
      const managementToken = created.data?.managementToken;
      if (!reference || !managementToken) return append("stopped", false, "Creation did not return reference/token.");

      const fetched = await call("GET", `/api/public/appointments/${reference}?token=${managementToken}`);
      append("5. getAppointmentByReference", fetched.ok, fetched);

      const rescheduled = await call("POST", `/api/public/appointments/${reference}/reschedule`, {
        managementToken,
        newLocalDate: localDate,
        newLocalStartTime: slot.localStartTime,
      });
      append("6. rescheduleAppointment (to the same slot, as a smoke test)", rescheduled.ok, rescheduled);

      const cancelled = await call("POST", `/api/public/appointments/${reference}/cancel`, {
        managementToken,
        reason: "dev/api-test cleanup",
      });
      append("7. cancelAppointment", cancelled.ok, cancelled);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 900 }}>
      <h1>/dev/api-test</h1>
      <p>
        Development-only smoke test for /api/public/*. Not the final website — see
        ARCHITECTURE.md. Runs the full lifecycle: services → barbers → availability → create →
        get by reference → reschedule → cancel.
      </p>
      <button onClick={runFullFlow} disabled={running}>
        {running ? "Running..." : "Run full flow"}
      </button>
      <div style={{ marginTop: 16 }}>
        {log.map((entry, i) => (
          <details key={i} open style={{ marginBottom: 8, border: "1px solid #ccc", padding: 8 }}>
            <summary style={{ color: entry.ok ? "green" : "red" }}>
              {entry.ok ? "OK" : "FAIL"} — {entry.step}
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(entry.data, null, 2)}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
