/**
 * Internal test runner — non-destructive, self-cleaning where it creates
 * data. See .claude/skills/barbershop-crm-builder/references/google-sheets-apps-script.md
 * §"Testing strategy". This is the local-harness half of validation; the
 * real-deployment half (batched, against an actual Google Sheet) is
 * documented in APPS_SCRIPT_CONNECT_GUIDE.md and is NOT something this
 * environment can run — see the task's final report for that distinction.
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
    if (err && err.name === "ApiError" && err.code === expectedCode) return;
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
  for (var key in overrides || {}) envelope[key] = overrides[key];
  return envelope;
}

function seedTestServiceAndStaff_(suffix) {
  var serviceId = "svc-test-" + suffix;
  appendRowFromObject_(SHEET_NAMES.SERVICES, {
    serviceId: serviceId, name: "Test Service", description: "", price: 20, currency: "USD",
    durationMinutes: 30, bufferMinutes: 0, active: true, displayOrder: 0, image: "",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  var staffId = "staff-test-" + suffix;
  appendRowFromObject_(SHEET_NAMES.STAFF, {
    staffId: staffId, name: "Test Staff", biography: "", photoUrl: "", active: true, publicBooking: true,
    displayOrder: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  appendRowFromObject_(SHEET_NAMES.STAFF_SERVICES, { staffServiceId: generateUuid_(), staffId: staffId, serviceId: serviceId, active: true, createdAt: new Date().toISOString() });
  var days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  for (var i = 0; i < days.length; i++) {
    appendRowFromObject_(SHEET_NAMES.WORKING_HOURS, {
      workingHoursId: generateUuid_(), staffId: staffId, dayOfWeek: days[i], openingTime: "09:00", closingTime: "17:00",
      active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }
  return { serviceId: serviceId, staffId: staffId };
}

/** Next Monday (or later) from today, formatted YYYY-MM-DD — avoids past-date/weekend flakiness regardless of when tests run. */
function nextMondayLocalDate_() {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() + 7); // a week out, comfortably inside any reasonable maxAdvanceDays
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.getUTCFullYear() + "-" + pad2_(d.getUTCMonth() + 1) + "-" + pad2_(d.getUTCDate());
}

var INTERNAL_TESTS_CORE_ = [
  {
    name: "stableStringify sorts object keys",
    run: function () { assertEqual_(stableStringify_({ b: 1, a: 2 }), '{"a":2,"b":1}', "key order"); },
  },
  {
    name: "constantTimeEquals matches/rejects correctly",
    run: function () {
      assertEqual_(constantTimeEquals_("abc", "abc"), true, "equal");
      assertEqual_(constantTimeEquals_("abc", "abd"), false, "different");
    },
  },
  {
    name: "valid signed envelope passes verification",
    run: function () {
      var envelope = buildTestEnvelope_("health", {});
      verifySignedRequest_(envelope);
    },
  },
  {
    name: "tampered payload is rejected",
    run: function () {
      var envelope = buildTestEnvelope_("health", { a: 1 });
      envelope.payload = { a: 2 };
      assertThrowsCode_(function () { verifySignedRequest_(envelope); }, ERROR_CODES.INVALID_SIGNATURE, "tampered payload");
    },
  },
  {
    name: "wrong API key is rejected",
    run: function () {
      var envelope = buildTestEnvelope_("health", {}, { apiKey: "wrong-key" });
      assertThrowsCode_(function () { verifySignedRequest_(envelope); }, ERROR_CODES.UNAUTHORIZED, "wrong api key");
    },
  },
  {
    name: "reused nonce is rejected on second use",
    run: function () {
      var envelope = buildTestEnvelope_("health", {});
      verifySignedRequest_(envelope);
      assertThrowsCode_(function () { verifySignedRequest_(envelope); }, ERROR_CODES.NONCE_REUSED, "reused nonce");
    },
  },
  {
    name: "unsupported action is rejected",
    run: function () {
      assertThrowsCode_(function () { routeAction_("thisActionDoesNotExist", {}); }, ERROR_CODES.UNSUPPORTED_ACTION, "unsupported action");
    },
  },
  {
    name: "health action reports live status",
    run: function () {
      var result = actionHealth_();
      if (!result || result.status !== "live") throw new Error("health did not report live: " + JSON.stringify(result));
    },
  },
  {
    name: "setupCRM is idempotent",
    run: function () {
      setupCRM();
      setupCRM();
      var validation = validateCrmStructure();
      if (!validation.ok) throw new Error("CRM structure invalid after setup: " + validation.problems.join("; "));
    },
  },
  // --- Signature vectors shared with the Next.js side (src/lib/crm/signing.ts,
  // tests/signing.test.ts) — a same-runtime sign-then-verify test (above)
  // cannot catch a charset mismatch between two independent
  // implementations; only comparing against Node-generated ground truth
  // can. See references/security-and-idempotency.md.
  {
    name: "computeHmacHex matches Node-generated Vector 1 (ASCII, key sorting)",
    run: function () {
      var canonical = buildCanonicalString_({ version: "1", timestamp: 1700000000000, nonce: "n1", requestId: "r1", action: "health", payload: { b: 1, a: 2 } });
      assertEqual_(computeHmacHex_(canonical, "test-signing-secret"), "6eb923f9b63a8a907e2414546d275178ed8cde614876b72a703f0166fb6f5dd4", "vector 1");
    },
  },
  {
    name: "computeHmacHex matches Node-generated Vector 2 (Unicode: accents, ñ)",
    run: function () {
      var canonical = buildCanonicalString_({ version: "1", timestamp: 1700000000000, nonce: "n2", requestId: "r2", action: "createAppointment", payload: { customerNotes: "Café con leche, ñoño, corazón" } });
      assertEqual_(computeHmacHex_(canonical, "test-signing-secret"), "aaa5398042e569552f054a6e3cdb30c60dad13697bce296c7bf60effaa43db07", "vector 2 (unicode)");
    },
  },
  {
    name: "computeHmacHex matches Node-generated Vector 3 (emoji + newline)",
    run: function () {
      var canonical = buildCanonicalString_({ version: "1", timestamp: 1700000000000, nonce: "n3", requestId: "r3", action: "createAppointment", payload: { customerNotes: "Line one\nLine two 💈✂️" } });
      assertEqual_(computeHmacHex_(canonical, "test-signing-secret"), "f3ab80b8b9829f151ef5f225e715ae8da19608d9089bca5f63992b0abb8bc82d", "vector 3 (emoji)");
    },
  },
];

var INTERNAL_TESTS_BOOKING_ = [
  {
    name: "getAvailability excludes a slot already taken by an active appointment, and double-booking is prevented under the lock",
    run: function () {
      var fixture = seedTestServiceAndStaff_("booking1");
      var date = nextMondayLocalDate_();
      var first = actionCreateAppointment_({
        idempotencyKey: "idem-" + generateUuid_(), serviceId: fixture.serviceId, staffId: fixture.staffId,
        localDate: date, localStartTime: "10:00", customer: { name: "Alex", phone: "+15550001111" }, source: "ADMIN",
      });
      if (first.idempotent) throw new Error("expected a fresh booking, got idempotent replay");

      assertThrowsCode_(function () {
        actionCreateAppointment_({
          idempotencyKey: "idem-" + generateUuid_(), serviceId: fixture.serviceId, staffId: fixture.staffId,
          localDate: date, localStartTime: "10:00", customer: { name: "Sam", phone: "+15550002222" }, source: "ADMIN",
        });
      }, ERROR_CODES.SLOT_UNAVAILABLE, "second booking for the identical slot");
    },
  },
  {
    name: "a slot ending exactly at closing time is accepted (half-open interval)",
    run: function () {
      var fixture = seedTestServiceAndStaff_("halfopen");
      var date = nextMondayLocalDate_();
      var result = checkSlotValidity_(buildAvailabilityContext_(), { serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "16:30" });
      if (!result.valid) throw new Error("expected 16:30-17:00 (ends exactly at closing) to be valid, got " + result.reason);
    },
  },
  {
    name: "idempotent retry with the same key returns the original appointment",
    run: function () {
      var fixture = seedTestServiceAndStaff_("idem");
      var date = nextMondayLocalDate_();
      var key = "idem-retry-" + generateUuid_();
      var first = actionCreateAppointment_({ idempotencyKey: key, serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "11:00", customer: { name: "Alex", phone: "+15550003333" }, source: "ADMIN" });
      var retry = actionCreateAppointment_({ idempotencyKey: key, serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "11:00", customer: { name: "Alex", phone: "+15550003333" }, source: "ADMIN" });
      if (!retry.idempotent) throw new Error("expected idempotent replay");
      assertEqual_(retry.appointment.id, first.appointment.id, "same appointment id");
    },
  },
  {
    name: "cancel then reschedule work under lock, and a failed reschedule leaves the appointment unchanged",
    run: function () {
      var fixture = seedTestServiceAndStaff_("cancelresched");
      var date = nextMondayLocalDate_();
      var created = actionCreateAppointment_({ idempotencyKey: "idem-" + generateUuid_(), serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "12:00", customer: { name: "Alex", phone: "+15550004444" }, source: "ADMIN" });
      var token = created.managementToken;

      var blocker = actionCreateAppointment_({ idempotencyKey: "idem-" + generateUuid_(), serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "13:00", customer: { name: "Blocker", phone: "+15550005555" }, source: "ADMIN" });

      assertThrowsCode_(function () {
        actionRescheduleAppointment_({ appointmentId: created.appointment.id, managementToken: token, newLocalDate: date, newLocalStartTime: "13:00" });
      }, ERROR_CODES.SLOT_UNAVAILABLE, "reschedule into a taken slot");

      var stillOriginal = actionGetAppointmentByReference_({ reference: created.appointment.reference, managementToken: token });
      assertEqual_(stillOriginal.appointment.localStartTime, "12:00", "unchanged after failed reschedule");

      var rescheduled = actionRescheduleAppointment_({ appointmentId: created.appointment.id, managementToken: token, newLocalDate: date, newLocalStartTime: "14:00" });
      assertEqual_(rescheduled.appointment.localStartTime, "14:00", "rescheduled successfully");

      var cancelled = actionCancelAppointment_({ appointmentId: created.appointment.id, managementToken: token });
      assertEqual_(cancelled.appointment.status, "CANCELLED", "cancelled");
      var cancelledAgain = actionCancelAppointment_({ appointmentId: created.appointment.id, managementToken: token });
      assertEqual_(cancelledAgain.appointment.status, "CANCELLED", "cancel is idempotent");
    },
  },
  {
    name: "a blocked slot and a time-off period both correctly reject a booking attempt",
    run: function () {
      var fixture = seedTestServiceAndStaff_("blocks");
      var date = nextMondayLocalDate_();
      actionCreateBlockedSlot_({ staffId: fixture.staffId, localDate: date, startTime: "15:00", endTime: "15:30", reason: "test block" });
      var blockedCheck = checkSlotValidity_(buildAvailabilityContext_(), { serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "15:00" });
      assertEqual_(blockedCheck.valid, false, "blocked slot rejected");
      assertEqual_(blockedCheck.reason, ERROR_CODES.OVERLAPS_BLOCK, "blocked slot reason");

      actionCreateTimeOff_({ staffId: fixture.staffId, startDate: date, endDate: date, reason: "test day off" });
      var timeOffCheck = checkSlotValidity_(buildAvailabilityContext_(), { serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "09:00" });
      assertEqual_(timeOffCheck.valid, false, "time off rejected");
      assertEqual_(timeOffCheck.reason, ERROR_CODES.OVERLAPS_TIME_OFF, "time off reason");
    },
  },
  {
    name: "admin operations (confirm/complete/no-show/price/active toggles) work and are audited",
    run: function () {
      var fixture = seedTestServiceAndStaff_("admin");
      var date = nextMondayLocalDate_();
      var created = actionCreateAppointment_({ idempotencyKey: "idem-" + generateUuid_(), serviceId: fixture.serviceId, staffId: fixture.staffId, localDate: date, localStartTime: "09:00", customer: { name: "Alex", phone: "+15550006666" }, source: "WEBSITE" });

      var confirmed = actionConfirmAppointment_({ appointmentId: created.appointment.id });
      assertEqual_(confirmed.appointment.status, "CONFIRMED", "confirmed");
      var completed = actionCompleteAppointment_({ appointmentId: created.appointment.id });
      assertEqual_(completed.appointment.status, "COMPLETED", "completed");

      var priceUpdate = actionAdminSetServicePrice_({ serviceId: fixture.serviceId, price: 35 });
      assertEqual_(priceUpdate.service.price, 35, "price updated");
      var toggle = actionAdminSetServiceActive_({ serviceId: fixture.serviceId, active: false });
      assertEqual_(toggle.service.active, false, "service deactivated");

      var auditEntries = actionListAuditLog_().entries;
      var hasConfirm = auditEntries.some(function (e) { return e.action === "confirmAppointment" && e.entityId === created.appointment.id; });
      if (!hasConfirm) throw new Error("expected an audit-log entry for confirmAppointment");
    },
  },
  {
    name: "importSeed inserts new rows and is idempotent on a second call with the same payload",
    run: function () {
      var suffix = generateUuid_().substring(0, 8);
      var seed = {
        settings: [{ key: "businessName", value: "Test Barbershop " + suffix, type: "string" }],
        services: [{ serviceId: "seed-svc-" + suffix, name: "Seed Cut", price: 25, currency: "USD", durationMinutes: 30, bufferMinutes: 5, active: true }],
        staff: [{ staffId: "seed-staff-" + suffix, name: "Seed Barber", active: true, publicBooking: true }],
        staffServices: [{ staffId: "seed-staff-" + suffix, serviceId: "seed-svc-" + suffix, active: true }],
        workingHours: [{ staffId: "seed-staff-" + suffix, dayOfWeek: "monday", openingTime: "09:00", closingTime: "17:00" }],
        breaks: [{ staffId: "seed-staff-" + suffix, dayOfWeek: "monday", startTime: "12:00", endTime: "13:00" }],
      };

      var first = actionImportSeed_(seed);
      assertEqual_(first.services.inserted, 1, "first import inserts the service");
      assertEqual_(first.staff.inserted, 1, "first import inserts the staff member");
      assertEqual_(first.staffServices.inserted, 1, "first import inserts the staff-service link");
      assertEqual_(first.workingHours.inserted, 1, "first import inserts working hours");
      assertEqual_(first.breaks.inserted, 1, "first import inserts the break");
      assertEqual_(first.settings.updated, 1, "first import updates the existing businessName setting");

      var settingsAfterFirst = getSettingsMap_();
      assertEqual_(settingsAfterFirst.businessName, "Test Barbershop " + suffix, "businessName applied");

      var second = actionImportSeed_(seed);
      assertEqual_(second.services.inserted, 0, "second import inserts no new service");
      assertEqual_(second.services.skipped, 1, "second import skips the existing service");
      assertEqual_(second.staff.skipped, 1, "second import skips the existing staff member");
      assertEqual_(second.staffServices.skipped, 1, "second import skips the existing staff-service link");
      assertEqual_(second.workingHours.skipped, 1, "second import skips existing working hours");
      assertEqual_(second.breaks.skipped, 1, "second import skips the existing break");

      var auditEntries = actionListAuditLog_().entries;
      var hasImport = auditEntries.some(function (e) { return e.action === "importSeed"; });
      if (!hasImport) throw new Error("expected an audit-log entry for importSeed");
    },
  },
];

var INTERNAL_TESTS_ALL_ = [].concat(INTERNAL_TESTS_CORE_, INTERNAL_TESTS_BOOKING_);

function runInternalTestList_(tests) {
  return tests.map(function (test) {
    var start = Date.now();
    try {
      test.run();
      return { name: test.name, passed: true, durationMs: Date.now() - start };
    } catch (err) {
      return { name: test.name, passed: false, message: err && err.message, durationMs: Date.now() - start };
    }
  });
}

function runAllInternalTests() {
  var results = runInternalTestList_(INTERNAL_TESTS_ALL_);
  var failed = results.filter(function (r) { return !r.passed; }).length;
  return { total: results.length, passed: results.length - failed, failed: failed, results: results };
}
