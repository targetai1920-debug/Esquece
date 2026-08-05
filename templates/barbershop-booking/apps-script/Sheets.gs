/**
 * Sheet names, column headers, and generic batch read/write helpers. See
 * .claude/skills/barbershop-crm-builder/references/crm-data-model.md and
 * references/google-sheets-apps-script.md for why the coercion/robust-write
 * handling below exists — Sheets can silently coerce phone numbers to
 * numbers, times to Date objects or day fractions, etc.
 */

var SHEET_NAMES = {
  SETTINGS: "SETTINGS",
  SERVICES: "SERVICES",
  STAFF: "STAFF",
  STAFF_SERVICES: "STAFF_SERVICES",
  WORKING_HOURS: "WORKING_HOURS",
  BREAKS: "BREAKS",
  TIME_OFF: "TIME_OFF",
  BLOCKED_SLOTS: "BLOCKED_SLOTS",
  CUSTOMERS: "CUSTOMERS",
  APPOINTMENTS: "APPOINTMENTS",
  FAQS: "FAQS",
  PROMOTIONS: "PROMOTIONS",
  AUDIT_LOG: "AUDIT_LOG",
};

var SHEET_HEADERS = {};
SHEET_HEADERS[SHEET_NAMES.SETTINGS] = ["key", "value", "type", "description", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.SERVICES] = ["serviceId", "name", "description", "price", "currency", "durationMinutes", "bufferMinutes", "active", "displayOrder", "image", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.STAFF] = ["staffId", "name", "biography", "photoUrl", "active", "publicBooking", "displayOrder", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.STAFF_SERVICES] = ["staffServiceId", "staffId", "serviceId", "active", "createdAt"];
SHEET_HEADERS[SHEET_NAMES.WORKING_HOURS] = ["workingHoursId", "staffId", "dayOfWeek", "openingTime", "closingTime", "active", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.BREAKS] = ["breakId", "staffId", "dayOfWeek", "startTime", "endTime", "active", "createdAt"];
SHEET_HEADERS[SHEET_NAMES.TIME_OFF] = ["timeOffId", "staffId", "startDate", "endDate", "reason", "active", "createdAt"];
SHEET_HEADERS[SHEET_NAMES.BLOCKED_SLOTS] = ["blockedSlotId", "staffId", "localDate", "startTime", "endTime", "reason", "active", "createdAt"];
SHEET_HEADERS[SHEET_NAMES.CUSTOMERS] = ["customerId", "name", "phone", "email", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS] = [
  "appointmentId", "reference", "idempotencyKey", "serviceId", "serviceNameSnapshot", "servicePriceSnapshot",
  "serviceDurationSnapshot", "serviceBufferSnapshot", "staffId", "staffNameSnapshot", "customerId",
  "customerNameSnapshot", "customerPhoneSnapshot", "localDate", "localStartTime", "localEndTime", "status",
  "source", "customerNotes", "managementTokenHash", "createdAt", "updatedAt", "cancelledAt", "cancellationReason",
];
SHEET_HEADERS[SHEET_NAMES.FAQS] = ["faqId", "question", "answer", "active", "displayOrder"];
SHEET_HEADERS[SHEET_NAMES.PROMOTIONS] = ["promotionId", "name", "description", "validFrom", "validUntil", "active"];
SHEET_HEADERS[SHEET_NAMES.AUDIT_LOG] = ["auditId", "action", "entityType", "entityId", "actorType", "metadataJson", "createdAt"];

// Columns known to be coercion-prone — normalized explicitly on read, and
// forced to a text format on write. Extend this if a new column is added
// to any sheet above that holds a phone number, an "HH:mm" time, or a
// zero-padded id.
var TEXT_FORCED_COLUMN_NAMES_ = {
  phone: true, customerPhoneSnapshot: true,
  localStartTime: true, localEndTime: true, openingTime: true, closingTime: true, startTime: true, endTime: true,
  localDate: true, startDate: true, endDate: true,
  staffId: true, serviceId: true, customerId: true, appointmentId: true,
};

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getCrmSpreadsheetId_());
}

function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/** Adds any header columns declared above that a sheet doesn't have yet — never removes or reorders existing ones. */
function ensureSheetHeaders_(sheet, sheetName) {
  var declared = SHEET_HEADERS[sheetName];
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var existingSet = {};
  for (var i = 0; i < existing.length; i++) existingSet[existing[i]] = true;

  var missing = declared.filter(function (h) {
    return !existingSet[h];
  });
  if (existing.length === 0) {
    sheet.getRange(1, 1, 1, declared.length).setValues([declared]);
  } else if (missing.length > 0) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  applyTextColumnFormats_(sheet, sheetName);
}

function applyTextColumnFormats_(sheet, sheetName) {
  var headers = SHEET_HEADERS[sheetName];
  var maxRows = Math.max(sheet.getMaxRows(), 1000);
  for (var c = 0; c < headers.length; c++) {
    if (TEXT_FORCED_COLUMN_NAMES_[headers[c]]) {
      sheet.getRange(1, c + 1, maxRows, 1).setNumberFormat("@");
    }
  }
}

function normalizeTextCellValue_(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

/**
 * A cell auto-parsed by Sheets from an "HH:mm" literal has no real
 * timezone identity — extract with UTC getters, matching how the platform
 * actually stores a time-only value. Also handles the day-fraction-number
 * shape and the case where TEXT_FORCED_COLUMN_NAMES_ already kept it a
 * plain string.
 */
function normalizeLocalTimeCellValue_(raw) {
  if (raw instanceof Date) {
    var h = raw.getUTCHours();
    var m = raw.getUTCMinutes();
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
  }
  if (typeof raw === "number") {
    var totalMinutes = Math.round(raw * 24 * 60);
    var hh = Math.floor(totalMinutes / 60);
    var mm = totalMinutes % 60;
    return (hh < 10 ? "0" + hh : hh) + ":" + (mm < 10 ? "0" + mm : mm);
  }
  return normalizeTextCellValue_(raw);
}

function normalizeLocalDateCellValue_(raw) {
  if (raw instanceof Date) {
    var y = raw.getUTCFullYear();
    var mo = raw.getUTCMonth() + 1;
    var d = raw.getUTCDate();
    return y + "-" + (mo < 10 ? "0" + mo : mo) + "-" + (d < 10 ? "0" + d : d);
  }
  return normalizeTextCellValue_(raw);
}

var LOCAL_TIME_COLUMN_NAMES_ = { openingTime: true, closingTime: true, startTime: true, endTime: true, localStartTime: true, localEndTime: true };
var LOCAL_DATE_COLUMN_NAMES_ = { localDate: true, startDate: true, endDate: true };

function normalizeCellValue_(columnName, raw) {
  if (LOCAL_TIME_COLUMN_NAMES_[columnName]) return normalizeLocalTimeCellValue_(raw);
  if (LOCAL_DATE_COLUMN_NAMES_[columnName]) return normalizeLocalDateCellValue_(raw);
  if (TEXT_FORCED_COLUMN_NAMES_[columnName]) return normalizeTextCellValue_(raw);
  if (raw === "") return undefined;
  return raw;
}

/** Reads every data row of a sheet into an array of plain objects keyed by its declared headers. */
function sheetToObjects_(sheetName) {
  var sheet = getOrCreateSheet_(sheetName);
  ensureSheetHeaders_(sheet, sheetName);
  var headers = SHEET_HEADERS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (row.every(function (v) { return v === ""; })) continue; // skip fully-empty rows
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var normalized = normalizeCellValue_(headers[c], row[c]);
      if (normalized !== undefined) obj[headers[c]] = normalized;
    }
    obj._rowNumber = r + 2;
    out.push(obj);
  }
  return out;
}

/**
 * Writes into an explicitly-addressed range rather than a generic
 * "append" call — a column already formatted as plain text has still been
 * observed re-coerced by a naive append on the very next write. See
 * references/google-sheets-apps-script.md.
 */
function writeRowRobustly_(sheet, headers, row, rowNumber) {
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function appendRowFromObject_(sheetName, obj) {
  var sheet = getOrCreateSheet_(sheetName);
  ensureSheetHeaders_(sheet, sheetName);
  var headers = SHEET_HEADERS[sheetName];
  var row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? "" : obj[h];
  });
  writeRowRobustly_(sheet, headers, row, sheet.getLastRow() + 1);
  return obj;
}

function updateRowFromObject_(sheetName, rowNumber, obj) {
  var sheet = getOrCreateSheet_(sheetName);
  var headers = SHEET_HEADERS[sheetName];
  var row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? "" : obj[h];
  });
  writeRowRobustly_(sheet, headers, row, rowNumber);
  return obj;
}
