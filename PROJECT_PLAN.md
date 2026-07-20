# PROJECT_PLAN.md — Esquece Barber Studio

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the technical design this plan implements, and
[`CLIENT_INFORMATION_REQUIRED.md`](./CLIENT_INFORMATION_REQUIRED.md) for what's still needed
from the client before real (non-demo) data can go in.

## Current status

**Phase 0 (analysis) and the architecture-adaptation step are done.** Repository was created
empty; no code exists yet. This document, `ARCHITECTURE.md`, and
`CLIENT_INFORMATION_REQUIRED.md` are the first artifacts. Next step is Phase 1 (project
scaffold) — not started.

## Guardrails for every phase

- The **booking-and-availability engine** (`lib/booking-engine`) is the one and only place
  availability/duration/conflict logic lives. Website, WhatsApp, and admin all call it — no
  phase may add interface-specific booking logic as a shortcut.
- No invented business data. Services, prices, barbers, schedules are either real (once
  supplied by the client) or clearly marked `DEMO_DATA_REPLACE_BEFORE_PRODUCTION`.
- Payments, loyalty, commissions, marketing campaigns, waitlists, and advanced analytics are
  out of scope until explicitly requested after the MVP ships.
- Claude never has direct write authority over price, service existence, duration, or
  appointment creation/cancellation — see `ARCHITECTURE.md` §7.

## Phase 0 — Analysis (done)

- [x] Confirm repository is new/empty.
- [x] Adapt the general booking-system brief into an Esquece-specific architecture.
- [x] Write `PROJECT_PLAN.md`, `ARCHITECTURE.md`, `CLIENT_INFORMATION_REQUIRED.md`.

## Phase 1 — Project foundation (next)

- [ ] Initialize Next.js (TypeScript, App Router).
- [ ] Configure PostgreSQL connection + Prisma.
- [ ] Create the folder structure proposed in `ARCHITECTURE.md` §3.
- [ ] Configure environment variables (`.env.example`).
- [ ] Add linting/formatting (ESLint, Prettier) and a test runner (Vitest or Jest — decided at
      implementation time).
- [ ] `README.md` with local setup instructions.

## Phase 2 — Booking domain

- [ ] Prisma schema for all entities in `ARCHITECTURE.md` §4.
- [ ] Initial migration, including the hand-written `EXCLUDE` constraint migration (§5).
- [ ] Implement `getAvailableSlots`.
- [ ] Implement `createAppointment` (transactional, re-validated, race-safe).
- [ ] Implement `cancelAppointment`, `rescheduleAppointment`.
- [ ] Tests: duration handling, breaks, time off, blocks, overlapping appointments, and the
      two-simultaneous-customers race test required by the brief (only one of two concurrent
      requests for the same barber/slot may succeed).

## Phase 3 — Public booking website

- [ ] Mobile-first step flow: service → barber → date → time → customer details → summary →
      confirmation, per `ARCHITECTURE.md` §6.
- [ ] Wire each step to real availability/services/barbers from the DB via the booking engine.
- [ ] Loading/error states, including "slot just got taken" recovery (re-query and re-offer).
- [ ] Visual identity: black/white/grey, configurable electric accent color, crowned-smile logo
      placeholder until brand assets arrive (see `CLIENT_INFORMATION_REQUIRED.md`).

## Phase 4 — Admin dashboard

- [ ] Authentication for admin routes.
- [ ] Agenda views (day/week/month), filter by barber/status.
- [ ] Manual appointment create/edit/cancel/reschedule/complete/no-show, all through the booking
      engine.
- [ ] Services, barbers, schedules, breaks, time off, blocked slots CRUD.
- [ ] Customers view (history, cancellations, notes).
- [ ] Conversations view (handoffs, reason, bot on/off, reactivate).
- [ ] Business configuration (address, hours, cancellation policy, min lead time, max advance
      days, buffer, reminder timing).

## Phase 5 — WhatsApp agent

- [ ] Webhook: verification (`GET`), signature-verified inbound handling (`POST`).
- [ ] Message dedup via Meta's external message id.
- [ ] Conversation state machine persisted in `Conversation` (`ARCHITECTURE.md` §7).
- [ ] Claude integration with the structured-output contract + validation.
- [ ] Booking, cancellation, reschedule flows via the shared booking engine.
- [ ] Human handoff (trigger detection, silence automated replies, staff alert, manual
      reactivation only).

## Phase 6 — Automations

- [ ] Booking confirmations (all sources).
- [ ] Reminders before appointment (idempotent).
- [ ] Modification/cancellation notices.
- [ ] Internal alerts for new bookings and handoffs.

## Phase 7 — Production readiness

- [ ] Security review (secrets, auth, rate limiting, input validation, audit logging).
- [ ] Full test suite green.
- [ ] Confirm hosting/DB provider (pending decision, `ARCHITECTURE.md` §2) and deploy.
- [ ] Load real (non-demo) business data once received from the client.
- [ ] Webhook verification against the real Meta app.
- [ ] Real booking test end-to-end on all three interfaces.

## Explicitly deferred (not this MVP)

Payments/deposits, loyalty/fidelización, commissions, marketing campaigns, automated review
requests, waitlists, advanced analytics.
