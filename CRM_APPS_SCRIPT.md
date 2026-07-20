# CRM_APPS_SCRIPT.md — Apps Script project overview

What each file in `apps-script/` does. See `CRM_SCHEMA.md` for the sheet schema and
`API_CONTRACT.md` for the request contract.

| File | Responsibility |
|---|---|
| `appsscript.json` | Manifest: timezone, V8 runtime, Web App execution settings. |
| `.clasp.json.example` | Template for local `clasp` deployment config (copy to `.clasp.json`, fill in your script ID — never commit the real one). |
| `.claspignore` | Limits `clasp push` to the actual source files. |
| `Api.gs` | `doGet`/`doPost` Web App entry points. `doGet` is unauthenticated and returns no business data; `doPost` verifies the signed envelope and dispatches via `Router.gs`. |
| `Router.gs` | `ACTION_HANDLERS_` dispatch table + `registerAction_`/`routeAction_`. The only place an action name maps to a handler function — never dynamically resolved. |
| `Security.gs` | Stable JSON serialization, canonical string construction, HMAC-SHA256 signing/verification, nonce/timestamp checks. Must match the Next.js-side implementation byte-for-byte — see `API_CONTRACT.md`'s shared test vectors. |
| `Response.gs` | Standard success/error JSON envelope builders. |
| `Errors.gs` | `ERROR_CODES` constants and the `ApiError` exception type every handler throws instead of a raw error. |
| `Config.gs` | Script Properties access (`CRM_API_KEY`, `CRM_SIGNING_SECRET`, `CRM_SPREADSHEET_ID`, `BUSINESS_TIMEZONE`, Calendar settings). |
| `Sheets.gs` | Sheet name/header constants and generic batch read/write helpers (`sheetToObjects_`, `appendRowFromObject_`, `updateRowFromObject_`, `getOrCreateSheet_`). |
| `Setup.gs` | `setupCRM()` (idempotent sheet/setting creation), `validateCrmStructure()`, `showCrmVersion()`, default `SETTINGS` rows. |
| `Menu.gs` | `onOpen()` custom "Esquece CRM" spreadsheet menu. |
| `Dashboard.gs` | Generates the read-only `DASHBOARD` summary sheet from live data. |
| `Health.gs` | `health`/`getApiVersion`/`validateCrmStructure` action handlers (system, no business data). |
| `Seed.gs` | `seedDemoData()`/`removeDemoData()` — clearly-marked, reversible demo rows for services/barbers/barber-services/working-hours. |
| `DateTime.gs` | Local-date/time validation, weekday calculation, minute-interval math, overlap check, UTC↔local conversion, Spanish date formatting. All business-timezone-aware — no browser-locale or server-default-timezone assumptions. |
| `Ids.gs` | UUID/reference/nonce generation, management-token generation and hashing. |
| `Tests.gs` | `runAllInternalTests()` — non-destructive tests for setup idempotency, request signing, and system actions (this phase's scope; booking-rule tests land in Phase D alongside the code they test). |

## Not yet present (later phases)

- `Validation.gs`, `Repositories.gs`, `Settings.gs`, `Services.gs`, `Barbers.gs`,
  `Customers.gs` — CRM domain (Phase C).
- `Availability.gs`, `Appointments.gs` — booking engine, locking, atomic creation (Phase D).
- `Conversations.gs`, `Messages.gs`, `Handoffs.gs` — conversation/handoff persistence actions
  (Phase D, consumed by Phase H/I).
- `Notifications.gs`, `CalendarSync.gs` — Phase J.
- `AuditLog.gs` — audit-entry actions (introduced alongside whichever Phase C/D action first
  needs to write one).

This list is illustrative, not a binding file-naming contract — if a later phase finds a
different split clearer (e.g. merging two small files), that's fine as long as no single file
becomes unmanageably large and this table is updated to match.
