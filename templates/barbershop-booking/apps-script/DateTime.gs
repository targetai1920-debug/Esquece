/**
 * Local-date/time helpers — pure calendar-day arithmetic via Date.UTC, no
 * dependency on the script's own timezone setting, mirroring
 * src/lib/booking/availability.ts on the Next.js side exactly (same rules,
 * same half-open interval semantics). See BOOKING_RULES equivalent:
 * .claude/skills/barbershop-crm-builder/references/booking-and-availability-rules.md.
 */

var WEEKDAY_BY_INDEX_ = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function weekdayOf_(localDate) {
  var parts = localDate.split("-").map(Number);
  return WEEKDAY_BY_INDEX_[new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay()];
}

function minutesOf_(hhmm) {
  var parts = hhmm.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function toHHMM_(totalMinutes) {
  var h = Math.floor(totalMinutes / 60);
  var m = totalMinutes % 60;
  return (h < 10 ? "0" + h : String(h)) + ":" + (m < 10 ? "0" + m : String(m));
}

function intervalsOverlap_(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function addMinutesToLocalDateTime_(localDate, localTime, minutesToAdd) {
  var parts = localDate.split("-").map(Number);
  var total = minutesOf_(localTime) + minutesToAdd;
  var dayOverflow = Math.floor(total / 1440);
  var remaining = ((total % 1440) + 1440) % 1440;
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + dayOverflow));
  var newDate = date.getUTCFullYear() + "-" + pad2_(date.getUTCMonth() + 1) + "-" + pad2_(date.getUTCDate());
  return { localDate: newDate, localTime: toHHMM_(remaining) };
}

function addDaysToLocalDate_(localDate, days) {
  var parts = localDate.split("-").map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return date.getUTCFullYear() + "-" + pad2_(date.getUTCMonth() + 1) + "-" + pad2_(date.getUTCDate());
}

function pad2_(n) {
  return n < 10 ? "0" + n : String(n);
}
