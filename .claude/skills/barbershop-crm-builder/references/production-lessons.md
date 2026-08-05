# Production lessons

Concrete bugs this architecture has already produced in a real pilot, generalized. Treat
every one of these as a corner case that *will* recur in a new project if the same
mechanism is present, not a one-off curiosity.

## Spreadsheet type coercion (if using a spreadsheet-backed CRM)

A phone number written as a bare string was read back as a number, losing formatting. A
time-of-day cell written one way came back as a date-like object; written another way, as
a day-fraction number. A column already formatted as plain text was still re-coerced on
the very next write because the write path used a generic "append" call instead of writing
into the explicitly-formatted range. Fix: normalize at both the write boundary (force
text/plain formatting on coercion-prone columns) and the read boundary (a per-column-type
normalizer, one canonical classification, never an assumption that the written type
survives). See `google-sheets-apps-script.md`.

## Date-serial mishandling

A time-of-day value auto-parsed by the spreadsheet platform has no real timezone identity
— it's a wall-clock reading anchored to the platform's internal epoch for time-only
values, not an instant. Reprojecting it through a timezone-aware conversion function (as
if it already were a real instant) double-applies an offset and silently shifts the
result by hours, sometimes crossing a date boundary. Fix: extract components using the
getters that match how the value was actually stored (commonly UTC-based getters for a
serial with no real timezone identity), verified with tests that reproduce the exact
storage shapes, not just the happy path. See `google-sheets-apps-script.md`.

## HMAC charset mismatch across runtimes

Two independent implementations of the same signing algorithm, on two different runtimes,
computed different byte sequences for the identical string whenever that string contained
non-ASCII characters — because one runtime's HMAC call used an implicit charset that
doesn't reliably mean UTF-8, while the other runtime's HMAC call did. Every action that
only ever carried ASCII payloads passed; the one action that carried free-text user input
(a name or note with an accented character) failed signature verification, in production,
specifically at the step that matters most (creating the booking) rather than at an
earlier, less consequential step. Fix: pass the charset explicitly on every runtime
involved, and cover it with shared cross-runtime test vectors that include non-ASCII text
— a same-runtime sign-then-verify test cannot catch this, because it never exercises two
independent implementations agreeing. See `security-and-idempotency.md`.

## Nonce reuse on retry

A signed-request envelope was built once, then reused verbatim across a network-level
retry. The receiving side's replay protection correctly rejected the retry as a reused
nonce — which is the intended behavior of replay protection, but broke the retry the
client actually needed to succeed. Fix: build a fresh envelope (new nonce, timestamp,
signature) per physical attempt, while keeping the business payload and idempotency key
identical across attempts. See `security-and-idempotency.md`.

## Read amplification in availability queries

An early implementation of the read-only availability check re-read every underlying
table once per candidate slot being evaluated, turning what should be a small, roughly
constant number of reads per request into a number that grew with the number of candidate
slots and staff members. Fix: load each needed table once per request, build a single
in-memory context, and reuse it across every slot/staff being evaluated in that request —
proven by a test that counts reads and asserts the count stays roughly constant regardless
of candidate count. Critically, this optimization must never be applied to a *mutating*
path, which must always re-read fresh data inside its lock — see
`google-sheets-apps-script.md`.

## Schema/code drift silently dropping data

A time-off record's absolute-instant mirror columns were dropped from the schema's header
declaration during a later edit, while the write code that populated them was left
untouched — so writes to those columns silently stopped landing anywhere, and the overlap
check that depended on them quietly lost correctness for exactly the case those columns
existed to make efficient. Nothing crashed; nothing errored; the bug was only visible by
comparing the schema declaration against the write code line by line. Fix: treat schema
declaration and write-path code as one unit that must be checked together on every change,
ideally with an automated check, not just careful reading. See `crm-data-model.md`.

## A previous-round bug class worth naming explicitly: local environment masking a CI-only failure

A TypeScript project's configuration correctly excluded a sibling subproject from its own
compilation — except the fix relied on a generated type-declaration file that only exists
after running a build/dev command at least once. A developer's local machine had already
run that command earlier in the session, so the bug was invisible locally; a genuinely
fresh checkout (exactly what CI does on every run) did not have that generated file yet,
and failed. Fix: always validate from a genuinely clean checkout (a fresh worktree/clone
with no shared generated artifacts) before trusting that CI will pass — see
`testing-and-ci.md`'s clean-checkout section. This is the general shape of "works on my
machine": a warm local environment silently supplies something a fresh environment
doesn't have.

## Antipatterns

A concentrated list — if you see any of these while building or reviewing a project from
this skill, treat it as a defect to fix, not a style preference:

- Frontend/browser code writing directly to the CRM storage, bypassing the backend API.
- Any secret reachable from browser-shipped code or a public API response.
- Hardcoded demo/placeholder data presented to a user (or a client demo) as if it were
  real business data, without a visible "this is a placeholder" signal.
- Per-channel availability logic instead of one shared engine.
- Reporting a booking as confirmed before the CRM mutation has actually returned success.
- A booking mutation with no lock/transaction guarding it.
- Trusting a previously-displayed slot as still valid at confirmation time instead of
  re-validating.
- Relying on a disabled submit button as the *only* defense against duplicate booking
  submission — the backend must independently enforce idempotency.
- Reusing a signed request's nonce/envelope on a network-level retry.
- An HMAC implementation without an explicit charset on every runtime involved.
- Normalizing a phone number (or any identifier) in more than one place in the codebase.
- Using a generic/unformatted write path for spreadsheet columns known to be
  coercion-prone.
- Assuming a spreadsheet cell's stored type will match what's read back, without a
  per-column normalizer.
- Caching an availability result across a mutation attempt.
- A scripting-platform's action registration depending on file load order rather than one
  explicit dispatch table.
- Running destructive or mutating tests against real business data instead of an isolated
  test path with guaranteed cleanup.
- Describing a mock-verified integration as production-verified, at any point, to anyone.
- Copying one client's identity, brand, or data into a new client's project.
- Inventing a policy (cancellation, pricing, promotions) the business hasn't actually
  authorized.
- Storing a management token (or any bearer-style secret) in plain text instead of a hash.
- Storing an admin password in plain text instead of a securely hashed value.
- A wildcard CORS origin on any endpoint that mutates data.
- Forcing a dependency upgrade that breaks the project just to silence an audit finding,
  without evaluating whether the fix is worse than the finding.
- Modifying a real production system (secrets, real deployment, real credentials) while
  the actual task is building or updating a reusable template/skill.
