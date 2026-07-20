/**
 * Centralized CRM error codes. Keep in sync with the Next.js-side error
 * mapping (lib/crm, Phase E) — see API_CONTRACT.md.
 *
 * Never let a raw JS exception message reach the HTTP response; always
 * translate to one of these codes via ApiError (see Response.gs).
 */
var ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  REQUEST_EXPIRED: "REQUEST_EXPIRED",
  NONCE_REUSED: "NONCE_REUSED",
  INVALID_REQUEST: "INVALID_REQUEST",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  NOT_FOUND: "NOT_FOUND",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  SERVICE_NOT_FOUND: "SERVICE_NOT_FOUND",
  BARBER_NOT_FOUND: "BARBER_NOT_FOUND",
  SERVICE_INACTIVE: "SERVICE_INACTIVE",
  BARBER_INACTIVE: "BARBER_INACTIVE",
  BARBER_NOT_ELIGIBLE: "BARBER_NOT_ELIGIBLE",
  BUSINESS_CLOSED: "BUSINESS_CLOSED",
  WEEKEND_CLOSED: "WEEKEND_CLOSED",
  OUTSIDE_BUSINESS_HOURS: "OUTSIDE_BUSINESS_HOURS",
  DATE_IN_PAST: "DATE_IN_PAST",
  BOOKING_TOO_SOON: "BOOKING_TOO_SOON",
  BOOKING_TOO_FAR_IN_ADVANCE: "BOOKING_TOO_FAR_IN_ADVANCE",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  APPOINTMENT_NOT_FOUND: "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_ALREADY_CANCELLED: "APPOINTMENT_ALREADY_CANCELLED",
  APPOINTMENT_NOT_CHANGEABLE: "APPOINTMENT_NOT_CHANGEABLE",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  LOCK_TIMEOUT: "LOCK_TIMEOUT",
  CONVERSATION_CONFLICT: "CONVERSATION_CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  CALENDAR_SYNC_FAILED: "CALENDAR_SYNC_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

/**
 * Throw this from anywhere in the CRM implementation. Router.gs catches it
 * and turns it into the standard error envelope (Response.gs) — callers
 * never see a raw stack trace or an unmapped error.
 */
function ApiError(code, message, retryable) {
  this.name = "ApiError";
  this.code = code || ERROR_CODES.INTERNAL_ERROR;
  this.message = message || "Internal error.";
  this.retryable = !!retryable;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;
