"use client";

import { useState } from "react";
import type { Barber, Service } from "@/lib/crm/types";

const emptyForm = { name: "", biography: "", specialties: "", phoneE164: "" };

export function BarbersClient({ initialBarbers, services }: { initialBarbers: Barber[]; services: Service[] }) {
  const [barbers, setBarbers] = useState(initialBarbers);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
  const [editingServiceIds, setEditingServiceIds] = useState<string[]>([]);

  async function refresh() {
    const response = await fetch("/api/admin/barbers");
    const json = await response.json();
    if (json.ok) setBarbers(json.data);
  }

  async function createBarber() {
    setError(null);
    try {
      const response = await fetch("/api/admin/barbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          biography: form.biography || undefined,
          specialties: form.specialties || undefined,
          phoneE164: form.phoneE164 || undefined,
        }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setForm(emptyForm);
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el barbero");
    }
  }

  async function toggleActive(barber: Barber) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/barbers/${barber.barberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !barber.active }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el barbero");
    }
  }

  async function editServices(barberId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/barbers/${barberId}/services`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setEditingServiceIds(json.data.serviceIds);
      setEditingBarberId(barberId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los servicios del barbero");
    }
  }

  async function saveServices() {
    if (!editingBarberId) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/barbers/${editingBarberId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds: editingServiceIds }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setEditingBarberId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar los servicios");
    }
  }

  function toggleServiceId(serviceId: string) {
    setEditingServiceIds((ids) => (ids.includes(serviceId) ? ids.filter((id) => id !== serviceId) : [...ids, serviceId]));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Barberos</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          {showForm ? "Cancelar" : "Nuevo barbero"}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {showForm && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-4 dark:border-neutral-800">
          <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Especialidades" value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Teléfono" value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Biografía" value={form.biography} onChange={(e) => setForm({ ...form, biography: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button onClick={createBarber} disabled={!form.name} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
            Crear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="p-2">Nombre</th>
              <th className="p-2">Teléfono</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Visible al público</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {barbers.map((b) => (
              <tr key={b.barberId} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="p-2">{b.name}</td>
                <td className="p-2">{b.phoneE164}</td>
                <td className="p-2">{b.active ? "Activo" : "Inactivo"}</td>
                <td className="p-2">{b.publicBooking ? "Sí" : "No"}</td>
                <td className="p-2 flex gap-1">
                  <button onClick={() => toggleActive(b)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    {b.active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => editServices(b.barberId)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    Servicios
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingBarberId && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Servicios de {barbers.find((b) => b.barberId === editingBarberId)?.name}</h2>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <label key={s.serviceId} className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700">
                <input type="checkbox" checked={editingServiceIds.includes(s.serviceId)} onChange={() => toggleServiceId(s.serviceId)} />
                {s.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveServices} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Guardar</button>
            <button onClick={() => setEditingBarberId(null)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
