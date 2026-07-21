import "server-only";
import { getAiProvider as getAiProviderName, isProduction } from "@/lib/env/server";
import { AnthropicAiProvider } from "./anthropicProvider";
import { MockAiProvider } from "./mockProvider";
import type { AiProvider } from "./types";

/** Provider selection — same production-safety pattern as lib/crm/factory.ts and lib/whatsapp/factory.ts. */

let cachedProvider: AiProvider | null = null;

export function getAiClient(): AiProvider {
  if (cachedProvider) return cachedProvider;

  const provider = getAiProviderName();

  if (provider === "mock" && isProduction() && process.env.ALLOW_UNSAFE_MOCKS_IN_PRODUCTION !== "true") {
    throw new Error(
      "AI_PROVIDER=mock is not allowed in production. Set AI_PROVIDER=anthropic with a real " +
        "ANTHROPIC_API_KEY, or explicitly set ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true if you " +
        "understand the consequences (never do this for a real deployment serving real customers).",
    );
  }

  cachedProvider = provider === "anthropic" ? new AnthropicAiProvider() : new MockAiProvider();
  return cachedProvider;
}

/** Test-only: forces the next getAiClient() call to construct a fresh instance. */
export function _resetAiClientForTests() {
  cachedProvider = null;
}
