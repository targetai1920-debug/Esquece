import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";
import { getAiProvider, getCrmProvider, getWhatsAppProvider, isDemoMode, isProduction } from "@/lib/env/server";

/** Safe settings + provider/health display only — never returns a secret, credential, or hash (SECURITY.md). */
export const GET = adminApiRoute({}, async () => {
  const crm = getCrmClient();
  const [businessSettings, crmHealth] = await Promise.all([crm.getBusinessSettings(), crm.health()]);
  return {
    businessSettings,
    crmHealth,
    providers: {
      crm: getCrmProvider(),
      ai: getAiProvider(),
      whatsapp: getWhatsAppProvider(),
    },
    environment: {
      production: isProduction(),
      demoMode: isDemoMode(),
    },
  };
});
