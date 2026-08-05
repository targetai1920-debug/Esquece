import { getCrmClient } from "@/lib/crm/factory";
import { okResponse } from "@/lib/http/envelope";

export async function GET() {
  const services = await getCrmClient().listServices();
  return okResponse(services);
}
