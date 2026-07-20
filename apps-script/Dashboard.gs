/**
 * Generates the read-only DASHBOARD summary sheet. Not the source of
 * truth — always derived from APPOINTMENTS/HUMAN_HANDOFFS/NOTIFICATIONS/
 * CUSTOMERS at generation time. Safe to regenerate at any time.
 */

var DASHBOARD_LABELS_ = [
  "Fecha", "Citas hoy", "Confirmadas hoy", "Completadas hoy", "Canceladas hoy",
  "No presentados hoy", "Próximas citas", "Handoffs abiertos", "Notificaciones fallidas",
  "Clientes activos", "Citas esta semana", "Citas este mes", "Actualizado",
];

function rebuildDashboard_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SHEET_NAMES.DASHBOARD) || spreadsheet.insertSheet(SHEET_NAMES.DASHBOARD);
  var timezone = getBusinessTimezone_();
  var today = formatUtcToLocalDate_(new Date(), timezone);

  var appointments = spreadsheet.getSheetByName(SHEET_NAMES.APPOINTMENTS)
    ? sheetToObjects_(spreadsheet.getSheetByName(SHEET_NAMES.APPOINTMENTS))
    : [];
  var handoffs = spreadsheet.getSheetByName(SHEET_NAMES.HUMAN_HANDOFFS)
    ? sheetToObjects_(spreadsheet.getSheetByName(SHEET_NAMES.HUMAN_HANDOFFS))
    : [];
  var notifications = spreadsheet.getSheetByName(SHEET_NAMES.NOTIFICATIONS)
    ? sheetToObjects_(spreadsheet.getSheetByName(SHEET_NAMES.NOTIFICATIONS))
    : [];
  var customers = spreadsheet.getSheetByName(SHEET_NAMES.CUSTOMERS)
    ? sheetToObjects_(spreadsheet.getSheetByName(SHEET_NAMES.CUSTOMERS))
    : [];

  var todayAppointments = appointments.filter(function (a) {
    return a.localDate === today;
  });
  var weekRange = localDateWeekRange_(today);
  var monthPrefix = today.substring(0, 7);

  var values = [
    today,
    todayAppointments.length,
    todayAppointments.filter(function (a) { return a.status === "CONFIRMED"; }).length,
    todayAppointments.filter(function (a) { return a.status === "COMPLETED"; }).length,
    todayAppointments.filter(function (a) { return a.status === "CANCELLED"; }).length,
    todayAppointments.filter(function (a) { return a.status === "NO_SHOW"; }).length,
    appointments.filter(function (a) {
      return a.localDate >= today && (a.status === "PENDING" || a.status === "CONFIRMED");
    }).length,
    handoffs.filter(function (h) { return h.status === "OPEN"; }).length,
    notifications.filter(function (n) { return n.status === "FAILED"; }).length,
    customers.filter(function (c) { return c.status !== "INACTIVE"; }).length,
    appointments.filter(function (a) { return a.localDate >= weekRange.start && a.localDate <= weekRange.end; }).length,
    appointments.filter(function (a) { return typeof a.localDate === "string" && a.localDate.indexOf(monthPrefix) === 0; }).length,
    new Date().toISOString(),
  ];

  sheet.clear();
  var rows = DASHBOARD_LABELS_.map(function (label, i) {
    return [label, values[i]];
  });
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenColumns(1);
}

function localDateWeekRange_(localDate) {
  var parts = localDate.split("-").map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  var day = d.getDay(); // 0 = Sunday
  var mondayOffset = day === 0 ? -6 : 1 - day;
  var monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: Utilities.formatDate(monday, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    end: Utilities.formatDate(sunday, Session.getScriptTimeZone(), "yyyy-MM-dd"),
  };
}
