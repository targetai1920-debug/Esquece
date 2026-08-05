# Testing and CI

## Minimum required local commands (root project)

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:apps-script   # or equivalent, if the CRM runs on a separate scripting runtime
npm run build
```

For a separate frontend subproject (e.g. a statically-exported booking website living in
its own subdirectory):

```bash
npm ci
npm run lint
npm run typecheck
npm test --if-present
npm run build
```

Adapt script names to the actual project, but keep the *shape*: install from a lockfile,
lint, typecheck, test, build — every one of them must pass before considering work done,
and a subproject's CI must not silently skip a step because a script doesn't exist (use an
`--if-present`-style guard deliberately, not by accident).

## Minimum test coverage by area

**Booking/availability rules** — for each rule in `booking-and-availability-rules.md`:
inactive service, inactive staff, staff not linked to the service, closed weekday, past
date, below-minimum notice, beyond-maximum advance window, service ending after closing,
service ending exactly at closing (must succeed), overlapping break, overlapping time off,
overlapping business-wide block, overlapping staff-specific block, overlapping existing
appointment, a cancelled appointment freeing its slot, two concurrent confirmations racing
for the identical slot (exactly one must succeed), idempotent retry (same key + same
payload returns the original), idempotency conflict (same key + different payload is
rejected), a valid reschedule, a reschedule that fails without losing the original booking,
and "any available staff" selection under the tie-break rule.

**API layer** — allowed-origin CORS success, rejected-origin CORS failure, mutation-origin
server-side rejection independent of CORS headers, invalid payload rejection, oversized
payload rejection, rate limiting, the full error envelope shape, management-token
gating on lookup/cancel/reschedule, and — if signed requests are used — invalid signature
rejection, replayed-nonce rejection, expired-timestamp rejection, a Unicode payload
signing/verifying correctly (see `security-and-idempotency.md`), and a retried request
using a fresh envelope while keeping the same idempotency key.

**Website** — loading/empty/error states for every fetch, changing the service clears
dependent staff/date/time selections, changing staff clears date/time, a `SLOT_UNAVAILABLE`
response preserves already-entered customer details, a double-click/double-submit does not
create two bookings, a successful booking shows the real reference/status/price from the
API (never a client-invented value), basic keyboard/mobile navigation works.

**Cross-channel** (only if more than one channel exists) — a booking made through channel A
is immediately unavailable to channel B; two channels racing for the identical slot: one
wins, the other gets a graceful `SLOT_UNAVAILABLE`/re-offer; an admin-created block is
enforced identically regardless of which channel attempts to book it; a cancellation made
in one channel frees the slot for every other channel; a service-duration change made in
one channel changes availability identically everywhere — never two independently-drifting
duration rules.

## Testing pattern

Prefer tests that call the actual exported route handlers / actual orchestrator functions
— the same code the real request path invokes — over reimplementing the logic inside the
test. A test failing should mean the real code path is wrong, not that a test double
drifted from reality.

For a spreadsheet-backed CRM's scripting layer, see `google-sheets-apps-script.md`'s
testing section — a faithful local mock harness plus separate, batched verification
against the real deployed platform.

## CI pipeline requirements

- Runs on pull requests, validating (lint/typecheck/test/build) without deploying.
- A separate frontend subproject's build must be gated on the backend it depends on
  passing first, if that dependency exists.
- Each subproject has its own lint/type configuration; the root project's tooling must not
  accidentally reach into and lint/typecheck a nested subproject meant to be independent
  (a real, easy-to-hit mistake: an unscoped ignore/include glob in one subproject's config
  silently also matching files inside a sibling subproject — scope every such pattern
  explicitly to avoid cross-contamination in either direction).
- If the framework generates ambient type declarations as a side effect of a dev/build
  command, run that generation step explicitly before typechecking in CI — a machine that
  has never run the dev/build command locally won't have those generated files, and a
  typecheck that silently depended on them will fail only in CI, not locally, which is
  exactly the kind of gap a clean-checkout validation is meant to catch (next section).
- Deploy only on push to the production branch (or an explicit manual trigger), never on a
  pull request — a pull-request run must always skip the deploy step, verified by
  inspecting the actual job/step conclusions after a real PR run, not assumed from the
  workflow file alone.
- A pull-request run must never be able to cancel or interfere with an in-progress
  production-branch run — scope any concurrency-cancellation group so PR runs and the
  production-branch run don't share a cancellation group.

## Clean-checkout validation

Before trusting that CI will pass, reproduce it locally in a genuinely clean state — not
just "my existing working directory," which can have stale generated files masking a bug
that only a fresh checkout would hit. Use an isolated worktree or a fresh clone, with no
shared `node_modules`/build output/generated type declarations from the main working
directory, run the full install-from-lockfile-then-validate sequence there, and only then
trust that CI will match. This has caught real bugs that a warm local environment hid —
document the specific mechanism in `production-lessons.md`.

## Dependency audit

Run the project's dependency-vulnerability audit (e.g. `npm audit`) for both
production-only and full dependency trees. Don't apply an automatic "fix everything"
command blindly if it would downgrade a core framework dependency or otherwise introduce a
breaking regression riskier than the vulnerability itself — evaluate each finding, prefer
a real upstream patch version when one exists, and document any vulnerability left
unresolved (with the reason) rather than silently ignoring the audit output.
