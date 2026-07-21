import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getAdminAuthConfig } from "@/lib/env/server";

/**
 * Signed, HTTP-only admin session cookie (SECURITY.md). Not a database-
 * backed session — the JWT itself carries the (single) admin identity;
 * `AUTH_SECRET` is what makes it unforgeable. Short-lived, server-
 * verified on every admin request via middleware.
 */

export const ADMIN_SESSION_COOKIE = "esquece_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 hours

function getSigningKey(): Uint8Array {
  const config = getAdminAuthConfig();
  if (!config) {
    throw new Error("Admin auth is not configured (ADMIN_EMAIL/ADMIN_PASSWORD_HASH/AUTH_SECRET missing).");
  }
  return new TextEncoder().encode(config.authSecret);
}

export interface AdminSessionPayload {
  email: string;
}

export async function createAdminSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSigningKey());
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey());
    if (typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_DURATION_SECONDS;
