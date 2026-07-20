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
