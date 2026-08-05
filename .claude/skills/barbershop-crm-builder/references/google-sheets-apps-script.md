# Spreadsheet-backed CRM (e.g. Google Sheets + Apps Script)

Read this only if `architecture-and-decisions.md`'s decision tree points at a
spreadsheet-backed CRM. If a relational database was chosen instead, this file doesn't
apply — the entity model in `crm-data-model.md` still does.

## Why this option exists, stated honestly

A spreadsheet the owner can literally open and read is, incidentally, a free CRM UI. No
database server, connection pooling, or migration tooling to operate for a single-location
pilot's volume. The scripting platform's own locking primitive provides a real, if
lower-throughput, concurrency guarantee for the double-booking problem — adequate at small
scale, not at large scale. State the tradeoff in the new project's own architecture doc,
don't just adopt it silently.

## Automatic type coercion — normalize at every boundary

Spreadsheet platforms commonly auto-convert cell contents on write and on read:

- Phone numbers and other numeric-looking IDs can become numbers, losing leading zeros or
  formatting.
- Time-of-day values can become a `Date` object or a fraction-of-a-day number depending on
  how the cell was written.
- Date values become `Date` objects, which is fine for the calendar day but easy to
  mishandle across timezones (see next section).
- Strings with leading zeros can silently lose them once treated as numbers.

Fix this at both the write boundary and the read boundary, not just one:

- On write, force the affected columns to a text/plain format before writing, so future
  writes don't get re-coerced by the platform's own auto-detection.
- On read, run every cell through a per-column-type normalizer that knows which columns
  are "local time," "local date," "phone/id-as-text," etc., and converts whatever the
  platform handed back into the canonical application type — never assume the type you
  wrote is the type you'll read back on a *pre-existing* sheet (one written before a
  format fix was applied) or one edited by a human directly in the UI.
- Maintain one authoritative column-type classification (a small constant map, not
  scattered per-call assumptions) so every reader agrees on which columns need which
  normalization.
- A single real-world case worth defending against explicitly: a sheet already had a
  "plain text" format applied to a column, but a naive append re-detected and re-coerced
  the value anyway on the very next write — use whatever robust-write primitive the
  platform offers (e.g. writing into an explicitly formatted range rather than a generic
  "append row" call) for columns known to be coercion-prone.

## Date/time serials

A cell auto-parsed by the platform from a literal date/time string typically becomes a
pure calendar/serial value with **no timezone concept attached** — it is not "this
instant in the business's timezone," it's closer to "this wall-clock reading, anchored to
whatever epoch the platform uses internally for time-only values." Do not reproject such a
value through a timezone-aware conversion function as if it already were a real instant —
that double-applies a timezone offset and produces a shifted result. Extract the
hour/minute (or the calendar date) using the getters appropriate for how the platform
actually stored it (commonly UTC-based getters for a serial that has no real timezone
identity), verified against real behavior, not assumed. Write tests that specifically
reproduce: a time-of-day cell stored as a full date-like object, a time-of-day cell stored
as a day-fraction number, and a date cell that could be off by one day if timezone
conversion is applied where it shouldn't be.

## Locking and atomic mutations

Use the platform's serialization/locking primitive (e.g. a script-level lock) to guard
every mutating action:

1. Acquire the lock before touching any data.
2. Re-read the relevant rows *while holding the lock* — never trust data read before the
   lock was acquired.
3. Re-run the full availability check (`booking-and-availability-rules.md`).
4. Write only if it still passes.
5. Release the lock in a `finally`-equivalent block, on every code path, including
   exceptions.

This is a coarser mechanism than a database exclusion constraint — it serializes *all*
mutating writes project-wide, not just conflicting ones. That's an accepted throughput
tradeoff at small scale, not a correctness gap, as long as every mutating action actually
goes through it. A read-only availability query does **not** need the lock — see
§"Read performance" below for why locking every read would be actively harmful.

## Read performance for read-only availability queries

Don't re-read every underlying table once per candidate slot or per staff member when
answering one availability query — that turns an O(days × staff) query into an
O(days × staff × sheet-reads) one for no correctness benefit. Instead:

1. Load each needed table once per incoming request.
2. Build a single in-memory context object from that data.
3. Reuse that context across every staff member / slot being evaluated in that request.
4. Keep the number of underlying reads roughly constant regardless of how many candidate
   slots or staff are being checked.

This optimization must **never** apply to a mutating path — `createAppointment`-equivalent
actions must always re-read fresh data *inside* the lock (previous section), never reuse a
pre-lock context object, no matter how tempting the performance win looks. Write a test
that counts underlying reads for the read path to catch a regression back to
read-per-slot, and a separate test proving the mutating path still re-validates against
fresh data under the lock even when a stale context was available.

## Central action router, not distributed self-registration

If the platform concatenates all project files into one global execution context (common
for script-based platforms), be careful with *where* an action gets registered. Function
*declarations* are typically available project-wide regardless of file load order, but
*top-level statements* (e.g. a registration call sitting outside any function) execute in
file-load order — commonly alphabetical by filename in the editor. A domain file whose
name sorts before the router file could try to register into a table that doesn't exist
yet, and throw. Avoid this entirely: declare the full action-name → handler-function
mapping as one literal table in one file, referencing handler functions by name (which
works regardless of load order, since by the time the table itself is evaluated, every
function declaration in the project already exists). Don't build the dispatch table by
having every domain file call a shared "register yourself" function from its own top-level
scope.

## Deployment specifics

- Production traffic must hit the platform's *stable* deployed endpoint, not a
  "latest code" / dev-mode endpoint — the exact naming differs by platform, but the
  distinction (stable-versioned vs. always-latest-and-unauthenticated-for-testing) is
  universal and easy to get backwards.
- Saving a script file does **not** automatically update an already-deployed stable
  version. After any code change meant for production, a new deployment version must be
  published explicitly.
- Secrets (API keys, signing secrets, spreadsheet id) belong in the platform's own
  properties/secret store, never hardcoded in script source.
- Setup/schema-creation code must be idempotent and non-destructive (see
  `crm-data-model.md`'s "Setup/migration idempotency") — safe to run repeatedly, including
  against a sheet that already has real data and manual edits.

## Testing strategy: local mock harness + real deployment, not either alone

**Local harness.** Run the actual script source (not a reimplementation) inside a
general-purpose scripting runtime (e.g. Node's `vm` module) against hand-built mocks of the
platform's services (spreadsheet access, properties/secret store, crypto/HMAC utilities,
cache, lock, content/response helpers, any calendar-like integration). Two details matter:

- The mocks must be **faithful**, not merely present. A stubbed date-formatting mock that
  fakes a fixed offset instead of doing real timezone arithmetic will silently hide real
  timezone bugs — implement date/time-formatting mocks for real, using the runtime's own
  timezone-aware APIs, verified against the exact patterns the script code actually uses.
- A crypto/HMAC mock must model any charset-related quirks the real platform has (see
  `security-and-idempotency.md`) — a mock that's *more correct* than the real platform will
  never catch the exact bug class the real platform can produce.

Concatenate the files the same way the platform does (matching its load-order semantics)
before running, so the router-registration hazard above is actually exercised, not
accidentally avoided by loading files in a different order than production would.

**Real deployment.** The local harness proves the script's own logic is internally
consistent; it does not prove the real platform's quota, permission, or parsing behavior
matches the mock. Treat "passes locally" and "verified against the real deployed backend"
as two distinct, both-necessary claims — see `deployment-and-operations.md`'s verification
levels. When running the full test suite against a *real* deployment (not the local
harness), split it into small batches if the platform has an execution-time limit per
invocation — provide a per-batch entry point plus one that aggregates results across
batches, and a safe cleanup routine for anything a timed-out batch might have left behind.
Never let a test run against a real deployment mutate real business data — every test that
creates rows must clean them up itself, and any external side-integration (e.g. a
calendar) should be swappable for an in-memory fake during tests specifically so test runs
can't touch a real outside service.
