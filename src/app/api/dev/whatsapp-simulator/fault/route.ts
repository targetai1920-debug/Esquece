import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCrmClient } from "@/lib/crm/factory";
import { getAiClient } from "@/lib/ai/factory";
import { getWhatsAppClient } from "@/lib/whatsapp/factory";
import { MockCrmClient } from "@/lib/crm/mockClient";
import { MockAiProvider } from "@/lib/ai/mockProvider";
import { MockWhatsAppProvider } from "@/lib/whatsapp/mockProvider";
import { devOnlyGuard } from "@/lib/http/devOnly";
import { CrmError } from "@/lib/crm/errors";
import { errorJsonFromException, generateRequestId, successJson } from "@/lib/http/envelope";
import { parseJsonBody } from "@/lib/http/publicRoute";

/** Arms a one-shot failure on the next call to the given mock provider — master spec §20 "simulate CRM/AI/WhatsApp errors." No-op target for a real (non-mock) provider — faults only make sense against a mock. */
const faultSchema = z.object({ target: z.enum(["crm", "ai", "whatsapp"]) });

export async function POST(request: NextRequest) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const requestId = generateRequestId();
  try {
    const input = await parseJsonBody(request, faultSchema);

    if (input.target === "crm") {
      const crm = getCrmClient();
      if (!(crm instanceof MockCrmClient)) throw new CrmError("INVALID_REQUEST", "CRM_PROVIDER is not mock — nothing to simulate.", false);
      crm.failNextCall = true;
    } else if (input.target === "ai") {
      const ai = getAiClient();
      if (!(ai instanceof MockAiProvider)) throw new CrmError("INVALID_REQUEST", "AI_PROVIDER is not mock — nothing to simulate.", false);
      ai.failNext = true;
    } else {
      const whatsapp = getWhatsAppClient();
      if (!(whatsapp instanceof MockWhatsAppProvider)) throw new CrmError("INVALID_REQUEST", "WHATSAPP_PROVIDER is not mock — nothing to simulate.", false);
      whatsapp.failNextSend = true;
    }

    return successJson(requestId, { armed: input.target });
  } catch (err) {
    return errorJsonFromException(requestId, err);
  }
}
