# FIRST_RUN.md

Step-by-step first-time deployment of the Esquece CRM to a real Google Sheet, for someone doing
this by hand in the Apps Script editor (no `clasp`, no command line required). Follow in order.

## 1. Create a blank Google Sheet

Go to sheets.google.com → Blank spreadsheet. Name it something recognizable, e.g.
"Esquece Barber Studio — CRM". Do not add any tabs, columns, or data yourself — `setupCRM()`
(step 7) creates everything the system needs.

## 2. Open Extensions → Apps Script

From the open Sheet: Extensions menu → Apps Script. This opens a bound Apps Script project — one
that already knows which Sheet it belongs to.

## 3. Create each file with the exact name

In the Apps Script editor's left sidebar, click the `+` next to "Files" → Script, for each of the
31 filenames listed in `COPY_ORDER.md`. Delete the default starter file (usually named `Code.gs`)
once you're done — it should not remain in the project.

## 4. Paste each matching file

For each file you created, open the matching `.gs` file in this `manual-apps-script-export/`
folder, select all its contents, and paste it into the corresponding Apps Script file — replacing
any placeholder content the editor put there. Every file in this export is an exact, unmodified
copy of this repository's `apps-script/` directory; do not edit or "clean up" anything while
pasting.

## 5. Replace the manifest

Click the gear icon (Project Settings) and check "Show `appsscript.json` manifest file in
editor". An `appsscript.json` file now appears in the file list. Open it and replace its entire
contents with this export's `appsscript.json`.

## 6. Add Script Properties

Still in Project Settings, scroll to "Script Properties" and add each property name listed in
`SCRIPT_PROPERTIES.md`, with your own real values (generate fresh random strings for
`CRM_API_KEY`/`CRM_SIGNING_SECRET` — don't reuse anything from development/testing). Leave the
optional ones out if you don't need them yet.

## 7. Run `setupCRM()`

In the Apps Script editor's toolbar, select the function `setupCRM` from the function dropdown
(next to the Run button), then click Run. The first run will prompt you to authorize the script
(it needs permission to edit the Sheet, and Calendar permission if you plan to enable Calendar
sync later) — review and accept. This creates all the CRM's sheets/tabs with the correct headers.
It's safe to run more than once — it won't duplicate anything or overwrite a value you've already
set by hand.

## 8. Run the internal tests — as five batches, not `runAllInternalTests()`

**Do not run `runAllInternalTests()` against this real deployment.** It runs all ~32 internal
tests in one execution, which is slow enough against real Google Sheets (not the fast in-memory
mock this project's automated test suite uses) that it exceeds Apps Script's own ~6-minute
execution limit and fails with "Exceeded maximum execution time" before ever printing a summary.
That function still exists in `Tests.gs`, but only for this project's local Node test harness
(`npm run test:apps-script`), which has no such time limit.

**If you've ever run `runAllInternalTests()` against this deployment before (or a batch was ever
killed by a timeout mid-test), run `resetInternalTestEnvironment()` first.** A timeout can kill an
execution before a test's own `finally` cleanup runs, which can leave temporary test rows behind
or (in older versions of this test suite) a leftover Calendar test configuration. This function is
always safe to run — it only removes rows matching this test suite's own well-known test markers
and only resets Calendar Script Properties if they currently hold one of this suite's own test
sentinel values, never a real business Calendar id — and does nothing if there's nothing to clean
up. Check the execution log afterward for a `{removedTestRows, removedTestServices,
resetCalendarProperties}` summary.

Then run these five functions from the same dropdown, **in this order**, waiting for each to
finish before starting the next:

1. `runInternalTestsCore()`
2. `runInternalTestsSheets()`
3. `runInternalTestsBooking()`
4. `runInternalTestsConversations()`
5. `runInternalTestsIntegrations()`

Each one finishes comfortably under the execution limit on its own. After each run, check the
execution log (View → Logs, or Ctrl+Enter) — it prints a `[TEST START]`/`[TEST END]` line (with
duration) for every test in that batch, then one `[BATCH ...]` line with that batch's own
`{total, passed, failed}`. All five batches together cover every internal test — nothing is
skipped by splitting them up.

Once all five have run, call **`logInternalTestSummary()`** (not `showInternalTestSummary()`) for
the combined result across all five batches: it logs and returns `{total, passed, failed,
skipped}` — `skipped` means a batch hasn't been run yet (or was cleared), not a hidden failure.
`showInternalTestSummary()` also exists, but only for the "Esquece CRM" spreadsheet menu's
"Pruebas internas: ver resumen" item — it shows a UI alert dialog, which only has somewhere to
appear when triggered from the spreadsheet's own menu. Calling it from the Apps Script editor's
Run button instead has no dialog to show it in and can sit waiting until the execution times out
— use `logInternalTestSummary()` from the editor every time. If you ever want to start over
cleanly (e.g. before a final pre-deployment check), call `clearInternalTestSummary()` first, then
re-run the five batches in order again — it never keeps a stale result from a previous run mixed
in with a fresh one.

Every test creates and cleans up its own temporary rows in a `finally` block, even if it fails —
they never leave anything behind or touch real data, and none of them write real, persistent
Script Properties for Calendar configuration (Calendar-related tests use an in-memory-only
override that's automatically gone the moment the execution ends, timeout or not — see
`Calendar.gs`'s `CALENDAR_SYNC_ENABLED_OVERRIDE_FOR_TESTS_`/`CALENDAR_ID_OVERRIDE_FOR_TESTS_`). If
anything fails, do not proceed to deployment — fix the underlying issue first (see this
repository's `apps-script/README.md` and `TESTING.md`).

## 9. Deploy as Web App

Click Deploy → New deployment. Click the gear icon next to "Select type" and choose "Web app".
Set:
- Execute as: **Me** (the account deploying)
- Who has access: **Anyone**

Click Deploy, and authorize again if prompted.

## 10. Copy the `/exec` URL

After deploying, copy the Web app URL shown (it ends in `/exec`). This is the
`CRM_APPS_SCRIPT_URL` value the Next.js backend needs, alongside the same `CRM_API_KEY` and
`CRM_SIGNING_SECRET` values you set in step 6 — see this repository's `APPS_SCRIPT_SETUP.md` for
where those go on the Next.js/Render side.

## If you ever change the code later

Redeploying after editing a file requires Deploy → Manage deployments → edit (pencil icon) →
select "New version" → Deploy, so the live `/exec` URL picks up the change — just saving a file in
the editor does not update an already-deployed Web App. See `APPS_SCRIPT_SETUP.md`'s "Redeploying
after a code change" section in the main repository.
