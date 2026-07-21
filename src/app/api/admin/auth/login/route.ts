import { type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminAuthConfig, isProduction } from "@/lib/env/server";
import { verifyPassword } from "@/lib/auth/password";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSessionToken } from "@/lib/auth/session";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/http/rateLimit";
import { errorJson, errorJsonFromException, generateRequestId, successJson } from "@/lib/http/envelope";
import { parseJsonBody } from "@/lib/http/publicRoute";
import { logger } from "@/lib/logging/logger";

/**
 * Admin login (SECURITY.md — MVP approach: ADMIN_EMAIL + ADMIN_PASSWORD_HASH
 * + AUTH_SECRET). Rate-limited per IP independent of the public API's
 * buckets. Never logs the submitted password, never returns the hash.
 */

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const ip = getClientIp(request);
  const rate = checkRateLimit(`admin-login:${ip}`, RATE_LIMITS.adminLogin);
  if (!rate.allowed) {
    const response = errorJson(requestId, "RATE_LIMITED", "Demasiados intentos. Intenta de nuevo en unos minutos.", true);
    response.headers.set("Retry-After", String(Math.ceil((rate.resetAtMs - Date.now()) / 1000)));
    return response;
  }

  try {
    const body = await parseJsonBody(request, loginSchema);
    const config = getAdminAuthConfig();
    if (!config) {
      logger.error("Admin login attempted but admin auth is not configured", { requestId });
      return errorJson(requestId, "INTERNAL_ERROR", "El acceso de administrador no está configurado.");
    }

    // Always run the (constant-cost) password check, even on an email
    // mismatch, so response timing doesn't reveal whether the email matched.
    const passwordMatches = await verifyPassword(body.password, config.passwordHash);
    const emailMatches = body.email.trim().toLowerCase() === config.email.trim().toLowerCase();

    if (!emailMatches || !passwordMatches) {
      logger.warn("Admin login failed", { requestId });
      return errorJson(requestId, "UNAUTHORIZED", "Correo o contraseña incorrectos.");
    }

    const token = await createAdminSessionToken(config.email);
    const response = successJson(requestId, { email: config.email });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    logger.info("Admin login succeeded", { requestId });
    return response;
  } catch (err) {
    return errorJsonFromException(requestId, err);
  }
}
