/**
 * CRM setup — idempotent, safe to run repeatedly, never erases existing
 * data. See BOOKING_RULES.md §0 for what these default values mean and
 * CLIENT_INFORMATION_REQUIRED.md for which of them are still demo values
 * pending real business data.
 */

var CRM_SCHEMA_VERSION = "1";

var DEFAULT_SETTINGS_ROWS_ = [
  ["BUSINESS_NAME", "Esquece Barber Studio", "string", "Nombre del negocio", "true"],
  ["BUSINESS_TIMEZONE", "America/La_Paz", "string", "Zona horaria del negocio", "true"],
  ["CURRENCY", "BOB", "string", "Moneda", "true"],
  ["OPENING_TIME", "08:00", "time", "Hora de apertura general", "true"],
  ["CLOSING_TIME", "16:00", "time", "Hora de cierre general", "true"],
  ["SLOT_INTERVAL_MINUTES", "30", "number", "Intervalo entre horarios ofrecidos", "true"],
  ["MIN_BOOKING_NOTICE_MINUTES", "60", "number", "Anticipación mínima para reservar", "true"],
  ["MAX_ADVANCE_BOOKING_DAYS", "60", "number", "Máximo de días de anticipación", "true"],
  ["SESSION_TIMEOUT_MINUTES", "60", "number", "Expiración de sesión de conversación", "true"],
  ["MONDAY_OPEN", "true", "boolean", "Abierto lunes", "true"],
  ["TUESDAY_OPEN", "true", "boolean", "Abierto martes", "true"],
  ["WEDNESDAY_OPEN", "true", "boolean", "Abierto miércoles", "true"],
  ["THURSDAY_OPEN", "true", "boolean", "Abierto jueves", "true"],
  ["FRIDAY_OPEN", "true", "boolean", "Abierto viernes", "true"],
  ["SATURDAY_OPEN", "false", "boolean", "Abierto sábado", "true"],
  ["SUNDAY_OPEN", "false", "boolean", "Abierto domingo", "true"],
  ["DEFAULT_BUFFER_MINUTES", "0", "number", "Margen por defecto entre citas", "true"],
  ["ALLOW_ANY_BARBER", "true", "boolean", "Permitir \"cualquiera disponible\"", "true"],
  ["ENABLE_REMINDERS", "false", "boolean", "Activar recordatorios automáticos", "true"],
  ["ENABLE_CALENDAR_SYNC", "false", "boolean", "Activar sincronización con Google Calendar", "true"],
  ["BUSINESS_ADDRESS", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — dirección exacta", "true"],
  ["GOOGLE_MAPS_URL", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — enlace de Google Maps", "true"],
  ["INSTAGRAM_URL", "https://instagram.com/esquece.barber.studio", "string", "Instagram", "true"],
  ["WHATSAPP_DISPLAY_NUMBER", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — número de WhatsApp", "true"],
  ["PAYMENT_METHODS", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — métodos de pago aceptados", "true"],
  ["CANCELLATION_POLICY", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — política de cancelación", "true"],
  ["LATE_ARRIVAL_POLICY", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — política de tardanza", "true"],
  ["NO_SHOW_POLICY", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — política de inasistencia", "true"],
  ["REMINDER_HOURS_BEFORE", "24", "number", "Horas de anticipación del recordatorio", "true"],
  ["INTERNAL_NOTIFICATION_EMAIL", "", "string", "Correo para alertas internas", "true"],
  ["INTERNAL_NOTIFICATION_PHONE", "", "string", "DEMO_DATA_REPLACE_BEFORE_PRODUCTION — teléfono para alertas internas", "true"],
  ["CRM_SCHEMA_VERSION", CRM_SCHEMA_VERSION, "string", "Versión del esquema del CRM", "false"],
];

/**
 * Idempotent CRM setup. Safe to run multiple times: creates missing
 * sheets/headers, never deletes or overwrites existing SETTINGS rows or
 * any other data.
 */
/**
 * Column-format application (Sheets.gs's applyTextColumnFormats_) is a real
 * Google Sheets API cost — one Range#setNumberFormat call per classified
 * column, each spanning up to ~1000 rows. setupCRM() is idempotent and
 * called often (several internal tests call it before seeding demo data),
 * so redoing this on every single call was enough real-Sheets latency,
 * multiplied across many calls in one execution, to push
 * runAllInternalTests() past Apps Script's 6-minute execution limit. This
 * version marker makes it a true one-time cost: the very first call (a
 * brand-new sheet, or an existing production sheet that predates this
 * feature) still fixes every column exactly once; every call after that
 * skips the expensive part entirely — never touches a value either way, so
 * this is purely a performance change, not a data change. Bump
 * COLUMN_FORMAT_VERSION_ if the column classification itself ever changes
 * and existing sheets need it reapplied.
 */
var COLUMN_FORMAT_VERSION_ = "1";
var COLUMN_FORMAT_VERSION_PROPERTY_ = "CRM_COLUMN_FORMAT_VERSION_APPLIED";

function columnFormatsAreUpToDate_() {
  return getScriptProperty_(COLUMN_FORMAT_VERSION_PROPERTY_) === COLUMN_FORMAT_VERSION_;
}

function markColumnFormatsUpToDate_() {
  PropertiesService.getScriptProperties().setProperty(COLUMN_FORMAT_VERSION_PROPERTY_, COLUMN_FORMAT_VERSION_);
}

function setupCRM() {
  var spreadsheet = getSpreadsheet_();
  var sheetsByName = {};

  CRM_DATA_SHEET_NAMES.forEach(function (name) {
    sheetsByName[name] = getOrCreateSheet_(spreadsheet, name);
  });

  if (!columnFormatsAreUpToDate_()) {
    // Plain-text format on every date/time/identifier column so a future
    // write of "08:00"/a numeric-looking phone into that column doesn't get
    // auto-detected by Sheets as a Date/Number on the next read. Format-only
    // (never touches a value), safe to run against the real, already-
    // populated production sheet — but only actually needs to happen once.
    CRM_DATA_SHEET_NAMES.forEach(function (name) {
      applyTextColumnFormats_(sheetsByName[name], name, SHEET_HEADERS[name]);
    });
    markColumnFormatsUpToDate_();
  }

  seedDefaultSettings_(spreadsheet);
  rebuildDashboard_(spreadsheet);

  Logger.log("setupCRM() complete. Schema version " + CRM_SCHEMA_VERSION + ".");
  return { ok: true, schemaVersion: CRM_SCHEMA_VERSION };
}

function seedDefaultSettings_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.SETTINGS);
  var existingRows = sheetToObjects_(sheet);
  var existingKeys = {};
  existingRows.forEach(function (row) {
    existingKeys[row.key] = true;
  });

  var now = new Date().toISOString();
  var headers = SHEET_HEADERS[SHEET_NAMES.SETTINGS];

  DEFAULT_SETTINGS_ROWS_.forEach(function (defaultRow) {
    var key = defaultRow[0];
    if (existingKeys[key]) return; // never overwrite a value already present
    appendRowFromObject_(sheet, headers, {
      key: key,
      value: defaultRow[1],
      type: defaultRow[2],
      description: defaultRow[3],
      editable: defaultRow[4],
      updatedAt: now,
    });
  });
}

function validateCrmStructure() {
  var spreadsheet = getSpreadsheet_();
  var problems = [];

  CRM_DATA_SHEET_NAMES.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      problems.push("Missing sheet: " + name);
      return;
    }
    var expected = SHEET_HEADERS[name];
    var actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    var actualSet = {};
    actual.forEach(function (h) {
      if (h) actualSet[h] = true;
    });
    expected.forEach(function (h) {
      if (!actualSet[h]) {
        problems.push("Sheet " + name + " is missing column: " + h);
      }
    });
  });

  var result = { ok: problems.length === 0, problems: problems };
  Logger.log(JSON.stringify(result));
  return result;
}

function showCrmVersion() {
  var message = "CRM schema version: " + CRM_SCHEMA_VERSION;
  Logger.log(message);
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    // Not running in a spreadsheet UI context (e.g. called from a test) — logging is enough.
  }
  return CRM_SCHEMA_VERSION;
}
