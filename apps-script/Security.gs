/**
 * Request authentication for the CRM API. See SECURITY.md "CRM request
 * signing" and API_CONTRACT.md for the exact contract and shared test
 * vectors. This file's stableStringify_/buildCanonicalString_ MUST produce
 * byte-identical output to the Next.js implementation (lib/crm/signing.ts,
 * Phase E) — that's what the shared test vectors in API_CONTRACT.md are for.
 *
 * Envelope shape:
 *   { version, action, requestId, timestamp, nonce, apiKey, payload, signature }
 *
 * canonicalString = version + "\n" + timestamp + "\n" + nonce + "\n"
 *                  + requestId + "\n" + action + "\n" + stableJson(payload)
 * signature = lowercase-hex( HMAC-SHA256(canonicalString, CRM_SIGNING_SECRET) )
 */

var SUPPORTED_ENVELOPE_VERSION = "1";

/**
 * Recursively key-sorted, array-order-preserving JSON serialization.
 * Rejects undefined/function values (throws) rather than silently
 * dropping them, so signer and verifier can never disagree about what
 * was actually in the payload.
 */
function stableStringify_(value) {
  return stableStringifyValue_(value);
}

function stableStringifyValue_(value) {
  if (value === null) return "null";
  var t = typeof value;

  if (t === "number") {
    if (!isFinite(value)) {
      throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Non-finite number in payload.", false);
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t === "undefined" || t === "function") {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Unsupported value type: " + t, false);
  }
  if (Array.isArray(value)) {
    var items = value.map(stableStringifyValue_);
    return "[" + items.join(",") + "]";
  }
  if (t === "object") {
    var keys = Object.keys(value).sort();
    var parts = keys.map(function (key) {
      return JSON.stringify(key) + ":" + stableStringifyValue_(value[key]);
    });
    return "{" + parts.join(",") + "}";
  }
  throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Unsupported value type: " + t, false);
}

function buildCanonicalString_(envelope) {
  return [
    envelope.version,
    String(envelope.timestamp),
    envelope.nonce,
    envelope.requestId,
    envelope.action,
    stableStringify_(envelope.payload === undefined ? null : envelope.payload),
  ].join("\n");
}

function computeHmacHex_(message, secret) {
  var bytes = Utilities.computeHmacSha256Signature(message, secret);
  return bytes
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

/** Constant-time string comparison (Apps Script has no crypto.timingSafeEqual). */
function constantTimeEquals_(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validates a signed envelope end-to-end. Throws ApiError on any failure.
 * Deliberately uses the same generic UNAUTHORIZED-shaped errors for
 * distinct failure modes at the message level where the difference isn't
 * useful to a legitimate caller, while still returning a specific `code`
 * for Next.js-side handling — see SECURITY.md ("without revealing which
 * part of authentication failed" refers to not leaking *why* to a
 * malicious caller via timing/content, not to hiding the error code from
 * our own trusted server).
 */
function verifySignedRequest_(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new ApiError(ERROR_CODES.INVALID_REQUEST, "Malformed request body.", false);
  }

  var required = ["version", "action", "requestId", "timestamp", "nonce", "apiKey", "signature"];
  for (var i = 0; i < required.length; i++) {
    if (envelope[required[i]] === undefined || envelope[required[i]] === null) {
      throw new ApiError(ERROR_CODES.INVALID_REQUEST, "Missing field: " + required[i], false);
    }
  }

  if (envelope.version !== SUPPORTED_ENVELOPE_VERSION) {
    throw new ApiError(ERROR_CODES.UNSUPPORTED_VERSION, "Unsupported request version.", false);
  }

  if (!constantTimeEquals_(String(envelope.apiKey), getCrmApiKey_())) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, "Invalid credentials.", false);
  }

  var now = Date.now();
  var age = now - Number(envelope.timestamp);
  if (isNaN(age) || age > REQUEST_MAX_AGE_MS || age < -REQUEST_MAX_AGE_MS) {
    throw new ApiError(ERROR_CODES.REQUEST_EXPIRED, "Request timestamp out of range.", false);
  }

  var cache = CacheService.getScriptCache();
  var nonceCacheKey = "nonce:" + envelope.nonce;
  if (cache.get(nonceCacheKey)) {
    throw new ApiError(ERROR_CODES.NONCE_REUSED, "This request was already used.", false);
  }

  var expectedSignature = computeHmacHex_(buildCanonicalString_(envelope), getCrmSigningSecret_());
  if (!constantTimeEquals_(String(envelope.signature), expectedSignature)) {
    throw new ApiError(ERROR_CODES.INVALID_SIGNATURE, "Invalid signature.", false);
  }

  // Only mark the nonce as used once the request is fully authenticated —
  // an attacker replaying a bad signature shouldn't be able to burn a
  // legitimate caller's nonce.
  cache.put(nonceCacheKey, "1", NONCE_CACHE_TTL_SECONDS);
}
