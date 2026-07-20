# Esquece Barber Studio — Booking Platform

Booking-and-availability platform for **Esquece Barber Studio** (Cochabamba, Bolivia), built by
TargetAI. One shared booking engine, three interfaces: public website, WhatsApp agent, admin
dashboard — all backed by a Google Sheets CRM reached through Google Apps Script. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design and
[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for current build status.

## Stack

Next.js (TypeScript, App Router) · Google Apps Script + Google Sheets (CRM) · Tailwind CSS ·
Zod · WhatsApp Cloud API · Anthropic Claude API.

## Status

See [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for the authoritative, per-phase
status — it's updated at the end of every phase and is more current than this paragraph.

## Local setup

```bash
npm install
cp .env.example .env      # fill in local values; never commit .env
npm run dev
```

No database to provision locally: with `CRM_PROVIDER=mock` (the `.env.example` default), the
app runs entirely against an in-memory mock CRM that enforces the same business rules as the
real Apps Script backend (`ARCHITECTURE.md` §2, `MockCrmClient`) — the full booking flow is
demonstrable with zero external credentials. Switch to `CRM_PROVIDER=appscript` once a real
Apps Script deployment exists (see `APPS_SCRIPT_SETUP.md`).

## Scripts

- `npm run dev` — start the Next.js dev server.
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npm run typecheck` — `tsc --noEmit` (strict mode).
- `npm test` — Vitest.

## Project docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design: Next.js → CRM client → Apps Script →
  Sheets, booking engine, WhatsApp agent design at the architecture level.
- [`BOOKING_RULES.md`](./BOOKING_RULES.md) — the concrete availability/booking rules the engine
  implements.
- [`WHATSAPP_AGENT_DESIGN.md`](./WHATSAPP_AGENT_DESIGN.md) — webhook, dedup, conversation state
  machine, human handoff, at implementation level.
- [`SECURITY.md`](./SECURITY.md) — security requirements and how they're enforced, including CRM
  request signing.
- [`MIGRATION_TO_POSTGRESQL.md`](./MIGRATION_TO_POSTGRESQL.md) — documented (not scheduled)
  future path if Sheets/Apps Script capacity is ever exceeded.
- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — phased plan.
- [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) — current, living build status.
- [`CLIENT_INFORMATION_REQUIRED.md`](./CLIENT_INFORMATION_REQUIRED.md) — real business data
  still needed from the client; everything else in the codebase is demo data, clearly marked
  `DEMO_DATA_REPLACE_BEFORE_PRODUCTION`.
- [`CRM_APPS_SCRIPT.md`](./CRM_APPS_SCRIPT.md) — what each `apps-script/*.gs` file does.
- [`CRM_SCHEMA.md`](./CRM_SCHEMA.md) — full column-level Google Sheets schema.
- [`API_CONTRACT.md`](./API_CONTRACT.md) — Next.js ↔ Apps Script request/response contract,
  signing algorithm, and shared test vectors.
- [`APPS_SCRIPT_SETUP.md`](./APPS_SCRIPT_SETUP.md) — exact Apps Script deployment steps.

Remaining docs (`META_SETUP.md`, `ANTHROPIC_SETUP.md`, `RENDER_SETUP.md`, `DEPLOYMENT.md`,
`TESTING.md`, `OPERATIONS.md`, `LIMITATIONS.md`) are added as the phases that produce their
content land — see `IMPLEMENTATION_STATUS.md` for current status.

## Environment variables

See [`.env.example`](./.env.example). Never commit real secrets — only variable names are
documented.
