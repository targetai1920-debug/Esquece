/**
 * The only place APPOINTMENTS rows are written. Every mutation acquires
 * the script lock, rebuilds a fresh availability context INSIDE the lock,
 * and re-validates — see references/booking-and-availability-rules.md
 * §"Confirmation is a re-check, not a trust of the displayed slot" and
 * references/security-and-idempotency.md.
 */

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(30000);
  if (!acquired) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, "Could not acquire lock in time.", true);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function appointmentRowToObject_(row) {
  return {
    id: row.appointmentId,
    reference: row.reference,
    idempotencyKey: row.idempotencyKey,
    serviceId: row.serviceId,
    serviceNameSnapshot: row.serviceNameSnapshot,
    servicePriceSnapshot: Number(row.servicePriceSnapshot),
    serviceDurationSnapshot: Number(row.serviceDurationSnapshot),
    serviceBufferSnapshot: Number(row.serviceBufferSnapshot),
    staffId: row.staffId,
    staffNameSnapshot: row.staffNameSnapshot,
    customerId: row.customerId,
    customerNameSnapshot: row.customerNameSnapshot,
    customerPhoneSnapshot: row.customerPhoneSnapshot,
    localDate: row.localDate,
    localStartTime: row.localStartTime,
    localEndTime: row.localEndTime,
    status: row.status,
    source: row.source,
    customerNotes: row.customerNotes || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledAt: row.cancelledAt || null,
    cancellationReason: row.cancellationReason || "",
  };
}

function findAppointmentRowByIdempotencyKey_(idempotencyKey) {
  var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].idempotencyKey === idempotencyKey) return rows[i];
  }
  return null;
}

function actionCreateAppointment_(payload) {
  var idempotencyKey = requireString_(payload, "idempotencyKey");
  var serviceId = requireString_(payload, "serviceId");
  var localDate = requireLocalDate_(payload, "localDate");
  var localStartTime = requireLocalTime_(payload, "localStartTime");
  var anyStaff = requireBoolean_(payload, "anyStaff", false);
  var staffIdInput = optionalString_(payload, "staffId");
  var customer = payload.customer || {};
  requireString_(customer, "name");
  requireString_(customer, "phone");
  var source = optionalString_(payload, "source") || "OTHER";

  return withScriptLock_(function () {
    var existing = findAppointmentRowByIdempotencyKey_(idempotencyKey);
    if (existing) {
      return { appointment: appointmentRowToObject_(existing), managementToken: null, idempotent: true };
    }

    var ctx = buildAvailabilityContext_(); // rebuilt inside the lock — never reused from before acquisition
    var staffId = staffIdInput;
    if (!staffId) {
      if (!anyStaff) throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "staffId or anyStaff=true is required.", false);
      var eligible = ctx.staffCtx.staff.filter(function (r) {
        if (String(r.active) !== "true") return false;
        return ctx.staffCtx.staffServices.some(function (ss) {
          return ss.staffId === r.staffId && ss.serviceId === serviceId && String(ss.active) === "true";
        });
      });
      var available = eligible.filter(function (r) {
        return checkSlotValidity_(ctx, { serviceId: serviceId, staffId: r.staffId, localDate: localDate, localStartTime: localStartTime }).valid;
      });
      if (available.length === 0) throw new ApiError(ERROR_CODES.SLOT_UNAVAILABLE, "The slot is no longer available.", false);
      staffId = pickStaffForAnyAvailable_(ctx, available.map(function (r) { return r.staffId; }), localDate);
    }

    var staff = requireActiveStaffOrNull_(staffId, ctx.staffCtx);
    if (!staff) throw new ApiError(ERROR_CODES.STAFF_NOT_FOUND, "Staff member not found or inactive.", false);

    var service = null;
    for (var i = 0; i < ctx.services.length; i++) {
      if (ctx.services[i].id === serviceId && ctx.services[i].active) { service = ctx.services[i]; break; }
    }
    if (!service) throw new ApiError(ERROR_CODES.SERVICE_NOT_FOUND, "Service not found or inactive.", false);

    var check = checkSlotValidity_(ctx, { serviceId: serviceId, staffId: staffId, localDate: localDate, localStartTime: localStartTime });
    if (!check.valid) throw new ApiError(check.reason, "The slot is no longer available.", false);

    var customerObj = upsertCustomer_(customer);
    var endMinutes = minutesOf_(localStartTime) + service.durationMinutes + service.bufferMinutes;
    var managementToken = generateManagementToken_();
    var nowIso = new Date().toISOString();

    var row = {
      appointmentId: generateUuid_(),
      reference: generateReference_(localDate),
      idempotencyKey: idempotencyKey,
      serviceId: service.id,
      serviceNameSnapshot: service.name,
      servicePriceSnapshot: service.price,
      serviceDurationSnapshot: service.durationMinutes,
      serviceBufferSnapshot: service.bufferMinutes,
      staffId: staff.id,
      staffNameSnapshot: staff.name,
      customerId: customerObj.id,
      customerNameSnapshot: customerObj.name,
      customerPhoneSnapshot: customerObj.phone,
      localDate: localDate,
      localStartTime: localStartTime,
      localEndTime: toHHMM_(endMinutes),
      status: "CONFIRMED",
      source: source,
      customerNotes: optionalString_(payload, "customerNotes") || "",
      managementTokenHash: hashManagementToken_(managementToken),
      createdAt: nowIso,
      updatedAt: nowIso,
      cancelledAt: "",
      cancellationReason: "",
    };
    appendRowFromObject_(SHEET_NAMES.APPOINTMENTS, row);
    writeAuditEntry_("createAppointment", "Appointment", row.appointmentId, source === "ADMIN" ? "admin" : "customer", { reference: row.reference });

    return { appointment: appointmentRowToObject_(row), managementToken: managementToken, idempotent: false };
  });
}

function findAppointmentRowById_(appointmentId, rows) {
  return findRowById_(SHEET_NAMES.APPOINTMENTS, "appointmentId", appointmentId, rows);
}

function verifyManagementToken_(row, token) {
  return constantTimeEquals_(row.managementTokenHash, hashManagementToken_(token || ""));
}

function actionGetAppointmentByReference_(payload) {
  var reference = requireString_(payload, "reference");
  var token = requireString_(payload, "managementToken");
  var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
  var row = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].reference === reference) { row = rows[i]; break; }
  }
  if (!row) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Appointment not found.", false);
  if (!verifyManagementToken_(row, token)) throw new ApiError(ERROR_CODES.UNAUTHORIZED, "Invalid management token.", false);
  return { appointment: appointmentRowToObject_(row) };
}

function actionCancelAppointment_(payload) {
  var appointmentId = requireString_(payload, "appointmentId");
  var token = requireString_(payload, "managementToken");
  var reason = optionalString_(payload, "reason") || "";

  return withScriptLock_(function () {
    var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
    var row = findAppointmentRowById_(appointmentId, rows);
    if (!row) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Appointment not found.", false);
    if (!verifyManagementToken_(row, token)) throw new ApiError(ERROR_CODES.UNAUTHORIZED, "Invalid management token.", false);
    if (row.status === "CANCELLED") return { appointment: appointmentRowToObject_(row) };
    if (row.status === "COMPLETED") throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_CHANGEABLE, "Appointment already completed.", false);
    var patch = { status: "CANCELLED", cancelledAt: new Date().toISOString(), cancellationReason: reason, updatedAt: new Date().toISOString() };
    var updated = updateRowById_(SHEET_NAMES.APPOINTMENTS, "appointmentId", appointmentId, patch);
    writeAuditEntry_("cancelAppointment", "Appointment", appointmentId, "customer", { reason: reason });
    return { appointment: appointmentRowToObject_(updated) };
  });
}

function actionRescheduleAppointment_(payload) {
  var appointmentId = requireString_(payload, "appointmentId");
  var token = requireString_(payload, "managementToken");
  var newLocalDate = requireLocalDate_(payload, "newLocalDate");
  var newLocalStartTime = requireLocalTime_(payload, "newLocalStartTime");

  return withScriptLock_(function () {
    var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
    var row = findAppointmentRowById_(appointmentId, rows);
    if (!row) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Appointment not found.", false);
    if (!verifyManagementToken_(row, token)) throw new ApiError(ERROR_CODES.UNAUTHORIZED, "Invalid management token.", false);
    if (row.status !== "PENDING" && row.status !== "CONFIRMED") {
      throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_CHANGEABLE, "Appointment cannot be rescheduled in its current status.", false);
    }
    var ctx = buildAvailabilityContext_();
    var check = checkSlotValidity_(ctx, {
      serviceId: row.serviceId, staffId: row.staffId, localDate: newLocalDate, localStartTime: newLocalStartTime, excludeAppointmentId: appointmentId,
    });
    if (!check.valid) throw new ApiError(check.reason, "The new slot is not available.", false);
    var endMinutes = minutesOf_(newLocalStartTime) + Number(row.serviceDurationSnapshot) + Number(row.serviceBufferSnapshot);
    var updated = updateRowById_(SHEET_NAMES.APPOINTMENTS, "appointmentId", appointmentId, {
      localDate: newLocalDate, localStartTime: newLocalStartTime, localEndTime: toHHMM_(endMinutes), updatedAt: new Date().toISOString(),
    });
    writeAuditEntry_("rescheduleAppointment", "Appointment", appointmentId, "customer", { newLocalDate: newLocalDate, newLocalStartTime: newLocalStartTime });
    return { appointment: appointmentRowToObject_(updated) };
  });
}

function setAppointmentStatusAdmin_(appointmentId, status, action) {
  return withScriptLock_(function () {
    var updated = updateRowById_(SHEET_NAMES.APPOINTMENTS, "appointmentId", appointmentId, { status: status, updatedAt: new Date().toISOString() });
    if (!updated) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Appointment not found.", false);
    writeAuditEntry_(action, "Appointment", appointmentId, "admin", { status: status });
    return { appointment: appointmentRowToObject_(updated) };
  });
}

function actionConfirmAppointment_(payload) {
  return setAppointmentStatusAdmin_(requireString_(payload, "appointmentId"), "CONFIRMED", "confirmAppointment");
}
function actionCompleteAppointment_(payload) {
  return setAppointmentStatusAdmin_(requireString_(payload, "appointmentId"), "COMPLETED", "completeAppointment");
}
function actionMarkNoShow_(payload) {
  return setAppointmentStatusAdmin_(requireString_(payload, "appointmentId"), "NO_SHOW", "markNoShow");
}

function actionAdminCancelAppointment_(payload) {
  var appointmentId = requireString_(payload, "appointmentId");
  var reason = optionalString_(payload, "reason") || "";
  return withScriptLock_(function () {
    var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
    var row = findAppointmentRowById_(appointmentId, rows);
    if (!row) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Appointment not found.", false);
    if (row.status === "CANCELLED") return { appointment: appointmentRowToObject_(row) };
    if (row.status === "COMPLETED") throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_CHANGEABLE, "Appointment already completed.", false);
    var updated = updateRowById_(SHEET_NAMES.APPOINTMENTS, "appointmentId", appointmentId, {
      status: "CANCELLED", cancelledAt: new Date().toISOString(), cancellationReason: reason, updatedAt: new Date().toISOString(),
    });
    writeAuditEntry_("adminCancelAppointment", "Appointment", appointmentId, "admin", { reason: reason });
    return { appointment: appointmentRowToObject_(updated) };
  });
}

function actionAdminRescheduleAppointment_(payload) {
  var appointmentId = requireString_(payload, "appointmentId");
  var newLocalDate = requireLocalDate_(payload, "newLocalDate");
  var newLocalStartTime = requireLocalTime_(payload, "newLocalStartTime");
  return withScriptLock_(function () {
    var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
    var row = findAppointmentRowById_(appointmentId, rows);
    if (!row) throw new ApiError(ERROR_CODES.APPOINTMENT_NOT_FOUND, "Appointment not found.", false);
    var ctx = buildAvailabilityContext_();
    var check = checkSlotValidity_(ctx, {
      serviceId: row.serviceId, staffId: row.staffId, localDate: newLocalDate, localStartTime: newLocalStartTime, excludeAppointmentId: appointmentId,
    });
    if (!check.valid) throw new ApiError(check.reason, "The new slot is not available.", false);
    var endMinutes = minutesOf_(newLocalStartTime) + Number(row.serviceDurationSnapshot) + Number(row.serviceBufferSnapshot);
    var updated = updateRowById_(SHEET_NAMES.APPOINTMENTS, "appointmentId", appointmentId, {
      localDate: newLocalDate, localStartTime: newLocalStartTime, localEndTime: toHHMM_(endMinutes), updatedAt: new Date().toISOString(),
    });
    writeAuditEntry_("adminRescheduleAppointment", "Appointment", appointmentId, "admin", { newLocalDate: newLocalDate, newLocalStartTime: newLocalStartTime });
    return { appointment: appointmentRowToObject_(updated) };
  });
}

function actionListAppointments_(payload) {
  var rows = sheetToObjects_(SHEET_NAMES.APPOINTMENTS);
  var filtered = rows.filter(function (r) {
    if (payload && payload.localDate && r.localDate !== payload.localDate) return false;
    if (payload && payload.staffId && r.staffId !== payload.staffId) return false;
    if (payload && payload.status && r.status !== payload.status) return false;
    return true;
  });
  return { appointments: filtered.map(appointmentRowToObject_) };
}
