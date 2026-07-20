/**
 * CUSTOMERS sheet access. Upserted by normalized phone — never duplicated.
 * getCustomerHistory reads APPOINTMENTS directly; appointment *creation*
 * is Phase D — until then this correctly returns an empty list, it does
 * not need to wait for Phase D to exist.
 */

function getCustomersSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.CUSTOMERS);
}

function findCustomerByPhoneRaw_(phoneE164) {
  return findRowById_(getCustomersSheet_(), "phoneE164", phoneE164);
}

function actionFindCustomerByPhone_(payload) {
  var phone = requirePhoneE164_(payload && payload.phoneE164, "phoneE164");
  return { customer: findCustomerByPhoneRaw_(phone) };
}

/**
 * Creates or updates a customer by phone. Never overwrites an existing
 * field with an empty value from the caller — only fields explicitly
 * provided (and non-empty) replace what's already there, so a partial
 * upsert (e.g. WhatsApp only ever supplying a name) can't silently erase
 * previously-collected data (e.g. an email captured via the website).
 */
function actionUpsertCustomer_(payload) {
  var phone = requirePhoneE164_(payload && payload.phoneE164, "phoneE164");
  var sheet = getCustomersSheet_();
  var headers = SHEET_HEADERS[SHEET_NAMES.CUSTOMERS];
  var existing = findCustomerByPhoneRaw_(phone);
  var now = new Date().toISOString();

  var incoming = {};
  if (payload.name) incoming.name = optionalString_(payload.name);
  if (payload.whatsappId) incoming.whatsappId = optionalString_(payload.whatsappId);
  if (payload.email) incoming.email = optionalString_(payload.email);
  if (payload.notes) incoming.notes = optionalString_(payload.notes);
  if (payload.source) incoming.source = optionalString_(payload.source);

  if (existing) {
    incoming.lastContactAt = now;
    var updated = updateRowById_(sheet, headers, "phoneE164", phone, incoming);
    return { customer: updated };
  }

  var created = insertRow_(sheet, headers, Object.assign(
    {
      customerId: generateEntityId_("cus"),
      phoneE164: phone,
      status: "ACTIVE",
      firstContactAt: now,
      lastContactAt: now,
      totalAppointments: 0,
      confirmedAppointments: 0,
      completedAppointments: 0,
      cancelledAppointments: 0,
      noShowAppointments: 0,
      demo: false,
    },
    incoming,
  ));
  return { customer: created };
}

function actionGetCustomer_(payload) {
  var customerId = requireString_(payload && payload.customerId, "customerId");
  var customer = findRowById_(getCustomersSheet_(), "customerId", customerId);
  if (!customer) {
    throw new ApiError(ERROR_CODES.CUSTOMER_NOT_FOUND, "Cliente no encontrado.", false);
  }
  return { customer: customer };
}

function actionListCustomers_(payload) {
  var search = payload && payload.search ? String(payload.search).toLowerCase() : null;
  var rows = sheetToObjects_(getCustomersSheet_());
  if (search) {
    rows = rows.filter(function (row) {
      return (
        (row.name && String(row.name).toLowerCase().indexOf(search) !== -1) ||
        (row.phoneE164 && String(row.phoneE164).indexOf(search) !== -1)
      );
    });
  }
  return { customers: rows };
}

function actionGetCustomerHistory_(payload) {
  var customerId = requireString_(payload && payload.customerId, "customerId");
  var customer = findRowById_(getCustomersSheet_(), "customerId", customerId);
  if (!customer) {
    throw new ApiError(ERROR_CODES.CUSTOMER_NOT_FOUND, "Cliente no encontrado.", false);
  }

  var appointmentsSheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS);
  var appointments = findRowsWhere_(appointmentsSheet, function (row) {
    return row.customerId === customerId;
  }).sort(function (a, b) {
    return String(b.startUtc || "").localeCompare(String(a.startUtc || ""));
  });

  return { customer: customer, appointments: appointments };
}

/**
 * Recomputes the CUSTOMERS counter columns from actual APPOINTMENTS rows.
 * Repair tool for drift, not called during normal request handling.
 */
function recalculateCustomerCounters() {
  var customersSheet = getCustomersSheet_();
  var customerHeaders = SHEET_HEADERS[SHEET_NAMES.CUSTOMERS];
  var appointments = sheetToObjects_(getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS));
  var customers = sheetToObjects_(customersSheet);

  customers.forEach(function (customer) {
    var forCustomer = appointments.filter(function (a) {
      return a.customerId === customer.customerId;
    });
    var counters = {
      totalAppointments: forCustomer.length,
      confirmedAppointments: forCustomer.filter(function (a) { return a.status === "CONFIRMED"; }).length,
      completedAppointments: forCustomer.filter(function (a) { return a.status === "COMPLETED"; }).length,
      cancelledAppointments: forCustomer.filter(function (a) { return a.status === "CANCELLED"; }).length,
      noShowAppointments: forCustomer.filter(function (a) { return a.status === "NO_SHOW"; }).length,
    };
    updateRowFromObject_(customersSheet, customerHeaders, Object.assign({}, customer, counters), customer.__row);
  });

  Logger.log("recalculateCustomerCounters() updated " + customers.length + " customers.");
  return { ok: true, customersUpdated: customers.length };
}
