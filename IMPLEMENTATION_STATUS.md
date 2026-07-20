# IMPLEMENTATION_STATUS.md

Living status file for the Esquece Barber Studio build. Updated at the end of every phase.
If a session ends mid-work, a new session should read this file first — it is written to be
resumable without re-deriving context from the conversation.

## Architecture (current, authoritative)

```
Public website / Admin dashboard / WhatsApp webhook
                 ↓
        Next.js server application
                 ↓
   Central server-side CRM client (CrmClient interface)
                 ↓
        Google Apps Script Web API
                 ↓
             Google Sheets CRM
```

Google Sheets + Apps Script is the source of truth for business data, appointments,
availability, conversation state, and dedup — **not** PostgreSQL/Prisma. See
`ARCHITECTURE.md` for the full rationale and `MIGRATION_TO_POSTGRESQL.md` for the documented
future path if Sheets/Apps Script capacity is ever exceeded.

## Phase status

| Phase | Description | Status |
|---|---|---|
| A | Architecture migration (Prisma → Apps Script CRM) | DONE |
| B | Apps Script CRM foundation | NOT STARTED |
| C | Apps Script CRM domain (services/barbers/customers/etc.) | NOT STARTED |
| D | Apps Script booking engine (availability, locks, atomic create) | NOT STARTED |
| E | Next.js CRM integration (CrmClient, AppsScriptCrmClient, MockCrmClient) | NOT STARTED |
| F | Public website (full booking flow, management page) | NOT STARTED |
| G | Admin dashboard | NOT STARTED |
| H | WhatsApp infrastructure (webhook, Meta client, dedup) | NOT STARTED |
| I | Claude conversational agent | NOT STARTED |
| J | Notifications and Calendar sync | NOT STARTED |
| K | Production hardening | NOT STARTED |

## Completed tasks

- (Phase A) Inspected commit `66bee17` — confirmed clean working tree, matches expected state.
- (Phase A) Created this file.
- (Phase A) Removed Prisma/PostgreSQL: deleted `prisma/schema.prisma`, `src/lib/db/client.ts`,
  the `@prisma/client`/`prisma` package.json dependencies and their scripts
  (`prisma:format`/`prisma:validate`/`postinstall`), and the stray `prisma/generated/` gitignore
  entry. Ran `npm install` to sync `package-lock.json` (25 packages removed).
- (Phase A) Refactored `src/lib/booking-engine/types.ts` to define `AppointmentSource`/
  `AppointmentStatus` as local string-literal unions instead of importing Prisma's generated
  enums — the booking-engine module now has zero database imports. Updated a stray doc comment
  in `appointments.ts` that referenced `prisma.appointment.create`.
- (Phase A) Rewrote `ARCHITECTURE.md`, `BOOKING_RULES.md`, `WHATSAPP_AGENT_DESIGN.md`,
  `SECURITY.md`, `README.md`, `PROJECT_PLAN.md` to describe the Apps Script + Google Sheets CRM
  architecture (Next.js → CrmClient → Apps Script Web API → Sheets) as current and authoritative,
  with `LockService`-based concurrency replacing the Postgres `EXCLUDE` constraint and CRM
  request signing (HMAC + nonce + timestamp) replacing direct DB access.
- (Phase A) Wrote `MIGRATION_TO_POSTGRESQL.md` documenting (not scheduling) the future path back
  to Postgres, referencing the preserved Prisma schema in git history at commit `66bee17`.
- (Phase A) Rewrote `.env.example` to the master spec's variable list (`CRM_PROVIDER`,
  `AI_PROVIDER`, `WHATSAPP_PROVIDER`, Apps Script/CRM signing vars, admin env-based auth vars,
  WhatsApp template vars) — no `DATABASE_URL`.
- (Phase A) Quality gate: `npm run lint` clean, `npm run typecheck` clean (strict), `npm test`
  8/8 passed, `npm run build` succeeded (routes `/`, `/_not-found`, `/reservar` static). Secret
  grep clean. `git status` reviewed before commit.

## In-progress tasks

None — Phase A is complete as of this update. Phase B (Apps Script CRM foundation) has not been
started.

## Remaining tasks

Everything in Phases B–K — see the phase list in `PROJECT_PLAN.md` for the detailed breakdown
of each (this is a large, multi-session build; do not assume any phase after A is started
unless this table says otherwise). Phase B specifically starts with: `apps-script/` project
structure, `appsscript.json`, `Setup.gs`/`setupCRM()`, `Sheets.gs`, `Security.gs` (request
signing + stable JSON serializer — must match a Next.js-side implementation to be written in
Phase E), `Response.gs`, `Config.gs`, `Menu.gs`, `Health.gs`, `Seed.gs`, `Tests.gs`.

## Blockers

None credential-related yet — Phases B onward are credential-independent (mocks/local Apps
Script source) until Phase K's external configuration gate.

## Latest commit

Phase A committed and pushed — see the session's final report for the exact hash (this file is
updated in the same commit, so check `git log -1` in the repo for the authoritative value if
this line is ever stale).

## Tests last executed

Post-Phase-A (this session): `npm run lint` clean, `npm run typecheck` clean, `npm test` → 2
files, 8/8 tests passed, `npm run build` succeeded. No Prisma commands run (removed). No Apps
Script tests yet — `Tests.gs`/`runAllInternalTests()` doesn't exist until Phase B.

## External configuration still required

Not yet reached — see `CLIENT_INFORMATION_REQUIRED.md` and (once written) the external
configuration checklist in the final report. Nothing in Phase A–K requires credentials; Apps
Script deployment, Meta setup, Anthropic key, and Render deployment are the actual external
gates, all deferred until the credential-independent implementation is complete.
