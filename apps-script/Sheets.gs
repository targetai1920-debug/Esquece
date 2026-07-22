/**
 * Sheet names, headers, and generic read/write helpers shared by every
 * domain file (Phase C/D). See CRM_SCHEMA.md for the authoritative,
 * column-by-column documentation generated alongside this file.
 *
 * Reading: sheetToObjects_ batch-reads a whole sheet in one getDataRange()
 * call and returns header-keyed objects — domain code must never call
 * getRange() inside a loop (ARCHITECTURE.md / BOOKING_RULES.md note on
 * Apps Script quota behavior).
 */

var SHEET_NAMES = {
  SETTINGS: "SETTINGS",
  SERVICES: "SERVICES",
  BARBERS: "BARBERS",
  BARBER_SERVICES: "BARBER_SERVICES",
  WORKING_HOURS: "WORKING_HOURS",
  BREAKS: "BREAKS",
  TIME_OFF: "TIME_OFF",
  BLOCKED_SLOTS: "BLOCKED_SLOTS",
  CUSTOMERS: "CUSTOMERS",
  APPOINTMENTS: "APPOINTMENTS",
  CONVERSATIONS: "CONVERSATIONS",
  CONVERSATION_MESSAGES: "CONVERSATION_MESSAGES",
  WEBHOOK_EVENTS: "WEBHOOK_EVENTS",
  HUMAN_HANDOFFS: "HUMAN_HANDOFFS",
  NOTIFICATIONS: "NOTIFICATIONS",
  AUDIT_LOG: "AUDIT_LOG",
  FAQS: "FAQS",
  PROMOTIONS: "PROMOTIONS",
  DASHBOARD: "DASHBOARD",
};

var SHEET_HEADERS = {};
SHEET_HEADERS[SHEET_NAMES.SETTINGS] = ["key", "value", "type", "description", "editable", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.SERVICES] = [
  "serviceId", "name", "description", "price", "currency", "durationMinutes",
  "bufferMinutes", "category", "imageUrl", "active", "displayOrder", "demo",
  "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.BARBERS] = [
  "barberId", "name", "biography", "specialties", "photoUrl", "phoneE164",
  "active", "publicBooking", "displayOrder", "calendarId", "demo", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.BARBER_SERVICES] = ["barberServiceId", "barberId", "serviceId", "active", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.WORKING_HOURS] = [
  "workingHoursId", "barberId", "dayOfWeek", "openingTime", "closingTime", "active", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.BREAKS] = [
  "breakId", "barberId", "date", "dayOfWeek", "startTime", "endTime", "recurring",
  "reason", "active", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.TIME_OFF] = [
  "timeOffId", "barberId", "startDate", "endDate", "startTime", "endTime",
  "allDay", "reason", "active", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.BLOCKED_SLOTS] = [
  "blockedSlotId", "barberId", "localDate", "startTime", "endTime", "reason",
  "active", "createdBy", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.CUSTOMERS] = [
  "customerId", "name", "phoneE164", "whatsappId", "email", "source", "status",
  "firstContactAt", "lastContactAt", "totalAppointments", "confirmedAppointments",
  "completedAppointments", "cancelledAppointments", "noShowAppointments", "notes",
  "demo", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS] = [
  "appointmentId", "reference", "idempotencyKey", "managementTokenHash", "customerId",
  "customerNameSnapshot", "customerPhoneSnapshot", "serviceId", "serviceNameSnapshot",
  "servicePriceSnapshot", "serviceDurationSnapshot", "serviceBufferSnapshot", "barberId",
  "barberNameSnapshot", "localDate", "localStartTime", "localEndTime", "startUtc", "endUtc",
  "timezone", "status", "source", "customerNotes", "internalNotes", "calendarEventId",
  "calendarSyncStatus", "cancellationReason", "createdAt", "updatedAt", "cancelledAt",
  "completedAt", "demo",
];
SHEET_HEADERS[SHEET_NAMES.CONVERSATIONS] = [
  "conversationId", "customerId", "phoneE164", "state", "scratchDataJson",
  "humanHandoffActive", "version", "lastInboundMessageAt", "lastOutboundMessageAt",
  "sessionExpiresAt", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.CONVERSATION_MESSAGES] = [
  "messageId", "externalMessageId", "conversationId", "customerId", "phoneE164",
  "direction", "messageType", "body", "interactivePayloadJson", "processingStatus",
  "errorCode", "receivedAt", "sentAt", "createdAt",
];
SHEET_HEADERS[SHEET_NAMES.WEBHOOK_EVENTS] = [
  "eventId", "externalEventId", "eventType", "phoneE164", "payloadHash",
  "processingStatus", "receivedAt", "processedAt", "errorCode", "createdAt",
];
SHEET_HEADERS[SHEET_NAMES.HUMAN_HANDOFFS] = [
  "handoffId", "conversationId", "customerId", "phoneE164", "reason", "status",
  "assignedTo", "startedAt", "resolvedAt", "resolutionNotes", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.NOTIFICATIONS] = [
  "notificationId", "appointmentId", "customerId", "conversationId", "type", "channel",
  "scheduledAt", "status", "attemptCount", "lastAttemptAt", "sentAt", "errorCode",
  "errorMessage", "idempotencyKey", "payloadJson", "createdAt", "updatedAt",
];
SHEET_HEADERS[SHEET_NAMES.AUDIT_LOG] = [
  "auditId", "requestId", "actorType", "actorId", "action", "entityType", "entityId",
  "beforeJson", "afterJson", "metadataJson", "createdAt",
];
SHEET_HEADERS[SHEET_NAMES.FAQS] = ["faqId", "category", "question", "answer", "keywords", "active", "displayOrder", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.PROMOTIONS] = ["promotionId", "name", "description", "validFrom", "validUntil", "active", "terms", "updatedAt"];

/** All CRM data sheets except the generated DASHBOARD view. */
var CRM_DATA_SHEET_NAMES = Object.keys(SHEET_HEADERS);

/**
 * Type-normalization frontier between whatever Google Sheets' getValues()/
 * setValues() hands back and what every domain file assumes it receives.
 * Real Google Sheets auto-detects a cell's type from what's written to it
 * (or typed into it) — a literal "08:00" string can come back as a Date
 * (time-of-day serial) on the next read, and a phone number with no "+"
 * prefix (this CRM always strips it — Validation.gs's requirePhoneE164_)
 * can come back as a Number. The Node vm test harness's mock sheet never
 * does this coercion, which is exactly why this needs its own explicit,
 * column-name-driven boundary rather than relying on "the mock already
 * agrees with production." Column names are unique and consistent across
 * every sheet (CRM_SCHEMA.md), so classification is done once, by name —
 * not per sheet, except where a name only makes sense on one sheet
 * (SETTINGS.value, handled via EXTRA_TEXT_FORMAT_COLUMNS_BY_SHEET_ below).
 *
 * Deliberately NOT included: price, durationMinutes, bufferMinutes,
 * displayOrder, the *Appointments counters, servicePriceSnapshot,
 * serviceDurationSnapshot, serviceBufferSnapshot, version, attemptCount,
 * dayOfWeek — these must stay numeric, never forced to text.
 */
var LOCAL_TIME_COLUMN_NAMES_ = {
  openingTime: true, closingTime: true, startTime: true, endTime: true,
  localStartTime: true, localEndTime: true,
};
var LOCAL_DATE_COLUMN_NAMES_ = {
  localDate: true, date: true, startDate: true, endDate: true,
  validFrom: true, validUntil: true,
};
/** Identifiers/phones/hashes/keys that must never silently become a Number. */
var FORCE_STRING_COLUMN_NAMES_ = {
  phoneE164: true, customerPhoneSnapshot: true, reference: true,
  idempotencyKey: true, managementTokenHash: true, payloadHash: true,
};
/** Extra columns to force to text that only make sense on one specific sheet. */
var EXTRA_TEXT_FORMAT_COLUMNS_BY_SHEET_ = {};
EXTRA_TEXT_FORMAT_COLUMNS_BY_SHEET_[SHEET_NAMES.SETTINGS] = ["value"];

/** Every column ending in "Id" (customerId, serviceId, appointmentId, ...) is an identifier. */
function isForceStringColumn_(columnName) {
  return FORCE_STRING_COLUMN_NAMES_[columnName] === true || /Id$/.test(columnName);
}

/** Minutes-of-day fraction (0..1 — how Sheets stores a "time of day" cell internally) -> "HH:mm". */
function dayFractionToLocalTime_(fraction) {
  var totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  var hh = Math.floor(totalMinutes / 60);
  var mm = totalMinutes % 60;
  return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
}

/**
 * Normalizes whatever Sheets handed back for a local-time column into a
 * canonical "HH:mm" string: a Date (Sheets auto-parsed a literal "08:00"
 * into a time-of-day serial), a bare day-fraction Number, or an
 * already-correct string all resolve the same way. Empty/missing stays ""
 * so a required-field validator still reports it as missing, not a bad time.
 *
 * IMPORTANT — the Date branch reads UTC accessors (getUTCHours/
 * getUTCMinutes), never Utilities.formatDate()/a named timezone. A
 * production run against a real spreadsheet proved that wrong: Google
 * Sheets' date/time serials are anchored at a historical epoch (~Dec 30,
 * 1899), and re-projecting that instant through a named IANA timezone
 * (even the business's own) picks up that timezone's pre-standardization
 * historical UTC offset (often a non-round value, e.g. minutes, not whole
 * hours) — which has nothing to do with the business's actual, current
 * offset. A requested "09:00" round-tripped through
 * Utilities.formatDate(date, "America/La_Paz", "HH:mm") came back as
 * "04:27". The serial's UTC-labeled instant already *is* the intended
 * calendar/time-of-day value — Sheets' serial-to-Date conversion is pure
 * day/time arithmetic with no timezone concept involved at all — so
 * reading it back via getUTC*() is the correct, timezone-agnostic inverse
 * of however Sheets constructed it, regardless of the business timezone,
 * the script's timezone, or the spreadsheet file's own display timezone
 * setting (none of which matter here).
 */
function normalizeLocalTimeCellValue_(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  if (raw instanceof Date) {
    var hh = raw.getUTCHours();
    var mm = raw.getUTCMinutes();
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }
  if (typeof raw === "number") return dayFractionToLocalTime_(raw);
  var str = String(raw).trim();
  return isValidLocalTime_(str) ? str : str.substring(0, 5);
}

/**
 * Same idea for local-date columns — Sheets may hand back a Date instead
 * of "yyyy-MM-dd". Same fix, same reasoning as normalizeLocalTimeCellValue_
 * above: read UTC accessors (getUTCFullYear/getUTCMonth/getUTCDate)
 * directly, never Utilities.formatDate()/a named timezone — the previous,
 * timezone-reprojecting version shifted a requested "2026-07-27" back to
 * "2026-07-26" against a real spreadsheet (midnight UTC of the 27th,
 * reinterpreted in a UTC-negative business timezone, falls on the
 * evening of the 26th).
 */
function normalizeLocalDateCellValue_(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  if (raw instanceof Date) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return raw.getUTCFullYear() + "-" + pad(raw.getUTCMonth() + 1) + "-" + pad(raw.getUTCDate());
  }
  var str = String(raw).trim();
  return LOCAL_DATE_PATTERN.test(str) ? str : str.substring(0, 10);
}

/**
 * Identifiers/phones/hashes/keys must never silently become a Number
 * (Sheets auto-converts a purely-numeric string, like a phone with no "+"
 * prefix, to a Number) — always read/write/compare them as text.
 */
function normalizeIdentifierCellValue_(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  return String(raw).trim();
}

function normalizeSheetCellValue_(columnName, raw) {
  if (LOCAL_TIME_COLUMN_NAMES_[columnName]) return normalizeLocalTimeCellValue_(raw);
  if (LOCAL_DATE_COLUMN_NAMES_[columnName]) return normalizeLocalDateCellValue_(raw);
  if (isForceStringColumn_(columnName)) return normalizeIdentifierCellValue_(raw);
  return raw;
}

function shouldForceTextColumnFormat_(sheetName, columnName) {
  if (LOCAL_TIME_COLUMN_NAMES_[columnName] || LOCAL_DATE_COLUMN_NAMES_[columnName] || isForceStringColumn_(columnName)) {
    return true;
  }
  var extra = EXTRA_TEXT_FORMAT_COLUMNS_BY_SHEET_[sheetName];
  return !!extra && extra.indexOf(columnName) !== -1;
}

/**
 * Sets the data rows (never the header row) of every date/time/identifier
 * column to Plain Text ("@") number format, so a future write of a literal
 * "08:00"/"+591..."-shaped string into that column is no longer
 * auto-detected by Sheets as a Date/Number on the *next* read. This does
 * NOT retroactively change already-stored values (Range#setNumberFormat
 * only changes how a cell is interpreted going forward, not what's already
 * in it) — that's what normalizeSheetCellValue_ is for. Purely a format
 * change, never touches a value, safe to re-run on every setupCRM() call
 * against a sheet that already has real data.
 */
function applyTextColumnFormats_(sheet, sheetName, headers) {
  var maxRows = Math.max(sheet.getMaxRows(), 2);
  headers.forEach(function (columnName, index) {
    if (shouldForceTextColumnFormat_(sheetName, columnName)) {
      sheet.getRange(2, index + 1, maxRows - 1, 1).setNumberFormat("@");
    }
  });
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  var headers = SHEET_HEADERS[sheetName];
  if (!headers) {
    throw new ApiError(ERROR_CODES.INTERNAL_ERROR, "No headers defined for sheet: " + sheetName, false);
  }

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  ensureHeaders_(sheet, headers);
  return sheet;
}

/**
 * Adds any headers that are missing from an existing sheet, without
 * touching existing columns/data — this is what makes setupCRM() safe to
 * run repeatedly and safe to run against a sheet a human already
 * customized (BOOKING_RULES.md's "never erase existing legitimate data").
 */
function ensureHeaders_(sheet, expectedHeaders) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var existingSet = {};
  existing.forEach(function (h) {
    if (h) existingSet[h] = true;
  });

  var missing = expectedHeaders.filter(function (h) {
    return !existingSet[h];
  });

  if (missing.length > 0) {
    var startColumn = lastColumn + (existing[0] ? 1 : 0);
    sheet.getRange(1, startColumn === 0 ? 1 : startColumn, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
}

/**
 * Batch-reads an entire sheet into an array of header-keyed objects.
 * Single getDataRange() call — never call this inside a loop over rows;
 * call it once per request and work with the in-memory array.
 */
function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = normalizeSheetCellValue_(headers[c], row[c]);
    }
    obj.__row = r + 1; // 1-based sheet row, for in-place updates
    rows.push(obj);
  }
  return rows;
}

/**
 * Writes one full row via Range#setValues() (never Sheet#appendRow()) — a
 * real Google Sheet was observed still auto-detecting and coercing a
 * literal "08:00"/phone-shaped string into a Date/Number on a column
 * that was already Plain-Text-formatted by applyTextColumnFormats_'s
 * one-time, whole-column pass (setupCRM()), when written via appendRow().
 * Explicitly re-asserting Plain Text format on this row's own classified
 * cells immediately before the value write closes that gap regardless of
 * whether the sheet-wide one-time format actually covers this exact row,
 * and regardless of whichever Sheets API method is used to append —
 * never relying solely on a column format applied once, elsewhere, in the
 * past. Reads the row's current formats first and only overwrites the
 * classified columns' entries, so an unrelated column's format (e.g. a
 * human-applied currency format on `price`) is never touched.
 */
function writeRowRobustly_(sheet, headers, row, rowNumber) {
  var sheetName = sheet.getName();
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var classifiedIndexes = [];
  headers.forEach(function (h, i) {
    if (shouldForceTextColumnFormat_(sheetName, h)) classifiedIndexes.push(i);
  });
  if (classifiedIndexes.length > 0) {
    var currentFormats = range.getNumberFormats()[0];
    classifiedIndexes.forEach(function (i) { currentFormats[i] = "@"; });
    range.setNumberFormats([currentFormats]);
  }
  range.setValues([row]);
}

function appendRowFromObject_(sheet, headers, obj) {
  var row = headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return "";
    return normalizeSheetCellValue_(h, v);
  });
  writeRowRobustly_(sheet, headers, row, sheet.getLastRow() + 1);
}

function updateRowFromObject_(sheet, headers, obj, rowNumber) {
  var row = headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return "";
    return normalizeSheetCellValue_(h, v);
  });
  writeRowRobustly_(sheet, headers, row, rowNumber);
}
