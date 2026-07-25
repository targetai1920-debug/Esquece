/**
 * The availability engine. Implements BOOKING_RULES.md §1 (the twelve-point
 * check) and §2 (slot granularity). This is the single place that logic
 * lives — Appointments.gs's createAppointment re-runs the same
 * per-slot check (isSlotValid_) under the script lock rather than
 * re-implementing it, and getAvailability (read-only, for display) uses
 * the same function too. Neither the website nor the WhatsApp agent may
 * compute availability on their own — ARCHITECTURE.md §5.
 */

function getWorkingHoursSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.WORKING_HOURS);
}
function getBreaksSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.BREAKS);
}
function getTimeOffSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.TIME_OFF);
}
function getBlockedSlotsSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.BLOCKED_SLOTS);
}
function getAppointmentsSheet_() {
  return getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.APPOINTMENTS);
}

/**
 * Preloads every sheet a getAvailability computation needs — settings,
 * working hours, breaks, time off, blocked slots, appointments, barbers,
 * and barber-service links — exactly once per request, and hands the
 * in-memory rows to checkSlotValidity_/getAvailableSlotsForBarber_/
 * actionGetAvailability_ instead of letting each of them call
 * sheetToObjects_ again for every candidate slot and every barber.
 *
 * Before this existed, actionGetAvailability_ for one barber (8:00-16:00,
 * 30-minute slots, demo data) triggered 86 sheetToObjects_ calls — 5 full
 * sheet reads (WORKING_HOURS/BREAKS/TIME_OFF/BLOCKED_SLOTS/APPOINTMENTS)
 * per *candidate slot*, on top of one BARBERS read per barber — because
 * checkSlotValidity_ and its interval helpers each read their sheet fresh,
 * unconditionally, every time they were called. With anyBarber=true across
 * two barbers that was 167 calls for a single request. This context makes
 * that request-scoped instead of slot/barber-scoped: 9 reads total
 * (2 outside this function — SERVICES/SETTINGS — plus the 7 below),
 * regardless of how many slots or barbers are evaluated.
 *
 * Every field here is *optional* to every consumer: checkSlotValidity_ and
 * the interval helpers below fall back to their own single fresh
 * sheetToObjects_ call when no context (or a context missing a specific
 * field) is passed — see each function's own comment. This is what keeps
 * Appointments.gs's createAppointment (which must always re-validate
 * against genuinely fresh data while holding the script lock —
 * ARCHITECTURE.md §5, BOOKING_RULES.md §3) correct without any change:
 * it simply never builds or passes a context, so every one of its
 * checkSlotValidity_ calls reads every sheet fresh, exactly as before.
 */
function buildAvailabilityContext_(localDate, settings) {
  return {
    localDate: localDate,
    settings: settings || getSettingsMap_(),
    workingHoursRows: sheetToObjects_(getWorkingHoursSheet_()),
    breaksRows: sheetToObjects_(getBreaksSheet_()),
    timeOffRows: sheetToObjects_(getTimeOffSheet_()),
    blockedSlotsRows: sheetToObjects_(getBlockedSlotsSheet_()),
    appointmentsRows: sheetToObjects_(getAppointmentsSheet_()),
    barbersRows: sheetToObjects_(getBarbersSheet_()),
    barberServicesRows: sheetToObjects_(getBarberServicesSheet_()),
  };
}

/**
 * BOOKING_RULES.md §1.8 — barber-specific WORKING_HOURS rows narrow
 * (never expand) general business-wide rows (barberId empty) for the
 * same weekday. If only one of the two exists, that one applies as-is.
 *
 * `context`, when provided (an availabilityContext_ — see
 * buildAvailabilityContext_), supplies already-loaded WORKING_HOURS rows
 * instead of triggering another sheetToObjects_ read.
 */
function getEffectiveWorkingIntervalsMinutes_(barberId, dayOfWeek, context) {
  var rows = (context && context.workingHoursRows) || sheetToObjects_(getWorkingHoursSheet_());
  var toIntervals = function (list) {
    return list
      .filter(function (r) { return Number(r.dayOfWeek) === dayOfWeek && isActiveRow_(r); })
      .map(function (r) {
        return { start: minutesFromMidnight_(r.openingTime), end: minutesFromMidnight_(r.closingTime) };
      });
  };

  var barberRows = rows.filter(function (r) { return r.barberId === barberId; });
  var generalRows = rows.filter(function (r) { return !r.barberId; });

  var barberIntervals = toIntervals(barberRows);
  var generalIntervals = toIntervals(generalRows);

  if (barberIntervals.length > 0 && generalIntervals.length > 0) {
    return intersectIntervalLists_(barberIntervals, generalIntervals);
  }
  return barberIntervals.length > 0 ? barberIntervals : generalIntervals;
}

function intersectIntervalLists_(listA, listB) {
  var out = [];
  listA.forEach(function (a) {
    listB.forEach(function (b) {
      var start = Math.max(a.start, b.start);
      var end = Math.min(a.end, b.end);
      if (start < end) out.push({ start: start, end: end });
    });
  });
  return out;
}

function isContainedInAnyInterval_(startMin, endMin, intervals) {
  return intervals.some(function (i) { return i.start <= startMin && endMin <= i.end; });
}

function overlapsAny_(startMin, endMin, intervals) {
  return intervals.some(function (i) { return intervalsOverlap_(startMin, endMin, i.start, i.end); });
}

/** `context`, when provided, supplies already-loaded BREAKS rows — see getEffectiveWorkingIntervalsMinutes_'s comment above. */
function getBreakIntervalsMinutes_(barberId, localDate, dayOfWeek, context) {
  var rows = (context && context.breaksRows) || sheetToObjects_(getBreaksSheet_());
  return rows
    .filter(function (r) {
      if (!isActiveRow_(r)) return false;
      if (r.barberId && r.barberId !== barberId) return false;
      var isRecurringMatch = (r.recurring === true || r.recurring === "true") && Number(r.dayOfWeek) === dayOfWeek;
      var isOneTimeMatch = r.date && formatBreakDate_(r.date) === localDate;
      return isRecurringMatch || isOneTimeMatch;
    })
    .map(function (r) {
      return { start: minutesFromMidnight_(r.startTime), end: minutesFromMidnight_(r.endTime) };
    });
}

function formatBreakDate_(dateValue) {
  if (dateValue instanceof Date) return formatUtcToLocalDate_(dateValue, getBusinessTimezone_());
  return String(dateValue).substring(0, 10);
}

/** `context`, when provided, supplies already-loaded TIME_OFF rows — see getEffectiveWorkingIntervalsMinutes_'s comment above. */
function getTimeOffIntervalsMinutesForDate_(barberId, localDate, timezone, context) {
  var rows = (context && context.timeOffRows) || sheetToObjects_(getTimeOffSheet_());
  var dayStart = parseLocalDateTimeToUtc_(localDate, "00:00", timezone);
  var dayEnd = parseLocalDateTimeToUtc_(localDate, "23:59", timezone);

  return rows
    .filter(function (r) {
      if (!isActiveRow_(r)) return false;
      if (r.barberId !== barberId) return false;
      var startsAt = new Date(r.startsAt);
      var endsAt = new Date(r.endsAt);
      return startsAt <= dayEnd && dayStart <= endsAt;
    })
    .map(function (r) {
      var allDay = r.allDay === true || r.allDay === "true";
      if (allDay) return { start: 0, end: 24 * 60 };
      return {
        start: minutesFromMidnight_(formatUtcToLocalTime_(new Date(r.startsAt), timezone)),
        end: minutesFromMidnight_(formatUtcToLocalTime_(new Date(r.endsAt), timezone)),
      };
    });
}

/** `context`, when provided, supplies already-loaded BLOCKED_SLOTS rows — see getEffectiveWorkingIntervalsMinutes_'s comment above. */
function getBlockedIntervalsMinutesForDate_(barberId, localDate, context) {
  var rows = (context && context.blockedSlotsRows) || sheetToObjects_(getBlockedSlotsSheet_());
  return rows
    .filter(function (r) {
      if (!isActiveRow_(r)) return false;
      if (r.barberId && r.barberId !== barberId) return false; // empty barberId = business-wide
      return r.localDate === localDate;
    })
    .map(function (r) {
      return { start: minutesFromMidnight_(r.startTime), end: minutesFromMidnight_(r.endTime) };
    });
}

/** Only these statuses block a slot — BOOKING_RULES.md §1.12/§4. */
var ACTIVE_APPOINTMENT_STATUSES_ = ["PENDING", "CONFIRMED"];

/**
 * `excludeAppointmentId` lets rescheduling treat an appointment's own
 * current interval as free while checking its prospective new slot
 * (Appointments.gs's actionRescheduleAppointment_) — everywhere else
 * calls this with no exclusion. `context`, when provided, supplies
 * already-loaded APPOINTMENTS rows — see getEffectiveWorkingIntervalsMinutes_'s
 * comment above.
 */
function getActiveAppointmentIntervalsMinutesForDate_(barberId, localDate, excludeAppointmentId, context) {
  var rows = (context && context.appointmentsRows) || sheetToObjects_(getAppointmentsSheet_());
  return rows
    .filter(function (r) {
      return r.barberId === barberId && r.localDate === localDate &&
        ACTIVE_APPOINTMENT_STATUSES_.indexOf(r.status) !== -1 &&
        r.appointmentId !== excludeAppointmentId;
    })
    .map(function (r) {
      return { start: minutesFromMidnight_(r.localStartTime), end: minutesFromMidnight_(r.localEndTime) };
    });
}

/**
 * The twelve-point check (BOOKING_RULES.md §1), for one exact
 * (barber, service, date, time) candidate. Used both for listing
 * availability and — re-run under the lock — for confirming a booking.
 *
 * `params.context` (an availabilityContext_ — see
 * buildAvailabilityContext_ above), when provided, is threaded into every
 * interval helper below so none of them re-reads its sheet. Every
 * Appointments.gs call site (createAppointment's initial check and its
 * re-check under the script lock, reschedule, "any available barber"
 * selection) never passes one, so it keeps reading every sheet fresh on
 * every call — required for correctness there, not just tolerated.
 */
function checkSlotValidity_(params) {
  var timezone = getBusinessTimezone_();
  var context = params.context;
  var settings = params.settings || (context && context.settings) || getSettingsMap_();
  var localDate = params.localDate;
  var localStartTime = params.localStartTime;
  var barberId = params.barberId;
  var totalDurationMinutes = params.totalDurationMinutes;

  if (!isValidLocalDate_(localDate)) return { valid: false, reason: ERROR_CODES.INVALID_PAYLOAD };
  if (!isValidLocalTime_(localStartTime)) return { valid: false, reason: ERROR_CODES.INVALID_PAYLOAD };

  var dayOfWeek = weekdayOfLocalDate_(localDate, timezone);
  var dayOpenKey = ["SUNDAY_OPEN", "MONDAY_OPEN", "TUESDAY_OPEN", "WEDNESDAY_OPEN", "THURSDAY_OPEN", "FRIDAY_OPEN", "SATURDAY_OPEN"][dayOfWeek];
  if (!settings[dayOpenKey]) {
    return { valid: false, reason: dayOfWeek === 0 || dayOfWeek === 6 ? ERROR_CODES.WEEKEND_CLOSED : ERROR_CODES.BUSINESS_CLOSED };
  }

  var startMin = minutesFromMidnight_(localStartTime);
  var endMin = startMin + totalDurationMinutes;
  var closingMin = minutesFromMidnight_(settings.CLOSING_TIME);
  var openingMin = minutesFromMidnight_(settings.OPENING_TIME);
  if (startMin < openingMin || endMin > closingMin) {
    return { valid: false, reason: ERROR_CODES.OUTSIDE_BUSINESS_HOURS };
  }

  var startUtc = parseLocalDateTimeToUtc_(localDate, localStartTime, timezone);
  var now = params.now || new Date();
  if (startUtc.getTime() <= now.getTime()) {
    return { valid: false, reason: ERROR_CODES.DATE_IN_PAST };
  }
  var minLeadMs = (settings.MIN_BOOKING_NOTICE_MINUTES || 0) * 60000;
  if (startUtc.getTime() - now.getTime() < minLeadMs) {
    return { valid: false, reason: ERROR_CODES.BOOKING_TOO_SOON };
  }
  var maxAdvanceMs = (settings.MAX_ADVANCE_BOOKING_DAYS || 0) * 24 * 60 * 60000;
  if (startUtc.getTime() - now.getTime() > maxAdvanceMs) {
    return { valid: false, reason: ERROR_CODES.BOOKING_TOO_FAR_IN_ADVANCE };
  }

  var workingIntervals = getEffectiveWorkingIntervalsMinutes_(barberId, dayOfWeek, context);
  if (!isContainedInAnyInterval_(startMin, endMin, workingIntervals)) {
    return { valid: false, reason: ERROR_CODES.OUTSIDE_BUSINESS_HOURS };
  }

  var breaks = getBreakIntervalsMinutes_(barberId, localDate, dayOfWeek, context);
  if (overlapsAny_(startMin, endMin, breaks)) {
    return { valid: false, reason: ERROR_CODES.SLOT_UNAVAILABLE };
  }

  var timeOff = getTimeOffIntervalsMinutesForDate_(barberId, localDate, timezone, context);
  if (overlapsAny_(startMin, endMin, timeOff)) {
    return { valid: false, reason: ERROR_CODES.SLOT_UNAVAILABLE };
  }

  var blocked = getBlockedIntervalsMinutesForDate_(barberId, localDate, context);
  if (overlapsAny_(startMin, endMin, blocked)) {
    return { valid: false, reason: ERROR_CODES.SLOT_UNAVAILABLE };
  }

  var appointments = getActiveAppointmentIntervalsMinutesForDate_(barberId, localDate, params.excludeAppointmentId, context);
  if (overlapsAny_(startMin, endMin, appointments)) {
    return { valid: false, reason: ERROR_CODES.SLOT_UNAVAILABLE };
  }

  return { valid: true };
}

function actionValidateSlot_(payload) {
  var serviceId = requireString_(payload && payload.serviceId, "serviceId");
  var barberId = requireString_(payload && payload.barberId, "barberId");
  var localDate = requireLocalDate_(payload && payload.localDate, "localDate");
  var localStartTime = requireLocalTime_(payload && payload.localStartTime, "localStartTime");

  var service = requireActiveService_(serviceId);
  requireActiveBarber_(barberId);
  requireBarberEligibleForService_(barberId, serviceId);

  var settings = getSettingsMap_();
  var totalDuration = Number(service.durationMinutes) + (Number(service.bufferMinutes) || settings.DEFAULT_BUFFER_MINUTES || 0);

  var result = checkSlotValidity_({
    barberId: barberId, localDate: localDate, localStartTime: localStartTime,
    totalDurationMinutes: totalDuration, settings: settings,
  });
  return result;
}

/**
 * Generates the grid of candidate start times for one barber on one date
 * (BOOKING_RULES.md §2 — aligned to that barber's own working-hours start,
 * stepped by SETTINGS.SLOT_INTERVAL_MINUTES), keeping only the ones that
 * pass checkSlotValidity_. `context`, when provided, is passed straight
 * through to every checkSlotValidity_ call in the loop below, so a whole
 * day's worth of candidate slots for this barber reads each sheet at most
 * once (via buildAvailabilityContext_), not once per candidate.
 */
function getAvailableSlotsForBarber_(barberId, serviceId, localDate, service, settings, context) {
  var dayOfWeek = weekdayOfLocalDate_(localDate, getBusinessTimezone_());
  var workingIntervals = getEffectiveWorkingIntervalsMinutes_(barberId, dayOfWeek, context);
  if (workingIntervals.length === 0) return [];

  var totalDuration = Number(service.durationMinutes) + (Number(service.bufferMinutes) || settings.DEFAULT_BUFFER_MINUTES || 0);
  var step = settings.SLOT_INTERVAL_MINUTES || 30;
  var earliestStart = Math.min.apply(null, workingIntervals.map(function (i) { return i.start; }));
  var latestEnd = Math.max.apply(null, workingIntervals.map(function (i) { return i.end; }));

  var slots = [];
  for (var startMin = earliestStart; startMin + totalDuration <= latestEnd; startMin += step) {
    var localStartTime = minutesToLocalTime_(startMin);
    var result = checkSlotValidity_({
      barberId: barberId, localDate: localDate, localStartTime: localStartTime,
      totalDurationMinutes: totalDuration, settings: settings, context: context,
    });
    if (result.valid) {
      slots.push({
        localStartTime: localStartTime,
        localEndTime: minutesToLocalTime_(startMin + totalDuration),
      });
    }
  }
  return slots;
}

function minutesToLocalTime_(totalMinutes) {
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  return (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
}

/**
 * Read-only, for display. See ARCHITECTURE.md §5 — never trusted as the
 * final word; createAppointment re-validates under the lock.
 *
 * Builds one availabilityContext_ (buildAvailabilityContext_) up front and
 * reuses it for every barber and every candidate slot evaluated below —
 * this is the one place in the request that used to read WORKING_HOURS/
 * BREAKS/TIME_OFF/BLOCKED_SLOTS/APPOINTMENTS/BARBERS repeatedly (see that
 * function's comment for the exact before/after counts).
 */
function actionGetAvailability_(payload) {
  var serviceId = requireString_(payload && payload.serviceId, "serviceId");
  var localDate = requireLocalDate_(payload && payload.localDate, "localDate");
  var anyBarber = payload && payload.anyBarber === true;
  var requestedBarberId = payload && payload.barberId;

  var service = requireActiveService_(serviceId);
  var settings = getSettingsMap_();
  var context = buildAvailabilityContext_(localDate, settings);

  var barberIds;
  if (anyBarber) {
    barberIds = listEligibleBarberIdsForService_(serviceId, context.barberServicesRows);
  } else {
    var barberId = requireString_(requestedBarberId, "barberId");
    requireActiveBarber_(barberId, context.barbersRows);
    requireBarberEligibleForService_(barberId, serviceId, context.barberServicesRows);
    barberIds = [barberId];
  }

  var slotsByTime = {};
  barberIds.forEach(function (barberId) {
    var barber = getBarberById_(barberId, context.barbersRows);
    if (!barber || !isActiveRow_(barber)) return;
    getAvailableSlotsForBarber_(barberId, serviceId, localDate, service, settings, context).forEach(function (slot) {
      var key = slot.localStartTime;
      if (!slotsByTime[key]) {
        slotsByTime[key] = { localStartTime: slot.localStartTime, localEndTime: slot.localEndTime, barberIds: [] };
      }
      slotsByTime[key].barberIds.push(barberId);
    });
  });

  var slots = Object.keys(slotsByTime)
    .sort()
    .map(function (key) { return slotsByTime[key]; });

  return { localDate: localDate, serviceId: serviceId, slots: slots };
}
