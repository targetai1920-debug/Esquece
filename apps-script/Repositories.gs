/**
 * Generic, sheet-agnostic CRUD helpers built on top of Sheets.gs's
 * batch read/write primitives. Domain files (Services.gs, Barbers.gs,
 * Customers.gs, and later Phase D's Availability.gs/Appointments.gs) use
 * these instead of hand-rolling row-finding logic each time.
 */

/**
 * Canonical string form for an identifier-column comparison — "" for
 * null/undefined/empty (so a missing id never matches a blank cell), the
 * trimmed string otherwise. Defense-in-depth on top of Sheets.gs's own
 * read-side normalization: even if a caller passes a raw Number (or a
 * column somehow escapes normalizeSheetCellValue_'s classification), this
 * still compares canonically instead of failing strict `===` on
 * String-vs-Number (e.g. a phone number Sheets auto-converted to a Number).
 */
function canonicalIdString_(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

function findRowById_(sheet, idColumn, id) {
  var target = canonicalIdString_(id);
  if (target === null) return null;
  var rows = sheetToObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (canonicalIdString_(rows[i][idColumn]) === target) return rows[i];
  }
  return null;
}

function findRowsWhere_(sheet, predicate) {
  return sheetToObjects_(sheet).filter(predicate);
}

/**
 * Inserts a new row, stamping createdAt/updatedAt if those columns exist
 * on the sheet and weren't already provided by the caller.
 */
function insertRow_(sheet, headers, fields) {
  var now = new Date().toISOString();
  var row = Object.assign({}, fields);
  if (headers.indexOf("createdAt") !== -1 && !row.createdAt) row.createdAt = now;
  if (headers.indexOf("updatedAt") !== -1 && !row.updatedAt) row.updatedAt = now;
  appendRowFromObject_(sheet, headers, row);
  return row;
}

/**
 * Merges `patch` onto the existing row found by idColumn/id, stamps
 * updatedAt if present, and writes it back in place. Throws NOT_FOUND if
 * no such row exists — callers pass a more specific error code/message
 * via notFoundError when the generic NOT_FOUND isn't precise enough.
 */
function updateRowById_(sheet, headers, idColumn, id, patch, notFoundError) {
  var existing = findRowById_(sheet, idColumn, id);
  if (!existing) {
    throw notFoundError || new ApiError(ERROR_CODES.NOT_FOUND, "No encontrado: " + id, false);
  }
  var updated = Object.assign({}, existing, patch);
  if (headers.indexOf("updatedAt") !== -1) updated.updatedAt = new Date().toISOString();
  updateRowFromObject_(sheet, headers, updated, existing.__row);
  return updated;
}

/**
 * Short, readable, non-guessable-enough-for-display entity ids, prefixed
 * by domain for readability in the sheet (e.g. "svc_...", "brb_...").
 * Not used where unguessability is a security property — see Ids.gs's
 * generateManagementToken_ for that.
 */
function generateEntityId_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").substring(0, 20);
}
