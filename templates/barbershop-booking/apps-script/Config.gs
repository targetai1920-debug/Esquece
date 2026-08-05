/**
 * Script Properties access — the only place secrets are read from. Set
 * these from the Apps Script editor (Project Settings → Script Properties),
 * never hardcoded here. See DEPLOYMENT_GUIDE.md / APPS_SCRIPT_CONNECT_GUIDE.md
 * (generated per client by factory/prepare-crm.mjs) for the exact values.
 */

function getScriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getCrmApiKey_() {
  var value = getScriptProperty_("CRM_API_KEY");
  if (!value) throw new ApiError(ERROR_CODES.INTERNAL_ERROR, "CRM_API_KEY is not configured.", false);
  return value;
}

function getCrmSigningSecret_() {
  var value = getScriptProperty_("CRM_SIGNING_SECRET");
  if (!value) throw new ApiError(ERROR_CODES.INTERNAL_ERROR, "CRM_SIGNING_SECRET is not configured.", false);
  return value;
}

function getCrmSpreadsheetId_() {
  var value = getScriptProperty_("CRM_SPREADSHEET_ID");
  if (!value) throw new ApiError(ERROR_CODES.INTERNAL_ERROR, "CRM_SPREADSHEET_ID is not configured.", false);
  return value;
}

var REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
var NONCE_CACHE_TTL_SECONDS = 5 * 60;
var API_VERSION = "1";
var SCHEMA_VERSION = "1";
