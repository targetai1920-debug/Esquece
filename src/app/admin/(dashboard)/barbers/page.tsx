import { getCrmClient } from "@/lib/crm/factory";
import { BarbersClient } from "./BarbersClient";

export default async function AdminBarbersPage() {
  const crm = getCrmClient();
  const [barbers, services] = await Promise.all([crm.adminListBarbers(), crm.adminListServices()]);
  return <BarbersClient initialBarbers={barbers} services={services} />;
}
