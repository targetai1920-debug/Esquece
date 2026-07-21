# LIMITATIONS.md

An honest, current list of what this system does not do, has not been verified against, or does
only in a simplified form. Kept up to date alongside `IMPLEMENTATION_STATUS.md` — if something
here is fixed, remove it from here in the same commit.

## Not verified against a live external system

- **No live Google Apps Script deployment.** Every `.gs` file's logic has been executed inside a
  Node `vm` mock of the Apps Script runtime (`apps-script/tests/run-tests.mjs`,
  `TESTING.md`), which has caught several real bugs — but a real Google Apps Script project has
  its own quota, permission, and parsing behavior no mock fully reproduces. See
  `APPS_SCRIPT_SETUP.md` to close this gap.
- **No real Meta WhatsApp Cloud API traffic.** The webhook's signature verification, dedup, and
  the full conversation orchestrator have been tested with synthetic (but correctly HMAC-signed)
  requests against `MockCrmClient`/`MockWhatsAppProvider`. See `META_SETUP.md`.
- **No real Anthropic Claude requests.** `AnthropicAiProvider` has been code-reviewed and
  typechecked but never actually called — every conversation test uses `MockAiProvider`'s
  deterministic keyword matching. See `ANTHROPIC_SETUP.md`.
- **No real Google Calendar.** Calendar sync (`apps-script/Calendar.gs`) has been tested against
  an in-memory `CalendarApp` mock added to the verification harness, not a real Google Calendar.

Until each of these is completed, do not describe the corresponding functionality to a client as
"live" or "production-tested" — only as "implemented and verified with mocks."

## Simplified by design (documented trade-offs, not bugs)

- **`REVIEWING_BOOKING` conversation state**: legal in the type/transition table, but the
  orchestrator moves directly from name-collection to `AWAITING_CONFIRMATION` in the same turn
  rather than persisting it as a separate resting step.
- **"Which appointment?" selection** (cancel/reschedule with multiple changeable appointments)
  uses a plain numbered text list + a numeric reply, not a WhatsApp interactive list message.
  `WhatsAppProvider.sendInteractiveList` exists and works (tested in
  `tests/whatsapp-providers.test.ts`) but isn't wired into this specific step yet.
- **Calendar sync failure retry**: a failure queues a `CALENDAR_SYNC_FAILURE` notification
  (visible in `/admin/notifications`) rather than an automatic background retry loop — proportionate
  to a best-effort, off-by-default feature, but it does mean a transient Calendar outage requires
  a human to notice and manually re-trigger (there is no "retry calendar sync" button yet).
- **Notification retry policy** gives up permanently after 5 attempts (exponential backoff:
  5/15/30/60/120 minutes) — a WhatsApp outage longer than roughly 3.5 hours means that specific
  notification is never retried automatically; it's visible as `FAILED` in `/admin/notifications`
  but there is no "retry" button there yet either.
- **Business-wide settings** (opening/closing time, timezone, currency, slot interval, min notice,
  max advance window, buffer, session timeout) are only editable by opening the `SETTINGS` sheet
  tab directly — there is no admin-dashboard screen for them, only for services/barbers/schedules/
  breaks/time-off/blocked-slots. Read-only, safe display exists at `/admin/config`.
- **Single admin account** — `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` is one set of credentials, not a
  multi-user/role system (documented as an explicit MVP choice in `SECURITY.md`/`ARCHITECTURE.md`
  from the start of this build, not a gap introduced late).

## Explicitly out of scope for this build

Payments/deposits, loyalty programs, commissions, marketing campaigns, automated review requests,
waitlists, and advanced analytics — per the original project brief and reaffirmed in
`PROJECT_PLAN.md`.

## Infrastructure/scale

- **Rate limiting is in-memory, not multi-instance-safe** (`lib/http/rateLimit.ts`, documented
  there and in `SECURITY.md`). Fine for a single Render Web Service instance; would need a shared
  store (e.g. Redis) if ever run horizontally scaled.
- **No load testing has been performed.** All performance-adjacent claims in this codebase are
  about correctness (no double-booking under concurrent requests — proven in
  `tests/mock-crm-client.test.ts`/`apps-script` tests/`tests/cross-channel.test.ts`), not
  throughput or latency under real production load.
- **`npm audit` reports one moderate-severity advisory** in `postcss`, vendored inside Next.js's
  own dependency tree (`node_modules/next/node_modules/postcss`), not a direct dependency of this
  project. The only available automatic fix (`npm audit fix --force`) downgrades Next.js to
  `9.3.3` — a large breaking regression far riskier than the advisory itself (which requires
  attacker-controlled CSS input to a CSS stringifier; this application never accepts arbitrary CSS
  from a user). Left unfixed pending an upstream Next.js patch; re-run `npm audit` periodically.

## Data

- **Demo data is still present** in the seeded services/barbers (`demo: true`-flagged,
  `DEMO_DATA_REPLACE_BEFORE_PRODUCTION` placeholders) until the client's real business data is
  supplied — see `CLIENT_INFORMATION_REQUIRED.md`. `removeDemoData()` in Apps Script removes it
  cleanly once real rows exist.
- **No official WhatsApp message templates exist yet** — `META_SETUP.md` §7 covers creating and
  getting them approved; until then, any notification outside the 24-hour window fails safely
  with `TEMPLATE_REQUIRED` rather than sending free-form or silently dropping.
