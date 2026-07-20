import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { CrmError, messageForCrmError, type CrmErrorCode } from "@/lib/crm/errors";

/**
 * Standard response envelope for every /api/public/* route — see
 * WEBSITE_INTEGRATION.md. Mirrors the same {ok, requestId, data, error}
 * shape the Apps Script CRM API itself uses (API_CONTRACT.md), so the
 * separate website only has to learn one envelope format even though two
 * different backends (this API, and this API's own call to Apps Script)
 * are involved.
 */

export function generateRequestId(): string {
  return randomUUID();
}

export function successJson(requestId: string, data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, requestId, data, error: null }, init);
}

const HTTP_STATUS_BY_CODE: Partial<Record<CrmErrorCode, number>> = {
  UNAUTHORIZED: 401,
  INVALID_SIGNATURE: 401,
  REQUEST_EXPIRED: 401,
  NONCE_REUSED: 401,
  INVALID_REQUEST: 400,
  INVALID_PAYLOAD: 400,
  UNSUPPORTED_VERSION: 400,
  UNSUPPORTED_ACTION: 400,
  NOT_FOUND: 404,
  CUSTOMER_NOT_FOUND: 404,
  SERVICE_NOT_FOUND: 404,
  BARBER_NOT_FOUND: 404,
  APPOINTMENT_NOT_FOUND: 404,
  SERVICE_INACTIVE: 409,
  BARBER_INACTIVE: 409,
  BARBER_NOT_ELIGIBLE: 409,
  BUSINESS_CLOSED: 409,
  WEEKEND_CLOSED: 409,
  OUTSIDE_BUSINESS_HOURS: 409,
  DATE_IN_PAST: 409,
  BOOKING_TOO_SOON: 409,
  BOOKING_TOO_FAR_IN_ADVANCE: 409,
  SLOT_UNAVAILABLE: 409,
  APPOINTMENT_ALREADY_CANCELLED: 409,
  APPOINTMENT_NOT_CHANGEABLE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CONVERSATION_CONFLICT: 409,
  RATE_LIMITED: 429,
  LOCK_TIMEOUT: 503,
  CALENDAR_SYNC_FAILED: 502,
  CRM_TIMEOUT: 504,
  CRM_UNREACHABLE: 502,
  CRM_INVALID_RESPONSE: 502,
  INTERNAL_ERROR: 500,
};

export function errorJson(requestId: string, code: CrmErrorCode, message?: string, retryable?: boolean) {
  const status = HTTP_STATUS_BY_CODE[code] ?? 500;
  return NextResponse.json(
    {
      ok: false,
      requestId,
      data: null,
      error: { code, message: message || messageForCrmError(code), retryable: retryable ?? false },
    },
    { status },
  );
}

/** Converts any caught error into the standard error envelope — never a raw stack trace. */
export function errorJsonFromException(requestId: string, err: unknown) {
  if (err instanceof CrmError) {
    return errorJson(requestId, err.code, err.message, err.retryable);
  }
  return errorJson(requestId, "INTERNAL_ERROR");
}
