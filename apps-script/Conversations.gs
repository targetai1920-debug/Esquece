/**
 * CONVERSATIONS + CONVERSATION_MESSAGES sheet access. Persistent WhatsApp
 * conversation state — WHATSAPP_AGENT_DESIGN.md §4/§5. Optimistic
 * versioning (applyConversationTurn) prevents two concurrent webhook
 * deliveries for the same phone number from silently clobbering each
 * other's state.
 */

function getConversationsSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.CONVERSATIONS);
}
function getConversationMessagesSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.CONVERSATION_MESSAGES);
}

function findConversationByPhone_(phoneE164) {
  return findRowById_(getConversationsSheet_(), "phoneE164", phoneE164);
}

function requireConversation_(conversationId) {
  var conversation = findRowById_(getConversationsSheet_(), "conversationId", conversationId);
  if (!conversation) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, "Conversación no encontrada.", false);
  }
  return conversation;
}

function actionGetOrCreateConversation_(payload) {
  var phone = requirePhoneE164_(payload && payload.phoneE164, "phoneE164");
  var existing = findConversationByPhone_(phone);
  if (existing) return existing;

  var sheet = getConversationsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.CONVERSATIONS];
  var now = new Date().toISOString();
  return insertRow_(sheet, headers, {
    conversationId: generateEntityId_("conv"),
    phoneE164: phone,
    state: "IDLE",
    scratchDataJson: "{}",
    humanHandoffActive: false,
    version: 1,
    lastInboundMessageAt: now,
  });
}

function actionGetConversation_(payload) {
  return requireConversation_(requireString_(payload && payload.conversationId, "conversationId"));
}

/**
 * Lock-guarded: reads the current row, checks expectedVersion, applies
 * the requested changes, increments version, writes back. Concurrent
 * calls for the same conversation with a stale expectedVersion get
 * CONVERSATION_CONFLICT instead of silently overwriting each other.
 */
function actionApplyConversationTurn_(payload) {
  var conversationId = requireString_(payload && payload.conversationId, "conversationId");
  var expectedVersion = payload && payload.expectedVersion;
  if (typeof expectedVersion !== "number") {
    throw new ApiError(ERROR_CODES.INVALID_PAYLOAD, "Falta expectedVersion.", false);
  }

  return withScriptLock_(function () {
    var sheet = getConversationsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.CONVERSATIONS];
    var conversation = requireConversation_(conversationId);

    if (Number(conversation.version) !== expectedVersion) {
      throw new ApiError(ERROR_CODES.CONVERSATION_CONFLICT, "La conversación cambió, intenta de nuevo.", false);
    }

    var patch = {};
    if (payload.newState) patch.state = payload.newState;
    if (payload.newScratchData) patch.scratchDataJson = stableStringify_(payload.newScratchData);
    if (payload.sessionExpiresAt) patch.sessionExpiresAt = payload.sessionExpiresAt;
    var now = new Date().toISOString();
    if (payload.inboundMessage) patch.lastInboundMessageAt = now;
    if (payload.outboundMessage) patch.lastOutboundMessageAt = now;
    patch.version = expectedVersion + 1;

    var updated = updateRowById_(sheet, headers, "conversationId", conversationId, patch);

    if (payload.inboundMessage) {
      appendMessageRow_(conversation, "INBOUND", payload.inboundMessage);
    }
    if (payload.outboundMessage) {
      appendMessageRow_(conversation, "OUTBOUND", payload.outboundMessage);
    }

    return updated;
  });
}

function appendMessageRow_(conversation, direction, message) {
  var sheet = getConversationMessagesSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.CONVERSATION_MESSAGES];
  insertRow_(sheet, headers, {
    messageId: generateEntityId_("msg"),
    externalMessageId: message.externalMessageId || null,
    conversationId: conversation.conversationId,
    customerId: conversation.customerId || null,
    phoneE164: conversation.phoneE164,
    direction: direction,
    messageType: message.messageType || "text",
    body: message.body || "",
    processingStatus: "PROCESSED",
    receivedAt: direction === "INBOUND" ? new Date().toISOString() : null,
    sentAt: direction === "OUTBOUND" ? new Date().toISOString() : null,
  });
}

function actionResetConversation_(payload) {
  var conversationId = requireString_(payload && payload.conversationId, "conversationId");
  return withScriptLock_(function () {
    var sheet = getConversationsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.CONVERSATIONS];
    var conversation = requireConversation_(conversationId);
    return updateRowById_(sheet, headers, "conversationId", conversationId, {
      state: "IDLE",
      scratchDataJson: "{}",
      humanHandoffActive: false,
      version: Number(conversation.version) + 1,
    });
  });
}

function actionAppendConversationMessage_(payload) {
  var conversationId = requireString_(payload && payload.conversationId, "conversationId");
  var conversation = requireConversation_(conversationId);
  appendMessageRow_(conversation, requireOneOf_(payload.direction, ["INBOUND", "OUTBOUND"], "direction"), payload);
  return { ok: true };
}

/** Admin view (Phase G) — recent conversations, optionally only ones with an active human handoff. */
function actionAdminListConversations_(payload) {
  var handoffOnly = !!(payload && payload.handoffActiveOnly);
  var rows = findRowsWhere_(getConversationsSheet_(), function (row) {
    return !handoffOnly || row.humanHandoffActive === true;
  });
  rows.sort(function (a, b) { return String(b.updatedAt || b.lastInboundMessageAt || "").localeCompare(String(a.updatedAt || a.lastInboundMessageAt || "")); });
  return { conversations: rows };
}

/** Admin view (Phase G) — full message history for one conversation, oldest first. */
function actionAdminGetConversationMessages_(payload) {
  var conversationId = requireString_(payload && payload.conversationId, "conversationId");
  requireConversation_(conversationId);
  var rows = findRowsWhere_(getConversationMessagesSheet_(), function (row) {
    return row.conversationId === conversationId;
  });
  rows.sort(function (a, b) {
    var aTime = a.receivedAt || a.sentAt || "";
    var bTime = b.receivedAt || b.sentAt || "";
    return String(aTime).localeCompare(String(bTime));
  });
  return { messages: rows };
}
