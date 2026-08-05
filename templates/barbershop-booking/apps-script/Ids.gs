function generateUuid_() {
  return Utilities.getUuid();
}

function generateReference_(localDate) {
  var datePart = localDate.replace(/-/g, "");
  var randomPart = Utilities.getUuid().replace(/-/g, "").substring(0, 4).toUpperCase();
  return "REF-" + datePart + "-" + randomPart;
}

function generateManagementToken_() {
  var bytes = Utilities.getUuid() + Utilities.getUuid();
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).replace(/=+$/, "");
}

function hashManagementToken_(rawToken) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawToken);
  return digest
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

function generateNonce_() {
  return Utilities.getUuid();
}

function generateRequestId_() {
  return Utilities.getUuid();
}
