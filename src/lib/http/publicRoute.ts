import { NextResponse, type NextRequest } from "next/server";
import { applyCors, isOriginAllowed } from "./cors";
import { checkRateLimit, getClientIp, type RateLimitConfig } from "./rateLimit";
import { errorJson, errorJsonFromException, generateRequestId, successJson } from "./envelope";
import { logger } from "@/lib/logging/logger";

/**
 * Shared wrapper for every /api/public/* route handler — applies CORS,
 * origin validation (defense in depth beyond the browser's own CORS
 * enforcement, per master spec §4 "validate request origin for
 * browser-based mutations"), rate limiting, and uniform error-to-envelope
 * mapping, so individual route files only implement their actual logic.
 */

type RouteContext = { params: Promise<Record<string, string>> };
type Handler<T> = (request: NextRequest, context: RouteContext) => Promise<T>;

export interface PublicRouteConfig {
  rateLimit: RateLimitConfig;
  rateLimitKey: string;
  /** Reject cross-origin requests from an unapproved Origin — set for anything that mutates data. */
  enforceOrigin?: boolean;
}

export function publicApiRoute<T>(config: PublicRouteConfig, handler: Handler<T>) {
  return async function (request: NextRequest, context: RouteContext) {
    const requestId = generateRequestId();
    const start = Date.now();
    const origin = request.headers.get("origin");

    if (config.enforceOrigin && origin && !isOriginAllowed(origin)) {
      logger.warn("Rejected request from unapproved origin", { requestId, operation: config.rateLimitKey });
      return applyCors(request, errorJson(requestId, "UNAUTHORIZED", "Origen no permitido."));
    }

    const rateLimitId = `${config.rateLimitKey}:${getClientIp(request)}`;
    const rate = checkRateLimit(rateLimitId, config.rateLimit);
    if (!rate.allowed) {
      const response = errorJson(requestId, "RATE_LIMITED", undefined, true);
      response.headers.set("Retry-After", String(Math.ceil((rate.resetAtMs - Date.now()) / 1000)));
      return applyCors(request, response);
    }

    try {
      const data = await handler(request, context);
      logger.info("Public API request succeeded", { requestId, operation: config.rateLimitKey, durationMs: Date.now() - start });
      return applyCors(request, successJson(requestId, data));
    } catch (err) {
      logger.error("Public API request failed", { requestId, operation: config.rateLimitKey, durationMs: Date.now() - start });
      return applyCors(request, errorJsonFromException(requestId, err));
    }
  };
}

export function publicApiPreflight() {
  return async function OPTIONS(request: NextRequest) {
    const { handlePreflight } = await import("./cors");
    return handlePreflight(request);
  };
}

/** No booking-related payload this API accepts is anywhere near this size — a generous ceiling against oversized/abusive request bodies (Phase K hardening). */
export const MAX_REQUEST_BODY_BYTES = 100_000;

/** Parses and validates a JSON body against a Zod schema, throwing a safe CrmError on failure. Enforces MAX_REQUEST_BODY_BYTES before ever attempting to parse. */
export async function parseJsonBody<T>(request: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  const { CrmError } = await import("@/lib/crm/errors");

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    throw new CrmError("INVALID_REQUEST", "El cuerpo de la solicitud es demasiado grande.", false);
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    throw new CrmError("INVALID_REQUEST", "El cuerpo de la solicitud no es JSON válido.", false);
  }
  // Belt-and-suspenders — Content-Length can be absent or spoofed; this checks the bytes actually received.
  if (rawText.length > MAX_REQUEST_BODY_BYTES) {
    throw new CrmError("INVALID_REQUEST", "El cuerpo de la solicitud es demasiado grande.", false);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new CrmError("INVALID_REQUEST", "El cuerpo de la solicitud no es JSON válido.", false);
  }
  try {
    return schema.parse(raw);
  } catch {
    throw new CrmError("INVALID_PAYLOAD", "Datos inválidos.", false);
  }
}

export { NextResponse };
