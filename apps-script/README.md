# apps-script/

Google Apps Script source for the Esquece CRM API. See `../CRM_APPS_SCRIPT.md` for what each
file does, `../CRM_SCHEMA.md` for the sheet schema, `../API_CONTRACT.md` for the request/
response contract, and `../APPS_SCRIPT_SETUP.md` for exact deployment steps.

## Status (Phase B)

Implemented: project structure, sheet setup (`setupCRM()`), custom spreadsheet menu, request
signing (`Security.gs`), standard response envelope, health/version/validate-structure actions,
demo seed/remove, internal test runner covering this phase's scope (setup idempotency, request
signing, health).

Not yet implemented: the actual CRM domain (services/barbers/customers/etc. — Phase C) and
booking engine (availability/locks/atomic create — Phase D) beyond the sheet schema already
defined in `Sheets.gs`. `ACTION_HANDLERS_` in `Router.gs` currently only has `health`,
`getApiVersion`, and `validateCrmStructure` — everything else in the master spec's action list
is added by later phases via `registerAction_`.

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
