import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/admin/auth";
import { getCrmClient } from "@/lib/crm/factory";

/**
 * Read-only MVP scope (services/staff/appointments) — an explicit,
 * documented scope reduction, not an oversight. See
 * .claude/skills/barbershop-crm-builder/references/admin-dashboard.md.
 * Every screen here reads through the same CrmClient the public API uses —
 * no separate/bypassing data path.
 */
export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) redirect("/admin/login");

  const crm = getCrmClient();
  const [settings, services, staff, appointments] = await Promise.all([
    crm.getBusinessSettings(),
    crm.listServices(),
    crm.listStaff(),
    crm.listAppointments(),
  ]);

  return (
    <main className="container">
      <h1>Panel administrativo — {settings.name}</h1>
      <p>Sesión: {session.email}</p>

      <section>
        <h2>Servicios ({services.length})</h2>
        <ul>
          {services.map((s) => (
            <li key={s.id}>
              {s.name} — {s.price} {s.currency} — {s.durationMinutes} min
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Personal ({staff.length})</h2>
        <ul>
          {staff.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Citas ({appointments.length})</h2>
        <ul>
          {appointments.map((a) => (
            <li key={a.id}>
              {a.localDate} {a.localStartTime} — {a.serviceNameSnapshot} con {a.staffNameSnapshot} — {a.status}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
