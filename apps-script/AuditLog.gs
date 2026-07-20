/**
 * AUDIT_LOG sheet access. Every admin-initiated (and significant
 * system-initiated) mutation writes one of these — SECURITY.md.
 */

function getAuditLogSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.AUDIT_LOG);
}

function writeAuditEntry_(params) {
  var sheet = getAuditLogSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.AUDIT_LOG];
  insertRow_(sheet, headers, {
    auditId: generateEntityId_("aud"),
    requestId: params.requestId || null,
    actorType: params.actorType,
    actorId: params.actorId || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    beforeJson: params.before !== undefined ? stableStringify_(params.before) : null,
    afterJson: params.after !== undefined ? stableStringify_(params.after) : null,
    metadataJson: params.metadata !== undefined ? stableStringify_(params.metadata) : null,
  });
}

function actionCreateAuditEntry_(payload) {
  writeAuditEntry_({
    requestId: payload && payload.requestId,
    actorType: requireString_(payload && payload.actorType, "actorType"),
    actorId: payload && payload.actorId,
    action: requireString_(payload && payload.action, "action"),
    entityType: requireString_(payload && payload.entityType, "entityType"),
    entityId: requireString_(payload && payload.entityId, "entityId"),
    before: payload && payload.before,
    after: payload && payload.after,
    metadata: payload && payload.metadata,
  });
  return { ok: true };
}

function actionListAuditEntries_(payload) {
  var entityType = payload && payload.entityType;
  var entityId = payload && payload.entityId;
  var rows = sheetToObjects_(getAuditLogSheet_());
  if (entityType) rows = rows.filter(function (r) { return r.entityType === entityType; });
  if (entityId) rows = rows.filter(function (r) { return r.entityId === entityId; });
  rows.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return { entries: rows };
}
