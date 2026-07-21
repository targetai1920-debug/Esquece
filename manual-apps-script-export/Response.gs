/**
 * Standard JSON response envelopes. See API_CONTRACT.md for the exact shape.
 * Never include stack traces, spreadsheet IDs, or secrets in a response.
 */

var API_VERSION = "1";

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function successResponse_(requestId, data) {
  return jsonResponse_({
    ok: true,
    requestId: requestId || null,
    data: data === undefined ? null : data,
    error: null,
    meta: { version: API_VERSION },
  });
}

function errorResponse_(requestId, code, message, retryable, details) {
  return jsonResponse_({
    ok: false,
    requestId: requestId || null,
    data: null,
    error: {
      code: code,
      message: message,
      retryable: !!retryable,
      details: details || null,
    },
    meta: { version: API_VERSION },
  });
}

/**
 * Converts any thrown value into a safe error response. ApiError instances
 * (Errors.gs) map directly; anything else becomes a generic INTERNAL_ERROR
 * with a safe message — the original error is logged (Logger.log), not
 * exposed, so a bug in our code never leaks internals to the caller.
 */
function errorResponseFromException_(requestId, err) {
  if (err && err.name === "ApiError") {
    return errorResponse_(requestId, err.code, err.message, err.retryable);
  }
  Logger.log("Unhandled error: " + (err && err.stack ? err.stack : err));
  return errorResponse_(
    requestId,
    ERROR_CODES.INTERNAL_ERROR,
    "Ocurrió un error interno. Intenta de nuevo en unos minutos.",
    true,
  );
}
