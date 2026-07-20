# BOOKING_RULES.md — concrete availability and booking rules

Implementation-level companion to `ARCHITECTURE.md` §5–6. This is what the Apps Script CRM's
`getAvailability`/`createAppointment`/`cancelAppointment`/`rescheduleAppointment` actions must
actually do (implemented in Phase D), written concretely enough to code and test against. All
examples use `BUSINESS_TIMEZONE=America/La_Paz` (no DST in Bolivia, so no DST edge cases).

> Superseded 2026-07-20: this logic now runs inside Google Apps Script against the `SETTINGS`/
> `SERVICES`/`BARBERS`/`BARBER_SERVICES`/`WORKING_HOURS`/`BREAKS`/`TIME_OFF`/`BLOCKED_SLOTS`/
> `APPOINTMENTS` sheets, not a TypeScript module talking to Postgres. The rules themselves are
> unchanged from the original design; only the storage and locking mechanism moved.

## 0. Initial `SETTINGS` values (demo defaults, all configurable)

```
BUSINESS_TIMEZONE          = America/La_Paz
CURRENCY                   = BOB
MONDAY_OPEN..FRIDAY_OPEN   = true
SATURDAY_OPEN              = false
SUNDAY_OPEN                = false
OPENING_TIME                = 08:00
CLOSING_TIME                = 16:00
SLOT_INTERVAL_MINUTES        = 30
MIN_BOOKING_NOTICE_MINUTES   = 60
MAX_ADVANCE_BOOKING_DAYS     = 60
SESSION_TIMEOUT_MINUTES      = 60
DEFAULT_BUFFER_MINUTES       = 0
ALLOW_ANY_BARBER             = true
```

These are demo defaults for a system that isn't configured with Esquece's real hours yet — not
invented official business hours. See `CLIENT_INFORMATION_REQUIRED.md`.

## 1. What makes a barber available for a slot

For barber `B`, service `S`, requested local date `D`, local start time `T`:

1. `BARBER_SERVICES` must contain an active row `(B, S)`, and both `S` and `B` must themselves
   be active — a barber not linked to the service is never offered for it, full stop.
2. `D` must not be in the past (relative to current business-local time).
3. `D`'s weekday must be open per `SETTINGS` (`MONDAY_OPEN`..`SUNDAY_OPEN`) — Saturday and
   Sunday rejected by default. This is enforced in Apps Script regardless of what the UI shows;
   disabling the date picker client-side is not sufficient.
4. `T` must be at least `MIN_BOOKING_NOTICE_MINUTES` from now.
5. `D` must be no more than `MAX_ADVANCE_BOOKING_DAYS` from today.
6. `end = T + S.durationMinutes + (S.bufferMinutes ?? DEFAULT_BUFFER_MINUTES)`.
7. `end` must be **at or before** `CLOSING_TIME` — a service starting before closing but ending
   after it is rejected. A service ending exactly at closing time is accepted (half-open
   interval, §22 below).
8. `WORKING_HOURS` must have an active row for `B` (or general business hours if barber-specific
   rows don't further restrict) on `D`'s weekday whose `[openingTime, closingTime]` fully
   contains `[T, end]`.
9. No `BREAKS` row for `B` (recurring by weekday, or one-time by date) overlapping `[T, end]`.
10. No `TIME_OFF` row for `B` overlapping `[D, T]`–`[D, end]`.
11. No `BLOCKED_SLOTS` row overlapping `[T, end]` where `barberId = B` **or** `barberId` is
    empty (business-wide block).
12. No existing `APPOINTMENTS` row for `B` with `status IN (PENDING, CONFIRMED)` overlapping
    `[T, end]` on `D`. `CANCELLED`/`NO_SHOW`/`COMPLETED` never block.

A slot is offered only if all twelve hold. "Cualquiera disponible" (any available barber) means:
run this check for every barber linked to the service, return the union with each slot annotated
with which barber(s) offer it; at confirmation time, if the customer didn't pin a barber, Apps
Script picks one under the lock (§23) using a documented deterministic tie-break: (1) fewest
active appointments that day, (2) lowest `displayOrder`, (3) alphabetical name.

## 2. Slot granularity

Slots are generated at `SLOT_INTERVAL_MINUTES` (default 30) starting from each barber's
`openingTime`. A service whose duration isn't a multiple of the interval still gets offered at
valid interval-aligned start times — what's checked is whether `[T, end]` fits within a free
window, not whether `end` itself is interval-aligned.

## 3. Confirmation is a re-check, not a trust of the displayed slot

`getAvailability` (§1) is read-only and can be stale by the time the customer confirms —
someone else may have booked in between, or the customer may have taken minutes to decide on
WhatsApp. `createAppointment` therefore:

1. Requires an idempotency key from the caller.
2. Acquires `LockService.getScriptLock()` before doing anything else.
3. Re-reads all relevant sheet rows **while holding the lock** and re-runs the full twelve-point
   check in §1 for the exact `(barber, service, date, start)` requested.
4. This lock is the actual race-condition guard — not the re-check alone. Apps Script serializes
   all script-lock holders project-wide, so two near-simultaneous `createAppointment` calls
   cannot both pass validation and both write: whichever acquires the lock second re-reads the
   now-updated `APPOINTMENTS` sheet and correctly sees the slot as taken.
5. On conflict, releases the lock, returns `SLOT_UNAVAILABLE`, and the caller re-queries
   `getAvailability` for fresh alternatives — never a bare error with no next step.
6. Releases the lock in a `finally` block regardless of outcome.

## 4. Appointment status lifecycle

`PENDING → CONFIRMED → COMPLETED`, with `CANCELLED` and `NO_SHOW` reachable from `PENDING` or
`CONFIRMED`. Only `PENDING` and `CONFIRMED` block a slot (§1.12). Website and WhatsApp bookings
are created as `CONFIRMED` directly; admin-created appointments default to `CONFIRMED` but can
be created as `PENDING` for tentative holds.

## 5. Cancellation and reschedule

- Cancelling sets `status = CANCELLED`, `cancelledAt = now`, always under the script lock, and
  writes an `AUDIT_LOG` entry. Idempotent — cancelling an already-cancelled appointment succeeds
  without error, cancelling a `COMPLETED` one is rejected (`APPOINTMENT_NOT_CHANGEABLE`).
- Rescheduling validates the new slot with the full §1/§3 process **before** releasing the old
  slot — the old appointment is only touched after the new slot's validity is confirmed under
  the same lock acquisition, so a failed reschedule never leaves the customer with no
  appointment at all.
- The specific minimum-notice cancellation policy text is a `SETTINGS` value
  (`CANCELLATION_POLICY`), not hardcoded, and is currently unset — see
  `CLIENT_INFORMATION_REQUIRED.md`. Until the client provides it, the engine does not block late
  cancellations, but the UI/bot must not claim a specific policy exists.

## 6. Price snapshot

`APPOINTMENTS.servicePriceSnapshot` (and duration/buffer snapshots) are copied from `SERVICES`
at creation time and never recomputed later — changing a service's price afterward must not
alter historical appointments' recorded price.

## 7. Source tracking

Every `APPOINTMENTS.source` is exactly one of `WEBSITE`, `WHATSAPP`, `ADMIN`, set by the caller,
never inferred later. For reporting only — no effect on availability logic.

## 8. Weekend rejection example (agent tone)

When a customer asks for Saturday or Sunday, the agent explains naturally and redirects — not a
single canned string every time:

> "Los sábados y domingos no tenemos atención. Puedo mostrarte horarios de lunes a viernes entre
> las 8:00 y las 16:00. ¿Qué día te viene mejor?"

The *rejection itself* is deterministic (§1.3, enforced in Apps Script); the phrasing is
Claude's, within that constraint (see `WHATSAPP_AGENT_DESIGN.md` §7).

## 9. What's explicitly not handled yet

Waitlists, deposits/holds with expiry, and per-service custom cancellation windows are not
implemented — see `PROJECT_PLAN.md` deferred list.
