function writeAuditEntry_(action, entityType, entityId, actorType, metadata) {
  appendRowFromObject_(SHEET_NAMES.AUDIT_LOG, {
    auditId: generateUuid_(),
    action: action,
    entityType: entityType,
    entityId: entityId,
    actorType: actorType,
    metadataJson: metadata ? JSON.stringify(metadata) : "",
    createdAt: new Date().toISOString(),
  });
}

function actionCreateAuditEntry_(payload) {
  writeAuditEntry_(
    requireString_(payload, "action"),
    requireString_(payload, "entityType"),
    requireString_(payload, "entityId"),
    optionalString_(payload, "actorType") || "system",
    payload.metadata,
  );
  return { ok: true };
}

function actionListAuditLog_() {
  var rows = sheetToObjects_(SHEET_NAMES.AUDIT_LOG);
  return {
    entries: rows.map(function (r) {
      return {
        id: r.auditId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorType: r.actorType,
        metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
        createdAt: r.createdAt,
      };
    }),
  };
}
