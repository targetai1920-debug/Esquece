import Link from "next/link";
import { loadClientConfig } from "@/config/loadConfig";

export default function HomePage() {
  const config = loadClientConfig();
  const activeServices = config.services.filter((s) => s.active);
  const activeStaff = config.staff.filter((s) => s.active);

  return (
    <main className="container">
      <section>
        <h1>{config.content.heroTitle}</h1>
        {config.content.heroSubtitle && <p>{config.content.heroSubtitle}</p>}
        <Link href="/reservar">
          <button>{config.content.bookingTitle}</button>
        </Link>
      </section>

      <section>
        <h2>{config.content.aboutTitle}</h2>
        {config.content.aboutText ? <p>{config.content.aboutText}</p> : <p>Información pendiente.</p>}
      </section>

      <section>
        <h2>Servicios</h2>
        {activeServices.length === 0 && <p>Todavía no hay servicios activos configurados.</p>}
        {activeServices.map((service) => (
          <div className="card" key={service.id}>
            <h3>{service.name}</h3>
            {service.description && <p>{service.description}</p>}
            <p>
              {service.durationMinutes} min · {service.price} {config.business.currency}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>Nuestro equipo</h2>
        {activeStaff.length === 0 && <p>Todavía no hay personal activo configurado.</p>}
        {activeStaff.map((member) => (
          <div className="card" key={member.id}>
            <h3>{member.name}</h3>
            {member.biography && <p>{member.biography}</p>}
          </div>
        ))}
      </section>

      <footer>
        <p>
          {config.business.address} · {config.business.phone}
        </p>
        {config.content.footerText && <p>{config.content.footerText}</p>}
      </footer>
    </main>
  );
}
