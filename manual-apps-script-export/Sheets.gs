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
      obj[headers[c]] = row[c];
    }
    obj.__row = r + 1; // 1-based sheet row, for in-place updates
    rows.push(obj);
  }
  return rows;
}

function appendRowFromObject_(sheet, headers, obj) {
  var row = headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? "" : v;
  });
  sheet.appendRow(row);
}

function updateRowFromObject_(sheet, headers, obj, rowNumber) {
  var row = headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? "" : v;
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}
