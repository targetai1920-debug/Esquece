function requireString_(payload, field) {
  var value = payload[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Missing or invalid field: " + field, false);
  }
  return value;
}

function optionalString_(payload, field) {
  var value = payload[field];
  return typeof value === "string" ? value : undefined;
}

function requireLocalDate_(payload, field) {
  var value = requireString_(payload, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Invalid date for field: " + field, false);
  }
  return value;
}

function requireLocalTime_(payload, field) {
  var value = requireString_(payload, field);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Invalid time for field: " + field, false);
  }
  return value;
}

function requireBoolean_(payload, field, fallback) {
  var value = payload[field];
  if (value === undefined) return fallback === undefined ? false : fallback;
  if (typeof value !== "boolean") {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Invalid boolean for field: " + field, false);
  }
  return value;
}
