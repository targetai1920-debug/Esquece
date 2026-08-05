function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function successResponse_(requestId, data) {
  return jsonResponse_({ ok: true, requestId: requestId || null, data: data === undefined ? null : data, error: null, meta: { version: API_VERSION } });
}

function errorResponseFromException_(requestId, err) {
  var code = ERROR_CODES.INTERNAL_ERROR;
  var message = "Internal error.";
  var retryable = false;
  if (err && err.name === "ApiError") {
    code = err.code;
    message = err.message;
    retryable = err.retryable;
  } else if (err && err.message) {
    // Never leak a raw exception message/stack from unexpected failures —
    // log it server-side (Logger.log), respond with a generic code only.
    Logger.log("Unexpected error: " + err.message + (err.stack ? "\n" + err.stack : ""));
  }
  return jsonResponse_({ ok: false, requestId: requestId || null, data: null, error: { code: code, message: message, retryable: retryable }, meta: { version: API_VERSION } });
}
