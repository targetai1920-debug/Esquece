# Esquece Barber Studio — Booking Platform

Booking-and-availability platform for **Esquece Barber Studio** (Cochabamba, Bolivia), built by
TargetAI. One shared booking engine, three interfaces: public website, WhatsApp agent, admin
dashboard. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design and
[`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for phase status.

## Stack

Next.js (TypeScript, App Router) · PostgreSQL · Prisma · Tailwind CSS · Zod · WhatsApp Cloud API
· Anthropic Claude API.

## Status

Phase 1 (project foundation) in progress. No booking flow, no WhatsApp integration, no admin
auth yet — see `PROJECT_PLAN.md` for what's implemented vs. stubbed.

## Local setup

```bash
npm install
cp .env.example .env      # fill in local values; never commit .env
npx prisma generate
npx prisma migrate dev    # requires a running PostgreSQL instance, see below
npm run dev
```

### Database

Needs a real PostgreSQL instance (the availability engine relies on a Postgres-only exclusion
constraint — see `ARCHITECTURE.md` §5 — so SQLite is not an option, even locally). Easiest local
option is Docker:

```bash
docker run --name esquece-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=esquece -p 5432:5432 -d postgres:16
```

Then set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/esquece` in `.env`.

## Scripts

- `npm run dev` — start the Next.js dev server.
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npm run typecheck` — `tsc --noEmit` (strict mode).
- `npm test` — Vitest.
- `npx prisma format` / `npx prisma validate` — schema checks.
- `npx prisma migrate dev` — apply migrations locally.

## Project docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, data model, booking engine, WhatsApp
  agent design at the architecture level.
- [`BOOKING_RULES.md`](./BOOKING_RULES.md) — the concrete availability/booking rules the engine
  implements.
- [`WHATSAPP_AGENT_DESIGN.md`](./WHATSAPP_AGENT_DESIGN.md) — webhook, dedup, conversation state
  machine, human handoff, at implementation level.
- [`SECURITY.md`](./SECURITY.md) — security requirements and how they're enforced.
- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — phased plan and current status.
- [`CLIENT_INFORMATION_REQUIRED.md`](./CLIENT_INFORMATION_REQUIRED.md) — real business data
  still needed from the client; everything else in the codebase is demo data, clearly marked
  `DEMO_DATA_REPLACE_BEFORE_PRODUCTION`.

## Environment variables

See [`.env.example`](./.env.example). Never commit real secrets — only variable names are
documented.
