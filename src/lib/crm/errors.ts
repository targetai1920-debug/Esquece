/**
 * Mirrors apps-script/Errors.gs's ERROR_CODES exactly — see API_CONTRACT.md.
 * Every CrmClient implementation throws CrmError, never a raw Error, so
 * every caller (API routes, WhatsApp handler, admin actions) can handle
 * failures uniformly.
 */

export const CRM_ERROR_CODES = [
  "UNAUTHORIZED",
  "INVALID_SIGNATURE",
  "REQUEST_EXPIRED",
  "NONCE_REUSED",
  "INVALID_REQUEST",
  "UNSUPPORTED_VERSION",
  "UNSUPPORTED_ACTION",
  "INVALID_PAYLOAD",
  "NOT_FOUND",
  "CUSTOMER_NOT_FOUND",
  "SERVICE_NOT_FOUND",
  "BARBER_NOT_FOUND",
  "SERVICE_INACTIVE",
  "BARBER_INACTIVE",
  "BARBER_NOT_ELIGIBLE",
  "BUSINESS_CLOSED",
  "WEEKEND_CLOSED",
  "OUTSIDE_BUSINESS_HOURS",
  "DATE_IN_PAST",
  "BOOKING_TOO_SOON",
  "BOOKING_TOO_FAR_IN_ADVANCE",
  "SLOT_UNAVAILABLE",
  "APPOINTMENT_NOT_FOUND",
  "APPOINTMENT_ALREADY_CANCELLED",
  "APPOINTMENT_NOT_CHANGEABLE",
  "IDEMPOTENCY_CONFLICT",
  "LOCK_TIMEOUT",
  "CONVERSATION_CONFLICT",
  "RATE_LIMITED",
  "CALENDAR_SYNC_FAILED",
  "INTERNAL_ERROR",
  // Client-side-only codes, never returned by Apps Script itself:
  "CRM_TIMEOUT",
  "CRM_UNREACHABLE",
  "CRM_INVALID_RESPONSE",
] as const;

export type CrmErrorCode = (typeof CRM_ERROR_CODES)[number];

export class CrmError extends Error {
  code: CrmErrorCode;
  retryable: boolean;
  details?: unknown;

  constructor(code: CrmErrorCode, message: string, retryable = false, details?: unknown) {
    super(message);
    this.name = "CrmError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Safe, Spanish, customer-facing default messages — callers (API routes,
 * WhatsApp handler) may override per-context, but this is the fallback so
 * nothing ever surfaces an English/technical string to a customer.
 */
export const CRM_ERROR_MESSAGES_ES: Record<CrmErrorCode, string> = {
  UNAUTHORIZED: "No autorizado.",
  INVALID_SIGNATURE: "Solicitud inválida.",
  REQUEST_EXPIRED: "La solicitud expiró, intenta de nuevo.",
  NONCE_REUSED: "Solicitud duplicada.",
  INVALID_REQUEST: "Solicitud inválida.",
  UNSUPPORTED_VERSION: "Versión no soportada.",
  UNSUPPORTED_ACTION: "Acción no soportada.",
  INVALID_PAYLOAD: "Datos inválidos.",
  NOT_FOUND: "No encontrado.",
  CUSTOMER_NOT_FOUND: "Cliente no encontrado.",
  SERVICE_NOT_FOUND: "Servicio no encontrado.",
  BARBER_NOT_FOUND: "Barbero no encontrado.",
  SERVICE_INACTIVE: "Este servicio ya no está disponible.",
  BARBER_INACTIVE: "Este barbero ya no está disponible.",
  BARBER_NOT_ELIGIBLE: "Este barbero no realiza ese servicio.",
  BUSINESS_CLOSED: "No tenemos atención ese día.",
  WEEKEND_CLOSED: "Los sábados y domingos no tenemos atención.",
  OUTSIDE_BUSINESS_HOURS: "Ese horario está fuera de nuestro horario de atención.",
  DATE_IN_PAST: "No se puede reservar en una fecha u hora pasada.",
  BOOKING_TOO_SOON: "Necesitamos un poco más de anticipación para esa hora.",
  BOOKING_TOO_FAR_IN_ADVANCE: "Esa fecha está demasiado lejos todavía.",
  SLOT_UNAVAILABLE: "El horario ya no está disponible.",
  APPOINTMENT_NOT_FOUND: "Cita no encontrada.",
  APPOINTMENT_ALREADY_CANCELLED: "Esta cita ya fue cancelada.",
  APPOINTMENT_NOT_CHANGEABLE: "Esta cita ya no se puede modificar.",
  IDEMPOTENCY_CONFLICT: "Ya se procesó una solicitud distinta con esta misma referencia.",
  LOCK_TIMEOUT: "El sistema está ocupado, intenta de nuevo en unos segundos.",
  CONVERSATION_CONFLICT: "Hubo un conflicto actualizando la conversación, intenta de nuevo.",
  RATE_LIMITED: "Demasiadas solicitudes, intenta de nuevo en un momento.",
  CALENDAR_SYNC_FAILED: "No se pudo sincronizar con el calendario (la cita sigue válida).",
  INTERNAL_ERROR: "Ocurrió un error interno. Intenta de nuevo en unos minutos.",
  CRM_TIMEOUT: "El sistema tardó demasiado en responder, intenta de nuevo.",
  CRM_UNREACHABLE: "No se pudo conectar con el sistema, intenta de nuevo en unos minutos.",
  CRM_INVALID_RESPONSE: "Ocurrió un error interno. Intenta de nuevo en unos minutos.",
};

export function messageForCrmError(code: CrmErrorCode): string {
  return CRM_ERROR_MESSAGES_ES[code] || CRM_ERROR_MESSAGES_ES.INTERNAL_ERROR;
}

export function isCrmErrorCode(value: string): value is CrmErrorCode {
  return (CRM_ERROR_CODES as readonly string[]).includes(value);
}
