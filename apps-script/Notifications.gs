/**
 * NOTIFICATIONS sheet access. Row creation only in this phase —
 * *sending* (WhatsApp templates, the 24h-window check, actual dispatch)
 * is Phase J. What's here already gives Phase J idempotent, claimable
 * rows to work from, and lets Appointments.gs create confirmation/
 * cancellation/reschedule notification records as a normal part of a
 * booking mutation (BOOKING_RULES.md / master spec step "create
 * notification records").
 */

function getNotificationsSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS);
}

var NOTIFICATION_TYPES = ["CONFIRMATION", "REMINDER", "CANCELLATION", "RESCHEDULE", "INTERNAL_ALERT", "CALENDAR_SYNC_FAILURE"];

/**
 * Internal helper — Appointments.gs calls this directly (already holding
 * the script lock from the appointment mutation) rather than going
 * through the action wrapper, to avoid re-acquiring a lock it already
 * holds.
 */
function createNotificationRow_(params) {
  var sheet = getNotificationsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.NOTIFICATIONS];
  return insertRow_(sheet, headers, {
    notificationId: generateEntityId_("ntf"),
    appointmentId: params.appointmentId || null,
    customerId: params.customerId || null,
    conversationId: params.conversationId || null,
    type: params.type,
    channel: params.channel || "whatsapp",
    scheduledAt: params.scheduledAt || new Date().toISOString(),
    status: "PENDING",
    attemptCount: 0,
    idempotencyKey: params.idempotencyKey || generateEntityId_("ntfkey"),
    payloadJson: params.payload !== undefined ? stableStringify_(params.payload) : null,
  });
}

function actionCreateNotification_(payload) {
  var type = requireOneOf_(payload && payload.type, NOTIFICATION_TYPES, "type");
  return { notification: createNotificationRow_(Object.assign({}, payload, { type: type })) };
}

function actionListDueNotifications_(payload) {
  var nowIso = new Date().toISOString();
  var rows = findRowsWhere_(getNotificationsSheet_(), function (row) {
    return row.status === "PENDING" && String(row.scheduledAt || "") <= nowIso;
  });
  return { notifications: rows };
}

/**
 * Atomically transitions PENDING -> PROCESSING for one notification, under
 * the script lock, so two concurrent cron invocations can't both send the
 * same reminder — mirrors the same "lock, re-read, write" discipline as
 * appointment creation.
 */
function actionClaimNotification_(payload) {
  var notificationId = requireString_(payload && payload.notificationId, "notificationId");
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(SCRIPT_LOCK_TIMEOUT_MS)) {
    throw new ApiError(ERROR_CODES.LOCK_TIMEOUT, "No se pudo bloquear el CRM a tiempo.", true);
  }
  try {
    var sheet = getNotificationsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.NOTIFICATIONS];
    var existing = findRowById_(sheet, "notificationId", notificationId);
    if (!existing) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, "Notificación no encontrada.", false);
    }
    if (existing.status !== "PENDING") {
      throw new ApiError(ERROR_CODES.IDEMPOTENCY_CONFLICT, "Esta notificación ya fue reclamada.", false);
    }
    var updated = updateRowById_(sheet, headers, "notificationId", notificationId, {
      status: "PROCESSING",
      attemptCount: (Number(existing.attemptCount) || 0) + 1,
      lastAttemptAt: new Date().toISOString(),
    });
    return { notification: updated };
  } finally {
    lock.releaseLock();
  }
}

function actionMarkNotificationSent_(payload) {
  var notificationId = requireString_(payload && payload.notificationId, "notificationId");
  var sheet = getNotificationsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.NOTIFICATIONS];
  var updated = updateRowById_(sheet, headers, "notificationId", notificationId, {
    status: "SENT",
    sentAt: new Date().toISOString(),
  }, new ApiError(ERROR_CODES.NOT_FOUND, "Notificación no encontrada.", false));
  return { notification: updated };
}

/**
 * `retryAfterMinutes` (optional) — Phase J's cron retry policy: when set,
 * the notification goes back to PENDING with a future scheduledAt instead
 * of terminally FAILED, so listDueNotifications() picks it up again later.
 * Omitted (or the caller has exhausted its own retry budget) means FAILED
 * is terminal — never sent, never retried again automatically.
 */
function actionMarkNotificationFailed_(payload) {
  var notificationId = requireString_(payload && payload.notificationId, "notificationId");
  var errorCode = optionalString_(payload && payload.errorCode, "");
  var errorMessage = optionalString_(payload && payload.errorMessage, "");
  var retryAfterMinutes = payload && payload.retryAfterMinutes;
  var sheet = getNotificationsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.NOTIFICATIONS];
  var patch = { errorCode: errorCode, errorMessage: errorMessage };
  if (typeof retryAfterMinutes === "number" && retryAfterMinutes > 0) {
    patch.status = "PENDING";
    patch.scheduledAt = new Date(Date.now() + retryAfterMinutes * 60000).toISOString();
  } else {
    patch.status = "FAILED";
  }
  var updated = updateRowById_(sheet, headers, "notificationId", notificationId, patch, new ApiError(ERROR_CODES.NOT_FOUND, "Notificación no encontrada.", false));
  return { notification: updated };
}

function actionCancelNotification_(payload) {
  var notificationId = requireString_(payload && payload.notificationId, "notificationId");
  var sheet = getNotificationsSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.NOTIFICATIONS];
  var existing = findRowById_(sheet, "notificationId", notificationId);
  if (!existing) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, "Notificación no encontrada.", false);
  }
  if (existing.status === "SENT") {
    // Already sent — cancelling is a no-op, not an error (idempotent).
    return { notification: existing };
  }
  var updated = updateRowById_(sheet, headers, "notificationId", notificationId, { status: "CANCELLED" });
  return { notification: updated };
}

/**
 * Admin view (Phase G) — unlike actionListDueNotifications_ (only PENDING
 * rows due now, for the Phase J cron), this returns notifications of any
 * status for the dashboard/notifications screen, optionally filtered.
 */
function actionAdminListNotifications_(payload) {
  var statusFilter = payload && payload.status ? String(payload.status) : null;
  var rows = findRowsWhere_(getNotificationsSheet_(), function (row) {
    return !statusFilter || row.status === statusFilter;
  });
  rows.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return { notifications: rows };
}
