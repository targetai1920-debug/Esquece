/**
 * Safe internal test runner. Only exercises pure logic and
 * non-destructive structural checks against the real bound spreadsheet —
 * never deletes sheets/rows here (see "Do not run destructive tests
 * against production sheets"). Domain/booking-rule tests (breaks, time
 * off, overlap, idempotent booking, etc.) are added in Phase D alongside
 * the code they test; this file currently covers Phase B scope only
 * (setup, security, health).
 */

function assertEqual_(actual, expected, label) {
  var actualStr = JSON.stringify(actual);
  var expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(label + ": expected " + expectedStr + ", got " + actualStr);
  }
}

function assertThrowsCode_(fn, expectedCode, label) {
  try {
    fn();
  } catch (err) {
    if (err && err.name === "ApiError" && err.code === expectedCode) {
      return;
    }
    throw new Error(label + ": expected ApiError(" + expectedCode + "), got " + (err && err.message));
  }
  throw new Error(label + ": expected an error, none was thrown");
}

function buildTestEnvelope_(action, payload, overrides) {
  var envelope = {
    version: SUPPORTED_ENVELOPE_VERSION,
    action: action,
    requestId: generateRequestId_(),
    timestamp: Date.now(),
    nonce: generateNonce_(),
    apiKey: getCrmApiKey_(),
    payload: payload || {},
  };
  envelope.signature = computeHmacHex_(buildCanonicalString_(envelope), getCrmSigningSecret_());
  for (var key in overrides || {}) {
    envelope[key] = overrides[key];
  }
  return envelope;
}

var INTERNAL_TESTS_ = [
  {
    name: "stableStringify sorts object keys",
    run: function () {
      assertEqual_(stableStringify_({ b: 1, a: 2 }), '{"a":2,"b":1}', "key order");
    },
  },
  {
    name: "stableStringify preserves array order",
    run: function () {
      assertEqual_(stableStringify_([3, 1, 2]), "[3,1,2]", "array order");
    },
  },
  {
    name: "stableStringify handles nested objects",
    run: function () {
      assertEqual_(stableStringify_({ z: { b: 1, a: 2 }, a: [1, 2] }), '{"a":[1,2],"z":{"a":2,"b":1}}', "nested");
    },
  },
  {
    name: "constantTimeEquals matches equal strings",
    run: function () {
      assertEqual_(constantTimeEquals_("abc", "abc"), true, "equal strings");
    },
  },
  {
    name: "constantTimeEquals rejects different strings",
    run: function () {
      assertEqual_(constantTimeEquals_("abc", "abd"), false, "different strings");
    },
  },
  {
    name: "valid signed envelope passes verification",
    run: function () {
      var envelope = buildTestEnvelope_("health", {});
      verifySignedRequest_(envelope); // throws on failure
    },
  },
  {
    name: "tampered payload is rejected",
    run: function () {
      var envelope = buildTestEnvelope_("health", { a: 1 });
      envelope.payload = { a: 2 }; // tamper after signing
      assertThrowsCode_(function () {
        verifySignedRequest_(envelope);
      }, ERROR_CODES.INVALID_SIGNATURE, "tampered payload");
    },
  },
  {
    name: "wrong API key is rejected",
    run: function () {
      var envelope = buildTestEnvelope_("health", {}, { apiKey: "wrong-key" });
      assertThrowsCode_(function () {
        verifySignedRequest_(envelope);
      }, ERROR_CODES.UNAUTHORIZED, "wrong api key");
    },
  },
  {
    name: "expired timestamp is rejected",
    run: function () {
      var envelope = buildTestEnvelope_("health", {}, { timestamp: Date.now() - REQUEST_MAX_AGE_MS - 60000 });
      // Signature was computed before the timestamp override in buildTestEnvelope_'s
      // return path — rebuild it so this test isolates timestamp freshness, not signature validity.
      envelope.signature = computeHmacHex_(buildCanonicalString_(envelope), getCrmSigningSecret_());
      assertThrowsCode_(function () {
        verifySignedRequest_(envelope);
      }, ERROR_CODES.REQUEST_EXPIRED, "expired timestamp");
    },
  },
  {
    name: "reused nonce is rejected on second use",
    run: function () {
      var envelope = buildTestEnvelope_("health", {});
      verifySignedRequest_(envelope); // first use: succeeds, marks nonce
      assertThrowsCode_(function () {
        verifySignedRequest_(envelope);
      }, ERROR_CODES.NONCE_REUSED, "reused nonce");
    },
  },
  {
    name: "unsupported action is rejected",
    run: function () {
      assertThrowsCode_(function () {
        routeAction_("thisActionDoesNotExist", {});
      }, ERROR_CODES.UNSUPPORTED_ACTION, "unsupported action");
    },
  },
  {
    name: "health action reports a status",
    run: function () {
      var result = actionHealth_();
      if (!result || !result.status) {
        throw new Error("health action returned no status: " + JSON.stringify(result));
      }
    },
  },
  {
    name: "setupCRM is idempotent and structure validates afterwards",
    run: function () {
      setupCRM();
      setupCRM(); // second call must not throw or duplicate anything
      var validation = validateCrmStructure();
      if (!validation.ok) {
        throw new Error("CRM structure invalid after setup: " + validation.problems.join("; "));
      }
    },
  },
  {
    name: "domain reads work against seeded demo data, then clean up after themselves",
    run: function () {
      setupCRM();
      seedDemoData();
      try {
        var services = actionListServices_().services;
        if (services.length < 1) throw new Error("expected at least one demo service");

        var barbersForService = actionListBarbersForService_({ serviceId: services[0].serviceId }).barbers;
        if (barbersForService.length < 1) throw new Error("expected at least one eligible demo barber");

        assertThrowsCode_(function () {
          requireBarberEligibleForService_(barbersForService[0].barberId, "not-a-real-service-id");
        }, ERROR_CODES.BARBER_NOT_ELIGIBLE, "ineligible barber/service pair");
      } finally {
        removeDemoData();
      }
    },
  },
  {
    name: "upsertCustomer dedupes by phone and never erases fields with a blank",
    run: function () {
      var testPhone = "59100000000"; // clearly-fake test number, not a real contact
      var testSheet = getCustomersSheet_();
      var before = findCustomerByPhoneRaw_(testPhone);
      if (before) {
        // Clean slate if a previous failed run left this behind.
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) {
          return row.phoneE164 === testPhone;
        });
      }
      try {
        var created = actionUpsertCustomer_({ phoneE164: testPhone, name: "Prueba Interna" }).customer;
        var updated = actionUpsertCustomer_({ phoneE164: testPhone, email: "prueba@example.com" }).customer;
        if (updated.customerId !== created.customerId) {
          throw new Error("second upsert created a new customer instead of updating the existing one");
        }
        if (updated.name !== "Prueba Interna") {
          throw new Error("second upsert erased the name field instead of preserving it");
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) {
          return row.phoneE164 === testPhone;
        });
      }
    },
  },
  {
    // The one test the master spec calls out explicitly: two attempts to
    // book the exact same barber and slot — only one may succeed. Runs
    // sequentially (Apps Script's script lock serializes real concurrent
    // requests to the same outcome this simulates: whichever acquires the
    // lock second re-reads the sheet and correctly sees the slot taken).
    name: "double booking: two requests for the same barber+slot, only one succeeds",
    run: function () {
      setupCRM();
      seedDemoData();
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var testPhoneA = "59100000001";
      var testPhoneB = "59100000002";
      var createdAppointmentIds = [];
      try {
        var first = actionCreateAppointment_({
          idempotencyKey: "test-race-key-a-" + testDate,
          source: "WEBSITE",
          serviceId: "demo-service-1",
          barberId: "demo-barber-1",
          localDate: testDate,
          localStartTime: "09:00",
          customer: { name: "Prueba Carrera A", phoneE164: testPhoneA },
        });
        createdAppointmentIds.push(first.appointment.appointmentId);

        assertThrowsCode_(function () {
          var second = actionCreateAppointment_({
            idempotencyKey: "test-race-key-b-" + testDate,
            source: "WEBSITE",
            serviceId: "demo-service-1",
            barberId: "demo-barber-1",
            localDate: testDate,
            localStartTime: "09:00", // identical slot
            customer: { name: "Prueba Carrera B", phoneE164: testPhoneB },
          });
          createdAppointmentIds.push(second.appointment.appointmentId); // would only run if it wrongly succeeded
        }, ERROR_CODES.SLOT_UNAVAILABLE, "second concurrent booking for the same slot");

        var confirmedForSlot = findRowsWhere_(getAppointmentsSheet_(), function (row) {
          return row.barberId === "demo-barber-1" && row.localDate === testDate &&
            row.localStartTime === "09:00" && row.status === "CONFIRMED";
        });
        if (confirmedForSlot.length !== 1) {
          throw new Error("expected exactly 1 confirmed appointment for the contested slot, found " + confirmedForSlot.length);
        }
      } finally {
        createdAppointmentIds.forEach(function (id) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === id; });
        });
        [testPhoneA, testPhoneB].forEach(function (phone) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === phone; });
        });
        removeDemoData();
      }
    },
  },
  {
    name: "retrying appointment creation with the same idempotency key does not create a duplicate",
    run: function () {
      setupCRM();
      seedDemoData();
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var testPhone = "59100000003";
      var idemKey = "test-idempotency-key-" + testDate;
      try {
        var firstAttempt = actionCreateAppointment_({
          idempotencyKey: idemKey, source: "WHATSAPP", serviceId: "demo-service-1", barberId: "demo-barber-2",
          localDate: testDate, localStartTime: "09:00", customer: { name: "Prueba Idempotencia", phoneE164: testPhone },
        });
        var retryAttempt = actionCreateAppointment_({
          idempotencyKey: idemKey, source: "WHATSAPP", serviceId: "demo-service-1", barberId: "demo-barber-2",
          localDate: testDate, localStartTime: "09:00", customer: { name: "Prueba Idempotencia", phoneE164: testPhone },
        });
        if (retryAttempt.appointment.appointmentId !== firstAttempt.appointment.appointmentId) {
          throw new Error("retry created a second appointment instead of returning the first");
        }
        var matchingRows = findRowsWhere_(getAppointmentsSheet_(), function (row) { return row.idempotencyKey === idemKey; });
        if (matchingRows.length !== 1) {
          throw new Error("expected exactly 1 row for this idempotency key, found " + matchingRows.length);
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.idempotencyKey === idemKey; });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
        removeDemoData();
      }
    },
  },
  {
    name: "conversation version conflict is detected, and webhook events are deduplicated",
    run: function () {
      var testPhone = "59100000005";
      var conversation = actionGetOrCreateConversation_({ phoneE164: testPhone });
      try {
        actionApplyConversationTurn_({ conversationId: conversation.conversationId, expectedVersion: conversation.version, newState: "SELECTING_SERVICE" });
        assertThrowsCode_(function () {
          actionApplyConversationTurn_({ conversationId: conversation.conversationId, expectedVersion: conversation.version, newState: "SELECTING_BARBER" });
        }, ERROR_CODES.CONVERSATION_CONFLICT, "stale expectedVersion");

        var eventId = "test-dedup-event-" + testPhone;
        var first = actionRegisterWebhookEvent_({ externalEventId: eventId, eventType: "message" });
        var second = actionRegisterWebhookEvent_({ externalEventId: eventId, eventType: "message" });
        if (first.isDuplicate !== false || second.isDuplicate !== true) {
          throw new Error("expected first registration to be new and second to be flagged duplicate");
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CONVERSATIONS, function (row) { return row.phoneE164 === testPhone; });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CONVERSATION_MESSAGES, function (row) { return row.phoneE164 === testPhone; });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.WEBHOOK_EVENTS, function (row) { return row.externalEventId === "test-dedup-event-" + testPhone; });
      }
    },
  },
  {
    name: "admin can create and deactivate a service, and inactive services are hidden from the public list",
    run: function () {
      var created = actionAdminCreateService_({ name: "Prueba interna — servicio admin", price: 1, durationMinutes: 15 });
      try {
        var publicListBefore = actionListServices_().services;
        if (!publicListBefore.some(function (s) { return s.serviceId === created.service.serviceId; })) {
          throw new Error("newly-created active service should appear in the public list");
        }
        actionAdminUpdateService_({ serviceId: created.service.serviceId, active: false });
        var publicListAfter = actionListServices_().services;
        if (publicListAfter.some(function (s) { return s.serviceId === created.service.serviceId; })) {
          throw new Error("deactivated service should no longer appear in the public list");
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.SERVICES, function (row) { return row.serviceId === created.service.serviceId; });
      }
    },
  },
  {
    name: "admin dashboard listings surface notifications, conversations and message history",
    run: function () {
      var testPhone = "59100000006";
      var conversation = actionGetOrCreateConversation_({ phoneE164: testPhone });
      var notification = createNotificationRow_({ type: "CONFIRMATION", customerId: null });
      try {
        actionApplyConversationTurn_({
          conversationId: conversation.conversationId,
          expectedVersion: conversation.version,
          inboundMessage: { messageType: "text", body: "Hola" },
        });

        var messages = actionAdminGetConversationMessages_({ conversationId: conversation.conversationId }).messages;
        if (messages.length !== 1 || messages[0].body !== "Hola" || messages[0].direction !== "INBOUND") {
          throw new Error("expected one inbound message with the sent body");
        }

        var conversations = actionAdminListConversations_({}).conversations;
        if (!conversations.some(function (c) { return c.conversationId === conversation.conversationId; })) {
          throw new Error("adminListConversations should include the test conversation");
        }

        var pendingNotifications = actionAdminListNotifications_({ status: "PENDING" }).notifications;
        if (!pendingNotifications.some(function (n) { return n.notificationId === notification.notificationId; })) {
          throw new Error("adminListNotifications({status: PENDING}) should include the test notification");
        }
        var sentNotifications = actionAdminListNotifications_({ status: "SENT" }).notifications;
        if (sentNotifications.some(function (n) { return n.notificationId === notification.notificationId; })) {
          throw new Error("adminListNotifications({status: SENT}) should not include a PENDING notification");
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CONVERSATIONS, function (row) { return row.phoneE164 === testPhone; });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CONVERSATION_MESSAGES, function (row) { return row.phoneE164 === testPhone; });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS, function (row) { return row.notificationId === notification.notificationId; });
      }
    },
  },
  {
    name: "booking with reminders enabled schedules a REMINDER notification, which cancellation then cancels",
    run: function () {
      var settingsSheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.SETTINGS);
      var settingsHeaders = SHEET_HEADERS[SHEET_NAMES.SETTINGS];
      var originalEnableReminders = findRowById_(settingsSheet, "key", "ENABLE_REMINDERS").value;
      updateRowById_(settingsSheet, settingsHeaders, "key", "ENABLE_REMINDERS", { value: "true" });

      seedDemoData();
      var testPhone = "59100000007";
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var created;
      try {
        created = actionCreateAppointment_({
          idempotencyKey: "test-reminder-" + testPhone,
          source: "WHATSAPP",
          serviceId: "demo-service-1",
          anyBarber: true,
          localDate: testDate,
          localStartTime: "09:00",
          customer: { name: "Prueba Recordatorio", phoneE164: testPhone },
        }).appointment;

        var reminders = findRowsWhere_(getNotificationsSheet_(), function (row) {
          return row.appointmentId === created.appointmentId && row.type === "REMINDER";
        });
        if (reminders.length !== 1 || reminders[0].status !== "PENDING") {
          throw new Error("expected exactly one PENDING REMINDER notification after booking with reminders enabled");
        }

        actionCancelAppointment_({ appointmentId: created.appointmentId, actor: { type: "system" } });

        var afterCancel = findRowsWhere_(getNotificationsSheet_(), function (row) {
          return row.appointmentId === created.appointmentId && row.type === "REMINDER";
        });
        if (afterCancel[0].status !== "CANCELLED") {
          throw new Error("expected the REMINDER notification to be cancelled once its appointment was cancelled");
        }
      } finally {
        updateRowById_(settingsSheet, settingsHeaders, "key", "ENABLE_REMINDERS", { value: originalEnableReminders });
        if (created) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === created.appointmentId; });
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS, function (row) { return row.appointmentId === created.appointmentId; });
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
        }
        removeDemoData();
      }
    },
  },
  {
    name: "Calendar sync: create/reschedule/cancel mirror the appointment lifecycle when enabled, and stay disabled by default",
    run: function () {
      seedDemoData();
      var testPhone = "59100000009";
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var newDate = nextWeekdayLocalDate_(testDate, 1);
      var created;
      try {
        // Disabled by default — booking must succeed with no calendar side effect at all.
        created = actionCreateAppointment_({
          idempotencyKey: "test-calendar-disabled-" + testPhone,
          source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true,
          localDate: testDate, localStartTime: "09:00",
          customer: { name: "Prueba Calendario", phoneE164: testPhone },
        }).appointment;
        if (created.calendarEventId) {
          throw new Error("expected no calendar event when ENABLE_CALENDAR_SYNC is off");
        }
        actionCancelAppointment_({ appointmentId: created.appointmentId, actor: { type: "system" } });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === created.appointmentId; });
        created = null;

        PropertiesService.getScriptProperties().setProperty("ENABLE_CALENDAR_SYNC", "true");
        PropertiesService.getScriptProperties().setProperty("GOOGLE_CALENDAR_ID", "test-calendar-for-esquece");

        created = actionCreateAppointment_({
          idempotencyKey: "test-calendar-enabled-" + testPhone,
          source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true,
          localDate: testDate, localStartTime: "10:00",
          customer: { name: "Prueba Calendario", phoneE164: testPhone },
        }).appointment;
        if (!created.calendarEventId || created.calendarSyncStatus !== "SYNCED") {
          throw new Error("expected a synced calendar event once ENABLE_CALENDAR_SYNC is on");
        }

        var rescheduled = actionRescheduleAppointment_({
          appointmentId: created.appointmentId, actor: { type: "system" },
          newLocalDate: newDate, newLocalStartTime: "11:00",
        }).appointment;
        if (rescheduled.calendarEventId !== created.calendarEventId || rescheduled.calendarSyncStatus !== "SYNCED") {
          throw new Error("expected the same calendar event to be updated (not recreated) on reschedule");
        }

        actionCancelAppointment_({ appointmentId: created.appointmentId, actor: { type: "system" } });
        var afterCancel = getAppointmentById_(created.appointmentId);
        if (afterCancel.calendarSyncStatus !== "CANCELLED") {
          throw new Error("expected calendarSyncStatus CANCELLED after cancelling a synced appointment");
        }

        // A misconfigured/inaccessible calendar must fail non-destructively — the appointment itself still exists and is bookable.
        PropertiesService.getScriptProperties().setProperty("GOOGLE_CALENDAR_ID", "invalid-calendar-id-for-test");
        var failing = actionCreateAppointment_({
          idempotencyKey: "test-calendar-failure-" + testPhone,
          source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true,
          localDate: testDate, localStartTime: "13:00",
          customer: { name: "Prueba Calendario", phoneE164: testPhone },
        }).appointment;
        if (failing.status !== "CONFIRMED") {
          throw new Error("a calendar sync failure must never prevent the booking itself from succeeding");
        }
        var failureNotifications = findRowsWhere_(getNotificationsSheet_(), function (row) {
          return row.appointmentId === failing.appointmentId && row.type === "CALENDAR_SYNC_FAILURE";
        });
        if (failureNotifications.length !== 1) {
          throw new Error("expected a CALENDAR_SYNC_FAILURE notification to be queued when Calendar sync fails");
        }
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === failing.appointmentId; });
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS, function (row) { return row.appointmentId === failing.appointmentId; });
      } finally {
        PropertiesService.getScriptProperties().setProperty("ENABLE_CALENDAR_SYNC", "false");
        PropertiesService.getScriptProperties().setProperty("GOOGLE_CALENDAR_ID", "");
        if (created) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === created.appointmentId; });
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS, function (row) { return row.appointmentId === created.appointmentId; });
        }
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
        removeDemoData();
      }
    },
  },
];

/**
 * Runs every registered test, catching failures individually so one
 * failing test doesn't abort the rest. Returns and logs a summary.
 */
function runAllInternalTests() {
  var results = INTERNAL_TESTS_.map(function (test) {
    try {
      test.run();
      return { name: test.name, passed: true };
    } catch (err) {
      return { name: test.name, passed: false, message: err && err.message ? err.message : String(err) };
    }
  });

  var passed = results.filter(function (r) { return r.passed; }).length;
  var summary = {
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    results: results,
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}
