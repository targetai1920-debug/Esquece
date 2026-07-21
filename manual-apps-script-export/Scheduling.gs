/**
 * Admin CRUD for WORKING_HOURS / BREAKS / TIME_OFF / BLOCKED_SLOTS —
 * everything BOOKING_RULES.md §1's availability check reads. Read
 * accessors used internally by Availability.gs already existed
 * (getEffectiveWorkingIntervalsMinutes_, etc.); this file adds the admin
 * mutation actions so the admin dashboard (Phase G) can actually manage
 * them, and a handful of read-list actions for the admin UI to render
 * current state.
 */

function actionAdminListWorkingHours_(payload) {
  var barberId = payload && payload.barberId;
  var rows = sheetToObjects_(getWorkingHoursSheet_());
  if (barberId) rows = rows.filter(function (r) { return r.barberId === barberId; });
  return { workingHours: rows };
}

function actionAdminSetWorkingHours_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var dayOfWeek = payload && payload.dayOfWeek;
  if (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "dayOfWeek debe ser 0-6.", false);
  }
  var openingTime = requireLocalTime_(payload && payload.openingTime, "openingTime");
  var closingTime = requireLocalTime_(payload && payload.closingTime, "closingTime");

  var sheet = getWorkingHoursSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.WORKING_HOURS];
  var existing = findRowsWhere_(sheet, function (r) { return r.barberId === barberId && Number(r.dayOfWeek) === dayOfWeek; })[0];

  var result;
  if (existing) {
    result = updateRowById_(sheet, headers, "workingHoursId", existing.workingHoursId, {
      openingTime: openingTime, closingTime: closingTime, active: true,
    });
  } else {
    result = insertRow_(sheet, headers, {
      workingHoursId: generateEntityId_("wh"), barberId: barberId, dayOfWeek: dayOfWeek,
      openingTime: openingTime, closingTime: closingTime, active: true,
    });
  }
  writeAuditEntry_({ actorType: "admin", action: "workingHours.set", entityType: "WorkingHours", entityId: result.workingHoursId, after: result });
  return { workingHours: result };
}

function actionAdminListBreaks_(payload) {
  var barberId = payload && payload.barberId;
  var rows = sheetToObjects_(getBreaksSheet_());
  if (barberId) rows = rows.filter(function (r) { return r.barberId === barberId; });
  return { breaks: rows };
}

function actionAdminCreateBreak_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var startTime = requireLocalTime_(payload && payload.startTime, "startTime");
  var endTime = requireLocalTime_(payload && payload.endTime, "endTime");
  var recurring = payload && payload.recurring === true;

  var fields = {
    breakId: generateEntityId_("brk"), barberId: barberId, startTime: startTime, endTime: endTime,
    recurring: recurring, reason: optionalString_(payload && payload.reason), active: true,
  };
  if (recurring) {
    if (typeof payload.dayOfWeek !== "number") throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Falta dayOfWeek para un descanso recurrente.", false);
    fields.dayOfWeek = payload.dayOfWeek;
  } else {
    fields.date = requireLocalDate_(payload && payload.date, "date");
  }

  var created = insertRow_(getBreaksSheet_(), SHEET_HEADERS[SHEET_NAMES.BREAKS], fields);
  writeAuditEntry_({ actorType: "admin", action: "break.create", entityType: "Break", entityId: created.breakId, after: created });
  return { break: created };
}

function actionAdminDeleteBreak_(payload) {
  var breakId = requireString_(payload && payload.breakId, "breakId");
  var sheet = getBreaksSheet_();
  var existing = findRowById_(sheet, "breakId", breakId);
  if (!existing) throw new ApiError(ERROR_CODES.NOT_FOUND, "Descanso no encontrado.", false);
  updateRowById_(sheet, SHEET_HEADERS[SHEET_NAMES.BREAKS], "breakId", breakId, { active: false });
  writeAuditEntry_({ actorType: "admin", action: "break.delete", entityType: "Break", entityId: breakId, before: existing });
  return { ok: true };
}

function actionAdminListTimeOff_(payload) {
  var barberId = payload && payload.barberId;
  var rows = sheetToObjects_(getTimeOffSheet_());
  if (barberId) rows = rows.filter(function (r) { return r.barberId === barberId; });
  return { timeOff: rows };
}

function actionAdminCreateTimeOff_(payload) {
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var startDate = requireLocalDate_(payload && payload.startDate, "startDate");
  var endDate = requireLocalDate_(payload && payload.endDate, "endDate");
  var allDay = payload && payload.allDay !== false;
  var timezone = getBusinessTimezone_();

  var created = insertRow_(getTimeOffSheet_(), SHEET_HEADERS[SHEET_NAMES.TIME_OFF], {
    timeOffId: generateEntityId_("off"),
    barberId: barberId,
    startDate: startDate,
    endDate: endDate,
    startTime: allDay ? "00:00" : requireLocalTime_(payload.startTime, "startTime"),
    endTime: allDay ? "23:59" : requireLocalTime_(payload.endTime, "endTime"),
    allDay: allDay,
    reason: optionalString_(payload && payload.reason),
    active: true,
    // TIME_OFF's overlap check (Availability.gs) reads startsAt/endsAt as
    // absolute instants — derive them here so both representations stay
    // consistent for whichever code path reads which column.
    startsAt: parseLocalDateTimeToUtc_(startDate, allDay ? "00:00" : payload.startTime, timezone).toISOString(),
    endsAt: parseLocalDateTimeToUtc_(endDate, allDay ? "23:59" : payload.endTime, timezone).toISOString(),
  });
  writeAuditEntry_({ actorType: "admin", action: "timeOff.create", entityType: "TimeOff", entityId: created.timeOffId, after: created });
  return { timeOff: created };
}

function actionAdminDeleteTimeOff_(payload) {
  var timeOffId = requireString_(payload && payload.timeOffId, "timeOffId");
  var sheet = getTimeOffSheet_();
  var existing = findRowById_(sheet, "timeOffId", timeOffId);
  if (!existing) throw new ApiError(ERROR_CODES.NOT_FOUND, "Ausencia no encontrada.", false);
  updateRowById_(sheet, SHEET_HEADERS[SHEET_NAMES.TIME_OFF], "timeOffId", timeOffId, { active: false });
  writeAuditEntry_({ actorType: "admin", action: "timeOff.delete", entityType: "TimeOff", entityId: timeOffId, before: existing });
  return { ok: true };
}

function actionAdminListBlockedSlots_(payload) {
  var barberId = payload && payload.barberId;
  var rows = sheetToObjects_(getBlockedSlotsSheet_());
  if (barberId) rows = rows.filter(function (r) { return r.barberId === barberId; });
  return { blockedSlots: rows };
}

function actionAdminCreateBlockedSlot_(payload) {
  var localDate = requireLocalDate_(payload && payload.localDate, "localDate");
  var startTime = requireLocalTime_(payload && payload.startTime, "startTime");
  var endTime = requireLocalTime_(payload && payload.endTime, "endTime");

  var created = insertRow_(getBlockedSlotsSheet_(), SHEET_HEADERS[SHEET_NAMES.BLOCKED_SLOTS], {
    blockedSlotId: generateEntityId_("blk"),
    barberId: (payload && payload.barberId) || null, // empty = business-wide
    localDate: localDate,
    startTime: startTime,
    endTime: endTime,
    reason: optionalString_(payload && payload.reason),
    active: true,
    createdBy: "admin",
  });
  writeAuditEntry_({ actorType: "admin", action: "blockedSlot.create", entityType: "BlockedSlot", entityId: created.blockedSlotId, after: created });
  return { blockedSlot: created };
}

function actionAdminDeleteBlockedSlot_(payload) {
  var blockedSlotId = requireString_(payload && payload.blockedSlotId, "blockedSlotId");
  var sheet = getBlockedSlotsSheet_();
  var existing = findRowById_(sheet, "blockedSlotId", blockedSlotId);
  if (!existing) throw new ApiError(ERROR_CODES.NOT_FOUND, "Bloqueo no encontrado.", false);
  updateRowById_(sheet, SHEET_HEADERS[SHEET_NAMES.BLOCKED_SLOTS], "blockedSlotId", blockedSlotId, { active: false });
  writeAuditEntry_({ actorType: "admin", action: "blockedSlot.delete", entityType: "BlockedSlot", entityId: blockedSlotId, before: existing });
  return { ok: true };
}
