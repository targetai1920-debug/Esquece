"use client";

import { useState } from "react";
import type { Notification, NotificationStatus } from "@/lib/crm/types";

const STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: "Pendiente",
  PROCESSING: "En proceso",
  SENT: "Enviada",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
};

export function NotificationsClient({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/notifications?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setNotifications(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar notificaciones");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Notificaciones</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button onClick={refresh} className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Filtrar</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
            <tr>
              <th className="p-2">Tipo</th>
              <th className="p-2">Canal</th>
              <th className="p-2">Programada</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Intentos</th>
              <th className="p-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.notificationId} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="p-2">{n.type}</td>
                <td className="p-2">{n.channel}</td>
                <td className="p-2">{n.scheduledAt ? new Date(n.scheduledAt).toLocaleString("es-BO") : ""}</td>
                <td className="p-2">{STATUS_LABELS[n.status]}</td>
                <td className="p-2">{n.attemptCount}</td>
                <td className="p-2 text-xs text-red-600 dark:text-red-400">{n.errorMessage}</td>
              </tr>
            ))}
            {notifications.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-neutral-500">Sin notificaciones para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
