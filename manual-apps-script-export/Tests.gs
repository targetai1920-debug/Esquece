/**
 * Internal test runner. Only exercises pure logic and non-destructive
 * structural checks against the real bound spreadsheet — every test cleans
 * up its own rows in a `finally` block, regardless of pass/fail, and none
 * of them delete a sheet or touch a row a test didn't create itself.
 *
 * Split into five batches (INTERNAL_TESTS_CORE_/SHEETS_/BOOKING_/
 * CONVERSATIONS_/INTEGRATIONS_) run via runInternalTestsCore() etc. —
 * against a real Apps Script deployment, running all ~29 tests in one
 * execution (runAllInternalTests()) was slow enough against real Google
 * Sheets latency to exceed Apps Script's ~6-minute execution limit before
 * ever printing a summary. Each batch function is small enough to finish
 * well under that limit on its own; getInternalTestSummary()/
 * showInternalTestSummary() combine results across separate batch runs
 * (persisted in Script Properties) into one total/passed/failed/skipped
 * report. runAllInternalTests() still runs everything in one call — kept
 * for the local Node vm harness (npm run test:apps-script), which has no
 * execution-time limit and no real Sheets API latency. See FIRST_RUN.md
 * for the exact real-deployment workflow.
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

/**
 * A self-contained in-memory fake calendar provider — never a real Google
 * Calendar, never registered with real CalendarApp. Only Calendar.gs's own
 * getSyncCalendar_() is redirected to it (via CALENDAR_APP_FOR_TESTS_), so
 * syncCreateCalendarEvent_/syncUpdateCalendarEvent_/syncCancelCalendarEvent_
 * run their real, unmodified production logic against it — this exercises
 * the actual sync code paths without depending on a real Google Calendar
 * being reachable from wherever these tests run.
 */
function makeFakeCalendarAppForTests_() {
  var events = {};
  var nextEventId = 1;
  function makeEvent(id) {
    var event = {
      _deleted: false,
      getId: function () { return id; },
      setTime: function () {}, // the test only asserts calendarEventId/calendarSyncStatus, not the stored time
      deleteEvent: function () { event._deleted = true; },
    };
    return event;
  }
  var fakeCalendar = {
    createEvent: function () {
      var id = "fake-test-event-" + (nextEventId++);
      var event = makeEvent(id);
      events[id] = event;
      return event;
    },
    getEventById: function (id) {
      var event = events[id];
      return event && !event._deleted ? event : null;
    },
  };
  return {
    getCalendarById: function () {
      return fakeCalendar; // any id resolves to this one in-memory fake — never a real calendar
    },
  };
}

// =====================================================================
// Batch: Core — security/envelope/setup. Fast, no demo data, no Calendar.
// =====================================================================
var INTERNAL_TESTS_CORE_ = [
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
];

// =====================================================================
// Batch: Sheets — the Sheets.gs type-normalization boundary (real Google
// Sheets Date/Number auto-coercion, not just the mock harness's behavior).
// =====================================================================
var INTERNAL_TESTS_SHEETS_ = [
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
    name: "sheetToObjects_ normalizes a phone number Sheets already converted to a Number",
    run: function () {
      var testPhone = "59100000011";
      try {
        var created = actionUpsertCustomer_({ phoneE164: testPhone, name: "Prueba Tipo Numero" }).customer;
        var sheet = getCustomersSheet_();
        var headers = SHEET_HEADERS[SHEET_NAMES.CUSTOMERS];
        var phoneCol = headers.indexOf("phoneE164") + 1;
        var rowRef = findRowById_(sheet, "customerId", created.customerId);
        // Simulate what real Google Sheets does to a purely-numeric string
        // written with no "+" prefix: store it as a Number, not text.
        sheet.getRange(rowRef.__row, phoneCol, 1, 1).setValues([[Number(testPhone)]]);

        var reread = findCustomerByPhoneRaw_(testPhone);
        if (!reread || reread.customerId !== created.customerId) {
          throw new Error("expected findCustomerByPhoneRaw_ to still find the customer after phoneE164 became a Number in the sheet");
        }
        if (typeof reread.phoneE164 !== "string" || reread.phoneE164 !== testPhone) {
          throw new Error("expected phoneE164 normalized back to the string \"" + testPhone + "\", got " + JSON.stringify(reread.phoneE164));
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
      }
    },
  },
  {
    name: "upsertCustomer still dedupes when the stored phone was previously coerced to a Number",
    run: function () {
      var testPhone = "59100000012";
      try {
        var created = actionUpsertCustomer_({ phoneE164: testPhone, name: "Prueba Numero Dedupe" }).customer;
        var sheet = getCustomersSheet_();
        var headers = SHEET_HEADERS[SHEET_NAMES.CUSTOMERS];
        var phoneCol = headers.indexOf("phoneE164") + 1;
        var rowRef = findRowById_(sheet, "customerId", created.customerId);
        sheet.getRange(rowRef.__row, phoneCol, 1, 1).setValues([[Number(testPhone)]]);

        var updated = actionUpsertCustomer_({ phoneE164: testPhone, email: "numero@example.com" }).customer;
        if (updated.customerId !== created.customerId) {
          throw new Error("second upsert created a new customer instead of updating the one whose phone was stored as a Number");
        }
        if (updated.name !== "Prueba Numero Dedupe") {
          throw new Error("second upsert erased the name field instead of preserving it");
        }
      } finally {
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
      }
    },
  },
  {
    name: "normalizeLocalTimeCellValue_ resolves a Date-typed cell (Sheets auto-parsing \"08:00\") back to \"08:00\"",
    run: function () {
      var timezone = getBusinessTimezone_();
      var asDate = parseLocalDateTimeToUtc_("2030-06-15", "08:00", timezone);
      assertEqual_(normalizeLocalTimeCellValue_(asDate), "08:00", "Date-typed time cell");
    },
  },
  {
    name: "normalizeLocalTimeCellValue_ resolves a bare day-fraction Number back to \"HH:mm\"",
    run: function () {
      assertEqual_(normalizeLocalTimeCellValue_(8 / 24), "08:00", "day-fraction 8/24");
      assertEqual_(normalizeLocalTimeCellValue_(0), "00:00", "day-fraction 0");
      assertEqual_(normalizeLocalTimeCellValue_(23.5 / 24), "23:30", "day-fraction 23.5/24");
    },
  },
];

// =====================================================================
// Batch: Booking — appointment creation/cancellation/reschedule/
// idempotency. The heaviest tests (each seeds/removes demo data and
// creates real appointment rows), so this is its own batch.
// =====================================================================
var INTERNAL_TESTS_BOOKING_ = [
  {
    name: "upsertCustomer dedupes by phone and never erases fields with a blank",
    run: function () {
      var testPhone = "59100000000"; // clearly-fake test number, not a real contact
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
    name: "creating an appointment succeeds even when WORKING_HOURS openingTime/closingTime were already stored as Date/Number, not strings",
    run: function () {
      setupCRM();
      seedDemoData();
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var testPhone = "59100000013";
      var created;
      var workingHoursSheet = getWorkingHoursSheet_();
      var whHeaders = SHEET_HEADERS[SHEET_NAMES.WORKING_HOURS];
      var openingCol = whHeaders.indexOf("openingTime") + 1;
      var closingCol = whHeaders.indexOf("closingTime") + 1;
      var timezone = getBusinessTimezone_();
      try {
        // Corrupt demo-barber-1's WORKING_HOURS rows the same way a real,
        // already-existing Google Sheet would: openingTime read back as a
        // Date, closingTime read back as a bare day-fraction Number.
        var whRows = findRowsWhere_(workingHoursSheet, function (row) { return row.barberId === "demo-barber-1"; });
        whRows.forEach(function (row) {
          workingHoursSheet.getRange(row.__row, openingCol, 1, 1).setValues([[parseLocalDateTimeToUtc_("2030-06-15", "08:00", timezone)]]);
          workingHoursSheet.getRange(row.__row, closingCol, 1, 1).setValues([[16 / 24]]);
        });

        created = actionCreateAppointment_({
          idempotencyKey: "test-normalized-time-" + testDate,
          source: "WEBSITE",
          serviceId: "demo-service-1",
          barberId: "demo-barber-1",
          localDate: testDate,
          localStartTime: "09:00",
          customer: { name: "Prueba Horario Normalizado", phoneE164: testPhone },
        }).appointment;

        if (created.status !== "CONFIRMED" || created.localStartTime !== "09:00" || created.localEndTime !== "09:30") {
          throw new Error("expected a normal CONFIRMED booking despite corrupted WORKING_HOURS cell types, got " + JSON.stringify(created));
        }
      } finally {
        if (created) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === created.appointmentId; });
        }
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
        removeDemoData();
      }
    },
  },
];

// =====================================================================
// Batch: Conversations — conversation state, webhook dedup, admin
// conversation/notification views.
// =====================================================================
var INTERNAL_TESTS_CONVERSATIONS_ = [
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
];

// =====================================================================
// Batch: Integrations — admin service CRUD + Google Calendar sync.
// The Calendar tests never touch a real Google Calendar: the "success"
// path uses an in-memory fake adapter (makeFakeCalendarAppForTests_,
// installed via Calendar.gs's CALENDAR_APP_FOR_TESTS_ seam), and the
// "invalid id" path deliberately uses a calendar id that cannot resolve
// to a real calendar, to prove the non-destructive-failure behavior
// against the real CalendarApp without ever creating one.
// =====================================================================
var INTERNAL_TESTS_INTEGRATIONS_ = [
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
    name: "Calendar sync stays disabled by default and creates no calendar event",
    run: function () {
      setupCRM();
      seedDemoData();
      var testPhone = "59100000009";
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var created;
      try {
        created = actionCreateAppointment_({
          idempotencyKey: "test-calendar-disabled-" + testPhone,
          source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true,
          localDate: testDate, localStartTime: "09:00",
          customer: { name: "Prueba Calendario Deshabilitado", phoneE164: testPhone },
        }).appointment;
        if (created.calendarEventId) {
          throw new Error("expected no calendar event when ENABLE_CALENDAR_SYNC is off");
        }
      } finally {
        if (created) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === created.appointmentId; });
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS, function (row) { return row.appointmentId === created.appointmentId; });
        }
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
        removeDemoData();
      }
    },
  },
  {
    name: "Calendar sync: create/reschedule/cancel succeed via a simulated calendar adapter (never touches real CalendarApp)",
    run: function () {
      setupCRM();
      seedDemoData();
      var testPhone = "59100000010";
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var newDate = nextWeekdayLocalDate_(testDate, 1);
      var created;
      try {
        CALENDAR_APP_FOR_TESTS_ = makeFakeCalendarAppForTests_();
        PropertiesService.getScriptProperties().setProperty("ENABLE_CALENDAR_SYNC", "true");
        PropertiesService.getScriptProperties().setProperty("GOOGLE_CALENDAR_ID", "fake-calendar-for-tests");

        created = actionCreateAppointment_({
          idempotencyKey: "test-calendar-adapter-" + testPhone,
          source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true,
          localDate: testDate, localStartTime: "10:00",
          customer: { name: "Prueba Calendario Adaptador", phoneE164: testPhone },
        }).appointment;
        if (!created.calendarEventId || created.calendarSyncStatus !== "SYNCED") {
          throw new Error("expected a synced calendar event via the fake adapter, got " + JSON.stringify(created));
        }

        var rescheduled = actionRescheduleAppointment_({
          appointmentId: created.appointmentId, actor: { type: "system" },
          newLocalDate: newDate, newLocalStartTime: "11:00",
        }).appointment;
        if (rescheduled.calendarEventId !== created.calendarEventId || rescheduled.calendarSyncStatus !== "SYNCED") {
          throw new Error("expected the same fake calendar event to be updated (not recreated) on reschedule");
        }

        actionCancelAppointment_({ appointmentId: created.appointmentId, actor: { type: "system" } });
        var afterCancel = getAppointmentById_(created.appointmentId);
        if (afterCancel.calendarSyncStatus !== "CANCELLED") {
          throw new Error("expected calendarSyncStatus CANCELLED after cancelling a synced appointment");
        }
      } finally {
        // Never leave the fake installed — a real booking must always reach real CalendarApp.
        CALENDAR_APP_FOR_TESTS_ = null;
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
  {
    name: "Calendar sync failure with an inaccessible real Calendar ID is recorded non-destructively",
    run: function () {
      setupCRM();
      seedDemoData();
      var testPhone = "59100000014";
      var testDate = nextWeekdayLocalDate_(formatUtcToLocalDate_(new Date(), getBusinessTimezone_()), 3);
      var failing;
      try {
        PropertiesService.getScriptProperties().setProperty("ENABLE_CALENDAR_SYNC", "true");
        // Deliberately real CalendarApp here (CALENDAR_APP_FOR_TESTS_ is not
        // set) — this id can never resolve to a real, accessible calendar,
        // so this proves the non-destructive-failure path against the
        // genuine CalendarApp.getCalendarById() behavior without ever
        // creating a real calendar.
        PropertiesService.getScriptProperties().setProperty("GOOGLE_CALENDAR_ID", "invalid-calendar-id-for-test");

        failing = actionCreateAppointment_({
          idempotencyKey: "test-calendar-failure-" + testPhone,
          source: "WHATSAPP", serviceId: "demo-service-1", anyBarber: true,
          localDate: testDate, localStartTime: "13:00",
          customer: { name: "Prueba Calendario Falla", phoneE164: testPhone },
        }).appointment;
        if (failing.status !== "CONFIRMED") {
          throw new Error("a calendar sync failure must never prevent the booking itself from succeeding");
        }
        if (failing.calendarSyncStatus !== "FAILED") {
          throw new Error("expected calendarSyncStatus FAILED when the configured Calendar id doesn't resolve to a real calendar");
        }
        var failureNotifications = findRowsWhere_(getNotificationsSheet_(), function (row) {
          return row.appointmentId === failing.appointmentId && row.type === "CALENDAR_SYNC_FAILURE";
        });
        if (failureNotifications.length !== 1) {
          throw new Error("expected a CALENDAR_SYNC_FAILURE notification to be queued when Calendar sync fails");
        }
      } finally {
        PropertiesService.getScriptProperties().setProperty("ENABLE_CALENDAR_SYNC", "false");
        PropertiesService.getScriptProperties().setProperty("GOOGLE_CALENDAR_ID", "");
        if (failing) {
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS, function (row) { return row.appointmentId === failing.appointmentId; });
          removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.NOTIFICATIONS, function (row) { return row.appointmentId === failing.appointmentId; });
        }
        removeRowsMatching_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS, function (row) { return row.phoneE164 === testPhone; });
        removeDemoData();
      }
    },
  },
];

/** Canonical roster of every internal test across all batches. */
var INTERNAL_TESTS_ALL_ = [].concat(
  INTERNAL_TESTS_CORE_,
  INTERNAL_TESTS_SHEETS_,
  INTERNAL_TESTS_BOOKING_,
  INTERNAL_TESTS_CONVERSATIONS_,
  INTERNAL_TESTS_INTEGRATIONS_,
);

/**
 * Runs one list of tests, logging a start/end line (with duration) around
 * each so a slow test is identifiable from the execution log alone, not
 * just from the final summary. Each test's own try/finally already
 * guarantees its cleanup runs even on failure — this only adds
 * timing/logging and catches the failure so one bad test doesn't stop
 * the rest of the batch.
 */
function runInternalTestList_(tests) {
  return tests.map(function (test) {
    var startedAt = Date.now();
    Logger.log("[TEST START] " + test.name);
    try {
      test.run();
      var durationMs = Date.now() - startedAt;
      Logger.log("[TEST END] " + test.name + " — PASSED (" + durationMs + "ms)");
      return { name: test.name, passed: true, durationMs: durationMs };
    } catch (err) {
      var failedDurationMs = Date.now() - startedAt;
      var message = err && err.message ? err.message : String(err);
      Logger.log("[TEST END] " + test.name + " — FAILED (" + failedDurationMs + "ms): " + message);
      return { name: test.name, passed: false, durationMs: failedDurationMs, message: message };
    }
  });
}

function summarizeResults_(results) {
  var passed = results.filter(function (r) { return r.passed; }).length;
  return {
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    results: results,
  };
}

// ---------------------------------------------------------------------
// Aggregated cross-batch summary, persisted in Script Properties so
// getInternalTestSummary()/showInternalTestSummary() can report a
// combined total/passed/failed/skipped across separate manual batch runs
// (each is its own Apps Script execution) without re-running everything
// in a single execution.
// ---------------------------------------------------------------------

var INTERNAL_TEST_RESULTS_PROPERTY_ = "INTERNAL_TEST_BATCH_RESULTS_JSON";

function loadStoredTestResults_() {
  var raw = getScriptProperty_(INTERNAL_TEST_RESULTS_PROPERTY_);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function recordBatchResults_(batchName, results) {
  var stored = loadStoredTestResults_();
  results.forEach(function (r) {
    stored[r.name] = {
      passed: r.passed,
      durationMs: r.durationMs,
      message: r.message ? String(r.message).substring(0, 500) : null,
      batch: batchName,
    };
  });
  PropertiesService.getScriptProperties().setProperty(INTERNAL_TEST_RESULTS_PROPERTY_, JSON.stringify(stored));
}

/**
 * Clears every stored batch result. Run this before a fresh full pass
 * across all batches so no stale result from a previous run lingers in
 * getInternalTestSummary(). Directly runnable from the Apps Script editor.
 */
function clearInternalTestSummary() {
  PropertiesService.getScriptProperties().deleteProperty(INTERNAL_TEST_RESULTS_PROPERTY_);
  Logger.log("Internal test summary cleared.");
}

function runBatch_(batchName, tests) {
  Logger.log("=== Batch: " + batchName + " (" + tests.length + " tests) ===");
  var results = runInternalTestList_(tests);
  recordBatchResults_(batchName, results);
  var summary = summarizeResults_(results);
  Logger.log("[BATCH " + batchName + "] " + JSON.stringify(summary));
  return summary;
}

/** Foundational/security/setup tests. Run this batch first. Directly runnable from the Apps Script editor. */
function runInternalTestsCore() {
  return runBatch_("core", INTERNAL_TESTS_CORE_);
}

/** Sheets.gs's type-normalization boundary against real Google Sheets Date/Number coercion. */
function runInternalTestsSheets() {
  return runBatch_("sheets", INTERNAL_TESTS_SHEETS_);
}

/** Appointment creation/cancellation/reschedule/idempotency — the heaviest real-Sheets tests. */
function runInternalTestsBooking() {
  return runBatch_("booking", INTERNAL_TESTS_BOOKING_);
}

/** Conversation state, webhook dedup, admin conversation/notification views. */
function runInternalTestsConversations() {
  return runBatch_("conversations", INTERNAL_TESTS_CONVERSATIONS_);
}

/** Admin service CRUD + Google Calendar sync (never touches a real Google Calendar — see the batch's own comment above). */
function runInternalTestsIntegrations() {
  return runBatch_("integrations", INTERNAL_TESTS_INTEGRATIONS_);
}

/**
 * Combined total/passed/failed/skipped across every batch run since the
 * last clearInternalTestSummary() — a test whose batch hasn't run yet (or
 * was cleared) reports "skipped", never silently omitted, so a partial
 * pass across batches is never mistaken for a complete one.
 */
function getInternalTestSummary() {
  var stored = loadStoredTestResults_();
  var results = INTERNAL_TESTS_ALL_.map(function (test) {
    var r = stored[test.name];
    if (!r) return { name: test.name, status: "skipped" };
    return {
      name: test.name,
      status: r.passed ? "passed" : "failed",
      durationMs: r.durationMs,
      message: r.message || undefined,
      batch: r.batch,
    };
  });
  var passed = results.filter(function (r) { return r.status === "passed"; }).length;
  var failed = results.filter(function (r) { return r.status === "failed"; }).length;
  var skipped = results.filter(function (r) { return r.status === "skipped"; }).length;
  return { total: results.length, passed: passed, failed: failed, skipped: skipped, results: results };
}

/**
 * Logs and (in the spreadsheet UI) alerts the combined summary. Directly
 * runnable from the Apps Script editor or the "Esquece CRM" menu.
 */
function showInternalTestSummary() {
  var summary = getInternalTestSummary();
  Logger.log(JSON.stringify(summary, null, 2));
  try {
    SpreadsheetApp.getUi().alert(
      "Pruebas internas — " + summary.passed + " OK, " + summary.failed + " fallidas, " +
        summary.skipped + " pendientes (de " + summary.total + ").",
    );
  } catch (e) {
    // Not running in a spreadsheet UI context (e.g. headless, or from the Node test harness) — logging is enough.
  }
  return summary;
}

/**
 * Runs every internal test in one execution. Fine for the local Node vm
 * harness (npm run test:apps-script), which has no execution-time limit
 * and no real Google Sheets API latency. Against a real, deployed Apps
 * Script project, use the five runInternalTests*() batch functions above
 * instead (see FIRST_RUN.md) — this single-execution form is exactly what
 * exceeded Apps Script's ~6-minute limit in practice.
 */
function runAllInternalTests() {
  var results = runInternalTestList_(INTERNAL_TESTS_ALL_);
  var summary = summarizeResults_(results);
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}
