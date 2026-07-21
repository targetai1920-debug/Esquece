# DEPLOYMENT.md

High-level deployment overview — the individual setup guides have the exact steps. This document
is the order of operations and the pre-deploy checklist.

## Order of operations

1. **`APPS_SCRIPT_SETUP.md`** — deploy the Google Apps Script CRM first. Everything else depends
   on having a real `CRM_APPS_SCRIPT_URL`/`CRM_API_KEY`/`CRM_SIGNING_SECRET`.
2. **`RENDER_SETUP.md`** — deploy this Next.js application, initially with
   `WHATSAPP_PROVIDER=mock`/`AI_PROVIDER=mock` if Meta/Anthropic credentials aren't ready yet. The
   public API, admin dashboard, and CRM connection are all independently useful at this point.
3. **`META_SETUP.md`** — connect the real WhatsApp Cloud API once ready. Requires step 2's live
   URL (for the webhook callback).
4. **`ANTHROPIC_SETUP.md`** — connect real Claude requests once ready.
5. Give the separate public website team this deployment's base URL and `WEBSITE_INTEGRATION.md`.
6. Configure the notification cron job (`RENDER_SETUP.md` §7).

Steps 3 and 4 can happen in either order, or be deferred — the application is fully functional
(bookable via the public API and admin dashboard, testable via `/dev/whatsapp-simulator`) with
both left as mocks. Never represent mocked functionality as live in front of the client until the
corresponding setup guide's step 8 (Meta) / step 4 (Anthropic) verification has actually been done.

## Pre-deploy checklist

Before pointing a deployment at real customer traffic:

- [ ] `CRM_PROVIDER=appscript` with real credentials (not `mock`, and
      `ALLOW_UNSAFE_MOCKS_IN_PRODUCTION` is **not** set)
- [ ] `AUTH_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` set to real, freshly-generated values —
      not anything used during development/testing
- [ ] `CRON_SECRET` set to a fresh random value
- [ ] `PUBLIC_WEBSITE_ORIGIN` set to the separate website's real domain (not a wildcard, not
      `localhost`)
- [ ] `NODE_ENV=production`
- [ ] `DEMO_MODE=false` once real business data (services/barbers/schedules) is loaded into the
      Sheet — see `CLIENT_INFORMATION_REQUIRED.md`
- [ ] The Apps Script CRM's `SETTINGS` sheet holds the real business hours/timezone/currency, not
      the demo defaults
- [ ] `/api/health` and `/api/health/crm` both report healthy against the real deployment
- [ ] Admin login works with the real credentials, and a plaintext password was never typed into
      a document, commit, or chat
- [ ] If WhatsApp is going live: `META_SETUP.md` fully completed, including approved templates
- [ ] If the Claude agent is going live: `ANTHROPIC_SETUP.md` fully completed, and a real
      conversation was manually tested end to end
- [ ] Notification cron job scheduled (`RENDER_SETUP.md` §7)

## Rollback

There is no database migration to roll back — all persistent state lives in the Google Sheet via
Apps Script, independent of the Next.js deployment's version. Rolling back the Next.js deployment
(Render's deploy history → redeploy a previous build) is safe on its own. Rolling back an Apps
Script *code* change requires redeploying a previous version from **Deploy → Manage deployments**
in the Apps Script editor (see `APPS_SCRIPT_SETUP.md`'s "Redeploying after a code change") — this
does not affect the Sheet's data, only the code that reads/writes it.

## What "deployed" does and doesn't mean here

Every phase of this build was verified as thoroughly as possible without live external
credentials: Apps Script logic executed against a faithful Node `vm` mock of the Apps Script
runtime (`apps-script/tests/run-tests.mjs`), and the full Next.js application driven end to end
against `CRM_PROVIDER=mock`/`AI_PROVIDER=mock`/`WHATSAPP_PROVIDER=mock` via real HTTP requests to
a real running dev server. That is real verification of this codebase's own logic — it is **not**
the same claim as "verified against a live Google Apps Script deployment," "verified against real
Meta WhatsApp traffic," or "verified against real Claude requests." Those three specific claims
can only become true once `APPS_SCRIPT_SETUP.md`, `META_SETUP.md`, and `ANTHROPIC_SETUP.md` are
each completed and manually confirmed — see `LIMITATIONS.md` for the current, honest status.
