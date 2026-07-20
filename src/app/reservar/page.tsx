import Link from "next/link";
import { DEMO_CONTACT } from "@/lib/demo/business";

/**
 * Placeholder only — the real step-by-step booking flow (service → barber →
 * date → time → customer details → summary → confirmation) is Phase 3, and
 * it must call the booking engine in src/lib/booking-engine, not reimplement
 * availability logic here. See PROJECT_PLAN.md.
 */
export default function ReservarPage() {
  return (
    <div className="flex min-h-full flex-col items-start justify-center gap-6 px-6 py-24 sm:px-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Próximamente
      </p>
      <h1 className="max-w-xl text-3xl font-black uppercase leading-tight sm:text-5xl">
        La reserva online todavía no está activa
      </h1>
      <p className="max-w-md text-sm text-muted sm:text-base">
        Estamos construyendo el flujo de reservas. Por ahora, escribinos por
        WhatsApp para agendar tu cita.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href={DEMO_CONTACT.whatsappHref}
          className="rounded-full bg-accent px-8 py-4 text-sm font-black uppercase tracking-wide text-accent-ink"
        >
          Escribir por WhatsApp
        </a>
        <Link
          href="/"
          className="rounded-full border border-current px-8 py-4 text-sm font-black uppercase tracking-wide"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}
