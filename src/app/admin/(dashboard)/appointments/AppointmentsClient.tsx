"use client";

import { useState } from "react";
import type { Appointment, AppointmentStatus, AvailableSlot, Barber, Service } from "@/lib/crm/types";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No presentado",
};

async function postJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error?.message || "Error desconocido");
  return json.data;
}

export function AppointmentsClient({
  initialAppointments,
  barbers,
  services,
}: {
  initialAppointments: Appointment[];
  barbers: Barber[];
  services: Service[];
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [localDate, setLocalDate] = useState("");
  const [barberId, setBarberId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createServiceId, setCreateServiceId] = useState(services[0]?.serviceId || "");
  const [createBarberId, setCreateBarberId] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  async function refresh() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (localDate) params.set("localDate", localDate);
      if (barberId) params.set("barberId", barberId);
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/appointments?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setAppointments(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar citas");
    }
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusyId(null);
    }
  }

  async function checkAvailability() {
    setError(null);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const data = await postJson("/api/admin/availability", {
        serviceId: createServiceId,
        localDate: createDate,
        barberId: createBarberId || undefined,
        anyBarber: !createBarberId,
      });
      setSlots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar disponibilidad");
    }
  }

  async function submitCreate() {
    if (!selectedSlot) return;
    setError(null);
    try {
      await postJson("/api/admin/appointments", {
        serviceId: createServiceId,
        barberId: createBarberId || selectedSlot.barberIds[0],
        anyBarber: !createBarberId,
        localDate: createDate,
        localStartTime: selectedSlot.localStartTime,
        customer: { name: customerName, phoneE164: customerPhone },
      });
      setShowCreateForm(false);
      setSlots([]);
      setSelectedSlot(null);
      setCustomerName("");
      setCustomerPhone("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la cita");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Citas</h1>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          {showCreateForm ? "Cancelar" : "Nueva cita"}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {showCreateForm && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <select value={createServiceId} onChange={(e) => setCreateServiceId(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
              {services.map((s) => (
                <option key={s.serviceId} value={s.serviceId}>{s.name}</option>
              ))}
            </select>
            <select value={createBarberId} onChange={(e) => setCreateBarberId(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
              <option value="">Cualquiera disponible</option>
              {barbers.map((b) => (
                <option key={b.barberId} value={b.barberId}>{b.name}</option>
              ))}
            </select>
            <input type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
            <button onClick={checkAvailability} disabled={!createDate} className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700">
              Ver horarios
            </button>
          </div>
          {slots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.localStartTime}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded border px-2 py-1 text-sm ${selectedSlot?.localStartTime === slot.localStartTime ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900" : "border-neutral-300 dark:border-neutral-700"}`}
                >
                  {slot.localStartTime}
                </button>
              ))}
            </div>
          )}
          {selectedSlot && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <input placeholder="Nombre del cliente" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
              <input placeholder="Teléfono (+591...)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
              <button onClick={submitCreate} disabled={!customerName || !customerPhone} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
                Confirmar cita
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
        <select value={barberId} onChange={(e) => setBarberId(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
          <option value="">Todos los barberos</option>
          {barbers.map((b) => (
            <option key={b.barberId} value={b.barberId}>{b.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button onClick={refresh} className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Filtrar</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="p-2">Fecha</th>
              <th className="p-2">Hora</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">Servicio</th>
              <th className="p-2">Barbero</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Origen</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.appointmentId} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="p-2">{a.localDate}</td>
                <td className="p-2">{a.localStartTime}</td>
                <td className="p-2">{a.customerNameSnapshot}<br /><span className="text-xs text-neutral-500">{a.customerPhoneSnapshot}</span></td>
                <td className="p-2">{a.serviceNameSnapshot}</td>
                <td className="p-2">{a.barberNameSnapshot}</td>
                <td className="p-2">{STATUS_LABELS[a.status]}</td>
                <td className="p-2 text-xs text-neutral-500">{a.source}</td>
                <td className="p-2">
                  {(a.status === "PENDING" || a.status === "CONFIRMED") && (
                    <div className="flex flex-wrap gap-1">
                      {a.status === "PENDING" && (
                        <button
                          disabled={busyId === a.appointmentId}
                          onClick={() => withBusy(a.appointmentId, () => postJson(`/api/admin/appointments/${a.appointmentId}/status`, { status: "CONFIRMED" }))}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                        >
                          Confirmar
                        </button>
                      )}
                      <button
                        disabled={busyId === a.appointmentId}
                        onClick={() => withBusy(a.appointmentId, () => postJson(`/api/admin/appointments/${a.appointmentId}/status`, { status: "COMPLETED" }))}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                      >
                        Completada
                      </button>
                      <button
                        disabled={busyId === a.appointmentId}
                        onClick={() => withBusy(a.appointmentId, () => postJson(`/api/admin/appointments/${a.appointmentId}/status`, { status: "NO_SHOW" }))}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                      >
                        No presentado
                      </button>
                      <button
                        disabled={busyId === a.appointmentId}
                        onClick={() => {
                          const newLocalDate = window.prompt("Nueva fecha (YYYY-MM-DD):", a.localDate);
                          if (!newLocalDate) return;
                          const newLocalStartTime = window.prompt("Nueva hora (HH:mm):", a.localStartTime);
                          if (!newLocalStartTime) return;
                          void withBusy(a.appointmentId, () => postJson(`/api/admin/appointments/${a.appointmentId}/reschedule`, { newLocalDate, newLocalStartTime }));
                        }}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                      >
                        Reprogramar
                      </button>
                      <button
                        disabled={busyId === a.appointmentId}
                        onClick={() => withBusy(a.appointmentId, () => postJson(`/api/admin/appointments/${a.appointmentId}/cancel`, { reason: "Cancelada por administración" }))}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-neutral-500">Sin citas para este filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
