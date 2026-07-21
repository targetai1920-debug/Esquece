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

// --- Admin (Phase G) ---

function actionAdminListBarbers_() {
  return { barbers: sortByDisplayOrder_(sheetToObjects_(getBarbersSheet_())) };
}

function actionAdminCreateBarber_(payload) {
  var sheet = getBarbersSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.BARBERS];
  var barber = insertRow_(sheet, headers, {
    barberId: generateEntityId_("brb"),
    name: requireString_(payload && payload.name, "name"),
    biography: optionalString_(payload && payload.biography),
    specialties: optionalString_(payload && payload.specialties),
    photoUrl: optionalString_(payload && payload.photoUrl),
    phoneE164: optionalString_(payload && payload.phoneE164),
    active: payload && payload.active !== undefined ? requireBoolean_(payload.active, "active") : true,
    publicBooking: payload && payload.publicBooking !== undefined ? requireBoolean_(payload.publicBooking, "publicBooking") : true,
    displayOrder: (payload && payload.displayOrder) || 0,
    calendarId: optionalString_(payload && payload.calendarId),
    demo: false,
  });
  writeAuditEntry_({ actorType: "admin", action: "barber.create", entityType: "Barber", entityId: barber.barberId, after: barber });
  return { barber: barber };
}

function actionAdminUpdateBarber_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var sheet = getBarbersSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.BARBERS];
  var before = getBarberById_(barberId);
  if (!before) throw new ApiError(ERROR_CODES.BARBER_NOT_FOUND, "Barbero no encontrado.", false);

  var patch = {};
  ["name", "biography", "specialties", "photoUrl", "phoneE164", "calendarId"].forEach(function (field) {
    if (payload[field] !== undefined) patch[field] = optionalString_(payload[field]);
  });
  if (payload.active !== undefined) patch.active = requireBoolean_(payload.active, "active");
  if (payload.publicBooking !== undefined) patch.publicBooking = requireBoolean_(payload.publicBooking, "publicBooking");
  if (payload.displayOrder !== undefined) patch.displayOrder = payload.displayOrder;

  var updated = updateRowById_(sheet, headers, "barberId", barberId, patch, new ApiError(ERROR_CODES.BARBER_NOT_FOUND, "Barbero no encontrado.", false));
  writeAuditEntry_({ actorType: "admin", action: "barber.update", entityType: "Barber", entityId: barberId, before: before, after: updated });
  return { barber: updated };
}

/** Replaces a barber's full set of service links (simplest correct model for a small admin form). */
function actionAdminSetBarberServices_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var serviceIds = (payload && payload.serviceIds) || [];
  if (!Array.isArray(serviceIds)) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "serviceIds debe ser un arreglo.", false);
  }
  requireActiveBarber_(barberId);

  var sheet = getBarberServicesSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.BARBER_SERVICES];
  removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.BARBER_SERVICES, function (row) {
    return row.barberId === barberId;
  });
  serviceIds.forEach(function (serviceId) {
    insertRow_(sheet, headers, {
      barberServiceId: barberId + ":" + serviceId,
      barberId: barberId,
      serviceId: serviceId,
      active: true,
    });
  });
  writeAuditEntry_({ actorType: "admin", action: "barber.setServices", entityType: "Barber", entityId: barberId, metadata: { serviceIds: serviceIds } });
  return { ok: true, serviceIds: serviceIds };
}

/** Reverse of listEligibleBarberIdsForService_ — which services is this barber currently linked to (for the admin edit form). */
function actionAdminGetBarberServices_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var serviceIds = findRowsWhere_(getBarberServicesSheet_(), function (row) {
    return row.barberId === barberId && isActiveRow_(row);
  }).map(function (row) {
    return row.serviceId;
  });
  return { serviceIds: serviceIds };
}
