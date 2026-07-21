import { getCrmClient } from "@/lib/crm/factory";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const crm = getCrmClient();
  const [summary, health] = await Promise.all([crm.adminGetDashboardSummary(), crm.health()]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Panel — {summary.date}</h1>
        <p className="text-xs text-neutral-500">CRM: {health.status} · esquema v{health.schemaVersion} · actualizado {new Date(summary.updatedAt).toLocaleString("es-BO")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Citas hoy" value={summary.appointmentsToday} />
        <StatCard label="Confirmadas hoy" value={summary.confirmedToday} />
        <StatCard label="Completadas hoy" value={summary.completedToday} />
        <StatCard label="Canceladas hoy" value={summary.cancelledToday} />
        <StatCard label="No presentados hoy" value={summary.noShowToday} />
        <StatCard label="Próximas citas" value={summary.upcomingAppointments} />
        <StatCard label="Handoffs abiertos" value={summary.openHandoffs} />
        <StatCard label="Notificaciones fallidas" value={summary.failedNotifications} />
        <StatCard label="Clientes activos" value={summary.activeCustomers} />
        <StatCard label="Citas esta semana" value={summary.appointmentsThisWeek} />
        <StatCard label="Citas este mes" value={summary.appointmentsThisMonth} />
      </div>
    </div>
  );
}
