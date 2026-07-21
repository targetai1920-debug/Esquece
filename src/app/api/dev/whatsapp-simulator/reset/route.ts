import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCrmClient } from "@/lib/crm/factory";
import { devOnlyGuard } from "@/lib/http/devOnly";
import { errorJsonFromException, generateRequestId, successJson } from "@/lib/http/envelope";
import { parseJsonBody } from "@/lib/http/publicRoute";

const resetSchema = z.object({ phoneE164: z.string().min(6) });

export async function POST(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const requestId = generateRequestId();
  try {
    const input = await parseJsonBody(request, resetSchema);
    const crm = getCrmClient();
    const conversation = await crm.getOrCreateConversation(input.phoneE164);
    const reset = await crm.resetConversation(conversation.conversationId);
    return successJson(requestId, { conversation: reset });
  } catch (err) {
    return errorJsonFromException(requestId, err);
  }
}
