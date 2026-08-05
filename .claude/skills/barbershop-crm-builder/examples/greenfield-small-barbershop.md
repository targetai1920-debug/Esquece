# Example: greenfield project for a small barbershop

## Request

"Build a booking website for a small barbershop with three barbers, a handful of
services, and Google Sheets as the CRM."

## Expected approach

1. **Discovery** (`references/discovery-and-client-inputs.md`): ask for (or mark pending)
   the business's real name, address, timezone, currency, services with real prices/
   durations, the three barbers' names/specialties/services, and real working hours. Do
   **not** invent a plausible price list or hours to "keep moving" — use
   `DEMO_DATA_REPLACE_BEFORE_PRODUCTION` placeholders for anything not yet provided, and
   list what's still needed.
2. **Architecture decision** (`references/architecture-and-decisions.md`): three barbers,
   presumably low-to-medium volume, tight budget → spreadsheet-backed CRM is a reasonable
   default here, but state the reasoning rather than picking it silently. Record the
   decision and the tradeoff (execution/quota limits, serialized-write throughput ceiling)
   in the new project's own docs.
3. **Rules first** (`references/booking-and-availability-rules.md`): write the concrete
   availability rules in prose, confirmed against real business policy where known,
   explicit placeholders where not (e.g. cancellation policy pending).
4. **Schema** (`references/crm-data-model.md`, `references/google-sheets-apps-script.md`):
   design the sheet-level schema, implement idempotent setup, apply the coercion/date-serial
   defenses from the start rather than as a later fix.
5. **Engine** — availability check, then locked/re-validated mutations
   (`references/security-and-idempotency.md`).
6. **API** (`references/public-api-and-booking-website.md`) — stable error codes, signed
   requests to the CRM backend if it's reached over the network, idempotency keys.
7. **Website** — mobile-first, real data, loading/error/empty states, idempotent
   submission, honest `SLOT_UNAVAILABLE` recovery.
8. **Tests** (`references/testing-and-ci.md`) — full availability-rule matrix, a
   concurrent-double-booking race test, CI wired to validate PRs without deploying.

## What a correct result looks like

- The browser never talks to the spreadsheet backend directly — only to this project's own
  API.
- No invented prices, hours, or barber bios presented as real.
- A concurrency test proves two simultaneous booking attempts for the identical slot
  cannot both succeed.
- The delivered report distinguishes "implemented and tested with mocks/locally" from
  "verified against the real deployed CRM backend" honestly (see
  `references/deployment-and-operations.md`).

## Common failure to avoid

Treating this as "just a web design task" — shipping a nice-looking static form with no
real availability engine behind it, or wiring the form directly to a spreadsheet API from
the browser. Both violate the core architecture (`SKILL.md` §1/§6).
