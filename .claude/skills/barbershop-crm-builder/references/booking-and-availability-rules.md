# Booking and availability rules

Write these rules in prose, get them reviewed/confirmed against the real client's actual
policy, and only then implement — don't let the first working code accidentally become
the spec. All times are business-local unless stated otherwise; convert to/from an
absolute instant only at the storage boundary.

## What makes a staff member available for a slot

For staff `P`, service `S`, requested local date `D`, local start time `T`:

1. `P` can perform `S` (an active staff-service link exists), and both `P` and `S` are
   themselves active. A staff member not linked to a service is never offered for it.
2. `D` is not in the past, relative to current business-local time.
3. `D`'s weekday is open per business settings — enforced server-side regardless of what
   a date picker allows the customer to click.
4. `T` is at least the configured minimum notice from now.
5. `D` is no more than the configured maximum advance-booking window from today.
6. `end = T + service.durationMinutes + (service.bufferMinutes ?? defaultBufferMinutes)`.
7. `end` is at or before closing time — a service starting before closing but ending after
   it is rejected; a service ending *exactly* at closing time is accepted (half-open
   interval, see §"Interval semantics" below).
8. Working hours for `P` on `D`'s weekday (or general hours, if no staff-specific override)
   fully contain `[T, end]`.
9. No break (recurring or one-time, for `P` or business-wide) overlaps `[T, end]`.
10. No time-off row for `P` overlaps `[D, T]`–`[D, end]`.
11. No blocked-slot row overlaps `[T, end]` where it's specific to `P` or business-wide.
12. No existing appointment for `P` with an active status overlaps `[T, end]` on `D`.
    Inactive statuses (cancelled/completed/no-show) never block.

A slot is offered only if all checks hold. "Any available staff member" means: run this
check for every staff member linked to the service, return the union with each slot
annotated with which staff offer it. At confirmation time, if the customer didn't pin a
specific staff member, the system picks one **under the same lock/transaction used for
confirmation** (never client-side, never before the lock), using a documented,
deterministic tie-break — for example: (1) fewest active appointments that day, (2) lowest
display order, (3) alphabetical name. Never pick randomly without a stated, reviewable
reason.

## Interval semantics

Treat every interval as half-open: `[start, end)`. This is what makes "ends exactly at
closing time" valid and "starts exactly when another appointment ends" valid too — a slot
ending at 16:00 and another starting at 16:00 don't overlap. Apply this consistently in
every overlap check (breaks, time off, blocks, appointments) — a mix of open/closed
conventions across checks is a common source of off-by-one availability bugs.

## Slot granularity

Generate candidate slots at the configured interval (e.g. every 15/30/60 minutes),
starting from each staff member's opening time. A service whose duration isn't a multiple
of the interval still gets offered at valid interval-aligned start times — what's checked
is whether `[T, end]` fits within a free window, not whether `end` itself lands on an
interval boundary.

## Confirmation is a re-check, not a trust of the displayed slot

Read `security-and-idempotency.md` for the full mechanism. In summary:

1. The availability query is read-only and can go stale between when it runs and when the
   customer confirms — another channel may book in between.
2. Confirmation requires an idempotency key from the caller.
3. Confirmation acquires a lock or opens a transaction **before** doing anything else.
4. It re-reads the relevant data **while holding the lock/transaction** and re-runs the
   full check above for the exact `(staff, service, date, start)` requested.
5. Only then does it write. The lock/transaction — not the re-check alone — is what
   prevents two concurrent confirmations for the same slot from both succeeding.
6. On conflict, it releases the lock, returns a stable `SLOT_UNAVAILABLE`-style error, and
   the caller re-queries availability for fresh alternatives — never a bare error with no
   next step.
7. The lock/transaction is always released, including on every failure path.

Rescheduling validates the *new* slot with the same process **before** releasing the old
one, so a failed reschedule never leaves the customer with no appointment at all.
Cancellation is idempotent — cancelling an already-cancelled appointment succeeds without
error; cancelling a completed one is rejected with a distinct, stable error code.

## Price and detail snapshotting

Appointment records copy service price/duration/buffer and staff/customer names at
creation time and never recompute them later — see `crm-data-model.md`.

## What this section deliberately doesn't cover

Waitlists, paid deposits/holds with expiry, and per-service custom cancellation windows
are common follow-up requests, not part of this skill's default scope — call them out
explicitly as future work if the client asks, rather than half-implementing them.
