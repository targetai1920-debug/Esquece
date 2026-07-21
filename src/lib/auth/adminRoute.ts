import "server-only";
import { type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken, type AdminSessionPayload } from "./session";
import { getPublicAppUrl } from "@/lib/env/server";
import { errorJson, errorJsonFromException, generateRequestId, successJson } from "@/lib/http/envelope";
import { logger } from "@/lib/logging/logger";

/**
 * Shared wrapper for every /api/admin/* route handler. `middleware.ts` is
 * the first line of defense (rejects unauthenticated requests before a
 * route handler even runs), but every handler re-verifies the session
 * itself too — defense in depth, and it's what gives the handler the
 * admin identity to record on audit entries.
 */

type RouteContext = { params: Promise<Record<string, string>> };
type Handler<T> = (request: NextRequest, context: RouteContext, admin: AdminSessionPayload) => Promise<T>;

export async function getAdminSessionFromRequest(request: NextRequest): Promise<AdminSessionPayload | null> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

/**
 * CSRF defense for state-changing admin requests: the session cookie is
 * SameSite=Lax (blocks cross-site form posts/fetches from ever attaching
 * it), and this checks the Origin header actually matches this app when
 * present. Browsers always send Origin on cross-origin fetches and on
 * same-origin state-changing requests in modern browsers, so an absent
 * Origin is treated as same-origin (older/simple requests) rather than
 * rejected outright.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const appUrl = new URL(getPublicAppUrl());
    return originUrl.host === appUrl.host;
  } catch {
    return false;
  }
}

export interface AdminRouteConfig {
  /** Set for anything that mutates data — GET reads don't need it. */
  enforceOrigin?: boolean;
}

export function adminApiRoute<T>(config: AdminRouteConfig, handler: Handler<T>) {
  return async function (request: NextRequest, context: RouteContext) {
    const requestId = generateRequestId();
    const start = Date.now();

    const admin = await getAdminSessionFromRequest(request);
    if (!admin) {
      return errorJson(requestId, "UNAUTHORIZED", "Sesión inválida o expirada.");
    }

    if (config.enforceOrigin && !isSameOriginRequest(request)) {
      logger.warn("Rejected admin request from unapproved origin", { requestId });
      return errorJson(requestId, "UNAUTHORIZED", "Origen no permitido.");
    }

    try {
      const data = await handler(request, context, admin);
      logger.info("Admin API request succeeded", { requestId, durationMs: Date.now() - start });
      return successJson(requestId, data);
    } catch (err) {
      logger.error("Admin API request failed", { requestId, durationMs: Date.now() - start });
      return errorJsonFromException(requestId, err);
    }
  };
}
