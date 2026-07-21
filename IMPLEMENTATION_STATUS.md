# IMPLEMENTATION_STATUS.md

Living status file for the Esquece Barber Studio build. Updated at the end of every phase.
If a session ends mid-work, a new session should read this file first — it is written to be
resumable without re-deriving context from the conversation.

## Architecture (current, authoritative)

```
Separate public website (own repo)   WhatsApp (Meta)   Admin dashboard (built here)
                 │                          │                       │
                 │   public booking API     │  webhook              │
                 ▼                          ▼                       ▼
                    Next.js server application (this repo)
                                   │
                                   ▼
              Central server-side CRM client (CrmClient interface)
                                   │
                                   ▼
                        Google Apps Script Web API
                                   │
                                   ▼
                             Google Sheets CRM
```

Google Sheets + Apps Script is the source of truth for business data, appointments,
availability, conversation state, and dedup — **not** PostgreSQL/Prisma. **The public website is
a separate project, built outside this repository** — this repo exposes the secure API it
consumes (Phase F), plus the WhatsApp agent and admin dashboard. See `ARCHITECTURE.md` for the
full rationale, its §10 for the cross-channel synchronization guarantee, and
`MIGRATION_TO_POSTGRESQL.md` for the documented future path if Sheets/Apps Script capacity is
ever exceeded.

## Phase status

| Phase | Description | Status |
|---|---|---|
| A | Architecture migration (Prisma → Apps Script CRM) | DONE |
| B | Apps Script CRM foundation | DONE |
| C | Apps Script CRM domain (services/barbers/customers/etc.) | DONE |
| D | Apps Script booking engine (availability, locks, atomic create) | DONE |
| E | Next.js CRM integration (CrmClient, AppsScriptCrmClient, MockCrmClient) | DONE |
| F | Secure public booking API for the separate website (not the website itself) | DONE |
| G | Admin dashboard | DONE |
| H | WhatsApp infrastructure (webhook, Meta client, dedup) | DONE |
| I | Claude conversational agent | DONE |
| J | Notifications and Calendar sync | DONE |
| K | Production hardening | DONE |

## Completed tasks

- (Phase A) Inspected commit `66bee17` — confirmed clean working tree, matches expected state.
- (Phase A) Created this file.
- (Phase A) Removed Prisma/PostgreSQL: deleted `prisma/schema.prisma`, `src/lib/db/client.ts`,
  the `@prisma/client`/`prisma` package.json dependencies and their scripts
  (`prisma:format`/`prisma:validate`/`postinstall`), and the stray `prisma/generated/` gitignore
  entry. Ran `npm install` to sync `package-lock.json` (25 packages removed).
- (Phase A) Refactored `src/lib/booking-engine/types.ts` to define `AppointmentSource`/
  `AppointmentStatus` as local string-literal unions instead of importing Prisma's generated
  enums — the booking-engine module now has zero database imports. Updated a stray doc comment
  in `appointments.ts` that referenced `prisma.appointment.create`.
- (Phase A) Rewrote `ARCHITECTURE.md`, `BOOKING_RULES.md`, `WHATSAPP_AGENT_DESIGN.md`,
  `SECURITY.md`, `README.md`, `PROJECT_PLAN.md` to describe the Apps Script + Google Sheets CRM
  architecture (Next.js → CrmClient → Apps Script Web API → Sheets) as current and authoritative,
  with `LockService`-based concurrency replacing the Postgres `EXCLUDE` constraint and CRM
  request signing (HMAC + nonce + timestamp) replacing direct DB access.
- (Phase A) Wrote `MIGRATION_TO_POSTGRESQL.md` documenting (not scheduling) the future path back
  to Postgres, referencing the preserved Prisma schema in git history at commit `66bee17`.
- (Phase A) Rewrote `.env.example` to the master spec's variable list (`CRM_PROVIDER`,
  `AI_PROVIDER`, `WHATSAPP_PROVIDER`, Apps Script/CRM signing vars, admin env-based auth vars,
  WhatsApp template vars) — no `DATABASE_URL`.
- (Phase A) Quality gate: `npm run lint` clean, `npm run typecheck` clean (strict), `npm test`
  8/8 passed, `npm run build` succeeded (routes `/`, `/_not-found`, `/reservar` static). Secret
  grep clean. `git status` reviewed before commit.

- (Phase B) Created the `apps-script/` project: `appsscript.json` (V8 runtime, `America/La_Paz`,
  Web App config), `.clasp.json.example`, `.claspignore`.
- (Phase B) `Errors.gs` (error codes + `ApiError`), `Response.gs` (success/error envelope
  builders), `Config.gs` (Script Properties access), `Ids.gs` (UUID/reference/nonce/management-
  token generation+hashing), `DateTime.gs` (local date/time validation, weekday math, interval
  overlap, UTC↔local conversion, Spanish date formatting).
- (Phase B) `Security.gs`: stable (recursively key-sorted) JSON serializer, canonical-string
  builder, HMAC-SHA256 signing, constant-time comparison, full `verifySignedRequest_` (API key,
  signature, timestamp freshness, nonce reuse via `CacheService`).
- (Phase B) `Sheets.gs`: all 18 CRM sheet name/header definitions, `getOrCreateSheet_`
  (idempotent, non-destructive), `ensureHeaders_`, batch `sheetToObjects_`/
  `appendRowFromObject_`/`updateRowFromObject_`.
- (Phase B) `Setup.gs`: `setupCRM()` (idempotent), default `SETTINGS` rows (matching
  `BOOKING_RULES.md` §0), `validateCrmStructure()`, `showCrmVersion()`.
- (Phase B) `Dashboard.gs`: generated `DASHBOARD` summary view.
- (Phase B) `Menu.gs`: `onOpen()` custom "Esquece CRM" spreadsheet menu (all items from the
  master spec's menu list — some deferred actions show an explanatory alert pointing to the
  phase that implements them).
- (Phase B) `Health.gs`: `health`/`getApiVersion`/`validateCrmStructure` action handlers.
  `Router.gs`: `ACTION_HANDLERS_` dispatch table + `registerAction_`/`routeAction_`, currently
  registering those three actions.
- (Phase B) `Api.gs`: `doGet` (unauthenticated, no business data) / `doPost` (parses envelope,
  verifies signature, dispatches via Router, returns standard envelope, never leaks a raw stack
  trace).
- (Phase B) `Seed.gs`: `seedDemoData()`/`removeDemoData()` — demo services/barbers/
  barber-services/working-hours, all `demo`-flagged, removable without touching real rows.
- (Phase B) `Tests.gs`: `runAllInternalTests()` covering this phase's scope — stable-stringify
  correctness, constant-time comparison, valid/tampered/wrong-key/expired/replayed-nonce request
  verification, unsupported-action rejection, health action, setup idempotency + structure
  validation. Non-destructive (no sheet/row deletion in tests).
- (Phase B) Wrote `CRM_APPS_SCRIPT.md` (file-by-file overview), `CRM_SCHEMA.md` (full
  column-level schema for all 19 sheets), `API_CONTRACT.md` (envelope format, signing algorithm,
  **3 verified shared test vectors** for the Phase E Next.js implementation to check itself
  against), `APPS_SCRIPT_SETUP.md` (exact, credential-free-until-the-actual-secrets deployment
  steps), `apps-script/README.md`.
- (Phase B) **Verification method, stated honestly**: this Apps Script source has not been
  deployed to a real Google Apps Script project (no live Google environment available in this
  session). Instead, every `.gs` file was syntax-checked (`node --check`), and the actual logic
  of `Security.gs`, `Response.gs`, `Router.gs`, `DateTime.gs`, `Sheets.gs`, `Setup.gs`, and
  `Seed.gs` was executed in Node against mocked `SpreadsheetApp`/`PropertiesService`/`Utilities`/
  `ContentService` globals (Apps Script's own file-concatenation/global-hoisting behavior
  reproduced via a single combined `vm` context) — not just read for plausibility. This caught
  and fixed one real bug (`Dashboard.gs` used `sheet.getParent()` inconsistently with the
  `spreadsheet` parameter already in scope). All of the following passed: the three
  `API_CONTRACT.md` signing vectors byte-for-byte; envelope success/error shape; tampered-
  payload/wrong-key/replayed-nonce/expired-timestamp rejection; unsupported-action rejection;
  `setupCRM()` creating all 18 data sheets with correct headers; running `setupCRM()` twice
  produces no duplicate `SETTINGS` rows and does not overwrite a manually-edited value;
  `validateCrmStructure()` correctly detects and (via `getOrCreateSheet_`) repairs a missing
  column; `seedDemoData()`/`removeDemoData()` create/remove exactly the expected demo rows,
  re-seeding doesn't duplicate, and removal never touches a real (non-demo) row planted in the
  same sheet. This is real logic verification, not merely "the code compiles" — but it is still
  **not the same as a real Apps Script deployment**, which has its own quota/permission/parsing
  quirks that can only be confirmed by actually deploying (see `APPS_SCRIPT_SETUP.md`).

- (Phase C) `Validation.gs`: generic payload validators (`requireString_`, `requirePhoneE164_`,
  `requireLocalDate_`/`requireLocalTime_`, `requireOneOf_`, etc.), each throwing `ApiError`
  (`INVALID_PAYLOAD`) with a specific field name.
- (Phase C) `Repositories.gs`: generic, sheet-agnostic CRUD (`findRowById_`, `findRowsWhere_`,
  `insertRow_` with automatic `createdAt`/`updatedAt` stamping, `updateRowById_` with patch-merge
  semantics, `generateEntityId_`).
- (Phase C) `Settings.gs`: `getSettingsMap_`/`getSettingValue_` (typed coercion by the
  `SETTINGS` sheet's `type` column — string/number/boolean), `getBusinessSettings` action.
- (Phase C) `Services.gs`: `listServices`/`getService` actions, `requireActiveService_`
  (throws `SERVICE_NOT_FOUND`/`SERVICE_INACTIVE` correctly).
- (Phase C) `Barbers.gs`: `listBarbers`/`getBarber`/`listBarbersForService` actions,
  `requireActiveBarber_`, `requireBarberEligibleForService_` (BOOKING_RULES.md §1.1 — a barber
  not linked to a service is never offered for it).
- (Phase C) `Customers.gs`: `findCustomerByPhone`/`upsertCustomer`/`getCustomer`/
  `listCustomers`/`getCustomerHistory` actions. `upsertCustomer` dedupes strictly by normalized
  phone and never lets a partial update (e.g. WhatsApp only ever sending a name) erase a field
  populated from another source (e.g. an email captured on the website) — verified explicitly.
  `recalculateCustomerCounters()` repair tool included, not run automatically.
- (Phase C) `Content.gs`: `listFaqs`/`listPromotions` actions — promotions are pre-filtered to
  currently-valid ones (`ARCHITECTURE.md` §7's "never mention an inactive promotion" rule is
  enforced by the data the action returns, not left to the caller to re-check).
- (Phase C) `Router.gs` **redesigned mid-phase**: discovered that the originally-planned
  `registerAction_` cross-file pattern (each domain file calling `registerAction_` from its own
  top-level scope) is an ordering hazard in Apps Script — function *declarations* hoist across
  all concatenated files regardless of order, but top-level *statements* execute in file order
  (alphabetical by default), so e.g. `Barbers.gs` could run its registration before `Router.gs`
  finishes initializing `ACTION_HANDLERS_`. Fixed by keeping every action listed directly in
  `Router.gs`'s one object literal instead (safe, since it only references hoisted function
  names) — documented in a comment at the top of the file so the reasoning isn't lost later.
- (Phase C) Extended `Tests.gs`: two new non-destructive tests — domain reads against
  seeded-then-removed demo data, and the customer-upsert dedup/non-erasure guarantee (creates a
  clearly-fake test phone number, cleans it up in a `finally` block either way).
- (Phase C) Updated `API_CONTRACT.md`'s action table (16 actions now implemented),
  `CRM_APPS_SCRIPT.md`'s file table, `apps-script/README.md`'s status section.
- (Phase C) **Verification, same honest standard as Phase B**: not deployed to a live Apps
  Script project. All new `.gs` files pass `node --check`. Logic was executed in Node against
  the same mocked-globals harness (now also mocking `CacheService` and `Utilities.getUuid`/
  `computeDigest`/`base64EncodeWebSafe`), confirming: `listServices`/`getService` correctly
  filter/error on inactive-or-missing; `listBarbersForService` correctly intersects
  `BARBER_SERVICES`; `requireBarberEligibleForService_` rejects a real barber against a
  fabricated service id; `upsertCustomer` dedupes and never erases; `getBusinessSettings`
  coerces string/number/boolean correctly per the `type` column; `getCustomerHistory` correctly
  returns an empty appointment list (Phase D hasn't created any yet, and it doesn't need to for
  this action to be correct); and `runAllInternalTests()` itself — the actual function a human
  would run in the Apps Script editor — reports **15/15 passed** when executed end-to-end
  through this harness. One test failure surfaced during this process
  (`CacheService.getScriptCache()` in my *test mock* was recreating an empty store on every
  call instead of returning a persistent one) — traced to the mock, not `Security.gs` itself
  (the identical nonce-reuse check already passed in Phase B's verification with a correctly
  persistent mock), and fixed in the test harness, not the source.

- (Phase D) `AuditLog.gs`: `writeAuditEntry_` (used internally by every `Appointments.gs`
  mutation), `createAuditEntry`/`listAuditEntries` actions.
- (Phase D) `Notifications.gs`: row creation (called by `Appointments.gs` on
  create/cancel/reschedule) plus `listDueNotifications`/`claimNotification` (lock-guarded
  PENDING→PROCESSING)/`markNotificationSent`/`markNotificationFailed`/`cancelNotification`
  actions. Sending itself is Phase J — this is row management only.
- (Phase D) `Availability.gs`: the actual availability engine. `checkSlotValidity_` implements
  BOOKING_RULES.md §1's twelve-point check end-to-end (weekday-open, lead-time, advance-window,
  business-hours containment via `getEffectiveWorkingIntervalsMinutes_` which correctly
  intersects barber-specific and general `WORKING_HOURS` rows, then non-overlap against breaks/
  time-off/blocked-slots/active-appointments). `getAvailableSlotsForBarber_` generates the
  interval-stepped grid (§2) and filters it through the same check. `getAvailability`/
  `validateSlot` actions.
- (Phase D) `Appointments.gs`: `createAppointment`, `cancelAppointment`, `rescheduleAppointment`,
  `updateAppointmentStatus` — every mutation wrapped in `withScriptLock_`
  (`LockService.getScriptLock()`, re-validates the slot under the lock, releases in `finally`
  even on exception). `createAppointment` requires an idempotency key, upserts the customer,
  snapshots service/barber details, generates a reference + management token (only the hash is
  stored), writes an audit entry, and creates a `CONFIRMATION` notification row.
  `pickBarberForAnyAvailable_` implements the documented tie-break (fewest same-day appointments,
  then `displayOrder`, then name) for "cualquiera disponible." `cancelAppointment` is idempotent
  and requires a valid management token when `actor.type === "customer"`.
  `rescheduleAppointment` validates the new slot **before** touching the existing row (a failed
  reschedule leaves the original completely untouched — verified explicitly) and correctly
  excludes the appointment's own current interval from its own conflict check.
- (Phase D) Eliminated a real duplication risk found while writing this: originally wrote a
  second, nearly-identical copy of the twelve-point check in `Appointments.gs` just to add one
  exclusion parameter for reschedule. Refactored `checkSlotValidity_` itself to accept an
  optional `excludeAppointmentId` instead — one rule implementation, not two that could drift.
- (Phase D) Extended `Tests.gs` with the **exact test the master spec calls out by name**: two
  requests for the same barber+slot, asserting only one succeeds and exactly one `CONFIRMED` row
  exists afterward — plus an idempotency-retry test. Both create real rows and clean them up in
  a `finally` block regardless of pass/fail. Added `addDaysToLocalDate_`/`nextWeekdayLocalDate_`
  to `DateTime.gs` to compute safe test dates relative to whenever the test actually runs (never
  a hardcoded date that would eventually fall in the past).
- (Phase D) Updated `API_CONTRACT.md` (18 more actions), `CRM_APPS_SCRIPT.md`,
  `apps-script/README.md`.
- (Phase D) **Verification, same honest standard as B/C, extended**: not deployed to a live Apps
  Script project. Beyond the standard mock-execution approach, this phase's harness modeled
  `LockService` (tracking held/released state to catch a leaked lock — none found across 21
  acquisitions in the full run) and used **real current dates** computed at test-run time (never
  hardcoded) so lead-time/weekday logic is exercised against real values, not fixtures rigged to
  pass. 34 direct checks plus the full 17-test `runAllInternalTests()` suite (15 prior + 2 new)
  all passed, covering: correct slot generation (grid starting at opening time, correct barber
  list per slot); Saturday returning zero slots; a slot whose end lands exactly at closing
  accepted, one minute later rejected; **the double-booking race** (second request for an
  identical barber+slot rejected with `SLOT_UNAVAILABLE`, exactly one `CONFIRMED` row survives);
  a non-overlapping slot for the same barber still succeeding; idempotent retry returning the
  original appointment without reissuing a management token; idempotency-key reuse with
  different data rejected; "any barber" correctly picking the less-booked barber; cancellation
  idempotency and management-token enforcement; a cancelled slot becoming rebookable; reschedule
  correctly rejecting into a taken slot **while leaving the original appointment fully intact**,
  succeeding into a free one, and not conflicting with its own current slot; notification rows
  created as a side effect of each mutation type; claim-once enforcement; and audit entries
  present for the full appointment lifecycle. This is real logic verification of the system's
  single most correctness-critical component — but it is still not a live-deployment proof; see
  `apps-script/README.md`.

- (Phase E) **Important correction absorbed mid-phase**: the public website is a separate
  project (own repo/host/domain), not built here. Updated `ARCHITECTURE.md` (§1, §2 diagram
  rewritten, new §10 "Cross-channel synchronization guarantee") and `PROJECT_PLAN.md` (Phase F
  redefined as "secure public booking API for the separate website," guardrail added) before
  writing any more code, so Phase F starts from the corrected premise instead of building a
  website to throw away.
- (Phase E) Retired the Phase-1 `src/lib/booking-engine/*` stub module (Postgres-era
  `NotImplementedError` placeholders) and its test — fully superseded by the CRM client; keeping
  it would have been dead, contradictory code.
- (Phase E) `src/lib/env/server.ts` — server-only (`import "server-only"`), Zod-validated
  environment config. Provider-specific getters (`getCrmConfig`, `getAnthropicConfig`,
  `getMetaConfig`) throw a clear, specific error listing exactly which env vars are missing when
  a non-mock provider is selected without its credentials — never a silent mock fallback.
- (Phase E) `src/lib/logging/logger.ts` — minimal structured logger; redacts any field whose key
  matches `token|secret|apikey|password|authorization`, and truncates phone-number fields to a
  last-4-digits suffix.
- (Phase E) `src/lib/crm/types.ts` — full domain types mirroring `CRM_SCHEMA.md`, and the
  `CrmClient` interface (every method from `API_CONTRACT.md`'s action table).
- (Phase E) `src/lib/crm/schemas.ts` — Zod schemas validating every CRM response shape before
  Next.js trusts it (SECURITY.md "output validation").
- (Phase E) `src/lib/crm/signing.ts` — `stableStringify`/`buildCanonicalString`/`computeHmacHex`/
  `buildSignedRequest`, deliberately **not** wrapped in `import "server-only"` (it holds no
  secrets itself — they're passed as parameters), so it can be unit-tested directly.
  **Verified against all three shared test vectors in `API_CONTRACT.md` — 6/6 tests pass**,
  proving this Next.js implementation and `apps-script/Security.gs` produce byte-identical
  signatures for the same input, which is the actual cross-system compatibility guarantee the
  whole signing scheme depends on.
- (Phase E) `src/lib/crm/appsScriptClient.ts` — `AppsScriptCrmClient`: signs every request,
  enforces the configured timeout via `AbortController`, validates the response envelope and
  then the `data` payload against the Zod schemas, maps every documented CRM error code, and
  retries once for calls explicitly marked safe (reads, plus `createAppointment` — safe because
  Apps Script's idempotency-key handling makes a retried create return the original, not a
  duplicate). Explicitly does **not** retry `rescheduleAppointment` (no idempotency key —
  documented reasoning in the code) or plain `upsertCustomer` calls made outside
  `createAppointment`.
- (Phase E) `src/lib/crm/mockClient.ts` — `MockCrmClient`: a second, necessarily-separate,
  in-memory implementation of the same `BOOKING_RULES.md` rules (there's no way to call a real
  Apps Script deployment offline), documented explicitly as such in the file header — not a
  second source of truth for production. **Found and fixed a real encapsulation bug while
  writing its tests**: early versions returned live references into internal arrays, so a caller
  reading `.version` off a `Conversation` object it received earlier would silently see the
  current (mutated) value instead of a snapshot — impossible for a real HTTP-backed client,
  which only ever hands back freshly-parsed JSON. Fixed by cloning every value at every public
  method's return boundary (`structuredClone`), while internal helpers still read/write the live
  arrays directly (the fix is at the boundary, not throughout the internal logic).
- (Phase E) `src/lib/crm/factory.ts` — `getCrmClient()` provider selection; refuses
  `CRM_PROVIDER=mock` in production unless `ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true` is also
  explicitly set (new env var, documented in `.env.example`).
- (Phase E) `src/app/api/health/route.ts` and `src/app/api/health/crm/route.ts` — general and
  CRM-specific health endpoints. **Verified for real**: started the actual Next.js dev server
  and curled both endpoints (not just unit tests) — both returned correct JSON reflecting the
  live `MockCrmClient` wiring end-to-end through the real Next.js runtime.
- (Phase E) Tests: `tests/crm-signing.test.ts` (6 tests, the 3 shared vectors plus edge cases)
  and `tests/mock-crm-client.test.ts` (13 tests mirroring the Apps Script Phase D coverage:
  weekday/weekend rules, exact-closing-time boundary, double-booking prevention, idempotent
  retry, idempotency-key conflict, any-barber tie-break, cancellation idempotency and slot
  release, reschedule-preserves-original-on-failure, conversation version conflict, human
  handoff persistence, webhook dedup, and two-customers-stay-isolated).
- (Phase E) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 3
  files, **24/24 passed**, `npm run build` succeeded, and the dev-server curl check above. Secret
  grep clean. `git status` reviewed before commit.

- (Phase F) `lib/http/envelope.ts` — the `{ok, requestId, data, error}` response shape, with a
  full CRM-error-code → HTTP-status map (e.g. `SLOT_UNAVAILABLE` → 409, `RATE_LIMITED` → 429,
  `CRM_TIMEOUT` → 504) and `errorJsonFromException` so every route's catch block is one line.
- (Phase F) `lib/http/cors.ts` — origin allowlist from `PUBLIC_WEBSITE_ORIGIN`
  (comma-separated, for multiple approved origins) plus `localhost:3000`/`127.0.0.1:3000` only
  in non-production; never a wildcard; preflight (`OPTIONS`) handling.
- (Phase F) `lib/http/rateLimit.ts` — in-memory fixed-window limiter, explicitly documented as
  not multi-instance-safe (SECURITY.md), swappable later behind the same `checkRateLimit()`
  call sites. Three tiers: reads (120/min), availability (60/min), mutations (20/min).
- (Phase F) `lib/http/publicRoute.ts` — shared wrapper (`publicApiRoute`) applying CORS, origin
  enforcement (server-side, not just browser CORS — defense in depth per master spec §4) for
  mutation routes, rate limiting, and uniform error mapping, so each of the 13 route files is
  just its actual logic.
- (Phase F) 13 `/api/public/*` routes: `settings`, `services`, `services/[serviceId]`,
  `barbers` (+ `?serviceId=` filter), `barbers/[barberId]`, `faqs`, `promotions`,
  `availability` (POST), `availability/validate` (POST), `appointments` (POST create),
  `appointments/[reference]` (GET, requires `?token=`), `appointments/[reference]/cancel`
  (POST), `appointments/[reference]/reschedule` (POST). All go through `getCrmClient()` from
  Phase E — no route touches Apps Script or a database directly.
- (Phase F) **Verified for real, not just unit-tested**: ran the actual dev server and drove
  the full lifecycle with `curl` — list services → list eligible barbers → check availability →
  create an appointment → confirm a duplicate request for the identical slot is rejected with
  `SLOT_UNAVAILABLE` → confirm fetching by reference with no token returns `UNAUTHORIZED` and
  with the correct token succeeds → reschedule → cancel → confirm an unapproved-origin CORS
  preflight returns 403 while the approved dev origin returns 204. Every one of these behaved
  exactly as designed against the real running Next.js server, not a mock harness.
- (Phase F) **Found and fixed a real security gap while writing this**: `MockCrmClient`
  accepted *any* value (or no value) as a management token on `cancelAppointment`/
  `rescheduleAppointment` — it never actually compared it. Since the public API layer relies on
  the CRM client to enforce "wrong token → rejected" for customer-initiated actions, this would
  have made the demo/test environment silently insecure in a way production (Apps Script) isn't.
  Fixed by adding a `managementTokens` map to the mock (mirroring `Appointments.gs`'s
  `managementTokenHash` pattern, raw value kept in-memory only) and a `requireManagementToken`
  check on `cancelAppointment`/`rescheduleAppointment` (when `actor.type === "customer"`) and
  `getAppointmentByReference` (when a token is supplied, matching Apps Script's own semantics).
  Caught by the new integration test suite, not by inspection — exactly the value of testing
  through the real route handlers instead of only unit-testing internals in isolation.
- (Phase F) `tests/public-api.test.ts` — 9 tests calling the actual exported route handler
  functions (the same functions Next.js itself invokes), covering the full lifecycle, payload
  validation, CORS preflight, server-side origin enforcement on the real POST (not just
  preflight), no-Origin server-to-server calls being allowed, and rate limiting. Added a matching
  unit test to `tests/mock-crm-client.test.ts` for the management-token fix specifically.
- (Phase F) `src/app/dev/api-test/` — minimal, unstyled, development-only page (disabled in
  production via a `NODE_ENV` check) that drives the same full lifecycle through the browser,
  for manual smoke-testing without curl. Explicitly not the final website.
- (Phase F) `WEBSITE_INTEGRATION.md` (complete endpoint-by-endpoint reference: auth, CORS,
  envelope, rate limits, idempotency, management tokens, slot-unavailable recovery, stale-state
  avoidance, production checklist) and `openapi.yaml` (machine-readable, YAML-validated).
- (Phase F) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 4
  files, **34/34 passed**, `npm run build` succeeded (all 13 public routes + health + dev page
  build correctly). Secret grep clean. `git status` reviewed before commit.

- (Phase G) Apps Script additions: `Conversations.gs` (persistent WhatsApp conversation state +
  message rows, optimistic version-conflict detection), `Handoffs.gs` (activate/resolve human
  handoff, `listOpenHumanHandoffs`), `WebhookEvents.gs` (lock-guarded dedup registration —
  built now, ahead of Phase H, specifically because the admin dashboard needs a
  conversations/handoffs view; documented as a deliberate exception to the "don't build unused
  API surface early" rule applied in Phases C/D). `Scheduling.gs`: admin CRUD for
  `WORKING_HOURS`/`BREAKS`/`TIME_OFF`/`BLOCKED_SLOTS` (list/create/delete, soft-delete via
  `active=false`). Admin CRUD added to `Services.gs` (`adminListServices`/`adminCreateService`/
  `adminUpdateService`) and `Barbers.gs` (`adminListBarbers`/`adminCreateBarber`/
  `adminUpdateBarber`/`adminSetBarberServices`/`adminGetBarberServices` — the last one added
  specifically so the admin barber-edit screen can show which services are currently checked).
  `Dashboard.gs` refactored: the `DASHBOARD` sheet-writing logic and a new
  `actionAdminGetDashboardSummary_` JSON action now share one `computeDashboardSummary_`
  function, so the admin dashboard's stat tiles and the spreadsheet's own summary tab can never
  drift apart. `Notifications.gs` gained `actionAdminListNotifications_` (any status, not just
  due-now) and `Conversations.gs` gained `actionAdminListConversations_`/
  `actionAdminGetConversationMessages_`. All new actions registered in `Router.gs`'s one
  `ACTION_HANDLERS_` object literal (same design as before — see Phase C's note on why).
- (Phase G) Extended `Tests.gs` with a new non-destructive test covering the three new admin
  listing actions (message history, conversation list, notification status filter) — cleans up
  via `finally` like every other test here.
- (Phase G) **Apps Script verification harness persisted to the repo** (previously ad hoc,
  rebuilt each session): `apps-script/tests/run-tests.mjs` — concatenates every `.gs` file (same
  file-order-matters reasoning as Phase C's `Router.gs` note), runs it in a Node `vm` context
  against hand-built mocks of `SpreadsheetApp`/`PropertiesService`/`Utilities` (including a real,
  not stubbed, `formatDate`/`computeDigest`/`base64EncodeWebSafe` implementation — a stubbed
  `formatDate` was tried first and produced a corrupted local-date string that silently broke
  `localDateWeekRange_`'s date parsing, caught by the harness itself)/`CacheService`/
  `LockService`/`ContentService`/`Logger`/`Session`, then calls `setupCRM()` and
  `runAllInternalTests()`. Wired up as `npm run test:apps-script`. **20/20 internal tests pass.**
- (Phase G) Next.js `CrmClient` extended with the Phase G admin methods (services/barbers/
  scheduling CRUD already added in earlier work this session, now completed with
  `adminGetBarberServices`, `adminListNotifications`, `adminListConversations`,
  `adminGetConversationMessages`, `adminGetDashboardSummary`) — implemented in both
  `AppsScriptCrmClient` and `MockCrmClient`, with matching Zod response schemas
  (`ConversationMessage`, `DashboardSummary` are new domain types). `MockCrmClient`'s
  `appendConversationMessage` previously discarded the message entirely (a known Phase E
  simplification, `void message`) — now actually persists rows and is exercised by
  `applyConversationTurn`'s `inboundMessage`/`outboundMessage` handling, matching Apps Script's
  `actionApplyConversationTurn_` behavior exactly.
- (Phase G) Admin authentication: `src/lib/auth/password.ts` (bcryptjs, 12 salt rounds),
  `src/lib/auth/session.ts` (`jose`-signed HS256 JWT session token, 8-hour expiry,
  `ADMIN_SESSION_COOKIE` constant), `scripts/hash-password.mjs` (`npm run hash-password -- "..."`,
  never logs the plaintext). `src/lib/auth/adminRoute.ts` — `adminApiRoute()` wrapper mirroring
  `publicApiRoute()`: verifies the session cookie (401 `UNAUTHORIZED` if absent/invalid), checks
  same-origin for mutation routes (`enforceOrigin`, CSRF defense in depth beyond the cookie's own
  `SameSite=Lax`), uniform error/success envelope. `src/middleware.ts` — protects every
  `/admin/*` page and `/api/admin/*` route (redirects to `/admin/login` for pages, 401 JSON for
  API routes), except the login/logout routes and the login page itself.
  `POST /api/admin/auth/login` (rate-limited 5/5min per IP via a new `RATE_LIMITS.adminLogin`
  bucket, always runs `verifyPassword` even on an email mismatch so response timing doesn't leak
  which part was wrong, sets the HTTP-only/`SameSite=Lax`/`Secure`-in-production cookie) and
  `POST /api/admin/auth/logout` (clears it).
- (Phase G) Admin API route layer — 24 route files under `src/app/api/admin/*`, every one calling
  the SAME `getCrmClient()` the website/WhatsApp will use, so manual admin bookings/cancellations/
  reschedules go through identical availability revalidation and locking:
  `dashboard`, `appointments` (list with filters + manual create), `appointments/[id]/cancel`,
  `appointments/[id]/reschedule`, `appointments/[id]/status` (confirm/complete/no-show —
  deliberately excludes `CANCELLED`, which has its own route with proper reason/idempotency
  handling), `availability` (POST, backs the manual-booking slot picker), `customers` (search),
  `customers/[id]` (history), `services` (list/create), `services/[id]` (update), `barbers`
  (list/create), `barbers/[id]` (update), `barbers/[id]/services` (get/set), `scheduling/
  working-hours`, `scheduling/breaks(+/[id])`, `scheduling/time-off(+/[id])`,
  `scheduling/blocked-slots(+/[id])`, `conversations` (list, `?handoffActiveOnly=`),
  `conversations/[id]`, `conversations/[id]/messages`, `handoffs`, `handoffs/[id]/resolve`
  (`reactivateBot` optional, matching WHATSAPP_AGENT_DESIGN.md's "no automatic reactivation"
  rule), `notifications` (list, `?status=` filter), `config` (safe settings + CRM/provider
  health — no secret ever included). Request bodies validated by `src/lib/http/
  adminApiSchemas.ts` (parallel to Phase F's `publicApiSchemas.ts`, separate because it's a
  different trust boundary — session-authenticated staff, not an approved website origin).
- (Phase G) Admin dashboard UI — `src/app/admin/(auth)/login` (route group, no nav shell) and
  `src/app/admin/(dashboard)/*` (shared layout with nav + logout, session read via
  `next/headers` `cookies()`): dashboard home (stat tiles from `adminGetDashboardSummary`),
  appointments (filterable table, manual-create form with a real availability slot picker,
  confirm/complete/no-show/reschedule/cancel actions), customers (search + history panel),
  services (create + activate/deactivate), barbers (create + activate/deactivate + a
  checkbox-based service-eligibility editor), schedule (per-barber weekly hours, recurring/
  one-time breaks, time off, business-wide or barber-specific blocked slots — all four in one
  page), conversations (recent list + open-handoffs panel with resolve/reactivate-bot buttons +
  a message-history viewer), notifications (status-filterable table), config (read-only business
  settings + CRM/provider health, explicitly never a secret). Functional Tailwind styling
  (dark-mode aware via the existing CSS variables/`dark:` classes) — not the final public
  website's design system, this is an internal tool.
- (Phase G) `tests/admin-api.test.ts` — 5 new integration tests calling the actual admin route
  handler functions: no-cookie → 401, tampered-cookie → 401, valid session → dashboard summary
  shape, mismatched-Origin mutation → 401 even with a valid session, and a full
  create-then-list-then-update service flow proving the admin route and the public/WhatsApp
  surface share one `CrmClient`.
- (Phase G) **Found and fixed a real, non-obvious local-dev bug while verifying this end-to-end**:
  Next.js's built-in `.env`/`.env.local` loader performs `$VARIABLE` expansion, and a bcrypt hash
  is full of literal `$` characters (`$2b$12$...`) — an unescaped hash in a `.env.local` file gets
  silently corrupted (each `$2b`, `$12`, etc. treated as an interpolation attempt), so every login
  fails with a generic "incorrect password" and no indication the hash itself was mangled. This
  only affects local `.env`-file-based development, not Render (which injects real process env
  vars, never parsed through this expansion step) — but it would have cost a future session real
  time to diagnose. Documented directly in `.env.example` next to `ADMIN_PASSWORD_HASH` with the
  exact escaping needed (`\$2b\$12\$...`).
- (Phase G) **Verified for real, not just unit-tested**: ran the actual dev server
  (`CRM_PROVIDER=mock`, a locally-generated `ADMIN_PASSWORD_HASH`) and drove the complete admin
  flow with `curl`: unauthenticated `/admin` → 307 redirect to `/admin/login`; login with wrong
  env-mangled hash → confirmed the bug above, fixed, then login succeeded; all 9 authenticated
  admin pages → 200; created a service via the admin API and confirmed it appeared in the admin
  list; fetched a barber's linked services; ran a real availability lookup for a future weekday
  and got the expected 16 half-hour slots; created a manual `ADMIN`-sourced appointment and
  confirmed it appeared in the filtered appointments list with `status: CONFIRMED`; logged out;
  confirmed the dashboard API then returned 401. No `.env.local` or other local-only file was
  left in the working tree afterward.
- (Phase G) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 5
  files, **45/45 passed** (5 phone + 6 signing + 20 MockCrmClient + 9 public API + 5 admin API),
  `npm run test:apps-script` → **20/20 passed**, `npm run build` succeeded (61 routes total,
  including all 24 new `/api/admin/*` routes and 9 new `/admin/*` pages, correctly split between
  static/dynamic). Secret grep clean (only match: a clearly-labeled non-real test fixture string
  in `tests/admin-api.test.ts`). `git status` reviewed before commit.

- (Phase H) `src/lib/whatsapp/types.ts` — `WhatsAppProvider` interface (`sendText`,
  `sendInteractiveButtons`, `sendInteractiveList`, `sendTemplate`, `markAsRead`), mirroring the
  `CrmClient` pattern: one interface, one mock, one real implementation, never a direct Graph API
  call scattered across call sites.
- (Phase H) `src/lib/whatsapp/mockProvider.ts` — `MockWhatsAppProvider`: records every send
  in-memory (`sentMessages`, inspectable by tests and the future `/dev/whatsapp-simulator`), plus
  a `failNextSend` one-shot hook for simulating a WhatsApp outage.
- (Phase H) `src/lib/whatsapp/metaProvider.ts` — `MetaWhatsAppProvider`: the only module that
  calls `graph.facebook.com` and holds `WHATSAPP_ACCESS_TOKEN` (via `getMetaConfig()`, Phase E).
  Maps Meta's error `code: 131047` (outside the 24-hour customer-initiated window — requires an
  approved template) onto a typed `requiresTemplate` flag per WHATSAPP_AGENT_DESIGN.md §9; never
  logs the access token.
- (Phase H) `src/lib/whatsapp/factory.ts` — `getWhatsAppClient()`, same production-safety pattern
  as `lib/crm/factory.ts`: refuses `WHATSAPP_PROVIDER=mock` in production unless
  `ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true` is also explicitly set.
- (Phase H) `src/lib/whatsapp/signature.ts` — `verifyMetaSignature` (HMAC-SHA256 over the raw
  body, constant-time compare via `crypto.timingSafeEqual`) and `verifyTokenMatches` (constant-time
  verify-token comparison for the `GET` handshake). No environment flag disables either check.
- (Phase H) `src/lib/whatsapp/webhookSchemas.ts` — Zod schemas for the Meta webhook body: one
  permissive `inboundMessageSchema` (not a discriminated union — Meta's `type` covers many values
  this codebase doesn't specifically parse; `text`/`interactive` are simply absent for those, not
  a validation error) plus `messageStatusSchema` and the enclosing `webhookPayloadSchema`.
  `messageTextBody`/`interactiveReplyId`/`findContactName` helpers.
- (Phase H) `src/app/api/whatsapp/webhook/route.ts` — the direct Next.js webhook (never Apps
  Script, per master spec §12). `GET`: `hub.mode`/`hub.verify_token`/`hub.challenge` handshake,
  constant-time token comparison, `403` on mismatch. `POST`: reads the raw body as text *before*
  any JSON parsing, verifies `X-Hub-Signature-256` against it, rejects with `401` before parsing
  a single byte of JSON on failure; parses and validates structure (`400` on either failure);
  iterates every `entry[].changes[].value`, handling `messages[]` and `statuses[]` independently
  with per-event try/catch (one bad event never drops the rest of the batch); always returns
  `200` once the payload is structurally accepted, even if an individual event's processing
  failed, matching Meta's aggressive-retry behavior. Each inbound message: dedups via
  `registerWebhookEvent` (lock-guarded in Apps Script, from Phase G), normalizes the phone via the
  existing `normalizeWaId`, upserts the customer, gets-or-creates the conversation, and appends
  the inbound message — unsupported message types (stickers, images, etc.) are still recorded
  (with `messageType` set to whatever Meta sent), never silently dropped. **Scope note**:
  composing and sending an automated reply is Phase I (the Claude agent) — this route's job is
  the infrastructure guarantee that every inbound event is verified, deduplicated, and persisted
  exactly once, which Phase I builds directly on top of.
- (Phase H) `tests/whatsapp-providers.test.ts` (11 tests: signature accept/reject-tampered/
  reject-missing/reject-malformed/reject-wrong-secret, verify-token match/mismatch/null, mock
  provider recording + one-shot failure + interactive body formatting) and
  `tests/whatsapp-webhook.test.ts` (10 tests calling the actual route handlers: GET
  accept/reject, POST reject-no-signature/reject-invalid-signature/reject-invalid-JSON, a full
  valid text-message flow proving the customer+conversation+message side effects, duplicate
  delivery processed exactly once, a status-only payload, an unsupported message type recorded
  without throwing, and multiple messages+statuses in one payload all processed).
- (Phase H) **Verified for real, not just unit-tested**: ran the actual dev server
  (`WHATSAPP_PROVIDER=meta` with locally-generated fake credentials — no real Meta account
  involved) and drove both the `GET` handshake (correct token → 200 + echoed challenge; wrong
  token → 403) and the `POST` path (computed a real HMAC-SHA256 signature over an actual request
  body with Node's `crypto`, exactly as Meta would, and confirmed: no signature → 401, valid
  signature + valid payload → 200) against the real running Next.js server.
- (Phase H) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 7
  files, **66/66 passed** (previous 45 + 11 provider + 10 webhook), `npm run test:apps-script` →
  **20/20 passed** (unchanged — no Apps Script changes this phase), `npm run build` succeeded
  (`/api/whatsapp/webhook` present as a dynamic route). Secret grep clean. `git status` reviewed
  before commit.

- (Phase I) `src/lib/ai/types.ts` — `AiProvider` interface (`interpretMessage`), `AiInterpretation`
  structured-output contract (`intent`, extracted `serviceName`/`barberName`/`localDate`/
  `localTime`/`customerName`, `confidence`, `needsHumanHandoff`, `replyDraft`). Mirrors the
  `CrmClient`/`WhatsAppProvider` pattern exactly.
- (Phase I) `src/lib/ai/mockProvider.ts` — `MockAiProvider`: deterministic keyword/pattern
  matching (Spanish greetings, service/barber name matching against the real CRM lists it's given,
  "hoy"/"mañana"/weekday-name/ISO-date resolution, `HH:mm`/"a las N" time resolution, a loose
  name-detection fallback) plus a `failNext` one-shot fault-injection hook mirroring
  `MockWhatsAppProvider.failNextSend`. Explicitly documented as not real NLU.
- (Phase I) `src/lib/ai/anthropicProvider.ts` — `AnthropicAiProvider`: real Claude integration via
  `@anthropic-ai/sdk`'s tool-use (forced `tool_choice`), never free-form text parsing — the
  `interpret_message` tool's `input` is validated against a Zod schema before a single field is
  trusted. System prompt explicitly lists the real services/barbers/today's date and states
  Claude must never invent one or mutate booking state directly (master spec §14). Default model
  updated to `claude-sonnet-5` (previously `claude-sonnet-4-5`) — "default to the latest and most
  capable Claude model" per this session's operating instructions.
- (Phase I) `src/lib/ai/factory.ts` — `getAiClient()`, same production-safety pattern as the CRM/
  WhatsApp factories (refuses `AI_PROVIDER=mock` in production without the explicit unsafe-mock
  opt-in).
- (Phase I) `src/lib/conversation/types.ts` — `BookingScratchData` (the exact structured shape
  persisted as `CONVERSATIONS.scratchDataJson`: service/barber/date/time/name, plus a `flow`
  discriminator so the shared `SELECTING_DATE`/`SELECTING_TIME`/`AWAITING_CONFIRMATION` states can
  serve booking, cancel, and reschedule without three separate copies of each).
- (Phase I) `src/lib/conversation/transitions.ts` — the legal `(fromState, toState)` table
  (WHATSAPP_AGENT_DESIGN.md §5); every transition the orchestrator produces is checked against it
  before being committed, so a handler bug that tries an illegal jump throws instead of silently
  corrupting conversation state. `HUMAN_HANDOFF` is reachable from any non-handoff state (global
  override) and leavable only through the existing `resolveHumanHandoff` action, never through
  this table.
- (Phase I) `src/lib/conversation/deterministicIntent.ts` — matches button/list reply ids,
  numeric menu choices, and fixed Spanish keywords (confirm/deny/cancel/reschedule/start-over/
  request-human) *before* ever calling the AI provider (§6 — cheaper and more reliable than an AI
  round-trip for a fixed choice; also means these never cost a real Anthropic API call).
- (Phase I) `src/lib/conversation/orchestrator.ts` — `handleInboundTurn()`, the single place that
  ties CRM + AI + WhatsApp together for one conversation turn. Session-expiry reset (never for an
  active handoff), records every inbound message even during handoff, global-intent interrupts
  (human handoff request/complaint, cancel, reschedule, start-over) recognized regardless of
  current state, then a full per-state dispatcher covering the entire state list: `IDLE` →
  `SELECTING_SERVICE` → `SELECTING_BARBER` → `SELECTING_DATE` → `SELECTING_TIME` →
  (`REQUESTING_NAME` if not already known) → `AWAITING_CONFIRMATION` → `BOOKING_CONFIRMED`;
  `CANCELLING_BOOKING`/`RESCHEDULING_BOOKING` (asks which appointment when more than one is
  changeable) feeding into the same shared `SELECTING_DATE`/`SELECTING_TIME`/
  `AWAITING_CONFIRMATION` states via the `flow` discriminator. Every booking/cancel/reschedule
  mutation calls the exact same `CrmClient` methods the public API and admin dashboard use
  (`createAppointment`/`cancelAppointment`/`rescheduleAppointment`), so availability is never
  calculated independently (ARCHITECTURE.md §4/§7) and a booking is never confirmed to the
  customer before the CRM write actually succeeds. `SLOT_UNAVAILABLE` at confirmation time is
  handled per master spec §16's "when a slot becomes unavailable during confirmation": explain
  briefly, fetch fresh availability, preserve everything already collected, offer new slots,
  never restart the whole flow. A WhatsApp send failure never blocks or rolls back a state change
  a real CRM mutation already depends on (logged, not silently swallowed).
- (Phase I) Webhook route (`src/app/api/whatsapp/webhook/route.ts`) now hands every inbound
  message to `handleInboundTurn()` instead of only recording it — Phase H's dedup/verification
  stays exactly as it was, this phase builds directly on top of it, per the scope note Phase H's
  entry above already flagged.
- (Phase I) **Found and fixed a real test-isolation coupling while wiring this up**:
  `getMetaConfig()` (the *outbound send* config, gated on `WHATSAPP_PROVIDER=meta`) was also being
  used by the webhook for *inbound signature verification* — meaning a webhook test that needed
  `WHATSAPP_PROVIDER=meta` (to make `getMetaConfig()` not throw) would also make
  `getWhatsAppClient()` construct a real `MetaWhatsAppProvider` for the orchestrator's outbound
  reply, which performs a real `fetch()` to `graph.facebook.com` — exactly the kind of accidental
  real-network-call-in-a-test this project's mock-provider discipline exists to prevent. Fixed by
  splitting a new `getMetaWebhookConfig()` (only `META_APP_SECRET`/`META_VERIFY_TOKEN`, not gated
  on `WHATSAPP_PROVIDER`) out of `getMetaConfig()` — receiving and verifying real Meta webhook
  traffic is legitimately independent of which provider currently handles outbound sends. The
  webhook route now uses `getMetaWebhookConfig()`; `tests/whatsapp-webhook.test.ts` was updated to
  stop setting `WHATSAPP_PROVIDER=meta` (leaving it at its `mock` default) — caught before it ever
  caused a hang/failure in CI, by reasoning through the factory wiring while writing this phase,
  not by a test actually timing out.
- (Phase I) `src/app/dev/whatsapp-simulator/` + four backing dev-only API routes
  (`/api/dev/whatsapp-simulator/{state,send,reset,fault}`, all 404 in production via a new shared
  `lib/http/devOnly.ts` guard) — master spec §20. Runs `handleInboundTurn()` against the exact
  same process-wide `getCrmClient()`/`getAiClient()`/`getWhatsAppClient()` singletons as the real
  webhook (**"must not use a separate fake booking calendar"** — literally the same in-memory
  `MockCrmClient` instance), not a reimplementation. Shows the message transcript, current state,
  scratch data, and handoff status; supports resetting a conversation and arming a one-shot
  failure on the CRM, AI, or WhatsApp-send mock (`MockCrmClient.failNextCall`,
  `MockAiProvider.failNext`, `MockWhatsAppProvider.failNextSend` — the last one already existed
  from Phase H, the first two added this phase specifically for this simulator).
- (Phase I) `tests/conversation-orchestrator.test.ts` — 8 tests driving the real orchestrator
  end-to-end: a full booking (greeting → service → barber → date → time → name → confirm →
  `BOOKING_CONFIRMED`, with the created appointment verified directly against the CRM);
  `SLOT_UNAVAILABLE` recovery when a rival booking takes the exact slot between summary and
  confirmation (asserts no duplicate appointment exists and the conversation didn't falsely
  confirm); cancellation with a single changeable appointment; cancellation asking which
  appointment when there are multiple; a full reschedule (old slot verified released — a
  follow-up booking into it succeeds — new slot verified occupied); human handoff activation,
  automated replies suppressed while active, inbound messages still recorded, and **no automatic
  reactivation** (only an explicit `resolveHumanHandoff` call reactivates); session expiry
  resetting a mid-flow conversation to `IDLE` before processing the next message (using a new
  test-only `MockCrmClient._setConversationLastInboundAtForTests` hook to backdate the timestamp
  instead of waiting real time out).
- (Phase I) **Verified for real, not just unit-tested**: ran the actual dev server and drove the
  full conversation through the real `/dev/whatsapp-simulator` API routes with `curl` — hola →
  service selection → barber selection → date → time → name → confirmation → a real `BOOKING_CONFIRMED`
  reply with a real appointment reference, then armed a CRM fault and reset the conversation,
  all against the real running Next.js server (not just the Vitest harness).
- (Phase I) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 8
  files, **74/74 passed** (previous 66 + 8 conversation orchestrator), `npm run test:apps-script`
  → **20/20 passed** (unchanged — no Apps Script changes this phase), `npm run build` succeeded
  (`/dev/whatsapp-simulator` + 4 new dev API routes present, correctly split static/dynamic).
  Secret grep clean. `git status` reviewed before commit.

- (Phase J) `apps-script/Appointments.gs`: `scheduleReminderNotification_` (schedules a
  `REMINDER` row at `REMINDER_HOURS_BEFORE` hours ahead of the appointment, only when
  `ENABLE_REMINDERS` is on and there's still time left for it to matter) called from
  `actionCreateAppointment_` and `actionRescheduleAppointment_` (re-scheduled to the new time);
  `cancelReminderNotificationsFor_` (cancels any still-pending reminder) called from both
  `actionCancelAppointment_` and before rescheduling. `actionMarkNotificationFailed_` extended
  with an optional `retryAfterMinutes` — when provided, the notification goes back to `PENDING`
  with a future `scheduledAt` instead of terminal `FAILED`, giving the cron processor an actual
  retry mechanism without a new action name. `apps-script/Conversations.gs` gained
  `actionFindConversationByPhone_` (non-creating lookup — see the bug this fixed, below).
  `NOTIFICATION_TYPES` gained `CALENDAR_SYNC_FAILURE`. All new actions registered in `Router.gs`.
- (Phase J) `apps-script/Calendar.gs` (new) — optional Google Calendar mirror via Apps Script's
  built-in `CalendarApp` (no service account — the deploying Google account authorizes Calendar
  access as a normal part of deployment, same as the rest of this project's credential model).
  Disabled by default (`ENABLE_CALENDAR_SYNC=false`); every function is a no-op when disabled or
  no `GOOGLE_CALENDAR_ID` is configured. `syncCreateCalendarEvent_`/`syncUpdateCalendarEvent_`/
  `syncCancelCalendarEvent_` wired into `actionCreateAppointment_`/`actionRescheduleAppointment_`/
  `actionCancelAppointment_` respectively. A Calendar failure is **never destructive**: caught,
  the appointment row gets `calendarSyncStatus: "FAILED"`, and a `CALENDAR_SYNC_FAILURE`
  notification (channel `"admin"`) is queued so staff see it in the dashboard — not a background
  retry loop (this sync is best-effort and off by default; a queued, staff-visible record is
  proportionate to that). Never includes conversation content in the event, only booking facts
  (service/barber/reference/status).
- (Phase J) **Found and fixed a real bug while writing the Calendar sync test**: the three sync
  functions called `updateRowById_` to patch `calendarEventId`/`calendarSyncStatus` onto the
  appointment row, but `updateRowById_` (like every Repositories.gs helper) returns a *new*
  object rather than mutating its input — the caller's `appointment`/`updated` local variable
  was never reassigned, so the value actually returned by `createAppointment`/
  `rescheduleAppointment`/`cancelAppointment` still showed the pre-sync (empty)
  `calendarEventId`/`calendarSyncStatus` even though the sheet itself was correctly updated. A
  genuinely failing test (`expected a synced calendar event once ENABLE_CALENDAR_SYNC is on`)
  caught this immediately; fixed by having every `sync*CalendarEvent_` function return the
  updated row and every call site reassign its local variable to that return value.
- (Phase J) **Found and fixed a real design bug while building the notification processor**: the
  24-hour customer-service-window check was originally going to use `getOrCreateConversation`,
  which defaults a brand-new conversation's `lastInboundMessageAt` to "now" — meaning a customer
  who booked via the website or admin and never once messaged WhatsApp would be incorrectly read
  as "within the window" the very first time a notification was processed for them, and get a
  free-form message instead of the required approved template. Fixed by adding a genuinely
  non-creating `findConversationByPhone` (new CrmClient method, backed by the new
  `actionFindConversationByPhone_` Apps Script action) and treating "no conversation exists" as
  definitively outside the window.
- (Phase J) `src/lib/notifications/processor.ts` — `processDueNotifications()`: claims each due
  notification atomically (`IDEMPOTENCY_CONFLICT` from a concurrent claim is treated as
  `skipped_duplicate`, not an error), routes non-`whatsapp`-channel notifications (e.g.
  `INTERNAL_ALERT`) straight to `SENT` with no send attempt, re-checks the appointment still
  exists and isn't stale for `REMINDER` (cancels it if the appointment is no longer
  `PENDING`/`CONFIRMED`), checks the 24h window via the fixed `findConversationByPhone`, sends
  free-form text within the window or an approved template (`getWhatsAppTemplates()`) outside it
  — failing safely with a clear `TEMPLATE_REQUIRED` reason if no template is configured, never
  silently dropped and never sent in violation of the window — and applies exponential-backoff
  retries (5/15/30/60/120 minutes) up to 5 attempts before giving up permanently.
- (Phase J) `src/app/api/cron/notifications/route.ts` — protected by `CRON_SECRET`
  (constant-time-compared `Authorization: Bearer` header), `GET`/`POST` both supported
  (schedulers vary in which they use; every action here is already idempotent per-notification).
- (Phase J) `tests/notifications-processor.test.ts` — 7 tests against the real processor: sends
  free-form text within the window; fails safely with `template_required` outside the window
  with none configured; sends via an approved template outside the window when one is
  configured; skips (cancels) a `REMINDER` for an appointment that's no longer changeable;
  routes a non-WhatsApp channel straight to sent; retries with backoff on a simulated WhatsApp
  send failure (and confirms the retried notification isn't immediately due again); never
  processes an already-`SENT` notification on a second run. `apps-script/Tests.gs` gained two
  new tests: reminder scheduling + cancellation-cancels-the-reminder, and the full Calendar sync
  lifecycle (disabled-by-default no-op, create/reschedule/cancel event mirroring, and the
  non-destructive-failure path with a queued `CALENDAR_SYNC_FAILURE` notification) — the harness
  (`apps-script/tests/run-tests.mjs`) gained a minimal in-memory `CalendarApp` mock for this.
- (Phase J) **Verified for real, not just unit-tested**: ran the actual dev server and drove the
  cron endpoint with `curl` — no `Authorization` header → 401; wrong secret → 401; correct secret
  with nothing due → `{processed: 0}`; created a real appointment via the live `/api/public/
  appointments` route (website-sourced, no prior WhatsApp conversation) and re-ran the cron,
  which correctly reported `{"outcome":"failed","detail":"template_required"}` — exactly the
  honest, safe failure this design intends for that scenario, observed against the real running
  server, not assumed from the test suite alone.
- (Phase J) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 9
  files, **81/81 passed** (previous 74 + 7 notifications-processor), `npm run test:apps-script` →
  **22/22 passed** (20 previous + reminder-scheduling + Calendar-sync-lifecycle), `npm run build`
  succeeded (`/api/cron/notifications` present as a dynamic route). Secret grep clean. `git
  status` reviewed before commit.

- (Phase K) **Request-size limits**: `lib/http/publicRoute.ts`'s `parseJsonBody` now checks
  `Content-Length` and the actual received body length against a 100KB ceiling
  (`MAX_REQUEST_BODY_BYTES`) before ever parsing JSON — covers every `/api/public/*` and
  `/api/admin/*` route, since they all share this one helper. The WhatsApp webhook (which reads
  its raw body directly, not through this helper) got its own 250KB ceiling (Meta batches
  multiple entries per delivery) in `src/app/api/whatsapp/webhook/route.ts`. New test in
  `tests/public-api.test.ts` proves an oversized body is rejected with `INVALID_REQUEST` before
  parsing.
- (Phase K) **Error boundaries**: `src/app/error.tsx` (route-segment errors) and
  `src/app/global-error.tsx` (root-layout errors) — a safe, generic Spanish message and a retry
  button instead of a blank screen or a raw stack trace, per master spec's "error boundaries."
- (Phase K) **Cross-channel automated test suite** (`tests/cross-channel.test.ts`, 6 tests) — the
  automated proof of this project's central claim, driving the real `/api/public/*` route
  handlers, the real `/api/admin/*` route handlers, and the real conversation orchestrator against
  one shared `MockCrmClient` instance: a website booking blocks that slot for WhatsApp; a WhatsApp
  booking blocks that slot for the website API; two channels racing for the identical slot leave
  exactly one appointment and the loser is safely rejected/re-offered; an admin-blocked slot is
  rejected identically from the website API, WhatsApp, and a direct create call; an admin
  cancellation releases the slot for the website API; a service duration change is reflected
  identically (the exact same `getAvailability()` result) in both the website API and WhatsApp.
- (Phase K) **Dependency review**: `npm audit` — one moderate advisory in `postcss`, vendored
  inside `next`'s own dependency tree, not a direct dependency. The only automatic fix available
  downgrades Next.js to `9.3.3` (a large breaking regression, far riskier than the advisory
  itself, which needs attacker-controlled CSS input this application never accepts from a user).
  Left unfixed pending an upstream Next.js patch — documented in `LIMITATIONS.md`, not silently
  ignored.
- (Phase K) **Secret review**: full-repo grep (not just this phase's diff) for
  `CRM_API_KEY`/`CRM_SIGNING_SECRET`/`META_APP_SECRET`/`WHATSAPP_ACCESS_TOKEN`/
  `ANTHROPIC_API_KEY`/`AUTH_SECRET`/`ADMIN_PASSWORD_HASH`/`CRON_SECRET`-shaped high-entropy values
  across every `.ts`/`.tsx`/`.gs`/`.md`/`.mjs`/`.json` file, plus a check for accidentally-tracked
  `.env*` files and the `.clasp.json.example` placeholder. Only match: two clearly-labeled,
  non-real test fixture strings (`tests/admin-api.test.ts`, `tests/cross-channel.test.ts`).
- (Phase K) Remaining documentation: `META_SETUP.md`, `ANTHROPIC_SETUP.md`, `RENDER_SETUP.md`,
  `DEPLOYMENT.md`, `TESTING.md`, `OPERATIONS.md`, `LIMITATIONS.md` — all new. Every setup guide
  gives exact steps with no real values, an explicit "what verified actually means" section, and
  a troubleshooting section for the specific failure modes this codebase can produce (e.g.
  `TEMPLATE_REQUIRED`, `getMetaConfig() called but WHATSAPP_PROVIDER is not 'meta'`).
- (Phase K) Full quality gate: `npm run lint` clean, `npm run typecheck` clean, `npm test` → 10
  files, **88/88 passed** (previous 81 + 6 cross-channel + 1 request-size-limit test added to
  `public-api.test.ts`), `npm run test:apps-script` → **22/22 passed** (unchanged — no Apps
  Script changes this phase), `npm run build` succeeded. Secret grep clean. `git status`
  reviewed before commit.

## In-progress tasks

None — Phases A through K are complete as of this update.

## Remaining tasks

None credential-independent. Everything that remains requires external credentials, a deployed
URL, or official client business data — see `CLIENT_INFORMATION_REQUIRED.md` and the final
report for the exact, itemized list (Google Spreadsheet ID + Apps Script deployment, Render
deployment + real environment variables, the separate website's real origin, Meta credentials +
approved templates, an Anthropic API key, and Esquece's real services/prices/barbers/schedules/
address/policies/photos).

## Blockers

Every remaining blocker is external-credential-related — see the list immediately above and the
final report. Nothing in this codebase is blocked on more code being written; every phase A
through K is complete, tested (with mocks/synthetic requests where a real external system isn't
available), and documented.

## Latest commit

Phase K committed and pushed — see the session's final report for the exact hash (this file is
updated in the same commit as Phase K's code, so `git log -1` in the repo is the authoritative
source if this line is ever stale).

## Tests last executed

Post-Phase-K (this session, the final phase of this build): `npm run lint` clean, `npm run
typecheck` clean, `npm test` → 10 files, **88/88 passed** (5 phone + 6 signing + 20 MockCrmClient
+ 10 public API + 5 admin API + 11 WhatsApp provider + 10 WhatsApp webhook + 8 conversation
orchestrator + 7 notifications processor + 6 cross-channel), `npm run test:apps-script` →
**22/22 passed**, `npm run build` succeeded. See `TESTING.md` for what each suite covers and the
verification discipline behind the Apps Script harness specifically.

## External configuration still required

Not yet reached — see `CLIENT_INFORMATION_REQUIRED.md` and (once written) the external
configuration checklist in the final report. Nothing in Phase A–K requires credentials; Apps
Script deployment, Meta setup, Anthropic key, and Render deployment are the actual external
gates, all deferred until the credential-independent implementation is complete.

## Independent audit (2026-07-21)

A fresh session re-verified every claim on this page directly against the repository (not from
prior conversation memory), per explicit instruction not to trust a self-reported "done" without
checking. Findings: `git status` clean, local `main` = `origin/main` = `a6029f6`. Re-ran, fresh,
in this session: `npm run lint` (clean), `npm run typecheck` (clean), `npm test` → **10 files,
88/88 passed**, `npm run test:apps-script` → **22/22 passed**, `npm run build` (succeeded),
`npm audit` (same 2 moderate `postcss`-in-`next` advisories as previously documented, no new
ones). Spot-checked `tests/cross-channel.test.ts` (6 tests) and `apps-script/Appointments.gs`
directly to confirm `LockService.getScriptLock()` (via `withScriptLock_`) genuinely wraps both
`actionCreateAppointment_` and `actionRescheduleAppointment_`, not just documented as doing so.
Grepped for hardcoded secrets and confirmed no `.env` file exists in the repo (only
`.env.example` with blank values). **No credential-independent gap was found; no code changes
were required.** Added `CLAUDE.md` as a concise durable checkpoint for future sessions (see that
file for the commit-per-phase table and current invariants) — it did not exist before this audit.
