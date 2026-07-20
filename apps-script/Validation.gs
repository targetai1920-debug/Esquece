/**
 * Generic payload validators. Every action handler validates its own
 * payload independently of whatever validated the signed envelope itself
 * (SECURITY.md — "the engine does not assume its caller already checked
 * everything"). Throw ApiError(INVALID_PAYLOAD, ...) on failure.
 */

function requireString_(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Campo requerido: " + fieldName, false);
  }
  return value.trim();
}

function optionalString_(value, fallback) {
  if (value === undefined || value === null) return fallback === undefined ? "" : fallback;
  if (typeof value !== "string") {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Se esperaba texto.", false);
  }
  return value.trim();
}

function requireBoolean_(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Campo requerido (booleano): " + fieldName, false);
  }
  return value;
}

function requirePositiveNumber_(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Campo requerido (número positivo): " + fieldName, false);
  }
  return value;
}

function requireLocalDate_(value, fieldName) {
  var str = requireString_(value, fieldName);
  if (!isValidLocalDate_(str)) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Fecha inválida (" + fieldName + "), formato esperado YYYY-MM-DD.", false);
  }
  return str;
}

function requireLocalTime_(value, fieldName) {
  var str = requireString_(value, fieldName);
  if (!isValidLocalTime_(str)) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Hora inválida (" + fieldName + "), formato esperado HH:mm.", false);
  }
  return str;
}

/**
 * Defensive E.164-ish check. The authoritative normalization happens
 * Next.js-side (lib/whatsapp/phone.ts) before a request ever reaches this
 * API — this is a second, independent check, not a duplicate source of
 * truth for the normalization algorithm itself.
 */
var E164_ISH_PATTERN_ = /^\+?[1-9]\d{6,14}$/;
function requirePhoneE164_(value, fieldName) {
  var str = requireString_(value, fieldName);
  var normalized = str.replace(/[+\s]/g, "");
  if (!E164_ISH_PATTERN_.test("+" + normalized)) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Número de teléfono inválido (" + fieldName + ").", false);
  }
  return normalized;
}

function requireOneOf_(value, allowedValues, fieldName) {
  if (allowedValues.indexOf(value) === -1) {
    throw new ApiError(
      ERROR_CODES.INVALID_PAYLOAD,
      "Valor inválido para " + fieldName + ": debe ser uno de " + allowedValues.join(", "),
      false,
    );
  }
  return value;
}
