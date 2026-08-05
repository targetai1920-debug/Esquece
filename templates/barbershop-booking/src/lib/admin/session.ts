import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "./auth";

/** Shared by the admin page (redirects when absent) and every Server Action (throws when absent). */
export async function getAdminSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return token ? await verifySessionToken(token) : null;
}
