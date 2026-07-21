import { ADMIN_SESSION_COOKIE } from "@/lib/auth/session";
import { generateRequestId, successJson } from "@/lib/http/envelope";

export async function POST() {
  const requestId = generateRequestId();
  const response = successJson(requestId, { loggedOut: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
