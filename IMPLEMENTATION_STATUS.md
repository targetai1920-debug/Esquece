# IMPLEMENTATION_STATUS.md

Living status file for the Esquece Barber Studio build. Updated at the end of every phase.
If a session ends mid-work, a new session should read this file first — it is written to be
resumable without re-deriving context from the conversation.

## Architecture (current, authoritative)

```
Public website / Admin dashboard / WhatsApp webhook
                 ↓
        Next.js server application
                 ↓
   Central server-side CRM client (CrmClient interface)
                 ↓
        Google Apps Script Web API
                 ↓
             Google Sheets CRM
```

Google Sheets + Apps Script is the source of truth for business data, appointments,
availability, conversation state, and dedup — **not** PostgreSQL/Prisma. See
`ARCHITECTURE.md` for the full rationale and `MIGRATION_TO_POSTGRESQL.md` for the documented
future path if Sheets/Apps Script capacity is ever exceeded.

## Phase status

| Phase | Description | Status |
|---|---|---|
| A | Architecture migration (Prisma → Apps Script CRM) | DONE |
| B | Apps Script CRM foundation | DONE |
| C | Apps Script CRM domain (services/barbers/customers/etc.) | DONE |
| D | Apps Script booking engine (availability, locks, atomic create) | DONE |
| E | Next.js CRM integration (CrmClient, AppsScriptCrmClient, MockCrmClient) | NOT STARTED |
| F | Public website (full booking flow, management page) | NOT STARTED |
| G | Admin dashboard | NOT STARTED |
| H | WhatsApp infrastructure (webhook, Meta client, dedup) | NOT STARTED |
| I | Claude conversational agent | NOT STARTED |
| J | Notifications and Calendar sync | NOT STARTED |
| K | Production hardening | NOT STARTED |

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

## In-progress tasks

None — Phases A, B, C, and D are complete as of this update. Phase E (Next.js CRM integration)
has not been started.

## Remaining tasks

Everything in Phases E–K — see the phase list in `PROJECT_PLAN.md`. Phase E specifically starts
with: the `CrmClient` TypeScript interface, `lib/crm/signing.ts` (must match `Security.gs`
byte-for-byte — verify against `API_CONTRACT.md`'s three shared test vectors before trusting
it), `AppsScriptCrmClient`, and `MockCrmClient` (same business rules as the real Apps Script
engine, so the whole booking flow is demonstrable with `CRM_PROVIDER=mock` and zero external
credentials). Conversation/webhook-dedup/handoff Apps Script actions remain deliberately
deferred to Phase H, per the note added to `API_CONTRACT.md` in this update.

## Blockers

None credential-related yet — Phases E onward remain credential-independent until Phase K's
external configuration gate. The one real external step still pending since Phase B is an actual
Apps Script deployment to confirm this session's mock-based verification holds up in the real
environment — not a blocker to continuing, just an honestly-labeled gap (see
`apps-script/README.md`). This matters more starting now than it did for B/C: Phase D's
concurrency guarantee specifically relies on `LockService` behaving as documented, which no
amount of single-threaded Node mocking can fully prove — flagging this explicitly rather than
letting it quietly ride along as "already covered."

## Latest commit

Phase D committed and pushed — see the session's final report for the exact hash (this file is
updated in the same commit as Phase D's code, so `git log -1` in the repo is the authoritative
source if this line is ever stale).

## Tests last executed

Post-Phase-D (this session): Next.js side unchanged and re-verified — `npm run lint` clean,
`npm run typecheck` clean, `npm test` → 2 files, 8/8 passed, `npm run build` succeeded. Apps
Script side: all `.gs` files pass `node --check`; the full booking engine plus everything from
Phases B/C was executed against mocked Apps Script globals (now including `LockService`), and
`runAllInternalTests()` was invoked end-to-end through that harness, reporting **17/17 passed**,
including the double-booking race test by name. None of this was executed inside a real Apps
Script project — see the detailed bullet above for exactly what is and isn't proven by that.

## External configuration still required

Not yet reached — see `CLIENT_INFORMATION_REQUIRED.md` and (once written) the external
configuration checklist in the final report. Nothing in Phase A–K requires credentials; Apps
Script deployment, Meta setup, Anthropic key, and Render deployment are the actual external
gates, all deferred until the credential-independent implementation is complete.
