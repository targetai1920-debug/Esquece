function serviceRowToObject_(row) {
  return {
    id: row.serviceId,
    name: row.name,
    description: row.description || "",
    price: Number(row.price),
    currency: row.currency,
    durationMinutes: Number(row.durationMinutes),
    bufferMinutes: Number(row.bufferMinutes || 0),
    active: String(row.active) === "true",
    image: row.image || "",
  };
}

function actionListServices_() {
  var rows = sheetToObjects_(SHEET_NAMES.SERVICES).filter(function (r) {
    return String(r.active) === "true";
  });
  return { services: rows.map(serviceRowToObject_) };
}

function actionAdminListServices_() {
  return { services: sheetToObjects_(SHEET_NAMES.SERVICES).map(serviceRowToObject_) };
}

function requireActiveService_(serviceId) {
  var row = findRowById_(SHEET_NAMES.SERVICES, "serviceId", serviceId);
  if (!row || String(row.active) !== "true") {
    throw new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Service not found or inactive.", false);
  }
  return serviceRowToObject_(row);
}

function actionAdminSetServiceActive_(payload) {
  var serviceId = requireString_(payload, "serviceId");
  var active = requireBoolean_(payload, "active");
  var updated = updateRowById_(SHEET_NAMES.SERVICES, "serviceId", serviceId, { active: active, updatedAt: new Date().toISOString() });
  if (!updated) throw new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Service not found.", false);
  writeAuditEntry_("setServiceActive", "Service", serviceId, "admin", { active: active });
  return { service: serviceRowToObject_(updated) };
}

function actionAdminSetServicePrice_(payload) {
  var serviceId = requireString_(payload, "serviceId");
  var price = payload.price;
  if (typeof price !== "number" || !isFinite(price) || price < 0) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Invalid price.", false);
  }
  var updated = updateRowById_(SHEET_NAMES.SERVICES, "serviceId", serviceId, { price: price, updatedAt: new Date().toISOString() });
  if (!updated) throw new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Service not found.", false);
  writeAuditEntry_("setServicePrice", "Service", serviceId, "admin", { price: price });
  return { service: serviceRowToObject_(updated) };
}
