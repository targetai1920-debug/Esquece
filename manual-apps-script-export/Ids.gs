/**
 * ID generation helpers. Apps Script has no crypto.randomUUID; Utilities
 * provides good-enough randomness for our purposes (not sequential row
 * numbers, which is the property we actually need — see BOOKING_RULES.md).
 */

function generateUuid_() {
  return Utilities.getUuid();
}

/**
 * Human-readable appointment reference, e.g. "ESQ-20260721-AB12".
 * Not used for lookups that need to be unguessable — see generateManagementToken_.
 */
function generateAppointmentReference_(localDate) {
  var datePart = localDate.replace(/-/g, "");
  var randomPart = Utilities.getUuid().replace(/-/g, "").substring(0, 4).toUpperCase();
  return "ESQ-" + datePart + "-" + randomPart;
}

/**
 * Raw management token returned to the customer once, at creation time.
 * Only its hash (hashManagementToken_) is ever persisted.
 */
function generateManagementToken_() {
  var bytes = Utilities.getUuid() + Utilities.getUuid();
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes),
  ).replace(/=+$/, "");
}

function hashManagementToken_(rawToken) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawToken);
  return digest.map(function (byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

function generateNonce_() {
  return Utilities.getUuid();
}

function generateRequestId_() {
  return Utilities.getUuid();
}
