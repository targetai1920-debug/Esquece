function blockedSlotRowToObject_(row) {
  return { id: row.blockedSlotId, staffId: row.staffId || undefined, localDate: row.localDate, startTime: row.startTime, endTime: row.endTime, reason: row.reason || "", active: String(row.active) === "true" };
}

function actionListBlockedSlots_() {
  return { blockedSlots: sheetToObjects_(SHEET_NAMES.BLOCKED_SLOTS).map(blockedSlotRowToObject_) };
}

function actionCreateBlockedSlot_(payload) {
  var row = {
    blockedSlotId: generateUuid_(),
    staffId: optionalString_(payload, "staffId") || "",
    localDate: requireLocalDate_(payload, "localDate"),
    startTime: requireLocalTime_(payload, "startTime"),
    endTime: requireLocalTime_(payload, "endTime"),
    reason: optionalString_(payload, "reason") || "",
    active: true,
    createdAt: new Date().toISOString(),
  };
  appendRowFromObject_(SHEET_NAMES.BLOCKED_SLOTS, row);
  writeAuditEntry_("createBlockedSlot", "BlockedSlot", row.blockedSlotId, "admin", {});
  return { blockedSlot: blockedSlotRowToObject_(row) };
}

function actionDeleteBlockedSlot_(payload) {
  var id = requireString_(payload, "blockedSlotId");
  var updated = updateRowById_(SHEET_NAMES.BLOCKED_SLOTS, "blockedSlotId", id, { active: false });
  if (!updated) throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Blocked slot not found.", false);
  writeAuditEntry_("deleteBlockedSlot", "BlockedSlot", id, "admin", {});
  return { ok: true };
}

function timeOffRowToObject_(row) {
  return { id: row.timeOffId, staffId: row.staffId, startDate: row.startDate, endDate: row.endDate, reason: row.reason || "", active: String(row.active) === "true" };
}

function actionListTimeOff_() {
  return { timeOff: sheetToObjects_(SHEET_NAMES.TIME_OFF).map(timeOffRowToObject_) };
}

function actionCreateTimeOff_(payload) {
  var row = {
    timeOffId: generateUuid_(),
    staffId: requireString_(payload, "staffId"),
    startDate: requireLocalDate_(payload, "startDate"),
    endDate: requireLocalDate_(payload, "endDate"),
    reason: optionalString_(payload, "reason") || "",
    active: true,
    createdAt: new Date().toISOString(),
  };
  appendRowFromObject_(SHEET_NAMES.TIME_OFF, row);
  writeAuditEntry_("createTimeOff", "TimeOff", row.timeOffId, "admin", {});
  return { timeOff: timeOffRowToObject_(row) };
}

function actionDeleteTimeOff_(payload) {
  var id = requireString_(payload, "timeOffId");
  var updated = updateRowById_(SHEET_NAMES.TIME_OFF, "timeOffId", id, { active: false });
  if (!updated) throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Time off not found.", false);
  writeAuditEntry_("deleteTimeOff", "TimeOff", id, "admin", {});
  return { ok: true };
}
