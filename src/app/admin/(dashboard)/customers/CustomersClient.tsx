"use client";

import { useState } from "react";
import type { Appointment, Customer } from "@/lib/crm/types";

export function CustomersClient({ initialCustomers }: { initialCustomers: Customer[] }) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ customer: Customer; appointments: Appointment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const response = await fetch(`/api/admin/customers?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setCustomers(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al buscar clientes");
    }
  }

  async function openHistory(customerId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setSelected(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar historial");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Clientes</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="flex gap-2">
        <input
          placeholder="Buscar por nombre o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          className="w-72 rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        />
        <button onClick={runSearch} className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Buscar</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
              <tr>
                <th className="p-2">Nombre</th>
                <th className="p-2">Teléfono</th>
                <th className="p-2">Citas</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerId} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.phoneE164}</td>
                  <td className="p-2">{c.totalAppointments}</td>
                  <td className="p-2">
                    <button onClick={() => openHistory(c.customerId)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                      Ver historial
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-neutral-500">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="font-semibold">{selected.customer.name}</h2>
            <p className="text-sm text-neutral-500">{selected.customer.phoneE164} · {selected.customer.email || "sin correo"}</p>
            <p className="text-sm">{selected.customer.notes || "Sin notas."}</p>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <p>Confirmadas: {selected.customer.confirmedAppointments}</p>
              <p>Completadas: {selected.customer.completedAppointments}</p>
              <p>Canceladas: {selected.customer.cancelledAppointments}</p>
              <p>No presentado: {selected.customer.noShowAppointments}</p>
              <p>Total: {selected.customer.totalAppointments}</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-neutral-500">
                  <tr><th className="p-1">Fecha</th><th className="p-1">Servicio</th><th className="p-1">Estado</th></tr>
                </thead>
                <tbody>
                  {selected.appointments.map((a) => (
                    <tr key={a.appointmentId} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="p-1">{a.localDate} {a.localStartTime}</td>
                      <td className="p-1">{a.serviceNameSnapshot}</td>
                      <td className="p-1">{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
