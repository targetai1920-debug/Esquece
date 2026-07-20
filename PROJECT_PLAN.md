# PROJECT_PLAN.md — Esquece Barber Studio

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the technical design,
[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for the current, authoritative,
per-phase status (more current than this file — update that one at the end of every phase, this
one only when phase scope itself changes), and
[`CLIENT_INFORMATION_REQUIRED.md`](./CLIENT_INFORMATION_REQUIRED.md) for what's still needed
from the client.

## Guardrails for every phase

- The **CRM client** (`lib/crm`, `CrmClient` interface) is the one and only place any interface
  talks to the CRM. Website, WhatsApp, and admin all go through it — no phase may add
  interface-specific booking/CRM logic as a shortcut.
- Availability/booking rules are enforced inside Apps Script (`ARCHITECTURE.md` §5), not
  re-implemented in Next.js. Next.js re-checks are a UX nicety, not the guarantee.
- No invented business data. Services, prices, barbers, schedules are either real (once
  supplied by the client) or clearly marked `DEMO_DATA_REPLACE_BEFORE_PRODUCTION` /
  `demo` flags in the CRM.
- Claude never has direct write authority over price, service existence, duration, or
  appointment creation/cancellation — see `ARCHITECTURE.md` §7 and the master spec §45.
- Every provider (CRM, AI, WhatsApp) has a mock implementation so the system is demonstrable
  end-to-end without any external credentials — see `ARCHITECTURE.md` §2.
- Payments, loyalty, commissions, marketing campaigns, waitlists, and advanced analytics are
  out of scope until explicitly requested after this build ships.

## Phases

| Phase | Description |
|---|---|
| A | Architecture migration: Prisma/Postgres → Apps Script CRM, docs updated, dead code removed |
| B | Apps Script CRM foundation: project structure, sheet setup, custom menu, request signing, health API, demo seed, internal tests |
| C | Apps Script CRM domain: services, barbers, customers, working hours, breaks, time off, blocks, FAQs, promotions, API actions |
| D | Apps Script booking engine: availability, script-lock concurrency, atomic appointment creation, idempotency, cancellation, reschedule, management token, audit, notifications |
| E | Next.js CRM integration: `CrmClient` interface, `AppsScriptCrmClient`, `MockCrmClient`, request signing client-side, validation, error mapping |
| F | Public website: full booking flow, booking confirmation, management page, cancellation/reschedule, accessibility |
| G | Admin dashboard: auth, dashboard, appointments, customers, services, barbers, schedules, conversations/handoffs, notifications |
| H | WhatsApp infrastructure: Meta webhook, HMAC, payload parser, Cloud API client, dedup, conversation persistence |
| I | Claude conversational agent: AI provider, structured output, state machine wiring, booking/cancel/reschedule flows, FAQ, handoff |
| J | Notifications and Calendar: notification processor, WhatsApp templates, reminders, optional Google Calendar sync, retries |
| K | Production hardening: rate limiting, safe logging, health endpoints, env validation, security review, dependency review, deployment docs, full quality gate |

Detailed task breakdown for each phase lives in the master implementation spec (delivered by the
user, not duplicated here to avoid drift) and is tracked task-by-task in
`IMPLEMENTATION_STATUS.md` as work happens.

## Explicitly deferred (not this build)

Payments/deposits, loyalty/fidelización, commissions, marketing campaigns, automated review
requests, waitlists, advanced analytics.

## Superseded history

The original plan (Phases 0–7, PostgreSQL/Prisma-based) is preserved in git history at commit
`66bee17` and earlier — not deleted, just superseded. See `ARCHITECTURE.md`'s header note and
`MIGRATION_TO_POSTGRESQL.md` for how that work relates to the current design.
