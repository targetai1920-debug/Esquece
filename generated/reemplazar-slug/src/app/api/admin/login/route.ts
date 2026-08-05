import { z } from "zod";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_SECONDS, createSessionToken, verifyAdminCredentials } from "@/lib/admin/auth";
import { errorResponse } from "@/lib/http/envelope";

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return errorResponse("INVALID_PAYLOAD", "Solicitud inválida.", 400);

  const valid = await verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!valid) return errorResponse("UNAUTHORIZED", "Credenciales inválidas.", 401);

  const token = await createSessionToken(parsed.data.email);
  const response = NextResponse.json({ ok: true, requestId: crypto.randomUUID(), data: { ok: true }, error: null });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/",
  });
  return response;
}
