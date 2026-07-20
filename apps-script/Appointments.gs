/**
 * The only place appointment rows are written. Every mutation runs under
 * LockService.getScriptLock() and re-validates from scratch while holding
 * it (BOOKING_RULES.md §3, ARCHITECTURE.md §5) — this is the actual
 * anti-double-booking guarantee, not the read-only getAvailability check.
 */

var APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
var APPOINTMENT_SOURCES = ["WEBSITE", "WHATSAPP", "ADMIN"];

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(SCRIPT_LOCK_TIMEOUT_MS)) {
    throw new ApiError(ERROR_CODES.LOCK_TIMEOUT, "El sistema está ocupado, intenta de nuevo en unos segundos.", true);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getAppointmentById_(appointmentId) {
  return findRowById_(getAppointmentsSheet_(), "appointmentId", appointmentId);
}

function getAppointmentByReferenceRaw_(reference) {
  return findRowById_(getAppointmentsSheet_(), "reference", reference);
}

/**
 * Picks a barber for "cualquiera disponible" (BOOKING_RULES.md §1):
 * deterministic tie-break — fewest active appointments that day, then
 * lowest displayOrder, then alphabetical name. Must be called while
 * holding the script lock, immediately before creating the appointment,
 * so the choice is made against current data.
 */
function pickBarberForAnyAvailable_(eligibleBarberIds, localDate, localStartTime, totalDurationMinutes, settings) {
  var candidates = eligibleBarberIds
    .map(getBarberById_)
    .filter(function (b) { return b && isActiveRow_(b); });

  var valid = candidates.filter(function (barber) {
    var result = checkSlotValidity_({
      barberId: barber.barberId, localDate: localDate, localStartTime: localStartTime,
      totalDurationMinutes: totalDurationMinutes, settings: settings,
    });
    return result.valid;
  });

  if (valid.length === 0) return null;

  valid.forEach(function (barber) {
    barber.__dayAppointmentCount = getActiveAppointmentIntervalsMinutesForDate_(barber.barberId, localDate).length;
  });

  valid.sort(function (a, b) {
    if (a.__dayAppointmentCount !== b.__dayAppointmentCount) return a.__dayAppointmentCount - b.__dayAppointmentCount;
    var orderA = Number(a.displayOrder) || 0, orderB = Number(b.displayOrder) || 0;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return valid[0];
}

function actionCreateAppointment_(payload) {
  var idempotencyKey = requireString_(payload && payload.idempotencyKey, "idempotencyKey");
  var source = requireOneOf_(payload && payload.source, APPOINTMENT_SOURCES, "source");
  var serviceId = requireString_(payload && payload.serviceId, "serviceId");
  var localDate = requireLocalDate_(payload && payload.localDate, "localDate");
  var localStartTime = requireLocalTime_(payload && payload.localStartTime, "localStartTime");
  var anyBarber = payload && payload.anyBarber === true;
  var requestedBarberId = payload && payload.barberId ? String(payload.barberId) : null;
  var customerInput = payload && payload.customer;
  if (!customerInput) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Campo requerido: customer", false);
  }
  var customerName = requireString_(customerInput.name, "customer.name");
  var customerPhone = requirePhoneE164_(customerInput.phoneE164, "customer.phoneE164");
  var customerNotes = optionalString_(payload && payload.customerNotes, "");

  return withScriptLock_(function () {
    var appointmentsSheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];

    var existingByKey = findRowsWhere_(appointmentsSheet, function (row) {
      return row.idempotencyKey === idempotencyKey;
    })[0];
    if (existingByKey) {
      var sameRequest = existingByKey.serviceId === serviceId &&
        existingByKey.localDate === localDate &&
        existingByKey.localStartTime === localStartTime &&
        existingByKey.customerPhoneSnapshot === customerPhone;
      if (!sameRequest) {
        throw new ApiError(ERROR_CODES.IDEMPOTENCY_CONFLICT, "Esta clave de idempotencia ya se usó con datos distintos.", false);
      }
      return { appointment: existingByKey, managementToken: null, idempotent: true };
    }

    var service = requireActiveService_(serviceId);
    var settings = getSettingsMap_();
    var totalDuration = Number(service.durationMinutes) + (Number(service.bufferMinutes) || settings.DEFAULT_BUFFER_MINUTES || 0);

    var barber;
    if (anyBarber) {
      if (!settings.ALLOW_ANY_BARBER) {
        throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "\"Cualquiera disponible\" no está habilitado.", false);
      }
      var eligibleIds = listEligibleBarberIdsForService_(serviceId);
      barber = pickBarberForAnyAvailable_(eligibleIds, localDate, localStartTime, totalDuration, settings);
      if (!barber) {
        throw new ApiError(ERROR_CODES.SLOT_UNAVAILABLE, "El horario ya no está disponible.", false);
      }
    } else {
      if (!requestedBarberId) {
        throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Falta barberId (o anyBarber=true).", false);
      }
      barber = requireActiveBarber_(requestedBarberId);
      requireBarberEligibleForService_(requestedBarberId, serviceId);
      var validity = checkSlotValidity_({
        barberId: requestedBarberId, localDate: localDate, localStartTime: localStartTime,
        totalDurationMinutes: totalDuration, settings: settings,
      });
      if (!validity.valid) {
        throw new ApiError(ERROR_CODES.SLOT_UNAVAILABLE, "El horario ya no está disponible.", false);
      }
    }

    var customer = actionUpsertCustomer_({
      phoneE164: customerPhone, name: customerName, source: source,
    }).customer;

    var timezone = getBusinessTimezone_();
    var startUtc = parseLocalDateTimeToUtc_(localDate, localStartTime, timezone);
    var localEndTime = minutesToLocalTime_(minutesFromMidnight_(localStartTime) + totalDuration);
    var endUtc = parseLocalDateTimeToUtc_(localDate, localEndTime, timezone);

    var rawManagementToken = generateManagementToken_();
    var appointment = insertRow_(appointmentsSheet, headers, {
      appointmentId: generateEntityId_("apt"),
      reference: generateAppointmentReference_(localDate),
      idempotencyKey: idempotencyKey,
      managementTokenHash: hashManagementToken_(rawManagementToken),
      customerId: customer.customerId,
      customerNameSnapshot: customerName,
      customerPhoneSnapshot: customerPhone,
      serviceId: serviceId,
      serviceNameSnapshot: service.name,
      servicePriceSnapshot: service.price,
      serviceDurationSnapshot: service.durationMinutes,
      serviceBufferSnapshot: service.bufferMinutes || 0,
      barberId: barber.barberId,
      barberNameSnapshot: barber.name,
      localDate: localDate,
      localStartTime: localStartTime,
      localEndTime: localEndTime,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      timezone: timezone,
      status: "CONFIRMED",
      source: source,
      customerNotes: customerNotes,
      demo: false,
    });

    writeAuditEntry_({
      actorType: source === "ADMIN" ? "admin" : "system",
      action: "appointment.create",
      entityType: "Appointment",
      entityId: appointment.appointmentId,
      after: appointment,
    });

    createNotificationRow_({
      appointmentId: appointment.appointmentId,
      customerId: customer.customerId,
      type: "CONFIRMATION",
      scheduledAt: new Date().toISOString(),
    });

    return { appointment: appointment, managementToken: rawManagementToken, idempotent: false };
  });
}

function verifyManagementTokenOrThrow_(appointment, rawToken) {
  if (!rawToken || hashManagementToken_(rawToken) !== appointment.managementTokenHash) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, "Token de gestión inválido.", false);
  }
}

function requireChangeableAppointment_(appointment) {
  if (!appointment) {
    throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Cita no encontrada.", false);
  }
  if (appointment.status === "COMPLETED") {
    throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_CHANGEABLE, "Esta cita ya fue completada.", false);
  }
}

function actionCancelAppointment_(payload) {
  var appointmentId = payload && payload.appointmentId;
  var reference = payload && payload.reference;
  var managementToken = payload && payload.managementToken;
  var actor = (payload && payload.actor) || { type: "system" };
  var reason = optionalString_(payload && payload.reason, "");

  return withScriptLock_(function () {
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    var appointment = appointmentId ? getAppointmentById_(appointmentId) : getAppointmentByReferenceRaw_(reference);
    requireChangeableAppointment_(appointment);

    if (actor.type === "customer") {
      verifyManagementTokenOrThrow_(appointment, managementToken);
    }

    if (appointment.status === "CANCELLED") {
      return { appointment: appointment }; // idempotent — already cancelled
    }

    var before = appointment;
    var updated = updateRowById_(sheet, headers, "appointmentId", appointment.appointmentId, {
      status: "CANCELLED",
      cancellationReason: reason,
      cancelledAt: new Date().toISOString(),
    });

    writeAuditEntry_({
      actorType: actor.type, actorId: actor.id,
      action: "appointment.cancel", entityType: "Appointment", entityId: appointment.appointmentId,
      before: before, after: updated,
    });

    createNotificationRow_({
      appointmentId: updated.appointmentId, customerId: updated.customerId,
      type: "CANCELLATION", scheduledAt: new Date().toISOString(),
    });

    return { appointment: updated };
  });
}

function actionRescheduleAppointment_(payload) {
  var appointmentId = requireString_(payload && payload.appointmentId, "appointmentId");
  var managementToken = payload && payload.managementToken;
  var actor = (payload && payload.actor) || { type: "system" };
  var newLocalDate = requireLocalDate_(payload && payload.newLocalDate, "newLocalDate");
  var newLocalStartTime = requireLocalTime_(payload && payload.newLocalStartTime, "newLocalStartTime");

  return withScriptLock_(function () {
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    var appointment = getAppointmentById_(appointmentId);
    requireChangeableAppointment_(appointment);
    if (appointment.status === "CANCELLED") {
      throw new ApiError(ERROR_CODES.APPOINTMENT_ALREADY_CANCELLED, "Esta cita ya fue cancelada.", false);
    }
    if (actor.type === "customer") {
      verifyManagementTokenOrThrow_(appointment, managementToken);
    }

    var service = requireActiveService_(appointment.serviceId);
    var settings = getSettingsMap_();
    var totalDuration = Number(service.durationMinutes) + (Number(service.bufferMinutes) || settings.DEFAULT_BUFFER_MINUTES || 0);

    // Validate the NEW slot before touching the existing appointment at
    // all — BOOKING_RULES.md §5: a failed reschedule must never leave the
    // customer with no appointment. We must exclude this appointment's own
    // current interval from the overlap check, since it's about to move.
    var validity = checkSlotValidityExcludingAppointment_(appointment, newLocalDate, newLocalStartTime, totalDuration, settings);
    if (!validity.valid) {
      throw new ApiError(ERROR_CODES.SLOT_UNAVAILABLE, "El nuevo horario no está disponible.", false);
    }

    var before = appointment;
    var timezone = getBusinessTimezone_();
    var newLocalEndTime = minutesToLocalTime_(minutesFromMidnight_(newLocalStartTime) + totalDuration);
    var startUtc = parseLocalDateTimeToUtc_(newLocalDate, newLocalStartTime, timezone);
    var endUtc = parseLocalDateTimeToUtc_(newLocalDate, newLocalEndTime, timezone);

    var updated = updateRowById_(sheet, headers, "appointmentId", appointmentId, {
      localDate: newLocalDate,
      localStartTime: newLocalStartTime,
      localEndTime: newLocalEndTime,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
    });

    writeAuditEntry_({
      actorType: actor.type, actorId: actor.id,
      action: "appointment.reschedule", entityType: "Appointment", entityId: appointmentId,
      before: before, after: updated,
    });

    createNotificationRow_({
      appointmentId: updated.appointmentId, customerId: updated.customerId,
      type: "RESCHEDULE", scheduledAt: new Date().toISOString(),
    });

    return { appointment: updated };
  });
}

/**
 * Same check as checkSlotValidity_ (Availability.gs), but treats the
 * given appointment's own current interval as free — so rescheduling to
 * a time that overlaps only its own not-yet-moved row doesn't reject
 * itself as "conflicting with itself."
 */
function checkSlotValidityExcludingAppointment_(appointmentToExclude, localDate, localStartTime, totalDurationMinutes, settings) {
  return checkSlotValidity_({
    barberId: appointmentToExclude.barberId,
    localDate: localDate,
    localStartTime: localStartTime,
    totalDurationMinutes: totalDurationMinutes,
    settings: settings,
    excludeAppointmentId: appointmentToExclude.appointmentId,
  });
}

function actionGetAppointment_(payload) {
  var appointmentId = requireString_(payload && payload.appointmentId, "appointmentId");
  var appointment = getAppointmentById_(appointmentId);
  if (!appointment) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Cita no encontrada.", false);
  return { appointment: appointment };
}

function actionGetAppointmentByReference_(payload) {
  var reference = requireString_(payload && payload.reference, "reference");
  var appointment = getAppointmentByReferenceRaw_(reference);
  if (!appointment) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Cita no encontrada.", false);
  if (payload && payload.managementToken) {
    verifyManagementTokenOrThrow_(appointment, payload.managementToken);
  }
  return { appointment: appointment };
}

function actionListAppointments_(payload) {
  var localDate = payload && payload.localDate;
  var barberId = payload && payload.barberId;
  var status = payload && payload.status;
  var rows = sheetToObjects_(getAppointmentsSheet_());
  if (localDate) rows = rows.filter(function (r) { return r.localDate === localDate; });
  if (barberId) rows = rows.filter(function (r) { return r.barberId === barberId; });
  if (status) rows = rows.filter(function (r) { return r.status === status; });
  rows.sort(function (a, b) { return String(a.startUtc || "").localeCompare(String(b.startUtc || "")); });
  return { appointments: rows };
}

function actionListCustomerAppointments_(payload) {
  var customerId = requireString_(payload && payload.customerId, "customerId");
  var rows = findRowsWhere_(getAppointmentsSheet_(), function (r) { return r.customerId === customerId; });
  rows.sort(function (a, b) { return String(b.startUtc || "").localeCompare(String(a.startUtc || "")); });
  return { appointments: rows };
}

function actionUpdateAppointmentStatus_(payload) {
  var appointmentId = requireString_(payload && payload.appointmentId, "appointmentId");
  var status = requireOneOf_(payload && payload.status, APPOINTMENT_STATUSES, "status");
  var actor = (payload && payload.actor) || { type: "admin" };

  return withScriptLock_(function () {
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    var appointment = getAppointmentById_(appointmentId);
    if (!appointment) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Cita no encontrada.", false);

    var patch = { status: status };
    if (status === "COMPLETED") patch.completedAt = new Date().toISOString();

    var updated = updateRowById_(sheet, headers, "appointmentId", appointmentId, patch);
    writeAuditEntry_({
      actorType: actor.type, actorId: actor.id,
      action: "appointment.updateStatus", entityType: "Appointment", entityId: appointmentId,
      before: appointment, after: updated,
    });
    return { appointment: updated };
  });
}
