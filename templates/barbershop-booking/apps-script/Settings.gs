function getSettingsMap_() {
  var rows = sheetToObjects_(SHEET_NAMES.SETTINGS);
  var map = {};
  for (var i = 0; i < rows.length; i++) map[rows[i].key] = rows[i].value;
  return map;
}

function getSettingValue_(map, key, type) {
  var raw = map[key];
  if (raw === undefined || raw === "") return null;
  if (type === "number") return Number(raw);
  if (type === "boolean") return String(raw) === "true";
  return raw;
}

function getBusinessSettingsObject_() {
  var map = getSettingsMap_();
  return {
    name: getSettingValue_(map, "businessName", "string") || "",
    timezone: getSettingValue_(map, "timezone", "string") || "Etc/UTC",
    locale: getSettingValue_(map, "locale", "string") || "en-US",
    currency: getSettingValue_(map, "currency", "string") || "USD",
    address: getSettingValue_(map, "address", "string") || "",
    phone: getSettingValue_(map, "phone", "string") || "",
    email: getSettingValue_(map, "email", "string") || "",
    instagram: getSettingValue_(map, "instagram", "string") || "",
    mapsUrl: getSettingValue_(map, "mapsUrl", "string") || "",
    minimumNoticeMinutes: getSettingValue_(map, "minimumNoticeMinutes", "number") || 0,
    maximumAdvanceDays: getSettingValue_(map, "maximumAdvanceDays", "number") || 60,
    slotIntervalMinutes: getSettingValue_(map, "slotIntervalMinutes", "number") || 30,
    allowAnyStaff: getSettingValue_(map, "allowAnyStaff", "boolean") !== false,
    cancellationNoticeHours: getSettingValue_(map, "cancellationNoticeHours", "number") || 0,
    cancellationPolicy: getSettingValue_(map, "cancellationPolicy", "string") || "",
  };
}

function actionGetBusinessSettings_() {
  return getBusinessSettingsObject_();
}

function actionUpdateSetting_(payload) {
  var key = requireString_(payload, "key");
  var value = payload.value === undefined || payload.value === null ? "" : String(payload.value);
  var rows = sheetToObjects_(SHEET_NAMES.SETTINGS);
  var existing = findRowById_(SHEET_NAMES.SETTINGS, "key", key, rows);
  if (!existing) throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Unknown setting: " + key, false);
  updateRowById_(SHEET_NAMES.SETTINGS, "key", key, { value: value, updatedAt: new Date().toISOString() });
  writeAuditEntry_("updateSetting", "Setting", key, "admin", { value: value });
  return { key: key, value: value };
}
