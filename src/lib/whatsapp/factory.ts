import "server-only";
import { getWhatsAppProvider as getWhatsAppProviderName, isProduction } from "@/lib/env/server";
import { MetaWhatsAppProvider } from "./metaProvider";
import { MockWhatsAppProvider } from "./mockProvider";
import type { WhatsAppProvider } from "./types";

/**
 * Provider selection — mirrors lib/crm/factory.ts exactly: WHATSAPP_PROVIDER=mock is refused in
 * production unless ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true is also explicitly set.
 */

let cachedProvider: WhatsAppProvider | null = null;

export function getWhatsAppClient(): WhatsAppProvider {
  if (cachedProvider) return cachedProvider;

  const provider = getWhatsAppProviderName();

  if (provider === "mock" && isProduction() && process.env.ALLOW_UNSAFE_MOCKS_IN_PRODUCTION !== "true") {
    throw new Error(
      "WHATSAPP_PROVIDER=mock is not allowed in production. Set WHATSAPP_PROVIDER=meta with real " +
        "credentials, or explicitly set ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true if you understand " +
        "the consequences (never do this for a real deployment serving real customers).",
    );
  }

  cachedProvider = provider === "meta" ? new MetaWhatsAppProvider() : new MockWhatsAppProvider();
  return cachedProvider;
}

/** Test-only: forces the next getWhatsAppClient() call to construct a fresh instance. */
export function _resetWhatsAppClientForTests() {
  cachedProvider = null;
}
