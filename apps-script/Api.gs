/**
 * Web App entry points. See API_CONTRACT.md for the full request/response
 * contract and SECURITY.md for the signing model.
 *
 * doGet is intentionally unauthenticated and returns no business data —
 * it exists only so hitting the deployed URL in a browser doesn't error,
 * and as a trivial reachability check. The real API is doPost, called
 * only from the Next.js server with a signed envelope (never the browser).
 */

function doGet(e) {
  return jsonResponse_({
    ok: true,
    requestId: null,
    data: {
      service: "esquece-crm",
      apiVersion: API_VERSION,
      message: "Use POST with a signed request envelope. See API_CONTRACT.md.",
    },
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
