/**
 * System actions — no business data, safe to call frequently.
 */

function actionHealth_() {
  var spreadsheetReachable = true;
  try {
    getSpreadsheet_().getName();
  } catch (e) {
    spreadsheetReachable = false;
  }

  return {
    status: spreadsheetReachable ? "ok" : "degraded",
    schemaVersion: CRM_SCHEMA_VERSION,
    apiVersion: API_VERSION,
    timestamp: new Date().toISOString(),
  };
}

function actionGetApiVersion_() {
  return { apiVersion: API_VERSION, schemaVersion: CRM_SCHEMA_VERSION };
}

function actionValidateCrmStructure_() {
  return validateCrmStructure();
}
