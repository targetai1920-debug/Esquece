/**
 * BARBERS + BARBER_SERVICES sheet access.
 */

function getBarbersSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.BARBERS);
}

function getBarberServicesSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.BARBER_SERVICES);
}

function getBarberById_(barberId) {
  return findRowById_(getBarbersSheet_(), "barberId", barberId);
}

function requireActiveBarber_(barberId) {
  var barber = getBarberById_(barberId);
  if (!barber) {
    throw new ApiError(ERROR_CODES.BARBER_NOT_FOUND, "Barbero no encontrado.", false);
  }
  if (barber.active !== true && barber.active !== "true" && barber.active !== "TRUE") {
    throw new ApiError(ERROR_CODES.BARBER_INACTIVE, "Este barbero ya no está disponible.", false);
  }
  return barber;
}

function isActiveRow_(row) {
  return row.active === true || row.active === "true" || row.active === "TRUE";
}

/** Barber ids linked to a service via an active BARBER_SERVICES row. */
function listEligibleBarberIdsForService_(serviceId) {
  return findRowsWhere_(getBarberServicesSheet_(), function (row) {
    return row.serviceId === serviceId && isActiveRow_(row);
  }).map(function (row) {
    return row.barberId;
  });
}

/** BOOKING_RULES.md §1.1 — a barber not linked to the service is never offered for it. */
function requireBarberEligibleForService_(barberId, serviceId) {
  var eligibleIds = listEligibleBarberIdsForService_(serviceId);
  if (eligibleIds.indexOf(barberId) === -1) {
    throw new ApiError(ERROR_CODES.BARBER_NOT_ELIGIBLE, "Este barbero no realiza ese servicio.", false);
  }
}

function actionListBarbers_() {
  var rows = findRowsWhere_(getBarbersSheet_(), function (row) {
    return isActiveRow_(row) && (row.publicBooking === true || row.publicBooking === "true" || row.publicBooking === "TRUE");
  });
  return { barbers: sortByDisplayOrder_(rows) };
}

function actionGetBarber_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  return { barber: requireActiveBarber_(barberId) };
}

function actionListBarbersForService_(payload) {
  var serviceId = requireString_(payload && payload.serviceId, "serviceId");
  requireActiveService_(serviceId); // throws SERVICE_NOT_FOUND / SERVICE_INACTIVE as appropriate

  var eligibleIds = listEligibleBarberIdsForService_(serviceId);
  var barbers = findRowsWhere_(getBarbersSheet_(), function (row) {
    return isActiveRow_(row) && eligibleIds.indexOf(row.barberId) !== -1;
  });
  return { barbers: sortByDisplayOrder_(barbers) };
}
