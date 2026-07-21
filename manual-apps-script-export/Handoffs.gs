/**
 * HUMAN_HANDOFFS actions. WHATSAPP_AGENT_DESIGN.md §8: activation sets
 * Conversation.humanHandoffActive + state under the same lock discipline
 * as any other conversation mutation; resolution is the only path back,
 * and only ever manual.
 */

function getHandoffsSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.HUMAN_HANDOFFS);
}

function actionActivateHumanHandoff_(payload) {
  var conversationId = requireString_(payload && payload.conversationId, "conversationId");
  var reason = requireString_(payload && payload.reason, "reason");

  return withScriptLock_(function () {
    var conversationsSheet = getConversationsSheet_();
    var conversationHeaders = SHEET_HEADERS[SHEET_NAMES.CONVERSATIONS];
    var conversation = requireConversation_(conversationId);

    updateRowById_(conversationsSheet, conversationHeaders, "conversationId", conversationId, {
      humanHandoffActive: true,
      state: "HUMAN_HANDOFF",
      version: Number(conversation.version) + 1,
    });

    var handoffsSheet = getHandoffsSheet_();
    var handoffHeaders = SHEET_HEADERS[SHEET_NAMES.HUMAN_HANDOFFS];
    var handoff = insertRow_(handoffsSheet, handoffHeaders, {
      handoffId: generateEntityId_("hnd"),
      conversationId: conversationId,
      customerId: conversation.customerId || "",
      phoneE164: conversation.phoneE164,
      reason: reason,
      status: "OPEN",
      startedAt: new Date().toISOString(),
    });

    createNotificationRow_({ conversationId: conversationId, type: "INTERNAL_ALERT" });
    return handoff;
  });
}

function actionResolveHumanHandoff_(payload) {
  var handoffId = requireString_(payload && payload.handoffId, "handoffId");
  var reactivateBot = payload && payload.reactivateBot === true;

  return withScriptLock_(function () {
    var handoffsSheet = getHandoffsSheet_();
    var handoffHeaders = SHEET_HEADERS[SHEET_NAMES.HUMAN_HANDOFFS];
    var handoff = findRowById_(handoffsSheet, "handoffId", handoffId);
    if (!handoff) throw new ApiError(ERROR_CODES.NOT_FOUND, "Handoff no encontrado.", false);

    var now = new Date().toISOString();
    var updated = updateRowById_(handoffsSheet, handoffHeaders, "handoffId", handoffId, {
      status: "RESOLVED",
      resolutionNotes: (payload && payload.resolutionNotes) || "",
      resolvedAt: now,
    });

    if (reactivateBot) {
      var conversationsSheet = getConversationsSheet_();
      var conversationHeaders = SHEET_HEADERS[SHEET_NAMES.CONVERSATIONS];
      var conversation = findRowById_(conversationsSheet, "conversationId", handoff.conversationId);
      if (conversation) {
        updateRowById_(conversationsSheet, conversationHeaders, "conversationId", handoff.conversationId, {
          humanHandoffActive: false,
          state: "IDLE",
          version: Number(conversation.version) + 1,
        });
      }
    }

    return updated;
  });
}

function actionListOpenHumanHandoffs_() {
  return { handoffs: findRowsWhere_(getHandoffsSheet_(), function (h) { return h.status === "OPEN"; }) };
}
