import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const GET = adminApiRoute({}, async (request) => {
  const handoffActiveOnly = request.nextUrl.searchParams.get("handoffActiveOnly") === "true";
  return getCrmClient().adminListConversations(handoffActiveOnly);
});
