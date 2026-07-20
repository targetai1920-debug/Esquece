import { NextResponse } from "next/server";
import { getCrmProvider, getAiProvider, getWhatsAppProvider } from "@/lib/env/server";

/**
 * General health — reports safe status only, never secrets or detailed
 * infrastructure (SECURITY.md, ARCHITECTURE.md §9 "Health endpoints").
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "live",
    providers: {
      crm: getCrmProvider(),
      ai: getAiProvider(),
      whatsapp: getWhatsAppProvider(),
    },
    timestamp: new Date().toISOString(),
  });
}
