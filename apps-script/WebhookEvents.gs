/**
 * WEBHOOK_EVENTS — persistent, lock-guarded dedup ledger for inbound Meta
 * webhook deliveries. WHATSAPP_AGENT_DESIGN.md §3: this lock-guarded
 * read-then-write is the atomic equivalent of Postgres's
 * INSERT...ON CONFLICT DO NOTHING — the lock is what makes it correct
 * under concurrent webhook deliveries, not a unique constraint (Sheets
 * has none).
 */

function getWebhookEventsSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.WEBHOOK_EVENTS);
}

function actionRegisterWebhookEvent_(payload) {
  var externalEventId = requireString_(payload && payload.externalEventId, "externalEventId");
  var eventType = requireString_(payload && payload.eventType, "eventType");

  return withScriptLock_(function () {
    var sheet = getWebhookEventsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.WEBHOOK_EVENTS];
    var existing = findRowById_(sheet, "externalEventId", externalEventId);
    if (existing) {
      return { isDuplicate: true, eventId: existing.eventId };
    }
    var created = insertRow_(sheet, headers, {
      eventId: generateEntityId_("evt"),
      externalEventId: externalEventId,
      eventType: eventType,
      phoneE164: (payload && payload.phoneE164) || "",
      payloadHash: (payload && payload.payloadHash) || "",
      processingStatus: "PROCESSING",
      receivedAt: new Date().toISOString(),
    });
    return { isDuplicate: false, eventId: created.eventId };
  });
}

function actionMarkWebhookEventProcessed_(payload) {
  var externalEventId = requireString_(payload && payload.externalEventId, "externalEventId");
  var sheet = getWebhookEventsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.WEBHOOK_EVENTS];
  var existing = findRowById_(sheet, "externalEventId", externalEventId);
  if (!existing) throw new ApiError(ERROR_CODES.NOT_FOUND, "Evento no encontrado.", false);
  updateRowById_(sheet, headers, "externalEventId", externalEventId, {
    processingStatus: "PROCESSED",
    processedAt: new Date().toISOString(),
  });
  return { ok: true };
}

function actionMarkWebhookEventFailed_(payload) {
  var externalEventId = requireString_(payload && payload.externalEventId, "externalEventId");
  var sheet = getWebhookEventsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.WEBHOOK_EVENTS];
  var existing = findRowById_(sheet, "externalEventId", externalEventId);
  if (!existing) throw new ApiError(ERROR_CODES.NOT_FOUND, "Evento no encontrado.", false);
  updateRowById_(sheet, headers, "externalEventId", externalEventId, {
    processingStatus: "FAILED",
    errorCode: (payload && payload.errorCode) || "",
    processedAt: new Date().toISOString(),
  });
  return { ok: true };
}
