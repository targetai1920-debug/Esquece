/**
 * Demo data — clearly marked (demo=true, "... — reemplazar" naming), safe
 * to add/remove repeatedly. Never created automatically by setupCRM();
 * only via explicit seedDemoData() call (menu or test harness). See
 * CLIENT_INFORMATION_REQUIRED.md — none of this is official Esquece data.
 */

function seedDemoData() {
  var spreadsheet = getSpreadsheet_();
  removeDemoData(); // idempotent: clear any previous demo rows first, avoid duplicates

  var now = new Date().toISOString();

  var servicesSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.SERVICES);
  var serviceHeaders = SHEET_HEADERS[SHEET_NAMES.SERVICES];
  var demoServices = [
    { serviceId: "demo-service-1", name: "Servicio demo — reemplazar", price: 50, durationMinutes: 30, bufferMinutes: 0, displayOrder: 1 },
    { serviceId: "demo-service-2", name: "Servicio demo 2 — reemplazar", price: 80, durationMinutes: 45, bufferMinutes: 0, displayOrder: 2 },
  ];
  demoServices.forEach(function (s) {
    appendRowFromObject_(servicesSheet, serviceHeaders, {
      serviceId: s.serviceId,
      name: s.name,
      description: "Datos de demostración — reemplazar antes de producción.",
      price: s.price,
      currency: "BOB",
      durationMinutes: s.durationMinutes,
      bufferMinutes: s.bufferMinutes,
      category: "demo",
      imageUrl: "",
      active: true,
      displayOrder: s.displayOrder,
      demo: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  var barbersSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.BARBERS);
  var barberHeaders = SHEET_HEADERS[SHEET_NAMES.BARBERS];
  var demoBarbers = [
    { barberId: "demo-barber-1", name: "Barbero demo 1 — reemplazar", displayOrder: 1 },
    { barberId: "demo-barber-2", name: "Barbero demo 2 — reemplazar", displayOrder: 2 },
  ];
  demoBarbers.forEach(function (b) {
    appendRowFromObject_(barbersSheet, barberHeaders, {
      barberId: b.barberId,
      name: b.name,
      biography: "Datos de demostración — reemplazar antes de producción.",
      specialties: "",
      photoUrl: "",
      phoneE164: "",
      active: true,
      publicBooking: true,
      displayOrder: b.displayOrder,
      calendarId: "",
      demo: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  var barberServicesSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.BARBER_SERVICES);
  var barberServiceHeaders = SHEET_HEADERS[SHEET_NAMES.BARBER_SERVICES];
  demoBarbers.forEach(function (b) {
    demoServices.forEach(function (s) {
      appendRowFromObject_(barberServicesSheet, barberServiceHeaders, {
        barberServiceId: b.barberId + ":" + s.serviceId,
        barberId: b.barberId,
        serviceId: s.serviceId,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  var workingHoursSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.WORKING_HOURS);
  var workingHoursHeaders = SHEET_HEADERS[SHEET_NAMES.WORKING_HOURS];
  demoBarbers.forEach(function (b) {
    for (var day = 1; day <= 5; day++) { // Monday(1)..Friday(5)
      appendRowFromObject_(workingHoursSheet, workingHoursHeaders, {
        workingHoursId: "demo-wh-" + b.barberId + "-" + day,
        barberId: b.barberId,
        dayOfWeek: day,
        openingTime: "08:00",
        closingTime: "16:00",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  rebuildDashboard_(spreadsheet);
  Logger.log("seedDemoData() complete.");
  return { ok: true };
}

function removeDemoData() {
  var spreadsheet = getSpreadsheet_();
  var sheetsWithDemoFlag = [
    SHEET_NAMES.SERVICES,
    SHEET_NAMES.BARBERS,
    SHEET_NAMES.CUSTOMERS,
    SHEET_NAMES.APPOINTMENTS,
  ];

  sheetsWithDemoFlag.forEach(function (name) {
    removeDemoRowsFromSheet_(spreadsheet, name);
  });

  // BARBER_SERVICES and WORKING_HOURS rows don't carry a demo flag of
  // their own; remove rows referencing demo-* ids instead.
  removeRowsMatching_(spreadsheet, SHEET_NAMES.BARBER_SERVICES, function (row) {
    return String(row.barberId).indexOf("demo-") === 0;
  });
  removeRowsMatching_(spreadsheet, SHEET_NAMES.WORKING_HOURS, function (row) {
    return String(row.barberId).indexOf("demo-") === 0;
  });

  Logger.log("removeDemoData() complete.");
  return { ok: true };
}

function removeDemoRowsFromSheet_(spreadsheet, sheetName) {
  removeRowsMatching_(spreadsheet, sheetName, function (row) {
    return row.demo === true || row.demo === "true" || row.demo === "TRUE";
  });
}

function removeRowsMatching_(spreadsheet, sheetName, predicate) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return;
  var rows = sheetToObjects_(sheet);
  // Delete from the bottom up so earlier row numbers stay valid.
  for (var i = rows.length - 1; i >= 0; i--) {
    if (predicate(rows[i])) {
      sheet.deleteRow(rows[i].__row);
    }
  }
}
