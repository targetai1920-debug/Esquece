import { type NextRequest } from "next/server";
import { getCrmClient } from "@/lib/crm/factory";
import { devOnlyGuard } from "@/lib/http/devOnly";
import { errorJsonFromException, generateRequestId, successJson } from "@/lib/http/envelope";

export async function GET(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const requestId = generateRequestId();
  try {
    const phoneE164 = request.nextUrl.searchParams.get("phoneE164");
    if (!phoneE164) throw new Error("phoneE164 is required");

    const crm = getCrmClient();
    const conversation = await crm.getOrCreateConversation(phoneE164);
    const messages = await crm.adminGetConversationMessages(conversation.conversationId);
    return successJson(requestId, { conversation, messages });
  } catch (err) {
    return errorJsonFromException(requestId, err);
  }
}
