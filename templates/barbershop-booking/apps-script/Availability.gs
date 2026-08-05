/**
 * The availability engine — mirrors src/lib/booking/availability.ts's rules
 * exactly (same twelve-point check, same half-open interval semantics). See
 * references/booking-and-availability-rules.md.
 *
 * buildAvailabilityContext_ loads every needed sheet ONCE per request and
 * is reused across every candidate slot/staff evaluated in a read-only
 * getAvailability call — see references/google-sheets-apps-script.md
 * §"Read performance". createAppointment_/cancelAppointment_/
 * rescheduleAppointment_ must NEVER reuse a context built before their
 * lock was acquired — they always call buildAvailabilityContext_() fresh,
 * inside the lock.
 */

var BLOCKING_STATUSES_ = { PENDING: true, CONFIRMED: true };

function buildAvailabilityContext_() {
  return {
    settings: getBusinessSettingsObject_(),
    staffCtx: loadAllStaffContext_(),
    services: sheetToObjects_(SHEET_NAMES.SERVICES).map(serviceRowToObject_),
    appointments: sheetToObjects_(SHEET_NAMES.APPOINTMENTS),
    timeOff: sheetToObjects_(SHEET_NAMES.TIME_OFF),
    blockedSlots: sheetToObjects_(SHEET_NAMES.BLOCKED_SLOTS),
    nowLocal: new Date().toISOString().slice(0, 16),
  };
}

function checkSlotValidity_(ctx, params) {
  var service = null;
  for (var si = 0; si < ctx.services.length; si++) {
    if (ctx.services[si].id === params.serviceId && ctx.services[si].active) { service = ctx.services[si]; break; }
  }
  if (!service) return { valid: false, reason: ERROR_CODES.SERVICE_NOT_FOUND };

  var staff = requireActiveStaffOrNull_(params.staffId, ctx.staffCtx);
  if (!staff) return { valid: false, reason: ERROR_CODES.STAFF_NOT_FOUND };
  if (staff.serviceIds.indexOf(service.id) === -1) return { valid: false, reason: ERROR_CODES.STAFF_NOT_ELIGIBLE };

  if (params.localDate < ctx.nowLocal.slice(0, 10)) return { valid: false, reason: ERROR_CODES.DATE_IN_PAST };

  var requestedStartLocal = params.localDate + "T" + params.localStartTime;
  var minNotice = addMinutesToLocalDateTime_(ctx.nowLocal.slice(0, 10), ctx.nowLocal.slice(11), ctx.settings.minimumNoticeMinutes);
  var minNoticeStr = minNotice.localDate + "T" + minNotice.localTime;
  if (requestedStartLocal < minNoticeStr) return { valid: false, reason: ERROR_CODES.BELOW_MINIMUM_NOTICE };

  var maxAdvance = addDaysToLocalDate_(ctx.nowLocal.slice(0, 10), ctx.settings.maximumAdvanceDays);
  if (params.localDate > maxAdvance) return { valid: false, reason: ERROR_CODES.BEYOND_MAXIMUM_ADVANCE };

  var weekday = weekdayOf_(params.localDate);
  var day = staff.workingHours[weekday];
  if (!day || day.closed || !day.start || !day.end) return { valid: false, reason: ERROR_CODES.STAFF_CLOSED_THAT_DAY };

  var start = minutesOf_(params.localStartTime);
  var end = start + service.durationMinutes + service.bufferMinutes;
  var dayStart = minutesOf_(day.start);
  var dayEnd = minutesOf_(day.end);
  if (end > dayEnd) return { valid: false, reason: ERROR_CODES.ENDS_AFTER_CLOSING };
  if (start < dayStart) return { valid: false, reason: ERROR_CODES.STARTS_BEFORE_OPENING };

  for (var bi = 0; bi < staff.breaks.length; bi++) {
    var brk = staff.breaks[bi];
    if (brk.days.indexOf(weekday) === -1) continue;
    if (intervalsOverlap_(start, end, minutesOf_(brk.start), minutesOf_(brk.end))) {
      return { valid: false, reason: ERROR_CODES.OVERLAPS_BREAK };
    }
  }

  for (var ti = 0; ti < ctx.timeOff.length; ti++) {
    var off = ctx.timeOff[ti];
    if (off.staffId !== staff.id || String(off.active) !== "true") continue;
    if (params.localDate >= off.startDate && params.localDate <= off.endDate) {
      return { valid: false, reason: ERROR_CODES.OVERLAPS_TIME_OFF };
    }
  }

  for (var bli = 0; bli < ctx.blockedSlots.length; bli++) {
    var block = ctx.blockedSlots[bli];
    if (String(block.active) !== "true") continue;
    if (block.staffId && block.staffId !== staff.id) continue;
    if (block.localDate !== params.localDate) continue;
    if (intervalsOverlap_(start, end, minutesOf_(block.startTime), minutesOf_(block.endTime))) {
      return { valid: false, reason: ERROR_CODES.OVERLAPS_BLOCK };
    }
  }

  for (var ai = 0; ai < ctx.appointments.length; ai++) {
    var appt = ctx.appointments[ai];
    if (appt.staffId !== staff.id) continue;
    if (appt.localDate !== params.localDate) continue;
    if (params.excludeAppointmentId && appt.appointmentId === params.excludeAppointmentId) continue;
    if (!BLOCKING_STATUSES_[appt.status]) continue;
    if (intervalsOverlap_(start, end, minutesOf_(appt.localStartTime), minutesOf_(appt.localEndTime))) {
      return { valid: false, reason: ERROR_CODES.SLOT_UNAVAILABLE };
    }
  }

  return { valid: true };
}

function requireActiveStaffOrNull_(staffId, staffCtx) {
  var row = findRowById_(SHEET_NAMES.STAFF, "staffId", staffId, staffCtx.staff);
  if (!row || String(row.active) !== "true") return null;
  return buildStaffObject_(row, staffCtx.staffServices, staffCtx.workingHours, staffCtx.breaks);
}

function getAvailableSlotsForStaff_(ctx, params) {
  var staff = requireActiveStaffOrNull_(params.staffId, ctx.staffCtx);
  var weekday = weekdayOf_(params.localDate);
  var day = staff ? staff.workingHours[weekday] : null;
  if (!staff || !day || day.closed || !day.start || !day.end) return [];

  var interval = ctx.settings.slotIntervalMinutes;
  var dayStart = minutesOf_(day.start);
  var dayEnd = minutesOf_(day.end);
  var service = null;
  for (var si = 0; si < ctx.services.length; si++) {
    if (ctx.services[si].id === params.serviceId) { service = ctx.services[si]; break; }
  }
  var slots = [];
  for (var t = dayStart; t < dayEnd; t += interval) {
    var result = checkSlotValidity_(ctx, { serviceId: params.serviceId, staffId: params.staffId, localDate: params.localDate, localStartTime: toHHMM_(t) });
    if (result.valid && service) {
      slots.push({ localStartTime: toHHMM_(t), localEndTime: toHHMM_(t + service.durationMinutes + service.bufferMinutes), staffIds: [staff.id] });
    }
  }
  return slots;
}

function getAvailableSlotsAnyStaff_(ctx, params) {
  var eligible = ctx.staffCtx.staff.filter(function (r) {
    if (String(r.active) !== "true") return false;
    var staffServiceRows = ctx.staffCtx.staffServices.filter(function (ss) { return ss.staffId === r.staffId && String(ss.active) === "true"; });
    return staffServiceRows.some(function (ss) { return ss.serviceId === params.serviceId; });
  });
  var byTime = {};
  for (var i = 0; i < eligible.length; i++) {
    var slots = getAvailableSlotsForStaff_(ctx, { serviceId: params.serviceId, staffId: eligible[i].staffId, localDate: params.localDate });
    for (var s = 0; s < slots.length; s++) {
      var slot = slots[s];
      if (byTime[slot.localStartTime]) {
        byTime[slot.localStartTime].staffIds.push(eligible[i].staffId);
      } else {
        byTime[slot.localStartTime] = slot;
      }
    }
  }
  var result = [];
  for (var key in byTime) result.push(byTime[key]);
  result.sort(function (a, b) { return a.localStartTime < b.localStartTime ? -1 : 1; });
  return result;
}

/** Deterministic tie-break: (1) fewest active appointments that day, (2) lowest id, (3) alphabetical name. */
function pickStaffForAnyAvailable_(ctx, eligibleStaffIds, localDate) {
  var scored = eligibleStaffIds.map(function (id) {
    var staffRow = findRowById_(SHEET_NAMES.STAFF, "staffId", id, ctx.staffCtx.staff);
    var activeCount = ctx.appointments.filter(function (a) {
      return a.staffId === id && a.localDate === localDate && BLOCKING_STATUSES_[a.status];
    }).length;
    return { id: id, activeCount: activeCount, name: staffRow.name };
  });
  scored.sort(function (a, b) {
    if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return a.name < b.name ? -1 : 1;
  });
  return scored[0].id;
}

function actionGetAvailability_(payload) {
  requireString_(payload, "serviceId");
  requireLocalDate_(payload, "localDate");
  var ctx = buildAvailabilityContext_();
  var slots;
  if (payload.staffId) {
    slots = getAvailableSlotsForStaff_(ctx, { serviceId: payload.serviceId, staffId: payload.staffId, localDate: payload.localDate });
  } else {
    slots = getAvailableSlotsAnyStaff_(ctx, { serviceId: payload.serviceId, localDate: payload.localDate });
  }
  return { slots: slots };
}

function actionValidateSlot_(payload) {
  var ctx = buildAvailabilityContext_();
  var result = checkSlotValidity_(ctx, {
    serviceId: requireString_(payload, "serviceId"),
    staffId: requireString_(payload, "staffId"),
    localDate: requireLocalDate_(payload, "localDate"),
    localStartTime: requireLocalTime_(payload, "localStartTime"),
  });
  return result.valid ? { valid: true } : { valid: false, reason: result.reason };
}
