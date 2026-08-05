/**
 * setupCRM() — idempotent sheet/column creation. Safe to run repeatedly,
 * including against a sheet that already has real data: only adds missing
 * sheets/columns/settings, never deletes or overwrites an existing value.
 * See references/crm-data-model.md §"Setup/migration idempotency".
 */

var DEFAULT_SETTINGS_ROWS_ = [
  { key: "businessName", value: "", type: "string" },
  { key: "timezone", value: "Etc/UTC", type: "string" },
  { key: "locale", value: "en-US", type: "string" },
  { key: "currency", value: "USD", type: "string" },
  { key: "address", value: "", type: "string" },
  { key: "phone", value: "", type: "string" },
  { key: "email", value: "", type: "string" },
  { key: "instagram", value: "", type: "string" },
  { key: "mapsUrl", value: "", type: "string" },
  { key: "minimumNoticeMinutes", value: "60", type: "number" },
  { key: "maximumAdvanceDays", value: "60", type: "number" },
  { key: "slotIntervalMinutes", value: "30", type: "number" },
  { key: "allowAnyStaff", value: "true", type: "boolean" },
  { key: "cancellationNoticeHours", value: "24", type: "number" },
  { key: "cancellationPolicy", value: "", type: "string" },
];

function setupCRM() {
  var allSheetNames = [];
  for (var key in SHEET_NAMES) allSheetNames.push(SHEET_NAMES[key]);
  for (var i = 0; i < allSheetNames.length; i++) {
    var sheet = getOrCreateSheet_(allSheetNames[i]);
    ensureSheetHeaders_(sheet, allSheetNames[i]);
  }

  var existingSettings = sheetToObjects_(SHEET_NAMES.SETTINGS);
  var existingKeys = {};
  for (var s = 0; s < existingSettings.length; s++) existingKeys[existingSettings[s].key] = true;
  for (var d = 0; d < DEFAULT_SETTINGS_ROWS_.length; d++) {
    var row = DEFAULT_SETTINGS_ROWS_[d];
    if (!existingKeys[row.key]) {
      appendRowFromObject_(SHEET_NAMES.SETTINGS, {
        key: row.key,
        value: row.value,
        type: row.type,
        description: "",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { ok: true };
}

function validateCrmStructure() {
  var problems = [];
  for (var key in SHEET_NAMES) {
    var name = SHEET_NAMES[key];
    var sheet = getSpreadsheet_().getSheetByName(name);
    if (!sheet) {
      problems.push("Missing sheet: " + name);
      continue;
    }
    var headers = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    var declared = SHEET_HEADERS[name];
    for (var i = 0; i < declared.length; i++) {
      if (headers.indexOf(declared[i]) === -1) {
        problems.push("Sheet " + name + " is missing column: " + declared[i]);
      }
    }
  }
  return { ok: problems.length === 0, problems: problems };
}
