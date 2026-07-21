import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const GET = adminApiRoute({}, async () => {
  return getCrmClient().adminGetDashboardSummary();
});
