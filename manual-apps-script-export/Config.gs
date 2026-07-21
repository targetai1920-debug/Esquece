/**
 * Script Properties access. These are the only place secrets live on the
 * Apps Script side — never in a visible spreadsheet cell. Set via
 * File > Project Settings > Script Properties, or Apps Script's
 * PropertiesService API during setup. See APPS_SCRIPT_SETUP.md.
 */

var SCRIPT_PROPERTY_KEYS = {
  CRM_API_KEY: "CRM_API_KEY",
  CRM_SIGNING_SECRET: "CRM_SIGNING_SECRET",
  CRM_SPREADSHEET_ID: "CRM_SPREADSHEET_ID",
  BUSINESS_TIMEZONE: "BUSINESS_TIMEZONE",
  GOOGLE_CALENDAR_ID: "GOOGLE_CALENDAR_ID",
  ENABLE_CALENDAR_SYNC: "ENABLE_CALENDAR_SYNC",
  INTERNAL_NOTIFICATION_EMAIL: "INTERNAL_NOTIFICATION_EMAIL",
};

function getScriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function requireScriptProperty_(key) {
  var value = getScriptProperty_(key);
  if (!value) {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      "Missing required Script Property: " + key + ". See APPS_SCRIPT_SETUP.md.",
      false,
    );
  }
  return value;
}

function getCrmApiKey_() {
  return requireScriptProperty_(SCRIPT_PROPERTY_KEYS.CRM_API_KEY);
}

function getCrmSigningSecret_() {
  return requireScriptProperty_(SCRIPT_PROPERTY_KEYS.CRM_SIGNING_SECRET);
}

function getSpreadsheetId_() {
  return requireScriptProperty_(SCRIPT_PROPERTY_KEYS.CRM_SPREADSHEET_ID);
}

/** Falls back to America/La_Paz if unset — never invents a different default. */
function getBusinessTimezone_() {
  return getScriptProperty_(SCRIPT_PROPERTY_KEYS.BUSINESS_TIMEZONE) || "America/La_Paz";
}

function isCalendarSyncEnabled_() {
  return getScriptProperty_(SCRIPT_PROPERTY_KEYS.ENABLE_CALENDAR_SYNC) === "true";
}

function getGoogleCalendarId_() {
  return getScriptProperty_(SCRIPT_PROPERTY_KEYS.GOOGLE_CALENDAR_ID) || null;
}

function getInternalNotificationEmail_() {
  return getScriptProperty_(SCRIPT_PROPERTY_KEYS.INTERNAL_NOTIFICATION_EMAIL) || null;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

/** Request freshness window — reject requests older or newer than this. See Security.gs. */
var REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
var NONCE_CACHE_TTL_SECONDS = 5 * 60;
var SCRIPT_LOCK_TIMEOUT_MS = 20 * 1000;
