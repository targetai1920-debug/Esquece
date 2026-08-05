import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

/**
 * MVP admin auth: one configured admin identity, a securely hashed
 * password, a signed session cookie. See
 * .claude/skills/barbershop-crm-builder/references/admin-dashboard.md —
 * a single shared account is an explicit, stated tradeoff for a small
 * single-location business, not an oversight.
 */

const COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return new TextEncoder().encode(secret);
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  if (!configuredEmail || !configuredHash) return false;
  if (email.trim().toLowerCase() !== configuredEmail.trim().toLowerCase()) return false;
  return bcrypt.compare(password, configuredHash);
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { email: String(payload.email) };
  } catch {
    return null;
  }
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
