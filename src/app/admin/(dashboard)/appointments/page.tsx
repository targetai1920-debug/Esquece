import { getCrmClient } from "@/lib/crm/factory";
import { AppointmentsClient } from "./AppointmentsClient";

export default async function AdminAppointmentsPage() {
  const crm = getCrmClient();
  const [appointments, barbers, services] = await Promise.all([
    crm.listAppointments(),
    crm.adminListBarbers(),
    crm.adminListServices(),
  ]);

  return <AppointmentsClient initialAppointments={appointments} barbers={barbers} services={services} />;
}
