/**
 * Custom spreadsheet menu — installed automatically when the bound
 * spreadsheet is opened by an editor.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Esquece CRM")
    .addItem("Configurar CRM", "setupCRM")
    .addItem("Validar estructura", "menuValidateCrmStructure_")
    .addSeparator()
    .addItem("Crear datos demo", "seedDemoData")
    .addItem("Eliminar datos demo", "removeDemoData")
    .addSeparator()
    .addItem("Ver citas de hoy", "menuShowTodayAppointments_")
    .addItem("Actualizar dashboard", "menuRefreshDashboard_")
    .addSeparator()
    .addItem("Procesar recordatorios", "menuProcessReminders_")
    .addItem("Revisar notificaciones fallidas", "menuShowFailedNotifications_")
    .addItem("Sincronizar calendario", "menuSyncCalendar_")
    .addSeparator()
    // Run these five in order for a real deployment — each finishes well
    // under Apps Script's execution limit on its own. The old single
    // "Ejecutar pruebas internas" (runAllInternalTests) is intentionally not
    // in this menu anymore: it runs all ~29 tests in one execution, which
    // is exactly what exceeded the 6-minute limit against a real
    // spreadsheet (see FIRST_RUN.md). runAllInternalTests() itself still
    // exists, for the local Node test harness only.
    .addItem("Pruebas internas: limpiar resumen", "clearInternalTestSummary")
    .addItem("Pruebas internas: 1) Core", "runInternalTestsCore")
    .addItem("Pruebas internas: 2) Sheets", "runInternalTestsSheets")
    .addItem("Pruebas internas: 3) Booking", "runInternalTestsBooking")
    .addItem("Pruebas internas: 4) Conversaciones", "runInternalTestsConversations")
    .addItem("Pruebas internas: 5) Integraciones", "runInternalTestsIntegrations")
    .addItem("Pruebas internas: ver resumen", "showInternalTestSummary")
    .addSeparator()
    .addItem("Mostrar versión", "showCrmVersion")
    .addToUi();
}

function menuValidateCrmStructure_() {
  var result = validateCrmStructure();
  var ui = SpreadsheetApp.getUi();
  ui.alert(result.ok ? "La estructura del CRM es válida." : "Problemas encontrados:\n" + result.problems.join("\n"));
}

function menuRefreshDashboard_() {
  rebuildDashboard_(getSpreadsheet_());
  SpreadsheetApp.getUi().alert("Dashboard actualizado.");
}

function menuShowTodayAppointments_() {
  SpreadsheetApp.getUi().alert(
    "Revisa la hoja APPOINTMENTS filtrando por la fecha de hoy, o el resumen en DASHBOARD.",
  );
}

function menuShowFailedNotifications_() {
  SpreadsheetApp.getUi().alert("Revisa la hoja NOTIFICATIONS filtrando por status = FAILED.");
}

/** Placeholder until Phase J implements the reminder processor inside Apps Script's reach. */
function menuProcessReminders_() {
  SpreadsheetApp.getUi().alert(
    "El procesamiento de recordatorios se ejecuta desde Next.js (/api/cron/notifications), " +
      "no desde este menú — ver PROJECT_PLAN.md, Fase J.",
  );
}

/** Placeholder until Phase J implements Calendar sync. */
function menuSyncCalendar_() {
  SpreadsheetApp.getUi().alert("Sincronización con Calendar pendiente — ver PROJECT_PLAN.md, Fase J.");
}
