import { getCrmClient } from "@/lib/crm/factory";
import { ServicesClient } from "./ServicesClient";

export default async function AdminServicesPage() {
  const services = await getCrmClient().adminListServices();
  return <ServicesClient initialServices={services} />;
}
