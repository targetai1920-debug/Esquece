import { getCrmClient } from "@/lib/crm/factory";
import { okResponse } from "@/lib/http/envelope";

export async function GET() {
  const settings = await getCrmClient().getBusinessSettings();
  return okResponse(settings);
}
