import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCrmClient } from "@/lib/crm/factory";
import { getAiClient } from "@/lib/ai/factory";
import { getWhatsAppClient } from "@/lib/whatsapp/factory";
import { handleInboundTurn } from "@/lib/conversation/orchestrator";
import { devOnlyGuard } from "@/lib/http/devOnly";
import { errorJsonFromException, generateRequestId, successJson } from "@/lib/http/envelope";
import { parseJsonBody } from "@/lib/http/publicRoute";

/**
 * Development-only simulator backend — runs the exact same orchestrator,
 * against the exact same process-wide CrmClient singleton (getCrmClient()),
 * as the real webhook (master spec §20: "must not use a separate fake
 * booking calendar"). Only the transport (HTTP form post vs. a Meta
 * webhook) is simulated.
 */

const sendSchema = z.object({
  phoneE164: z.string().min(6),
  messageText: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const requestId = generateRequestId();
  try {
    const input = await parseJsonBody(request, sendSchema);
    const crm = getCrmClient();
    const ai = getAiClient();
    const whatsapp = getWhatsAppClient();

    const outcome = await handleInboundTurn(
      { crm, ai, whatsapp },
      {
        phoneE164: input.phoneE164,
        externalMessageId: `sim-${randomUUID()}`,
        messageType: "text",
        messageText: input.messageText,
      },
    );

    const messages = await crm.adminGetConversationMessages(outcome.conversationId);
    const conversation = await crm.getConversation(outcome.conversationId);
    return successJson(requestId, { conversation, messages });
  } catch (err) {
    return errorJsonFromException(requestId, err);
  }
}
