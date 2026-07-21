/**
 * SETTINGS sheet access. See BOOKING_RULES.md §0 for what these keys mean
 * and CRM_SCHEMA.md for the sheet's columns.
 */

function coerceSettingValue_(rawValue, type) {
  if (type === "boolean") return String(rawValue).toLowerCase() === "true";
  if (type === "number") {
    var n = Number(rawValue);
    return isNaN(n) ? null : n;
  }
  // OPENING_TIME/CLOSING_TIME are type "time" — Sheets may hand back a Date
  // (a literal "08:00" auto-parsed as a time-of-day serial) or a bare
  // day-fraction Number instead of the string; normalize the same way
  // every other local-time column does (Sheets.gs).
  if (type === "time") return normalizeLocalTimeCellValue_(rawValue);
  return rawValue === undefined || rawValue === null ? "" : String(rawValue);
}

/**
 * Reads SETTINGS once and returns a plain { KEY: typedValue } map. Used
 * internally by other domain files (and Phase D's availability engine) —
 * prefer this over re-reading the sheet directly for every lookup within
 * a single request.
 */
function getSettingsMap_() {
  var sheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.SETTINGS);
  var rows = sheetToObjects_(sheet);
  var map = {};
  rows.forEach(function (row) {
    if (!row.key) return;
    map[row.key] = coerceSettingValue_(row.value, row.type);
  });
  return map;
}

function getSettingValue_(key, fallback) {
  var map = getSettingsMap_();
  return map[key] === undefined ? fallback : map[key];
}

function actionGetBusinessSettings_() {
  return getSettingsMap_();
}
