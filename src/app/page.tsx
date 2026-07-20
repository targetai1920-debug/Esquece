import Link from "next/link";
import { BrandMark } from "@/components/site/BrandMark";
import { PendingInfoNotice } from "@/components/site/PendingInfoNotice";
import {
  DEMO_BARBERS,
  DEMO_CONTACT,
  DEMO_LOCATION,
  DEMO_SERVICES,
  DEMO_TAGLINE,
} from "@/lib/demo/business";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <PendingInfoNotice />

      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10 text-lg sm:h-12 sm:w-12" />
          <span className="text-lg font-black uppercase tracking-tight sm:text-xl">
            Esquece Barber Studio
          </span>
        </div>
        <a
          href={DEMO_CONTACT.whatsappHref}
          className="hidden rounded-full border border-current px-4 py-2 text-sm font-semibold uppercase tracking-wide sm:inline-block"
        >
          WhatsApp
        </a>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="flex flex-col items-start gap-6 px-6 py-16 sm:px-10 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl">
            {DEMO_TAGLINE}
          </h1>
          <p className="max-w-xl text-base text-muted sm:text-lg">
            Reservas 24/7 por WhatsApp o desde la web. Elegí servicio,
            barbero y horario — sin llamadas, sin esperar respuesta.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reservar"
              className="rounded-full bg-accent px-8 py-4 text-sm font-black uppercase tracking-wide text-accent-ink transition hover:opacity-90"
            >
              Reservar ahora
            </Link>
            <a
              href={DEMO_CONTACT.whatsappHref}
              className="rounded-full border border-current px-8 py-4 text-sm font-black uppercase tracking-wide"
            >
              Escribir por WhatsApp
            </a>
          </div>
        </section>

        {/* Services preview */}
        <section className="border-t border-border px-6 py-14 sm:px-10">
          <h2 className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Servicios
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {DEMO_SERVICES.map((service) => (
              <li
                key={service.id}
                className="rounded-2xl border border-border bg-surface p-6"
              >
                <p className="text-lg font-bold">{service.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {service.durationMinutes} min
                </p>
                <p className="mt-4 text-xs uppercase tracking-wide text-muted">
                  {service.priceLabel}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Barbers preview */}
        <section className="border-t border-border px-6 py-14 sm:px-10">
          <h2 className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Barberos
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {DEMO_BARBERS.map((barber) => (
              <li
                key={barber.id}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-6"
              >
                <div className="h-14 w-14 shrink-0 rounded-full border border-border" />
                <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {barber.name}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Location + hours */}
        <section className="border-t border-border px-6 py-14 sm:px-10">
          <h2 className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Ubicación y horarios
          </h2>
          <p className="text-base font-semibold">{DEMO_LOCATION.addressLine}</p>
          <p className="text-sm text-muted">{DEMO_LOCATION.city}</p>
          <p className="mt-3 text-sm uppercase tracking-wide text-muted">
            {DEMO_LOCATION.hoursLabel}
          </p>
        </section>
      </main>

      <footer className="flex flex-col items-start gap-3 border-t border-border px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} Esquece Barber Studio
        </p>
        <div className="flex gap-4 text-xs font-semibold uppercase tracking-wide">
          <a href={`https://instagram.com/${DEMO_CONTACT.instagramHandle.replace("@", "")}`}>
            {DEMO_CONTACT.instagramHandle}
          </a>
          <a href={DEMO_CONTACT.whatsappHref}>WhatsApp</a>
        </div>
      </footer>
    </div>
  );
}
