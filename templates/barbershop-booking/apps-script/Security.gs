/**
 * Request authentication. See
 * .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md
 * for the full contract and the specific reason UTF-8 must be explicit
 * below (a real production bug in the pilot project this was generalized
 * from — signatures over non-ASCII text silently diverged from the Node
 * side when this used the 2-argument HMAC overload).
 *
 * canonicalString = version + "\n" + timestamp + "\n" + nonce + "\n"
 *                  + requestId + "\n" + action + "\n" + stableJson(payload)
 * signature = lowercase-hex( HMAC-SHA256(canonicalString, CRM_SIGNING_SECRET) )
 *
 * MUST stay byte-identical to the Next.js implementation
 * (src/lib/crm/signing.ts) — see tests/signing.test.ts (Node) and Tests.gs
 * (this project) for the shared vectors that catch any drift, including
 * Unicode ones.
 */

var SUPPORTED_ENVELOPE_VERSION = "1";

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
    return "[" + value.map(stableStringifyValue_).join(",") + "]";
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
  // Explicit UTF_8 charset — required for byte-identical signatures with
  // the Node side whenever the canonical string contains non-ASCII text
  // (accented characters, emoji). See this file's header comment.
  var bytes = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
  return bytes
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

function constantTimeEquals_(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

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

  // Only mark the nonce as used once fully authenticated — a replayed bad
  // signature shouldn't be able to burn a legitimate caller's nonce.
  cache.put(nonceCacheKey, "1", NONCE_CACHE_TTL_SECONDS);
}
