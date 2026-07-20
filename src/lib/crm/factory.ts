import "server-only";
import { getCrmProvider, isProduction } from "@/lib/env/server";
import { AppsScriptCrmClient } from "./appsScriptClient";
import { MockCrmClient } from "./mockClient";
import type { CrmClient } from "./types";

/**
 * Provider selection. CRM_PROVIDER=appscript in any environment always
 * uses the real client (and getCrmConfig() will throw its own clear error
 * if credentials are missing — env/server.ts). CRM_PROVIDER=mock in
 * production is refused unless ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true is
 * also explicitly set — SECURITY.md / ARCHITECTURE.md §2: "the
 * application must fail safely... never silently switch from a
 * production provider to a mock provider."
 */

let cachedClient: CrmClient | null = null;

export function getCrmClient(): CrmClient {
  if (cachedClient) return cachedClient;

  const provider = getCrmProvider();

  if (provider === "mock" && isProduction() && process.env.ALLOW_UNSAFE_MOCKS_IN_PRODUCTION !== "true") {
    throw new Error(
      "CRM_PROVIDER=mock is not allowed in production. Set CRM_PROVIDER=appscript with real " +
        "credentials, or explicitly set ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true if you understand " +
        "the consequences (never do this for a real deployment serving real customers).",
    );
  }

  cachedClient = provider === "appscript" ? new AppsScriptCrmClient() : new MockCrmClient();
  return cachedClient;
}

/** Test-only: forces the next getCrmClient() call to construct a fresh instance. */
export function _resetCrmClientForTests() {
  cachedClient = null;
}
