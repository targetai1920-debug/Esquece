import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const GET = adminApiRoute({}, async (request) => {
  const search = request.nextUrl.searchParams.get("search") || undefined;
  return getCrmClient().listCustomers(search);
});
