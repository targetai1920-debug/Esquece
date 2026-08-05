import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { getCrmClient } from "@/lib/crm/factory";
import {
  AppointmentActions,
  BlockedSlotForm,
  BlockedSlotList,
  ServiceRow,
  StaffRow,
  TimeOffForm,
  TimeOffList,
} from "./AdminControls";

/**
 * Operational admin dashboard — daily self-service tasks (confirm/cancel/
 * reschedule/complete/no-show appointments, block a slot, add a day off,
 * toggle a service or staff member, change a service price) without the
 * business owner needing a developer to edit code or regenerate the
 * project. See .claude/skills/barbershop-crm-builder/references/admin-dashboard.md.
 * Every screen here reads/writes through the same CrmClient the public
 * API uses — no separate/bypassing data path. Mutations live in
 * @/lib/admin/actions.ts (Server Actions: auth-checked, origin-checked,
 * audited by the CrmClient layer).
 */
export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const crm = getCrmClient();
  const [settings, services, staff, appointments, blockedSlots, timeOff] = await Promise.all([
    crm.getBusinessSettings(),
    crm.adminListServices(),
    crm.adminListStaff(),
    crm.listAppointments(),
    crm.listBlockedSlots(),
    crm.listTimeOff(),
  ]);

  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  return (
    <main className="container">
      <h1>Panel administrativo — {settings.name}</h1>
      <p>Sesión: {session.email}</p>

      <section>
        <h2>Citas ({appointments.length})</h2>
        <ul>
          {appointments.map((a) => (
            <li key={a.id}>
              <p>
                {a.localDate} {a.localStartTime} — {a.serviceNameSnapshot} con {a.staffNameSnapshot} —{" "}
                <strong>{a.status}</strong> — {a.customerNameSnapshot} ({a.customerPhoneSnapshot})
              </p>
              <AppointmentActions appointmentId={a.id} status={a.status} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Servicios ({services.length})</h2>
        <ul>
          {services.map((s) => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </ul>
      </section>

      <section>
        <h2>Personal ({staff.length})</h2>
        <ul>
          {staff.map((s) => (
            <StaffRow key={s.id} staff={s} />
          ))}
        </ul>
      </section>

      <section>
        <h2>Franjas bloqueadas ({blockedSlots.length})</h2>
        <BlockedSlotList blockedSlots={blockedSlots} staffNameById={staffNameById} />
        <BlockedSlotForm staff={staff} />
      </section>

      <section>
        <h2>Días libres ({timeOff.length})</h2>
        <TimeOffList timeOff={timeOff} staffNameById={staffNameById} />
        <TimeOffForm staff={staff} />
      </section>
    </main>
  );
}
