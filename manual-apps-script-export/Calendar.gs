/**
 * Optional Google Calendar sync — master spec §22. Google Sheets remains
 * authoritative regardless: every function here is a best-effort mirror,
 * never a source of truth, and a Calendar failure must never fail (or
 * roll back) the booking mutation that triggered it. Uses Apps Script's
 * built-in CalendarApp service (the same Google account that owns the
 * deployment authorizes Calendar access as a normal part of deploying —
 * no separate service account or OAuth credential, consistent with this
 * project's "no Google Cloud service account" constraint).
 *
 * Disabled by default (ENABLE_CALENDAR_SYNC=false) — when disabled, every
 * function here is a no-op and booking continues exactly as before.
 */

/**
 * Test-only seams: when non-null, these override the real Script
 * Properties/CalendarApp for the duration of the current execution only.
 * Always null in production. Only Tests.gs's Calendar tests set these —
 * and deliberately as plain in-memory variables, never by writing to real
 * Script Properties (PropertiesService), because Apps Script can kill an
 * execution mid-test on a timeout before its own `finally` cleanup runs;
 * a real Script Property written that way would stay corrupted (real
 * ENABLE_CALENDAR_SYNC=true / GOOGLE_CALENDAR_ID=<test value>) across every
 * later execution until someone noticed and fixed it by hand. A plain
 * top-level `var` can't do that: every fresh Apps Script execution (each
 * manual batch run, each real webhook/API call) starts with a brand-new
 * global scope, so these are guaranteed back to null the moment one
 * execution ends, killed by a timeout or not — no cleanup step required.
 */
var CALENDAR_SYNC_ENABLED_OVERRIDE_FOR_TESTS_ = null;
var CALENDAR_ID_OVERRIDE_FOR_TESTS_ = null;

function calendarSyncEnabled_() {
  var enabled = CALENDAR_SYNC_ENABLED_OVERRIDE_FOR_TESTS_ !== null
    ? CALENDAR_SYNC_ENABLED_OVERRIDE_FOR_TESTS_
    : isCalendarSyncEnabled_();
  return enabled && !!getEffectiveGoogleCalendarId_();
}

function getEffectiveGoogleCalendarId_() {
  return CALENDAR_ID_OVERRIDE_FOR_TESTS_ !== null ? CALENDAR_ID_OVERRIDE_FOR_TESTS_ : getGoogleCalendarId_();
}

/**
 * Test-only seam: when set, syncing calls this instead of the real
 * CalendarApp global. Always null in production — only Tests.gs's
 * Calendar-adapter test sets it, and only for its own duration, resetting
 * it to null in a `finally` even if the test fails, so no real booking can
 * ever be silently routed to a fake calendar. This exists specifically so
 * internal tests can exercise real create/update/cancel sync logic without
 * calling real CalendarApp with a made-up calendar id (which works against
 * the Node harness's mock but throws "Google Calendar not found or not
 * accessible" against a real Apps Script deployment).
 */
var CALENDAR_APP_FOR_TESTS_ = null;

function getCalendarAppProvider_() {
  return CALENDAR_APP_FOR_TESTS_ || CalendarApp;
}

function getSyncCalendar_() {
  var calendarId = getEffectiveGoogleCalendarId_();
  var calendar = getCalendarAppProvider_().getCalendarById(calendarId);
  if (!calendar) {
    throw new Error("Google Calendar not found or not accessible: " + calendarId);
  }
  return calendar;
}

/** No private conversation content, ever — only the booking facts already visible in the CRM (BOOKING_RULES.md / master spec §22). */
function calendarEventTitle_(appointment) {
  return appointment.serviceNameSnapshot + " — " + appointment.customerNameSnapshot;
}

function calendarEventDescription_(appointment) {
  return [
    "Barbero: " + appointment.barberNameSnapshot,
    "Referencia: " + appointment.reference,
    "Estado: " + appointment.status,
  ].join("\n");
}

/** Called after appointment creation. Never throws — a Calendar failure must not fail the booking (BOOKING_RULES.md's non-destructive-failure rule). */
/**
 * Each sync function returns the (possibly updated) appointment row —
 * `updateRowById_` returns a new object rather than mutating its input in
 * place, so callers MUST use the return value, not assume the appointment
 * object they passed in was mutated.
 */
function syncCreateCalendarEvent_(appointment) {
  if (!calendarSyncEnabled_()) return appointment;
  try {
    var calendar = getSyncCalendar_();
    var event = calendar.createEvent(
      calendarEventTitle_(appointment),
      new Date(appointment.startUtc),
      new Date(appointment.endUtc),
      { description: calendarEventDescription_(appointment) },
    );
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    return updateRowById_(sheet, headers, "appointmentId", appointment.appointmentId, {
      calendarEventId: event.getId(),
      calendarSyncStatus: "SYNCED",
    });
  } catch (err) {
    return recordCalendarSyncFailure_(appointment, err);
  }
}

/** Called after rescheduling. Updates the existing event's time if one exists; creates a fresh one if the original sync had failed. */
function syncUpdateCalendarEvent_(appointment) {
  if (!calendarSyncEnabled_()) return appointment;
  try {
    if (!appointment.calendarEventId) {
      return syncCreateCalendarEvent_(appointment);
    }
    var calendar = getSyncCalendar_();
    var event = calendar.getEventById(appointment.calendarEventId);
    if (!event) {
      return syncCreateCalendarEvent_(appointment);
    }
    event.setTime(new Date(appointment.startUtc), new Date(appointment.endUtc));
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    return updateRowById_(sheet, headers, "appointmentId", appointment.appointmentId, { calendarSyncStatus: "SYNCED" });
  } catch (err) {
    return recordCalendarSyncFailure_(appointment, err);
  }
}

/** Called after cancellation. Removes the calendar event if one was ever created; leaves the CRM row (source of truth) untouched either way. */
function syncCancelCalendarEvent_(appointment) {
  if (!calendarSyncEnabled_() || !appointment.calendarEventId) return appointment;
  try {
    var calendar = getSyncCalendar_();
    var event = calendar.getEventById(appointment.calendarEventId);
    if (event) event.deleteEvent();
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    return updateRowById_(sheet, headers, "appointmentId", appointment.appointmentId, { calendarSyncStatus: "CANCELLED" });
  } catch (err) {
    return recordCalendarSyncFailure_(appointment, err);
  }
}

/**
 * Records the failure without throwing — marks the row so staff can see it
 * in the admin dashboard, and queues a CALENDAR_SYNC_FAILURE notification
 * (channel "admin") as the retry/follow-up record master spec §22 asks
 * for, rather than a background retry loop (this sync is best-effort and
 * off by default; a queued, staff-visible record is proportionate).
 */
function recordCalendarSyncFailure_(appointment, err) {
  var updatedAppointment = appointment;
  try {
    var sheet = getAppointmentsSheet_();
    var headers = SHEET_HEADERS[SHEET_NAMES.APPOINTMENTS];
    updatedAppointment = updateRowById_(sheet, headers, "appointmentId", appointment.appointmentId, { calendarSyncStatus: "FAILED" });
  } catch (updateErr) {
    Logger.log("Failed to record calendar sync failure status: " + updateErr);
  }
  try {
    createNotificationRow_({
      appointmentId: appointment.appointmentId,
      customerId: appointment.customerId,
      type: "CALENDAR_SYNC_FAILURE",
      channel: "admin",
      scheduledAt: new Date().toISOString(),
    });
  } catch (notifyErr) {
    Logger.log("Failed to queue CALENDAR_SYNC_FAILURE notification: " + notifyErr);
  }
  Logger.log("Calendar sync failed for appointment " + appointment.appointmentId + ": " + err);
  return updatedAppointment;
}
