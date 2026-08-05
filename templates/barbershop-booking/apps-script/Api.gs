/**
 * Web App entry points. doGet is unauthenticated and returns no business
 * data — a trivial reachability check. doPost is the real API, called only
 * from the Next.js server with a signed envelope, never the browser.
 */

function doGet(e) {
  return jsonResponse_({
    ok: true,
    requestId: null,
    data: { service: "barbershop-crm", apiVersion: API_VERSION, message: "Use POST with a signed request envelope." },
    error: null,
    meta: { version: API_VERSION },
  });
}

function doPost(e) {
  var requestId = null;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new ApiError(ERROR_CODES.INVALID_REQUEST, "Missing request body.", false);
    }
    var envelope;
    try {
      envelope = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new ApiError(ERROR_CODES.INVALID_REQUEST, "Request body is not valid JSON.", false);
    }
    requestId = envelope && envelope.requestId ? envelope.requestId : null;

    verifySignedRequest_(envelope);

    var data = routeAction_(envelope.action, envelope.payload);
    return successResponse_(requestId, data);
  } catch (err) {
    return errorResponseFromException_(requestId, err);
  }
}
