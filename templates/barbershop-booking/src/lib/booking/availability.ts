import type { Appointment, AvailableSlot, BlockedSlot, BusinessSettings, Service, Staff, TimeOff, WorkingDay } from "../crm/types";
import { BLOCKING_STATUSES } from "../crm/types";

/**
 * The generic availability engine — see
 * .claude/skills/barbershop-crm-builder/references/booking-and-availability-rules.md.
 * Every interval here is half-open [start, end): a service ending exactly
 * when another starts (or exactly at closing time) does not overlap.
 */

export type WeekdayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const WEEKDAY_BY_INDEX: WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function weekdayOf(localDate: string): WeekdayKey {
  // localDate is "YYYY-MM-DD"; Date.UTC avoids any host-timezone influence
  // on which calendar weekday a pure date string represents.
  const [y, m, d] = localDate.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** True if [aStart, aEnd) and [bStart, bEnd) overlap, half-open semantics. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface AvailabilityContext {
  settings: BusinessSettings;
  services: Service[];
  staff: Staff[];
  appointments: Appointment[];
  timeOff: TimeOff[];
  blockedSlots: BlockedSlot[];
  /** Business-local "now", as an ISO-ish sortable string "YYYY-MM-DDTHH:mm". */
  nowLocal: string;
}

function isBlockingAppointment(a: Appointment): boolean {
  return (BLOCKING_STATUSES as readonly string[]).includes(a.status);
}

/**
 * The full slot-validity check — every rule in booking-and-availability-rules.md
 * §"What makes a staff member available for a slot", points 1-12. Runs
 * entirely against the pre-loaded context (see buildAvailabilityContext) —
 * safe for repeated read-only calls, but a mutating path (createAppointment)
 * must always rebuild the context from freshly-read data inside its lock,
 * never reuse a context built before the lock was acquired.
 */
export function checkSlotValidity(
  ctx: AvailabilityContext,
  params: { serviceId: string; staffId: string; localDate: string; localStartTime: string; excludeAppointmentId?: string },
): { valid: true } | { valid: false; reason: string } {
  const service = ctx.services.find((s) => s.id === params.serviceId);
  if (!service || !service.active) return { valid: false, reason: "SERVICE_NOT_FOUND" };

  const staff = ctx.staff.find((s) => s.id === params.staffId);
  if (!staff || !staff.active) return { valid: false, reason: "STAFF_NOT_FOUND" };

  if (!staff.serviceIds.includes(service.id)) return { valid: false, reason: "STAFF_NOT_ELIGIBLE" };

  if (params.localDate < ctx.nowLocal.slice(0, 10)) return { valid: false, reason: "DATE_IN_PAST" };

  const requestedStartLocal = `${params.localDate}T${params.localStartTime}`;
  const minNoticeThreshold = addMinutesToLocal(ctx.nowLocal, ctx.settings.minimumNoticeMinutes);
  if (requestedStartLocal < minNoticeThreshold) return { valid: false, reason: "BELOW_MINIMUM_NOTICE" };

  const maxAdvanceThreshold = addDaysToLocalDate(ctx.nowLocal.slice(0, 10), ctx.settings.maximumAdvanceDays);
  if (params.localDate > maxAdvanceThreshold) return { valid: false, reason: "BEYOND_MAXIMUM_ADVANCE" };

  const weekday = weekdayOf(params.localDate);
  const day: WorkingDay | undefined = staff.workingHours[weekday];
  if (!day || day.closed || !day.start || !day.end) return { valid: false, reason: "STAFF_CLOSED_THAT_DAY" };

  const start = minutesOf(params.localStartTime);
  const end = start + service.durationMinutes + service.bufferMinutes;
  const dayStart = minutesOf(day.start);
  const dayEnd = minutesOf(day.end);

  if (end > dayEnd) return { valid: false, reason: "ENDS_AFTER_CLOSING" };
  if (start < dayStart) return { valid: false, reason: "STARTS_BEFORE_OPENING" };

  for (const brk of staff.breaks) {
    if (!brk.days.includes(weekday)) continue;
    if (intervalsOverlap(start, end, minutesOf(brk.start), minutesOf(brk.end))) {
      return { valid: false, reason: "OVERLAPS_BREAK" };
    }
  }

  for (const off of ctx.timeOff) {
    if (off.staffId !== staff.id || off.active === false) continue;
    if (params.localDate >= off.startDate && params.localDate <= off.endDate) {
      return { valid: false, reason: "OVERLAPS_TIME_OFF" };
    }
  }

  for (const block of ctx.blockedSlots) {
    if (block.active === false) continue;
    if (block.staffId && block.staffId !== staff.id) continue; // staff-specific block for a different staff member
    if (block.localDate !== params.localDate) continue;
    if (intervalsOverlap(start, end, minutesOf(block.startTime), minutesOf(block.endTime))) {
      return { valid: false, reason: "OVERLAPS_BLOCK" };
    }
  }

  for (const appt of ctx.appointments) {
    if (appt.staffId !== staff.id) continue;
    if (appt.localDate !== params.localDate) continue;
    if (params.excludeAppointmentId && appt.id === params.excludeAppointmentId) continue;
    if (!isBlockingAppointment(appt)) continue;
    if (intervalsOverlap(start, end, minutesOf(appt.localStartTime), minutesOf(appt.localEndTime))) {
      return { valid: false, reason: "SLOT_UNAVAILABLE" };
    }
  }

  return { valid: true };
}

function addMinutesToLocal(localDateTime: string, minutes: number): string {
  const [datePart, timePart] = localDateTime.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const totalMinutes = minutesOf(timePart) + minutes;
  const dayOverflow = Math.floor(totalMinutes / 1440);
  const remaining = ((totalMinutes % 1440) + 1440) % 1440;
  const date = new Date(Date.UTC(y, m - 1, d + dayOverflow));
  const newDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${newDate}T${toHHMM(remaining)}`;
}

function addDaysToLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Candidate-slot generation for display — read-only, never trusted as
 * final (see BOOKING_RULES equivalent §3: confirmation always re-checks).
 */
export function getAvailableSlotsForStaff(
  ctx: AvailabilityContext,
  params: { serviceId: string; staffId: string; localDate: string },
): AvailableSlot[] {
  const staff = ctx.staff.find((s) => s.id === params.staffId);
  const weekday = weekdayOf(params.localDate);
  const day = staff?.workingHours[weekday];
  if (!staff || !staff.active || !day || day.closed || !day.start || !day.end) return [];

  const interval = ctx.settings.slotIntervalMinutes;
  const dayStart = minutesOf(day.start);
  const dayEnd = minutesOf(day.end);

  const slots: AvailableSlot[] = [];
  for (let t = dayStart; t < dayEnd; t += interval) {
    const result = checkSlotValidity(ctx, {
      serviceId: params.serviceId,
      staffId: params.staffId,
      localDate: params.localDate,
      localStartTime: toHHMM(t),
    });
    if (result.valid) {
      const service = ctx.services.find((s) => s.id === params.serviceId)!;
      slots.push({
        localStartTime: toHHMM(t),
        localEndTime: toHHMM(t + service.durationMinutes + service.bufferMinutes),
        staffIds: [staff.id],
      });
    }
  }
  return slots;
}

/**
 * "Any available staff" union across every staff member linked to the
 * service, with each slot annotated by which staff offer it.
 */
export function getAvailableSlotsAnyStaff(
  ctx: AvailabilityContext,
  params: { serviceId: string; localDate: string },
): AvailableSlot[] {
  const eligibleStaff = ctx.staff.filter((s) => s.active && s.serviceIds.includes(params.serviceId));
  const byTime = new Map<string, AvailableSlot>();
  for (const staff of eligibleStaff) {
    const slots = getAvailableSlotsForStaff(ctx, { serviceId: params.serviceId, staffId: staff.id, localDate: params.localDate });
    for (const slot of slots) {
      const existing = byTime.get(slot.localStartTime);
      if (existing) existing.staffIds.push(staff.id);
      else byTime.set(slot.localStartTime, { ...slot, staffIds: [staff.id] });
    }
  }
  return Array.from(byTime.values()).sort((a, b) => (a.localStartTime < b.localStartTime ? -1 : 1));
}

/**
 * Deterministic tie-break for "any available staff" at confirmation time —
 * must run inside the same lock as the write, never client-side.
 * (1) fewest active appointments that day, (2) lowest id (stand-in for a
 * configurable displayOrder), (3) alphabetical name.
 */
export function pickStaffForAnyAvailable(ctx: AvailabilityContext, eligibleStaffIds: string[], localDate: string): string {
  const scored = eligibleStaffIds.map((id) => {
    const staff = ctx.staff.find((s) => s.id === id)!;
    const activeCount = ctx.appointments.filter(
      (a) => a.staffId === id && a.localDate === localDate && isBlockingAppointment(a),
    ).length;
    return { id, activeCount, name: staff.name };
  });
  scored.sort((a, b) => a.activeCount - b.activeCount || a.id.localeCompare(b.id) || a.name.localeCompare(b.name));
  return scored[0].id;
}
