/**
 * Centralized date/time helpers. See BOOKING_RULES.md for the rules that
 * consume these. All "local" values are in the business timezone
 * (getBusinessTimezone_(), Config.gs) — never the Apps Script server's
 * default timezone, and never the browser's locale.
 */

var LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
var LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidLocalDate_(value) {
  if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) return false;
  var parts = value.split("-").map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  return (
    d.getFullYear() === parts[0] &&
    d.getMonth() === parts[1] - 1 &&
    d.getDate() === parts[2]
  );
}

function isValidLocalTime_(value) {
  return typeof value === "string" && LOCAL_TIME_PATTERN.test(value);
}

/** Pure calendar-date arithmetic — not an instant, so no timezone involved. */
function addDaysToLocalDate_(localDate, days) {
  var parts = localDate.split("-").map(Number);
  var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

/** 0 = Sunday ... 6 = Saturday, purely from the calendar date (no timezone conversion needed). */
function weekdayOfLocalDateOnly_(localDate) {
  var parts = localDate.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
}

/** Next date (starting from `daysFromNow` out) that isn't a Saturday/Sunday — for tests and any "pick a bookable day" UI helper. */
function nextWeekdayLocalDate_(fromLocalDate, minDaysFromNow) {
  var candidate = addDaysToLocalDate_(fromLocalDate, minDaysFromNow);
  while (weekdayOfLocalDateOnly_(candidate) === 0 || weekdayOfLocalDateOnly_(candidate) === 6) {
    candidate = addDaysToLocalDate_(candidate, 1);
  }
  return candidate;
}

/** 0 = Sunday ... 6 = Saturday, matching JS Date#getDay() and the WORKING_HOURS.dayOfWeek column. */
function weekdayOfLocalDate_(localDate, timezone) {
  var d = parseLocalDateTimeToUtc_(localDate, "00:00", timezone);
  return Number(Utilities.formatDate(d, timezone, "u")) % 7;
}

function minutesFromMidnight_(localTime) {
  var parts = localTime.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function addMinutesToLocalTime_(localTime, minutesToAdd) {
  var total = minutesFromMidnight_(localTime) + minutesToAdd;
  var hours = Math.floor(total / 60);
  var minutes = total % 60;
  var hh = (hours < 10 ? "0" : "") + hours;
  var mm = (minutes < 10 ? "0" : "") + minutes;
  return hh + ":" + mm;
}

/** True if [aStart, aEnd) overlaps [bStart, bEnd) — half-open interval, see BOOKING_RULES.md #22. */
function intervalsOverlap_(aStartMin, aEndMin, bStartMin, bEndMin) {
  return aStartMin < bEndMin && bStartMin < aEndMin;
}

function parseLocalDateTimeToUtc_(localDate, localTime, timezone) {
  var parts = localDate.split("-").map(Number);
  var timeParts = localTime.split(":").map(Number);
  // Build the instant by formatting a UTC guess and adjusting for the zone
  // offset — Apps Script has no built-in zoned-date constructor.
  var naiveUtc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1]));
  var offsetMinutes = getTimezoneOffsetMinutes_(naiveUtc, timezone);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60000);
}

function getTimezoneOffsetMinutes_(utcGuess, timezone) {
  var formatted = Utilities.formatDate(utcGuess, timezone, "Z");
  var sign = formatted.charAt(0) === "-" ? -1 : 1;
  var hours = Number(formatted.substring(1, 3));
  var minutes = Number(formatted.substring(3, 5));
  return sign * (hours * 60 + minutes);
}

function formatUtcToLocalDate_(utcDate, timezone) {
  return Utilities.formatDate(utcDate, timezone, "yyyy-MM-dd");
}

function formatUtcToLocalTime_(utcDate, timezone) {
  return Utilities.formatDate(utcDate, timezone, "HH:mm");
}

/** Spanish weekday/month names for customer-facing dates — never browser locale. */
var SPANISH_WEEKDAYS_ = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
var SPANISH_MONTHS_ = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatLocalDateForCustomer_(localDate) {
  var parts = localDate.split("-").map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  return SPANISH_WEEKDAYS_[d.getDay()] + " " + d.getDate() + " de " + SPANISH_MONTHS_[d.getMonth()];
}
