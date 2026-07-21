"use client";

import { useState } from "react";
import type { Service } from "@/lib/crm/types";

const emptyForm = { name: "", description: "", price: "", durationMinutes: "", bufferMinutes: "", category: "" };

export function ServicesClient({ initialServices }: { initialServices: Service[] }) {
  const [services, setServices] = useState(initialServices);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function refresh() {
    const response = await fetch("/api/admin/services");
    const json = await response.json();
    if (json.ok) setServices(json.data);
  }

  async function createService() {
    setError(null);
    try {
      const response = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          price: Number(form.price),
          durationMinutes: Number(form.durationMinutes),
          bufferMinutes: form.bufferMinutes ? Number(form.bufferMinutes) : undefined,
          category: form.category || undefined,
        }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setForm(emptyForm);
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el servicio");
    }
  }

  async function toggleActive(service: Service) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/services/${service.serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !service.active }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el servicio");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Servicios</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          {showForm ? "Cancelar" : "Nuevo servicio"}
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {showForm && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3 dark:border-neutral-800">
          <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Precio (BOB)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Duración (min)" type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Buffer (min)" type="number" value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <input placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button onClick={createService} disabled={!form.name || !form.price || !form.durationMinutes} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
            Crear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="p-2">Nombre</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Precio</th>
              <th className="p-2">Duración</th>
              <th className="p-2">Buffer</th>
              <th className="p-2">Estado</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.serviceId} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="p-2">{s.name}</td>
                <td className="p-2">{s.category}</td>
                <td className="p-2">{s.price} {s.currency}</td>
                <td className="p-2">{s.durationMinutes} min</td>
                <td className="p-2">{s.bufferMinutes} min</td>
                <td className="p-2">{s.active ? "Activo" : "Inactivo"}</td>
                <td className="p-2">
                  <button onClick={() => toggleActive(s)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    {s.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
