# APPS_SCRIPT_SETUP.md

Exact steps to deploy the Apps Script CRM (`apps-script/`) for the first time. No real values are
included here — fill them in yourself, and never commit them.

## 1. Create the Google Spreadsheet

Create a new, blank Google Sheet. This will be the CRM. Note its Spreadsheet ID (the long string
in its URL between `/d/` and `/edit`).

## 2. Open the bound Apps Script project

In the Sheet: **Extensions → Apps Script**. This opens an Apps Script project already bound to
this specific spreadsheet.

## 3. Add the source files

Either:

- **Manually**: for each file in `apps-script/*.gs`, create a matching script file (same name)
  in the Apps Script editor and paste its contents. Also replace the default `appsscript.json`
  manifest content (View → Show manifest file) with `apps-script/appsscript.json`'s content.
- **With `clasp`** (`npm i -g @google/clasp`, then `clasp login`): copy
  `apps-script/.clasp.json.example` to `apps-script/.clasp.json`, fill in the script ID from the
  Apps Script project's URL, then run `clasp push` from `apps-script/`.

## 4. Configure Script Properties

In the Apps Script editor: **Project Settings → Script Properties**. Add:

| Property | Value |
|---|---|
| `CRM_API_KEY` | A long random string — see "Generating secrets" below |
| `CRM_SIGNING_SECRET` | A separate long random string |
| `CRM_SPREADSHEET_ID` | The Spreadsheet ID from step 1 |
| `BUSINESS_TIMEZONE` | `America/La_Paz` |
| `GOOGLE_CALENDAR_ID` | (optional, only if enabling Calendar sync later) |
| `ENABLE_CALENDAR_SYNC` | `false` (or `true`, once configured) |
| `INTERNAL_NOTIFICATION_EMAIL` | An email for internal alerts (optional) |

**Never** put these values in spreadsheet cells, code, or documentation.

### Generating secrets

Any long, random, high-entropy string works. From a terminal:

```bash
openssl rand -hex 32
```

Run it twice — once for `CRM_API_KEY`, once for `CRM_SIGNING_SECRET`. Store both only in Script
Properties (here) and in the Next.js deployment's environment variables (`CRM_API_KEY`,
`CRM_SIGNING_SECRET`) — nowhere else.

## 5. Run `setupCRM()`

In the Apps Script editor, select the `setupCRM` function and click **Run**. The first run will
prompt for authorization — review and accept the permissions (it needs access to the bound
spreadsheet). This creates all CRM sheets with headers, frozen header rows, and default
`SETTINGS` values.

## 6. Verify the sheets

Go back to the spreadsheet — you should see all sheets listed in `CRM_SCHEMA.md`, each with a
header row.

## 7. Run internal tests

In the Apps Script editor, select `runAllInternalTests` and click **Run**. Check the execution
log (View → Logs) for the summary — all tests should pass. If any signing-related test fails,
double check `CRM_API_KEY`/`CRM_SIGNING_SECRET` are set (step 4).

## 8. Deploy as a Web App

**Deploy → New deployment**:

- Type: **Web app**.
- Execute as: **Me** (the project owner — matches `appsscript.json`'s `executeAs`).
- Who has access: **Anyone**. This does *not* mean anyone can use the CRM — every request must
  carry a valid signature (see `API_CONTRACT.md`); "Anyone" here only means Google doesn't
  additionally require the caller to be signed into a Google account, which the Next.js server
  isn't.

Click **Deploy**. Copy the Web App URL — it ends in `/exec`.

## 9. Use the `/exec` URL, never `/dev`

The `/dev` URL (shown during testing in the Apps Script editor) always runs the latest saved
code as the developer currently viewing it — it is not stable and not meant for production.
`/exec` runs the specific deployed version. Always use `/exec` for `CRM_APPS_SCRIPT_URL`.

## 10. Configure Next.js

Set in the Next.js deployment's environment (Render, or local `.env`):

```
CRM_PROVIDER=appscript
CRM_APPS_SCRIPT_URL=<the /exec URL from step 8>
CRM_API_KEY=<same value as Script Property, step 4>
CRM_SIGNING_SECRET=<same value as Script Property, step 4>
```

## 11. Run the CRM health check

Once Phase E's `AppsScriptCrmClient` exists, hit `/api/health/crm` on the Next.js deployment (or
run its equivalent local script) — it should report the Apps Script API reachable, authenticated,
and schema-version-compatible. Until Phase E ships, you can sanity-check the deployment directly
by sending a signed `health` request with any HTTP client, built per `API_CONTRACT.md`.

## Redeploying after a code change

**Deploy → Manage deployments → (pencil icon on the existing deployment) → Version: New version
→ Deploy.** This keeps the same `/exec` URL stable across code updates — creating a brand new
deployment instead would produce a different URL and require updating `CRM_APPS_SCRIPT_URL`
everywhere.
