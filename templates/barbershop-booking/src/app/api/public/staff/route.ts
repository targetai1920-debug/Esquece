import { getCrmClient } from "@/lib/crm/factory";
import { okResponse } from "@/lib/http/envelope";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const staff = serviceId
    ? await getCrmClient().listStaffForService(serviceId)
    : await getCrmClient().listStaff();
  return okResponse(staff);
}
