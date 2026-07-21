# CLAUDE.md — durable operating context for this repository

Read this first if context was ever compacted. Full detail lives in the docs linked below —
this file is only the checkpoint needed to resume safely without re-deriving everything.

## What this is

Esquece Barber Studio booking platform. **Not** the public website — this repo is the secure
backend: a Next.js server app exposing (1) a public booking API for a *separately built* website,
(2) a WhatsApp booking agent (Meta Cloud API + Claude), and (3) an admin dashboard. All three are
thin interfaces over one shared `CrmClient` → one Google Apps Script Web API → one Google Sheet.
See `ARCHITECTURE.md` (esp. §10) and `WEBSITE_INTEGRATION.md`.

## Non-negotiable invariants (verified in code, not just docs)

- Google Sheets + Apps Script is the sole source of truth — not Postgres/Prisma (that was ripped
  out in Phase A; `MIGRATION_TO_POSTGRESQL.md` is only a documented future path, not current state).
- The separate public website never talks to Apps Script and never receives `CRM_API_KEY` /
  `CRM_SIGNING_SECRET` — it only calls this repo's `/api/public/*` routes.
- Every appointment write (`createAppointment`, `rescheduleAppointment`) runs inside
  `withScriptLock_` (`apps-script/Appointments.gs`, uses `LockService.getScriptLock()`), which
  re-validates the slot from scratch while holding the lock. This is the actual anti-double-
  booking guarantee — `getAvailability` is read-only and never authoritative.
- No channel ever announces a booking confirmed before the Apps Script call returns success.
- WhatsApp webhook: GET verify-token handshake, HMAC-SHA256 over the **raw** body (before JSON
  parsing) via `timingSafeEqual`, persistent dedup by `externalEventId` — see
  `src/app/api/whatsapp/webhook/route.ts`, `src/lib/whatsapp/signature.ts`.
- `HUMAN_HANDOFF` conversation state → bot goes completely silent (`replySent: false`, no state
  mutation) and stays silent until a human explicitly resolves it in `/admin/conversations` — no
  automatic reactivation exists anywhere in `src/lib/conversation/orchestrator.ts`.
- Claude (`AnthropicAiProvider`/`MockAiProvider`) never has write access to CRM or conversation
  state and cannot invent prices/services/barbers/availability — it only classifies intent; the
  orchestrator does all state transitions and CRM calls.
- Every external integration (CRM, WhatsApp, AI) is a provider interface with a real
  implementation and a mock (`MockCrmClient`, `MockWhatsAppProvider`, `MockAiProvider`), selected
  by `*_PROVIDER` env vars. Factories refuse `*_PROVIDER=mock` when `NODE_ENV=production` unless
  `ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true` is explicitly set (never do this for real traffic).

## Phase status (all credential-independent work: DONE)

Phases A–K are complete — implemented, tested (Vitest + the Apps Script `vm` harness), and
documented. Commits (all on `main`, all pushed — confirmed via `git log`/`FETCH_HEAD` on
2026-07-21):

| Phase | Commit | Subject |
|---|---|---|
| A | `1c18b00` | docs: adopt Apps Script CRM architecture |
| B | `491abf6` | feat: create Apps Script CRM foundation |
| C | `62c0b31` | feat: add CRM business data services |
| D | `3a9d894` | feat: implement CRM booking engine |
| E | `3cac1d5` | feat: connect application to Apps Script CRM |
| F | `c2afae7` | feat: add public booking API for separate website |
| G | `4505c2b` | feat: add Esquece administration dashboard |
| H | `2ef9ca6` | feat: add WhatsApp Cloud API infrastructure |
| I | `493a3bc` | feat: add shared CRM conversational booking agent |
| J | `1ad263e` | feat: add reminders and calendar synchronization |
| K | `a6029f6` | chore: prepare Esquece platform for deployment (latest, HEAD = `main`) |

Full narrative (bugs found/fixed per phase, exact test counts at the time) is in
`IMPLEMENTATION_STATUS.md` — do not re-derive it from memory, read that file.

## Re-verified fresh on 2026-07-21 (independent repo-based audit, not trusting prior chat memory)

- `git status`: clean. `main` local = `origin/main` = `a6029f6`.
- `npm run lint`: clean. `npm run typecheck`: clean.
- `npm test`: **88/88 passed, 10 files** (matches `TESTING.md`'s table; spot-checked
  `tests/cross-channel.test.ts` — 6 tests — and confirmed they drive the real route handlers /
  orchestrator against one shared `MockCrmClient`, not a reimplementation).
- `npm run test:apps-script`: **22/22 passed** (Node `vm` harness against mocked Apps Script
  runtime — see "What is NOT verified" below for what this does not prove).
- `npm run build`: succeeded, all `/api/public/*`, `/api/admin/*`, `/api/whatsapp/webhook`,
  `/api/cron/notifications`, `/api/health*` routes present.
- `npm audit`: 2 moderate advisories, both the same `postcss` issue vendored inside
  `next`'s own dependency tree (not a direct dependency, requires attacker-controlled CSS input
  this app never accepts) — documented, not a regression.
- No `.env` file present (only `.env.example` with blank values). No hardcoded secret patterns
  found in `src/`, `apps-script/`, or docs.
- No credential-independent gaps found. No code changes were required by this audit.

## What is NOT verified (still mocked / still pending)

- No live Google Apps Script deployment, no real Meta WhatsApp traffic, no real Anthropic API
  calls, no real Google Calendar — everything above was verified against faithful mocks/a `vm`
  harness, not the real external systems. See `LIMITATIONS.md` (kept current) for the complete,
  itemized list — update that file, not this one, when a mock is replaced with the real thing.
- External credentials still required to go further: Google Spreadsheet + deployed Apps Script
  Web App URL/API key/signing secret (`APPS_SCRIPT_SETUP.md`), a Render deployment
  (`RENDER_SETUP.md`), the separate website's real origin, Meta WhatsApp credentials + approved
  message templates (`META_SETUP.md`), an Anthropic API key (`ANTHROPIC_SETUP.md`).
- Official Esquece business data still required (real services/prices/barbers/schedules/address/
  policies/photos) — see `CLIENT_INFORMATION_REQUIRED.md`. Demo data is flagged
  `DEMO_DATA_REPLACE_BEFORE_PRODUCTION` and removable via `removeDemoData()`.

## Exact next action

Deploy `apps-script/*.gs` to a real Google Apps Script project bound to a real Google Sheet
(`APPS_SCRIPT_SETUP.md`), then follow `DEPLOYMENT.md`'s order of operations. Nothing
credential-independent remains to build.

## Where to look for more

`docs entry point`: `README.md`. Architecture: `ARCHITECTURE.md`. Business rules:
`BOOKING_RULES.md`. Security model: `SECURITY.md`. Testing discipline: `TESTING.md`. Day-2 ops:
`OPERATIONS.md`. Setup guides: `APPS_SCRIPT_SETUP.md`, `RENDER_SETUP.md`, `META_SETUP.md`,
`ANTHROPIC_SETUP.md`. Website contract: `WEBSITE_INTEGRATION.md` / `openapi.yaml`.

Never store real secret values in this file or any other document in this repo.
