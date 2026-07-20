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
| C | Apps Script CRM domain (services/barbers/customers/etc.) | NOT STARTED |
| D | Apps Script booking engine (availability, locks, atomic create) | NOT STARTED |
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

## In-progress tasks

None — Phases A and B are complete as of this update. Phase C (Apps Script CRM domain) has not
been started.

## Remaining tasks

Everything in Phases C–K — see the phase list in `PROJECT_PLAN.md`. Phase C specifically starts
with: services/barbers/customers/working-hours/breaks/time-off/blocks/FAQs/promotions CRUD
actions registered onto the same `Router.gs` via `registerAction_`, extending `API_CONTRACT.md`'s
action table as each lands.

## Blockers

None credential-related yet — Phases C onward remain credential-independent (mocks/local Apps
Script source, verified the same way Phase B was) until Phase K's external configuration gate.
The one real external step still pending from Phase B specifically is an actual Apps Script
deployment to confirm this session's mock-based verification holds up in the real environment —
not a blocker to continuing Phase C, just an honestly-labeled gap (see `apps-script/README.md`).

## Latest commit

Phase B committed and pushed — see the session's final report for the exact hash (this file is
updated in the same commit as Phase B's code, so `git log -1` in the repo is the authoritative
source if this line is ever stale).

## Tests last executed

Post-Phase-B (this session): Next.js side unchanged and re-verified — `npm run lint` clean,
`npm run typecheck` clean, `npm test` → 2 files, 8/8 passed, `npm run build` succeeded. Apps
Script side: all `.gs` files pass `node --check` syntax validation; `Security.gs`,
`Response.gs`, `Router.gs`, `DateTime.gs`, `Sheets.gs`, `Setup.gs`, `Seed.gs` logic executed and
verified against mocked Apps Script globals (see the detailed bullet above) — not executed
inside a real Apps Script project.

## External configuration still required

Not yet reached — see `CLIENT_INFORMATION_REQUIRED.md` and (once written) the external
configuration checklist in the final report. Nothing in Phase A–K requires credentials; Apps
Script deployment, Meta setup, Anthropic key, and Render deployment are the actual external
gates, all deferred until the credential-independent implementation is complete.
