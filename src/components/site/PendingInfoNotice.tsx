/**
 * Visible, honest "this is still demo data" banner. Every value it points
 * at is marked DEMO_DATA_REPLACE_BEFORE_PRODUCTION in src/lib/demo/business.ts.
 * Remove this component once real business data + brand assets are loaded
 * from the database — see CLIENT_INFORMATION_REQUIRED.md.
 */
export function PendingInfoNotice() {
  return (
    <div className="border-y border-border bg-surface px-4 py-3 text-center text-xs text-muted sm:text-sm">
      Sitio en construcción — servicios, precios, barberos, horarios,
      dirección y logo son datos de muestra, pendientes de confirmación por
      Esquece Barber Studio.
    </div>
  );
}
