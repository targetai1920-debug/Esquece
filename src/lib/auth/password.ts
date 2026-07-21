import "server-only";
import bcrypt from "bcryptjs";

/**
 * Admin password hashing (SECURITY.md — "MVP approach: ADMIN_EMAIL +
 * ADMIN_PASSWORD_HASH environment variables"). Only the hash ever lives
 * in the environment; the plaintext password is never stored or logged.
 */

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
