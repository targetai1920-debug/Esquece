import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Stable response envelope every /api/public/* endpoint uses — see
 * .claude/skills/barbershop-crm-builder/references/public-api-and-booking-website.md.
 * The frontend switches on `error.code`, never on `error.message` text.
 */
export function okResponse<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, requestId: randomUUID(), data, error: null }, { status });
}

export function errorResponse(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json(
    { ok: false, requestId: randomUUID(), data: null, error: { code, message, retryable } },
    { status },
  );
}

const ERROR_STATUS: Record<string, number> = {
  SERVICE_NOT_FOUND: 404,
  STAFF_NOT_FOUND: 404,
  STAFF_NOT_ELIGIBLE: 409,
  STAFF_REQUIRED: 400,
  DATE_IN_PAST: 400,
  BELOW_MINIMUM_NOTICE: 400,
  BEYOND_MAXIMUM_ADVANCE: 400,
  STAFF_CLOSED_THAT_DAY: 409,
  ENDS_AFTER_CLOSING: 409,
  STARTS_BEFORE_OPENING: 409,
  OVERLAPS_BREAK: 409,
  SLOT_UNAVAILABLE: 409,
  APPOINTMENT_NOT_FOUND: 404,
  APPOINTMENT_NOT_CHANGEABLE: 409,
  UNAUTHORIZED: 401,
  INVALID_PAYLOAD: 400,
};

export function crmErrorToResponse(err: unknown) {
  if (err instanceof Error && "code" in err) {
    const code = (err as { code: string }).code;
    return errorResponse(code, safeMessageForCode(code), ERROR_STATUS[code] ?? 400);
  }
  return errorResponse("INTERNAL_ERROR", "Ocurrió un error interno.", 500);
}

function safeMessageForCode(code: string): string {
  const messages: Record<string, string> = {
    SLOT_UNAVAILABLE: "El horario ya no está disponible.",
    STAFF_NOT_ELIGIBLE: "Ese profesional no realiza este servicio.",
    DATE_IN_PAST: "La fecha seleccionada ya pasó.",
    BELOW_MINIMUM_NOTICE: "Se necesita más anticipación para reservar este horario.",
    BEYOND_MAXIMUM_ADVANCE: "Esa fecha está fuera del rango permitido para reservar.",
    UNAUTHORIZED: "No autorizado.",
    APPOINTMENT_NOT_CHANGEABLE: "Esta cita ya no puede modificarse.",
  };
  return messages[code] ?? "No se pudo completar la solicitud.";
}
