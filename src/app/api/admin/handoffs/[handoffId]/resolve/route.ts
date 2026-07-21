import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { adminResolveHandoffRequestSchema } from "@/lib/http/adminApiSchemas";

/** reactivateBot:true hands the conversation back to the WhatsApp bot (WHATSAPP_AGENT_DESIGN.md's human-handoff rules) — never automatic, always this explicit admin action. */
export const POST = adminApiRoute({ enforceOrigin: true }, async (request, context) => {
  const { handoffId } = await context.params;
  const input = await parseJsonBody(request, adminResolveHandoffRequestSchema);
  return getCrmClient().resolveHumanHandoff({ handoffId, ...input });
});
