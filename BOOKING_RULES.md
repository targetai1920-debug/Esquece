# BOOKING_RULES.md — concrete availability and booking rules

Implementation-level companion to `ARCHITECTURE.md` §5–6. This is what `lib/booking-engine`
must actually do, written concretely enough to code and test against. All examples use
`BUSINESS_TIMEZONE=America/La_Paz` (no DST in Bolivia, so no DST edge cases to handle).

## 1. What makes a barber available for a slot

For barber `B`, service `S`, requested start time `T`:

1. `BarberService` must contain a row `(B, S)` with `active = true` on both `Barber` and
   `Service` — a barber not linked to the service is never offered for it, full stop.
2. `end = T + S.durationMinutes + (S.bufferMinutes ?? Business.defaultBufferMinutes)`.
3. `WorkingSchedule` must have an active row for `B` on `T`'s day of week whose
   `[startTime, endTime]` fully contains `[T, end]`.
4. No `Break` row for `B` overlapping `[T, end]` on that date.
5. No `TimeOff` row for `B` overlapping `[T, end]`.
6. No `BlockedSlot` overlapping `[T, end]` where `barberId = B` **or** `barberId IS NULL`
   (business-wide block).
7. No existing `Appointment` for `B` with `status IN ('PENDING','CONFIRMED')` overlapping
   `[T, end]`.
8. `T` must be at least `Business.minLeadTimeMinutes` from now.
9. `T`'s date must be no more than `Business.maxAdvanceDays` from today.

A slot is offered to a customer only if all nine hold. "Any available barber" means: run this
check for every barber linked to the service, union the results, and — if the customer picks a
specific time without a barber preference — let the engine assign the first barber for whom
that exact time still passes all nine checks at confirmation time (§3).

## 2. Slot granularity

Slots are generated at a configurable step (default 15 minutes, `Business` config) starting
from each barber's `WorkingSchedule.startTime`. A service with `durationMinutes` not a multiple
of the step still gets offered at valid step-aligned start times — the engine checks whether the
resulting `[T, end]` fits within a free window, not whether `end` itself is step-aligned.

## 3. Confirmation is a re-check, not a trust of the displayed slot

`getAvailableSlots` (§1) is read-only and can be stale by the time the customer confirms —
someone else may have booked in between, or the customer may have taken minutes to decide on
WhatsApp. `createAppointment` therefore:

1. Re-runs the full nine-point check in §1 for the exact `(barber, service, start)` requested,
   inside a transaction.
2. Relies on the database exclusion constraint (`ARCHITECTURE.md` §5) as the actual
   race-condition guard, not the application-level re-check alone — the re-check is what
   produces a friendly "that slot just got taken, here are new options" response; the
   constraint is what makes it *impossible* for two overlapping appointments to both commit,
   even if the re-checks of two simultaneous requests both pass.
3. On constraint violation, the transaction rolls back, the caller calls `getAvailableSlots`
   again, and returns fresh alternatives — never a bare 500/error with no next step.

## 4. Appointment status lifecycle

`PENDING → CONFIRMED → COMPLETED`, with `CANCELLED` and `NO_SHOW` reachable from `PENDING` or
`CONFIRMED`. Only `PENDING` and `CONFIRMED` block a slot (§1.7) — `CANCELLED`/`NO_SHOW`/
`COMPLETED` appointments never count against availability. Website and WhatsApp bookings are
created as `CONFIRMED` directly (no separate manual-confirmation step in the MVP); admin-created
appointments are also `CONFIRMED` by default but can be created as `PENDING` for tentative
holds.

## 5. Cancellation and reschedule

- Cancelling sets `status = CANCELLED`, always inside a transaction, and writes an `AuditLog`
  entry (actor = customer via WhatsApp/website, or admin user).
- Rescheduling is implemented as: validate the new slot with the full §1/§3 process **before**
  releasing the old one (i.e. the old appointment is only cancelled after the new one commits
  successfully) — a failed reschedule must never leave the customer with no appointment at all.
- The specific minimum-notice cancellation policy (e.g. "no changes within 2 hours of the
  appointment") is `Business`-level config, not hardcoded, and is currently unset — see
  `CLIENT_INFORMATION_REQUIRED.md`. Until the client provides it, the engine does not block late
  cancellations, but the UI/bot must not claim a specific policy exists.

## 6. Price snapshot

`Appointment.price` and `Appointment.currency` are copied from `Service` at creation time and
never recomputed later — changing a service's price afterward must not alter historical
appointments' recorded price.

## 7. Source tracking

Every `Appointment.source` is exactly one of `WEBSITE`, `WHATSAPP`, `ADMIN`, set by the caller,
never inferred later. This is for reporting only — it has no effect on availability logic.

## 8. What's explicitly not handled yet

Waitlists (offering a customer the next opening if their preferred slot is taken), deposits/
holds with expiry, and per-service custom cancellation windows are not implemented — see
`PROJECT_PLAN.md` deferred list.
