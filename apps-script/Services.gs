/**
 * SERVICES sheet access. Public read actions plus admin CRUD (Phase G) —
 * write actions were deliberately deferred until the admin screens that
 * call them existed, to avoid speculative unused API surface (see
 * PROJECT_PLAN.md guardrails); they're added now, alongside those screens.
 */

function getServicesSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.SERVICES);
}

function getServiceById_(serviceId) {
  return findRowById_(getServicesSheet_(), "serviceId", serviceId);
}

function requireActiveService_(serviceId) {
  var service = getServiceById_(serviceId);
  if (!service) {
    throw new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Servicio no encontrado.", false);
  }
  if (service.active !== true && service.active !== "true" && service.active !== "TRUE") {
    throw new ApiError(ERROR_CODES.SERVICE_INACTIVE, "Este servicio ya no está disponible.", false);
  }
  return service;
}

function sortByDisplayOrder_(rows) {
  return rows.slice().sort(function (a, b) {
    return (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0);
  });
}

function actionListServices_() {
  var rows = findRowsWhere_(getServicesSheet_(), function (row) {
    return row.active === true || row.active === "true" || row.active === "TRUE";
  });
  return { services: sortByDisplayOrder_(rows) };
}

function actionGetService_(payload) {
  var serviceId = requireString_(payload && payload.serviceId, "serviceId");
  return { service: requireActiveService_(serviceId) };
}

// --- Admin (Phase G) ---

function actionAdminListServices_() {
  return { services: sortByDisplayOrder_(sheetToObjects_(getServicesSheet_())) };
}

function actionAdminCreateService_(payload) {
  var sheet = getServicesSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.SERVICES];
  var service = insertRow_(sheet, headers, {
    serviceId: generateEntityId_("svc"),
    name: requireString_(payload && payload.name, "name"),
    description: optionalString_(payload && payload.description),
    price: requirePositiveNumber_(payload && payload.price, "price"),
    currency: optionalString_(payload && payload.currency, "BOB"),
    durationMinutes: requirePositiveNumber_(payload && payload.durationMinutes, "durationMinutes"),
    bufferMinutes: (payload && payload.bufferMinutes) || 0,
    category: optionalString_(payload && payload.category),
    imageUrl: optionalString_(payload && payload.imageUrl),
    active: payload && payload.active !== undefined ? requireBoolean_(payload.active, "active") : true,
    displayOrder: (payload && payload.displayOrder) || 0,
    demo: false,
  });
  writeAuditEntry_({ actorType: "admin", action: "service.create", entityType: "Service", entityId: service.serviceId, after: service });
  return { service: service };
}

function actionAdminUpdateService_(payload) {
  var serviceId = requireString_(payload && payload.serviceId, "serviceId");
  var sheet = getServicesSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.SERVICES];
  var before = getServiceById_(serviceId);
  if (!before) throw new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Servicio no encontrado.", false);

  var patch = {};
  ["name", "description", "category", "imageUrl"].forEach(function (field) {
    if (payload[field] !== undefined) patch[field] = optionalString_(payload[field]);
  });
  if (payload.price !== undefined) patch.price = requirePositiveNumber_(payload.price, "price");
  if (payload.durationMinutes !== undefined) patch.durationMinutes = requirePositiveNumber_(payload.durationMinutes, "durationMinutes");
  if (payload.bufferMinutes !== undefined) patch.bufferMinutes = payload.bufferMinutes;
  if (payload.displayOrder !== undefined) patch.displayOrder = payload.displayOrder;
  if (payload.active !== undefined) patch.active = requireBoolean_(payload.active, "active");

  var updated = updateRowById_(sheet, headers, "serviceId", serviceId, patch, new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Servicio no encontrado.", false));
  writeAuditEntry_({ actorType: "admin", action: "service.update", entityType: "Service", entityId: serviceId, before: before, after: updated });
  return { service: updated };
}
