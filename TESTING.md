# TESTING.md

How to run and understand this project's automated tests, and the verification discipline used
throughout the build (see `IMPLEMENTATION_STATUS.md` for the phase-by-phase record of what was
actually run and what it found).

## Running everything

```bash
npm run lint          # ESLint — must be clean
npm run typecheck     # tsc --noEmit, strict mode — must be clean
npm test              # Vitest — the Next.js suite
npm run test:apps-script  # Node vm harness running the real Apps Script logic
npm run build          # Production build — must succeed
```

All five are run at the end of every phase (`IMPLEMENTATION_STATUS.md` records the exact pass
counts each time) and again before any release.

## The Next.js test suite (`npm test`, `tests/*.test.ts`)

| File | Covers |
|---|---|
| `phone.test.ts` | `normalizeWaId` phone normalization |
| `crm-signing.test.ts` | The 3 shared HMAC signing test vectors (must match `apps-script/Security.gs` byte-for-byte), plus edge cases |
| `mock-crm-client.test.ts` | `MockCrmClient`'s booking rules — weekday/weekend, exact-closing-time boundary, double-booking prevention, idempotent retry, any-barber tie-break, cancellation/reschedule, conversation versioning, human handoff, webhook dedup, admin CRUD |
| `public-api.test.ts` | The real `/api/public/*` route handlers — full booking lifecycle, CORS, origin enforcement, rate limiting, request-size limits |
| `admin-api.test.ts` | The real `/api/admin/*` route handlers — session gating, CSRF origin check, a full service create/update flow |
| `whatsapp-providers.test.ts` | HMAC/verify-token signature checks, `MockWhatsAppProvider` |
| `whatsapp-webhook.test.ts` | The real webhook route — GET handshake, signature verification, dedup, payload classification |
| `conversation-orchestrator.test.ts` | The real conversation orchestrator — booking, `SLOT_UNAVAILABLE` recovery, cancel, reschedule, human handoff, session expiry |
| `notifications-processor.test.ts` | The real cron notification processor — 24h window, templates, stale-appointment skipping, retry backoff |
| `cross-channel.test.ts` | Proves the website API, WhatsApp agent, and admin dashboard genuinely share one CRM — see below |

**Pattern used throughout**: tests call the actual exported route handler functions (the same
functions Next.js itself invokes for a real HTTP request) or the actual orchestrator/processor
functions — never a reimplementation of their logic. A test failing here means the real code path
is wrong, not a test double drifting from reality.

## The Apps Script test suite (`npm run test:apps-script`)

There is no live Google Apps Script deployment available in this development environment, so Apps
Script logic can't be "unit tested" through Google's own infrastructure. Instead,
`apps-script/tests/run-tests.mjs`:

1. Concatenates every `apps-script/*.gs` file into one script — Apps Script itself concatenates a
   project's files into one global scope at runtime (with function *declarations* hoisted
   project-wide regardless of file order, but top-level *statements* executing in file order),
   so loading files separately would not faithfully reproduce that behavior.
2. Runs the concatenated script inside a Node `vm` context against hand-built mocks of
   `SpreadsheetApp`, `PropertiesService`, `Utilities` (including a *real*, not stubbed,
   `formatDate`/`computeDigest`/`base64EncodeWebSafe` implementation — a stubbed `formatDate` was
   tried once and produced a silently-corrupted local date string), `CacheService`, `LockService`
   (tracking held/released state to catch a leaked lock), `ContentService`, `Logger`, `Session`,
   and `CalendarApp`.
3. Calls `setupCRM()` then `runAllInternalTests()` — the exact same function a human would run
   from the Apps Script editor (`apps-script/Tests.gs`'s `INTERNAL_TESTS_` array) — and reports
   the summary.

This has caught real bugs, not just plausible-looking code — see `IMPLEMENTATION_STATUS.md` for
the specific list (a `Dashboard.gs` typo, a `Router.gs` cross-file ordering hazard, a
`MockCrmClient` encapsulation bug, a `MockCrmClient` management-token gap, and — this repo's most
recent example — Calendar sync's `updateRowById_` return-value bug).

**What this is not**: proof that the code behaves identically inside a real Google Apps Script
project, which has its own quota, permission, and parsing quirks a mock can't reproduce. See
`apps-script/README.md` and `LIMITATIONS.md`.

## Cross-channel tests specifically

`tests/cross-channel.test.ts` is the automated proof of this project's central architectural
claim: the separate public website, the WhatsApp agent, and the admin dashboard are not three
independent booking systems that happen to look similar — they are one shared `CrmClient` calling
one Apps Script API backed by one Google Sheet. It drives the real public API route handlers, the
real admin API route handlers, and the real conversation orchestrator against a single shared
`MockCrmClient` instance within one test, and proves:

- A booking made through the website API is immediately unavailable to WhatsApp.
- A booking made through WhatsApp is immediately unavailable to the website API.
- Two channels racing for the identical slot: exactly one booking survives, the loser gets
  `SLOT_UNAVAILABLE` (or, for the WhatsApp conversation, a graceful re-offer of other times).
- An admin-created blocked slot is rejected identically whether the request came from the website
  API, the WhatsApp flow, or a direct API call.
- A cancellation made through the admin dashboard releases the slot for the website API.
- A service duration change made through the admin dashboard changes the *exact same* availability
  results for both the website API and the WhatsApp agent — never two independently-drifting
  duration rules.

## Manual/live verification

Beyond the automated suites, every phase's `IMPLEMENTATION_STATUS.md` entry records a live
dev-server (`npm run dev`) walkthrough via `curl` (or the browser for UI phases) — real HTTP
requests against a real running Next.js process, not just Vitest's in-process route-handler
calls. This is what actually caught the `.env`-file `$`-expansion bug that corrupted
`ADMIN_PASSWORD_HASH` in local development (documented in `.env.example` and Phase G's entry).

## What has *not* been tested against a live external system

- No real Google Apps Script deployment (`apps-script/README.md`).
- No real Meta WhatsApp Cloud API traffic (`META_SETUP.md`).
- No real Anthropic Claude API requests (`ANTHROPIC_SETUP.md`).
- No real Google Calendar (the Calendar sync tests use an in-memory `CalendarApp` mock).

See `LIMITATIONS.md` for the complete, current list.
