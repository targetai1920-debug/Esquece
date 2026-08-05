function actionHealth_() {
  return { status: "live", schemaVersion: SCHEMA_VERSION };
}

function actionGetApiVersion_() {
  return { apiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION };
}

function actionValidateCrmStructure_() {
  return validateCrmStructure();
}
