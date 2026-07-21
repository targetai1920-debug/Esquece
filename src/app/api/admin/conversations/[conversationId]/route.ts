import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const GET = adminApiRoute({}, async (_request, context) => {
  const { conversationId } = await context.params;
  return getCrmClient().getConversation(conversationId);
});
