import { getCrmClient } from "@/lib/crm/factory";
import { CustomersClient } from "./CustomersClient";

export default async function AdminCustomersPage() {
  const customers = await getCrmClient().listCustomers();
  return <CustomersClient initialCustomers={customers} />;
}
