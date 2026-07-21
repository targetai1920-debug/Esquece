"use client";

import { useState } from "react";
import type { Barber, BlockedSlotRecord, BreakRecord, TimeOffRecord, WorkingHours } from "@/lib/crm/types";

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

async function postJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error?.message || "Error desconocido");
  return json.data;
}

export function ScheduleClient({
  barbers,
  initialWorkingHours,
  initialBreaks,
  initialTimeOff,
  initialBlockedSlots,
}: {
  barbers: Barber[];
  initialWorkingHours: WorkingHours[];
  initialBreaks: BreakRecord[];
  initialTimeOff: TimeOffRecord[];
  initialBlockedSlots: BlockedSlotRecord[];
}) {
  const [barberId, setBarberId] = useState(barbers[0]?.barberId || "");
  const [workingHours, setWorkingHours] = useState(initialWorkingHours);
  const [breaks, setBreaks] = useState(initialBreaks);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [blockedSlots, setBlockedSlots] = useState(initialBlockedSlots);
  const [error, setError] = useState<string | null>(null);

  const [hoursForm, setHoursForm] = useState({ dayOfWeek: "1", openingTime: "08:00", closingTime: "16:00" });
  const [breakForm, setBreakForm] = useState({ recurring: true, dayOfWeek: "1", date: "", startTime: "12:00", endTime: "13:00", reason: "" });
  const [timeOffForm, setTimeOffForm] = useState({ startDate: "", endDate: "", allDay: true, startTime: "", endTime: "", reason: "" });
  const [blockedForm, setBlockedForm] = useState({ barberWide: true, localDate: "", startTime: "", endTime: "", reason: "" });

  async function refreshAll() {
    const [wh, br, to, bs] = await Promise.all([
      fetch("/api/admin/scheduling/working-hours").then((r) => r.json()),
      fetch("/api/admin/scheduling/breaks").then((r) => r.json()),
      fetch("/api/admin/scheduling/time-off").then((r) => r.json()),
      fetch("/api/admin/scheduling/blocked-slots").then((r) => r.json()),
    ]);
    if (wh.ok) setWorkingHours(wh.data);
    if (br.ok) setBreaks(br.data);
    if (to.ok) setTimeOff(to.data);
    if (bs.ok) setBlockedSlots(bs.data);
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  const barberWorkingHours = workingHours.filter((w) => w.barberId === barberId);
  const barberBreaks = breaks.filter((b) => b.barberId === barberId);
  const barberTimeOff = timeOff.filter((t) => t.barberId === barberId);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Horarios</h1>
        <select value={barberId} onChange={(e) => setBarberId(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
          {barbers.map((b) => (
            <option key={b.barberId} value={b.barberId}>{b.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold">Horario semanal</h2>
        <div className="flex flex-wrap gap-2">
          <select value={hoursForm.dayOfWeek} onChange={(e) => setHoursForm({ ...hoursForm, dayOfWeek: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
            {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
          <input type="time" value={hoursForm.openingTime} onChange={(e) => setHoursForm({ ...hoursForm, openingTime: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input type="time" value={hoursForm.closingTime} onChange={(e) => setHoursForm({ ...hoursForm, closingTime: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button
            onClick={() => run(() => postJson("/api/admin/scheduling/working-hours", { barberId, dayOfWeek: Number(hoursForm.dayOfWeek), openingTime: hoursForm.openingTime, closingTime: hoursForm.closingTime }))}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Guardar día
          </button>
        </div>
        <ul className="text-sm">
          {barberWorkingHours.map((w) => (
            <li key={w.workingHoursId}>{DAY_LABELS[w.dayOfWeek]}: {w.openingTime}–{w.closingTime} {w.active ? "" : "(inactivo)"}</li>
          ))}
          {barberWorkingHours.length === 0 && <li className="text-neutral-500">Sin horario propio — usa el horario general del negocio.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Descansos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={breakForm.recurring} onChange={(e) => setBreakForm({ ...breakForm, recurring: e.target.checked })} /> Recurrente
          </label>
          {breakForm.recurring ? (
            <select value={breakForm.dayOfWeek} onChange={(e) => setBreakForm({ ...breakForm, dayOfWeek: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
              {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
            </select>
          ) : (
            <input type="date" value={breakForm.date} onChange={(e) => setBreakForm({ ...breakForm, date: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          )}
          <input type="time" value={breakForm.startTime} onChange={(e) => setBreakForm({ ...breakForm, startTime: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input type="time" value={breakForm.endTime} onChange={(e) => setBreakForm({ ...breakForm, endTime: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Motivo" value={breakForm.reason} onChange={(e) => setBreakForm({ ...breakForm, reason: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button
            onClick={() => run(() => postJson("/api/admin/scheduling/breaks", {
              barberId, recurring: breakForm.recurring, startTime: breakForm.startTime, endTime: breakForm.endTime,
              dayOfWeek: breakForm.recurring ? Number(breakForm.dayOfWeek) : undefined,
              date: breakForm.recurring ? undefined : breakForm.date,
              reason: breakForm.reason || undefined,
            }))}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Agregar descanso
          </button>
        </div>
        <ul className="text-sm">
          {barberBreaks.map((b) => (
            <li key={b.breakId} className="flex items-center gap-2">
              {b.recurring ? DAY_LABELS[b.dayOfWeek ?? 0] : b.date}: {b.startTime}–{b.endTime} {b.reason && `(${b.reason})`}
              <button onClick={() => run(() => postJson(`/api/admin/scheduling/breaks/${b.breakId}`, undefined, "DELETE"))} className="text-xs text-red-600 dark:text-red-400">Eliminar</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Ausencias (vacaciones, permisos)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm({ ...timeOffForm, startDate: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={timeOffForm.allDay} onChange={(e) => setTimeOffForm({ ...timeOffForm, allDay: e.target.checked })} /> Todo el día
          </label>
          <input placeholder="Motivo" value={timeOffForm.reason} onChange={(e) => setTimeOffForm({ ...timeOffForm, reason: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button
            onClick={() => run(() => postJson("/api/admin/scheduling/time-off", { barberId, startDate: timeOffForm.startDate, endDate: timeOffForm.endDate, allDay: timeOffForm.allDay, reason: timeOffForm.reason || undefined }))}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Agregar ausencia
          </button>
        </div>
        <ul className="text-sm">
          {barberTimeOff.map((t) => (
            <li key={t.timeOffId} className="flex items-center gap-2">
              {t.startDate} → {t.endDate} {t.reason && `(${t.reason})`}
              <button onClick={() => run(() => postJson(`/api/admin/scheduling/time-off/${t.timeOffId}`, undefined, "DELETE"))} className="text-xs text-red-600 dark:text-red-400">Eliminar</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Horarios bloqueados</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={blockedForm.barberWide} onChange={(e) => setBlockedForm({ ...blockedForm, barberWide: e.target.checked })} /> Solo este barbero
          </label>
          <input type="date" value={blockedForm.localDate} onChange={(e) => setBlockedForm({ ...blockedForm, localDate: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input type="time" value={blockedForm.startTime} onChange={(e) => setBlockedForm({ ...blockedForm, startTime: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input type="time" value={blockedForm.endTime} onChange={(e) => setBlockedForm({ ...blockedForm, endTime: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Motivo" value={blockedForm.reason} onChange={(e) => setBlockedForm({ ...blockedForm, reason: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button
            onClick={() => run(() => postJson("/api/admin/scheduling/blocked-slots", {
              barberId: blockedForm.barberWide ? barberId : undefined,
              localDate: blockedForm.localDate, startTime: blockedForm.startTime, endTime: blockedForm.endTime, reason: blockedForm.reason || undefined,
            }))}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Bloquear horario
          </button>
        </div>
        <ul className="text-sm">
          {blockedSlots.map((b) => (
            <li key={b.blockedSlotId} className="flex items-center gap-2">
              {b.localDate} {b.startTime}–{b.endTime} — {b.barberId ? barbers.find((x) => x.barberId === b.barberId)?.name || b.barberId : "Todo el negocio"} {b.reason && `(${b.reason})`}
              <button onClick={() => run(() => postJson(`/api/admin/scheduling/blocked-slots/${b.blockedSlotId}`, undefined, "DELETE"))} className="text-xs text-red-600 dark:text-red-400">Eliminar</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
