# ARCHITECTURE.md — Esquece Barber Studio

Client: **Esquece Barber Studio** (Cochabamba, Bolivia — `@esquece.barber.studio`).
Built by **TargetAI** as a reusable booking platform, piloted on this client.

> **Architecture superseded 2026-07-20.** The original design (see git history at commit
> `6174f5f`/`66bee17`) used PostgreSQL + Prisma as the booking source of truth. That was never
> deployed or migrated. The current, authoritative design uses **Google Apps Script + Google
> Sheets as the CRM and source of truth**, reached from Next.js through a single server-side
> client. See `MIGRATION_TO_POSTGRESQL.md` for the documented (not scheduled) future path back
> to Postgres if Sheets/Apps Script ever becomes the bottleneck. Nothing in this document should
> describe Prisma/Postgres as current — if you find such a reference, it's a bug, fix it.

## 1. Core principle: this is a booking-and-availability system, not a chatbot

The product is **not** "a WhatsApp bot with AI." The product is a **shared booking and
availability engine**, backed by a CRM, with three interfaces attached to it:

1. Public booking website.
2. WhatsApp agent.
3. Admin dashboard.

All three go through the **same** server-side CRM client, which calls the **same** Apps Script
API, which enforces the **same** availability rules against the **same** Google Sheet. There is
no interface-specific booking logic anywhere, and no interface ever treats a locally-computed
slot as final — the Apps Script API is the only thing allowed to actually create, cancel, or
reschedule an appointment.

Claude (Anthropic API) is an **interpretation and communication layer only**. It reads natural
language and proposes a structured interpretation; it writes natural-sounding replies in
Spanish. It never has authority over price, duration, service existence, availability, or the
final creation/cancellation/reschedule of an appointment — see §7 and §8 for the boundary. The
CRM (Apps Script + Sheets) is the single source of truth — not the AI model's conversation
memory, not the frontend, not the WhatsApp message history, and not any local database.

## 2. High-level architecture

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

- **Next.js (TypeScript, App Router)** — single application serving the public website, the
  admin dashboard, and all API routes (booking API, WhatsApp webhook, cron). One deployable
  unit — no monorepo, no separate services.
- **Google Sheets** — the CRM. Business settings, services, barbers, schedules, breaks, time
  off, blocked slots, customers, appointments, conversations, messages, webhook dedup, human
  handoffs, notifications, and audit log all live in dedicated sheets. See `CRM_SCHEMA.md`
  (Phase B/C) for the exact column-level schema.
- **Google Apps Script** — a Web App (`doGet`/`doPost`) deployed from a script bound to that
  spreadsheet. It is the only thing that reads or writes the Sheet for booking-critical
  operations, and it is where availability computation, locking, and atomic appointment
  creation actually happen (§5). See `CRM_APPS_SCRIPT.md` and `API_CONTRACT.md` (Phase B/C).
  Never called directly from the browser — only from the Next.js server (§8).
- **Next.js CRM client** (`lib/crm`) — the *only* place in the Next.js app that knows the Apps
  Script URL, API key, and signing secret. Implements the `CrmClient` interface (Phase E)
  against two backends: `AppsScriptCrmClient` (real) and `MockCrmClient` (in-memory, same
  business rules, used for local dev, tests, and the WhatsApp simulator before real credentials
  exist).
- **Tailwind CSS** — utility styling for the mobile-first booking flow and the admin UI.
- **WhatsApp Cloud API (Meta)** — the only WhatsApp channel; webhook and outbound sending live
  in Next.js (`lib/whatsapp`), not in Apps Script.
- **Anthropic Claude API** — intent interpretation and reply drafting only, via a strict
  structured-output contract (§7), with a `MockAiProvider` fallback so the conversation flow is
  demonstrable without a real key.
- **Deployment**: Render for the Next.js app (Web Service + Cron for notifications); Google
  Apps Script's own hosting for the CRM API (no separate server to run). See `RENDER_SETUP.md`
  and `APPS_SCRIPT_SETUP.md`.

## 3. Why Apps Script/Sheets instead of Postgres for this phase

- Esquece needs a working, demonstrable system before any infrastructure spend or DevOps setup.
  A Google Sheet the owner can literally open and read is also, incidentally, a CRM UI for free.
- No database server, connection pooling, or migration tooling to operate for a single-location
  pilot's appointment volume.
- Google's own locking (`LockService`) and Apps Script's serial execution model provide a real,
  if lower-throughput, concurrency guarantee for the double-booking problem (§5) — adequate for
  one barbershop's traffic.
- The tradeoff, documented honestly in `LIMITATIONS.md` (Phase K) and `MIGRATION_TO_POSTGRESQL.md`:
  Apps Script has execution-time and quota limits, `LockService` serializes all writes (a
  throughput ceiling, not a correctness problem), and Sheets is not built for high write
  concurrency at scale. None of that is a problem at Esquece's current size; all of it is a
  reason a future client with materially higher volume might justify the Postgres path.

## 4. Data model (now: Google Sheets CRM)

Full column-level schema lives in `CRM_SCHEMA.md` (Phase B/C), generated together with the
Apps Script code that creates and maintains it (`setupCRM()`). At the architecture level, the
sheets are:

`SETTINGS`, `SERVICES`, `BARBERS`, `BARBER_SERVICES`, `WORKING_HOURS`, `BREAKS`, `TIME_OFF`,
`BLOCKED_SLOTS`, `CUSTOMERS`, `APPOINTMENTS`, `CONVERSATIONS`, `CONVERSATION_MESSAGES`,
`WEBHOOK_EVENTS`, `HUMAN_HANDOFFS`, `NOTIFICATIONS`, `AUDIT_LOG`, `FAQS`, `PROMOTIONS`, plus a
generated `DASHBOARD` view. This directly carries forward the entities from the original
Postgres design (Business→SETTINGS, Barber, Service, BarberService, WorkingSchedule→
WORKING_HOURS, Break, TimeOff, BlockedSlot, Customer, Appointment, Conversation,
ConversationMessage, HumanHandoff, Notification, AuditLog) — the concepts didn't change, the
storage did.

Appointments still snapshot price/service/barber details at booking time (so editing a service
later doesn't rewrite history) and still record `source` (`WEBSITE` | `WHATSAPP` | `ADMIN`).

## 5. Availability engine — now inside Apps Script

The rules are unchanged from `BOOKING_RULES.md` (service duration, which barbers can perform a
service, working hours, breaks, time off, blocks, existing appointments, buffer, business
timezone `America/La_Paz`) — what changed is *where* they're enforced: inside the Apps Script
project, not a TypeScript module talking to Postgres.

### `getAvailability` (Apps Script action, read-only)

Same nine-point logic as before (see `BOOKING_RULES.md` §1), now reading `WORKING_HOURS`,
`BREAKS`, `TIME_OFF`, `BLOCKED_SLOTS`, and `APPOINTMENTS` (status `PENDING`/`CONFIRMED`) out of
the Sheet. Used for display only, from the Next.js CRM client — never trusted as final.

### `createAppointment` (Apps Script action) — the only way an appointment gets created

Runs inside `LockService.getScriptLock()`, re-validates the slot from scratch while holding the
lock, then appends the row. This is the actual replacement for the Postgres `EXCLUDE` constraint
from the previous design: **Apps Script's script lock serializes all appointment-creation
requests project-wide**, so two concurrent `createAppointment` calls cannot both pass validation
and both write — the second one to acquire the lock re-reads the now-updated sheet and correctly
sees the slot as taken. This is a coarser mechanism than a database exclusion constraint (it
serializes *all* appointment writes, not just conflicting ones), which is an accepted throughput
tradeoff at Esquece's scale, not a correctness gap. `createAppointment` also requires and
enforces an idempotency key, so a retried request (e.g. a flaky network response reaching the
client after the write already succeeded) returns the original appointment rather than creating
a duplicate. Full algorithm: `BOOKING_RULES.md` (updated) and `API_CONTRACT.md` (Phase B/D).

`cancelAppointment` and `rescheduleAppointment` follow the same locked, re-validated pattern —
`rescheduleAppointment` validates the new slot before releasing the old one, so a failed
reschedule never leaves the customer with no appointment at all.

Nothing in Next.js ever writes an appointment row directly or announces a booking as confirmed
before the Apps Script call returns success.

## 6. Booking flow (shared across interfaces, presented differently)

Unchanged at this level: service → barber (or "any available") → date → time (from
`getAvailability`) → customer details → summary → confirm → `createAppointment` (via the CRM
client) → confirmation. See `WHATSAPP_AGENT_DESIGN.md` and the public-website flow docs for how
each interface presents these steps.

## 7. WhatsApp agent — persistent state, not model memory

Unchanged in principle from the original design, relocated in storage: conversation state and
scratch data live in the `CONVERSATIONS` sheet (via the CRM client), not a Postgres table and
not Claude's context. Every state transition is an explicit, validated write through
`applyConversationTurn` (Apps Script action, optimistic-version-checked) — Claude's output never
directly mutates conversation state. See `WHATSAPP_AGENT_DESIGN.md` for the full state machine,
Claude's structured-output contract, and the deterministic-before-AI rule.

## 8. Security

- **CRM request signing**: every Next.js → Apps Script call is a signed envelope (API key +
  HMAC-SHA256 over a canonical, stably-serialized payload + timestamp + nonce). Apps Script
  rejects unsigned, stale, replayed, or malformed requests before touching the Sheet. Full
  contract in `API_CONTRACT.md` (Phase B) and `SECURITY.md`.
- The Apps Script Web App is **never called from the browser** — only from the Next.js server,
  which is the only party holding `CRM_API_KEY`/`CRM_SIGNING_SECRET`.
- Admin routes: session-based auth, environment-configured credentials for the MVP (no separate
  user database yet — see `SECURITY.md`).
- WhatsApp webhook: HMAC signature verification against `META_APP_SECRET`, no bypass flag, ever
  (unchanged principle from the original design).
- Input validation (`zod`) at every boundary: website forms, WhatsApp payload parsing, and the
  CRM client's own request/response shapes.
- Secrets never reach the frontend bundle; only `NEXT_PUBLIC_`-prefixed variables are public,
  and none of the CRM/Meta/Anthropic credentials use that prefix.

## 9. Explicitly out of scope for this MVP

Payments/deposits, loyalty programs, commissions, marketing campaigns, automated review
requests, waitlists, and advanced analytics are **not** implemented. Google Calendar sync is
implemented but optional/off by default (`ENABLE_CALENDAR_SYNC`). See `PROJECT_PLAN.md` for the
full phase breakdown and `IMPLEMENTATION_STATUS.md` for what's actually done right now.
