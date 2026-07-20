/**
 * SERVICES sheet access. Public read actions only in this phase — admin
 * create/edit/activate actions are added in Phase G alongside the admin
 * dashboard screens that call them, to avoid speculative unused API
 * surface (see PROJECT_PLAN.md guardrails).
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
