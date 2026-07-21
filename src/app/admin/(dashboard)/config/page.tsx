import { getCrmClient } from "@/lib/crm/factory";
import { getAiProvider, getCrmProvider, getWhatsAppProvider, isDemoMode, isProduction } from "@/lib/env/server";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-1.5 text-sm dark:border-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Safe display only — never a secret, credential, or hash (SECURITY.md). */
export default async function AdminConfigPage() {
  const crm = getCrmClient();
  const [settings, health] = await Promise.all([crm.getBusinessSettings(), crm.health()]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Configuración</h1>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-semibold">Negocio</h2>
        <Row label="Nombre" value={settings.BUSINESS_NAME} />
        <Row label="Zona horaria" value={settings.BUSINESS_TIMEZONE} />
        <Row label="Moneda" value={settings.CURRENCY} />
        <Row label="Horario" value={`${settings.OPENING_TIME} – ${settings.CLOSING_TIME}`} />
        <Row label="Intervalo de turnos" value={`${settings.SLOT_INTERVAL_MINUTES} min`} />
        <Row label="Aviso mínimo" value={`${settings.MIN_BOOKING_NOTICE_MINUTES} min`} />
        <Row label="Anticipación máxima" value={`${settings.MAX_ADVANCE_BOOKING_DAYS} días`} />
        <Row label="Recordatorios" value={settings.ENABLE_REMINDERS ? "Activados" : "Desactivados"} />
        <Row label="Sincronización con Calendar" value={settings.ENABLE_CALENDAR_SYNC ? "Activada" : "Desactivada"} />
      </section>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-semibold">Estado del sistema</h2>
        <Row label="CRM" value={health.status} />
        <Row label="Versión de API" value={health.apiVersion} />
        <Row label="Versión de esquema" value={health.schemaVersion} />
        <Row label="Proveedor CRM" value={getCrmProvider()} />
        <Row label="Proveedor IA" value={getAiProvider()} />
        <Row label="Proveedor WhatsApp" value={getWhatsAppProvider()} />
        <Row label="Entorno" value={isProduction() ? "Producción" : "Desarrollo"} />
        <Row label="Modo demo" value={isDemoMode() ? "Sí" : "No"} />
      </section>
    </div>
  );
}
