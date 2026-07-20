# apps-script/

Google Apps Script source for the Esquece CRM API. See `../CRM_APPS_SCRIPT.md` for what each
file does, `../CRM_SCHEMA.md` for the sheet schema, `../API_CONTRACT.md` for the request/
response contract, and `../APPS_SCRIPT_SETUP.md` for exact deployment steps.

## Status (Phases B–C)

Implemented: project structure, sheet setup (`setupCRM()`), custom spreadsheet menu, request
signing (`Security.gs`), standard response envelope, system actions
(health/version/validate-structure), demo seed/remove, CRM domain reads (settings, services,
barbers, barber-service eligibility, customers with phone-deduped upsert, FAQs, promotions), and
an internal test runner covering all of that.

Not yet implemented: the booking engine (availability computation, `LockService`-based atomic
appointment creation, cancellation, reschedule — Phase D), conversation/webhook-dedup/handoff
persistence actions (Phase D, consumed by Phase H/I), notifications and Calendar sync
(Phase J). See `API_CONTRACT.md`'s action table for exactly which actions exist right now.

**Not deployed.** This source has not been pushed to a live Apps Script project or executed
against a real Google Sheet — see `IMPLEMENTATION_STATUS.md` for what's verified vs. pending
deployment.

## Local development note

Apps Script has no local test runner — `.gs` files only execute inside the Apps Script
environment. There is nothing to `npm test` here; correctness is reviewed by reading the source
and, once deployed, by running `runAllInternalTests()` from the Apps Script editor or the
"Ejecutar pruebas internas" spreadsheet menu item.

## Deploying

Either:
- Copy each `.gs` file's contents into a new Apps Script project bound to the CRM spreadsheet
  (Extensions → Apps Script), or
- Use `clasp` (`npm i -g @google/clasp`): copy `.clasp.json.example` to `.clasp.json`, fill in
  your script ID, then `clasp push` from this directory.

Full steps: `../APPS_SCRIPT_SETUP.md`.
