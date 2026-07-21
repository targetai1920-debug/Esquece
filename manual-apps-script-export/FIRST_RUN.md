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

## 8. Run `runAllInternalTests()`

Select `runAllInternalTests` from the same dropdown and Run it. Check the execution log (View →
Logs, or Ctrl+Enter) for the summary — it should report every internal test passing. These tests
create and clean up their own temporary rows; they don't leave anything behind or touch real data.
If anything fails, do not proceed to deployment — fix the underlying issue first (see this
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
