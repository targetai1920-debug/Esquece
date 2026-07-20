# ARCHITECTURE.md — Esquece Barber Studio

Client: **Esquece Barber Studio** (Cochabamba, Bolivia — `@esquece.barber.studio`).
Built by **TargetAI** as a reusable booking platform, piloted on this client.

## 1. Core principle: this is a booking-and-availability system, not a chatbot

The product is **not** "a WhatsApp bot with AI." The product is a **shared booking and
availability engine** with three interfaces attached to it:

1. Public booking website.
2. WhatsApp agent.
3. Admin dashboard.

All three call the **same** engine, against the **same** PostgreSQL database, enforcing the
**same** availability rules. There is no interface-specific booking logic anywhere. If a rule
about availability, duration, or conflict needs to change, it changes in exactly one place:
`lib/booking-engine`.

Claude (Anthropic API) is an **interpretation and communication layer only**. It reads natural
language and proposes a structured interpretation; it writes natural-sounding replies in
Spanish (the business operates in Cochabamba, Bolivia). It never has authority over price,
duration, service existence, availability, or the final creation/cancellation/reschedule of an
appointment. Those are deterministic backend operations. The database is the single source of
truth — not the AI model's conversation memory, not the frontend, not the WhatsApp message
history.

## 2. Stack

- **Next.js (TypeScript, App Router)** — single application serving the public website, the
  admin dashboard (under a protected route group), and all API routes (booking API, WhatsApp
  webhook, cron endpoints). One deployable unit for the MVP — no monorepo, no separate
  services. This keeps operational cost and complexity low, which matters for a first client
  pilot that must stay cheap to run and easy to reuse for future TargetAI clients.
- **PostgreSQL** — relational integrity and range/exclusion constraints are exactly what the
  anti-double-booking requirement needs (see §5). SQLite (used in the sibling
  `whatsapp-bot-inmobiliaria` project) is not adequate here because this system has real
  concurrent-write conflict requirements a single-file DB doesn't handle well.
- **Prisma ORM** — schema, migrations, typed client. One raw-SQL migration is required for the
  exclusion constraint Prisma cannot express natively (§5).
- **Tailwind CSS** — utility styling for the mobile-first booking flow and the admin UI.
- **WhatsApp Cloud API (Meta)** — the only WhatsApp channel. No third-party WhatsApp wrapper.
- **Anthropic Claude API** — intent interpretation and reply drafting only, via a strict
  structured-output contract (§7).
- **Deployment/hosting**: not decided yet — this is an architecturally/cost-significant choice
  and per project rules must be confirmed with the client-facing owner before committing. Needs
  a provider that supports PostgreSQL + scheduled jobs (for reminders) at low cost. Candidates
  to evaluate before Phase 7: Vercel (Next.js-native, has Cron Jobs, hobby tier) + a managed
  Postgres (Neon/Supabase/Railway), or Render (already used for the sibling project, supports
  both Postgres and cron, single provider for everything). **Recommendation, pending
  confirmation:** Vercel + Neon for the app/DB, since Next.js Cron Jobs and Prisma both have
  first-class support there and the free tiers cover MVP traffic. Not implemented in Phase
  0/1.

## 3. Proposed folder structure (design only — not scaffolded yet)

```
esquece/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (site)/                # public booking website
│   │   │   ├── page.tsx           # landing
│   │   │   └── reservar/          # step-by-step booking flow
│   │   ├── (admin)/               # protected admin dashboard
│   │   │   └── admin/...
│   │   └── api/
│   │       ├── availability/      # GET available slots
│   │       ├── appointments/      # POST create / PATCH cancel-reschedule
│   │       ├── whatsapp/webhook/  # GET verify, POST inbound messages
│   │       └── cron/reminders/    # scheduled reminder dispatch
│   ├── lib/
│   │   ├── booking-engine/        # THE shared domain core (see §5)
│   │   │   ├── availability.ts
│   │   │   ├── appointments.ts
│   │   │   └── types.ts
│   │   ├── whatsapp/              # Cloud API client, webhook parsing, dedup
│   │   ├── ai/                    # Claude client, structured-output schema + validation
│   │   ├── conversation/          # conversation state machine (§7)
│   │   ├── notifications/         # reminders, confirmations, idempotent sending
│   │   ├── auth/                  # admin session/auth
│   │   └── db.ts                  # Prisma client singleton
│   └── components/                # UI, split between site/ and admin/
├── tests/
├── docs/
│   └── project/                   # same operational-memory pattern as the sibling repo
├── .env.example
├── ARCHITECTURE.md
├── PROJECT_PLAN.md
└── CLIENT_INFORMATION_REQUIRED.md
```

The booking-engine module has **no dependency on Next.js request/response objects** — it's
plain TypeScript functions operating on Prisma types. That's what lets all three interfaces
(website API routes, WhatsApp webhook handler, admin server actions) call it directly as
function calls in-process, while keeping the door open to extracting it into a separate service
later without rewriting the logic itself.

## 4. Data model (initial entities)

All timestamps stored in UTC; business logic operates in `BUSINESS_TIMEZONE=America/La_Paz`.

- **Business** — name, description, address, timezone, phone, Instagram, map link, accent
  color, general config (min booking lead time, max advance-booking days, default buffer).
- **Barber** — name, photo, bio, specialties, active flag.
- **Service** — name, description, price, currency, duration minutes, optional buffer minutes,
  image, active flag, display order.
- **BarberService** — join table: which barbers can perform which services. This is what makes
  "any available barber" resolvable — the engine only considers barbers linked to the requested
  service.
- **WorkingSchedule** — barber, day of week, start time, end time, active flag.
- **Break** — barber, date or recurrence rule, start time, end time, optional reason.
- **TimeOff** — barber, start datetime, end datetime, reason (day off, vacation, sick, etc.).
- **BlockedSlot** — optional barber (null = whole business), start datetime, end datetime,
  reason, type. Manual admin blocks (e.g., equipment issue, private event).
- **Customer** — name, normalized phone (E.164), optional email, notes, created at, last
  interaction at.
- **Appointment** — customer, service, barber, start datetime, end datetime, price snapshot at
  booking time, status, **source** (`WEBSITE` | `WHATSAPP` | `ADMIN`), comment, created/updated
  at. Status: `PENDING` | `CONFIRMED` | `COMPLETED` | `CANCELLED` | `NO_SHOW`.
- **Conversation** — WhatsApp phone number, related customer, current state, scratch data
  (service/barber/date/time/name being collected), last message at, human-handoff flag, session
  expiry.
- **ConversationState** — either an enum column on `Conversation` (`IDLE`,
  `SELECTING_SERVICE`, `SELECTING_BARBER`, `SELECTING_DATE`, `SELECTING_TIME`,
  `REQUESTING_NAME`, `AWAITING_CONFIRMATION`, `BOOKING_CONFIRMED`, `HUMAN_HANDOFF`) plus a
  `ConversationStateLog` table recording every transition (from, to, reason, timestamp) for
  debugging and audit. The state itself lives on `Conversation`; the log is the audit trail.
- **HumanHandoff** — conversation, reason, status, started at, assigned person (optional),
  reactivated at.
- **Notification** — appointment (optional), conversation (optional), type (confirmation,
  reminder, cancellation, reschedule, internal alert), scheduled at, status, attempt count, sent
  at. Sending must be idempotent (§8).
- **AuditLog** — actor (admin user or system), action, entity type, entity id, before/after
  snapshot (JSON), created at. Records every admin mutation to appointments, schedules, blocks,
  services, and barbers.

Also carried over from the general brief but not detailed above: **Message** (raw inbound/
outbound WhatsApp messages with Meta's external id, for deduplication — same pattern already
proven in the sibling `whatsapp-bot-inmobiliaria` project) and **Reminder** is folded into
`Notification` (type=`REMINDER`) rather than a separate table, to avoid duplicating the
idempotent-sending mechanism twice.

## 5. Availability engine — the core of the system

Two entry points, both in `lib/booking-engine`:

### `getAvailableSlots(businessId, serviceId, barberId | "any", dateRange)`

Read-only. For each candidate barber (either the one requested, or all barbers linked to the
service via `BarberService`):

1. Resolve `WorkingSchedule` for the requested day of week.
2. Subtract `Break` intervals for that date.
3. Subtract `TimeOff` intervals overlapping that date.
4. Subtract `BlockedSlot` intervals (barber-specific or business-wide).
5. Subtract existing `Appointment` intervals where `status IN (PENDING, CONFIRMED)`.
6. Walk the remaining free time in increments, keeping only windows that fit
   `service.duration + service.buffer` (falling back to `business.defaultBuffer` when the
   service doesn't override it).
7. Return slots in `BUSINESS_TIMEZONE`, annotated with which barber(s) offer each slot.

This function is used for **display only** — by the website's calendar, and by the WhatsApp
agent when listing options to the customer. It is never trusted as the final word.

### `createAppointment(input)` — the only way an appointment gets created

Runs inside a **database transaction**, and re-validates from scratch — it does not trust that
the slot shown earlier is still free:

1. Open transaction (`SERIALIZABLE` or `REPEATABLE READ` isolation — decided during Phase 2
   implementation based on Prisma's transaction support).
2. Re-run the same availability checks as `getAvailableSlots`, scoped to the one requested
   barber and interval.
3. Attempt the `INSERT` into `Appointment`.
4. **Database-level protection against races**, independent of the application check above: a
   PostgreSQL exclusion constraint on the `Appointment` table using `btree_gist`:

   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;

   ALTER TABLE "Appointment"
     ADD CONSTRAINT no_overlapping_active_appointments
     EXCLUDE USING gist (
       "barberId" WITH =,
       tstzrange("startTime", "endTime") WITH &&
     )
     WHERE (status IN ('PENDING', 'CONFIRMED'));
   ```

   Prisma's schema DSL cannot express `EXCLUDE` constraints, so this ships as a hand-written SQL
   migration alongside the Prisma-generated ones. This is the actual guarantee: even if two
   requests pass the application-level check at the same instant, only one `INSERT` can succeed
   — the second raises a constraint violation, which the transaction catches and turns into a
   "slot no longer available" response instead of a 500 error.
5. Commit only if the insert succeeded.
6. Only **after** a successful commit does any caller (website API route, WhatsApp handler,
   admin action) send a confirmation to the customer. Nothing announces a booking as confirmed
   before the transaction commits.
7. On conflict, the caller re-runs `getAvailableSlots` and returns fresh options instead of a
   bare error.

`cancelAppointment` and `rescheduleAppointment` live next to `createAppointment` in the same
module, follow the same transactional discipline, and `rescheduleAppointment` internally calls
the same validation path as a new booking for the target slot before releasing the old one.

This engine is exercised identically by:
- `POST /api/appointments` (website),
- the WhatsApp conversation handler at the confirmation step,
- admin server actions for manual booking/reschedule/cancel.

No interface calls Prisma directly for booking-critical writes — only through these functions.

## 6. Booking flow (shared across interfaces, presented differently)

Service → barber (or "any available") → date → time (from `getAvailableSlots`) → customer
details → summary → confirm → `createAppointment` → confirmation. Steps 1–3 can be entered in
different order or skipped ("any available" barber) depending on interface, but the underlying
calls are the same functions with the same validation.

## 7. WhatsApp agent — persistent state, not model memory

Conversation state is a column in the `Conversation` table, not something reconstructed from
chat history sent to Claude. Every state transition is an explicit, validated backend write —
Claude's output never directly mutates `Conversation.state`; the conversation handler does,
after checking the transition is legal for the current state.

States: `IDLE`, `SELECTING_SERVICE`, `SELECTING_BARBER`, `SELECTING_DATE`, `SELECTING_TIME`,
`REQUESTING_NAME`, `AWAITING_CONFIRMATION`, `BOOKING_CONFIRMED`, `HUMAN_HANDOFF`. Scratch data
for the in-progress booking (chosen service/barber/date/time/name, or which existing
appointment is being cancelled/rescheduled) is stored on `Conversation` as structured JSON, not
inferred each turn. Idle sessions expire and reset to `IDLE` after a configurable timeout,
without discarding the underlying `Customer`/`Appointment` history.

### Claude's structured-output contract

Every inbound WhatsApp message is sent to Claude with: the current conversation state, the
relevant scratch data, and **live data fetched from the database for that turn** (active
services, active barbers, whether the requested slot is real) — never hardcoded business facts
in the prompt. Claude must return a validated structure (via Anthropic tool-use / JSON schema),
minimally:

- `intent` (e.g. `book`, `cancel`, `reschedule`, `check_availability`, `faq`, `request_human`)
- `confidence`
- `entities`: `service`, `barber`, `date`, `time` (raw, as mentioned)
- `needs_human_handoff` (bool)
- `proposed_reply` (natural language, in Spanish)

The backend validates this structure (e.g. with `zod`) before acting on it. Entities are
**resolved against the database** (fuzzy-matched service/barber names must resolve to real,
active `Service`/`Barber` rows) — Claude naming a service is never sufficient to treat it as
selected. Low confidence, an invalid/unparseable structure, or an entity that fails to resolve
all result in a clarifying question, not a state change. `proposed_reply` is only sent verbatim
when it doesn't depend on a fact the backend hasn't independently verified (price, duration,
availability) — those are always substituted from the DB, never left to the model's phrasing of
the number.

Handoff triggers (complaints, hostility, payment issues, explicit request for a human, anything
outside the bot's authority) set `state = HUMAN_HANDOFF`, stop automated replies, and notify
staff — following the same pattern already proven in the sibling `whatsapp-bot-inmobiliaria`
project (silence-on-handoff, no auto-reactivation, webhook keeps recording incoming messages).

## 8. Notifications and reminders

`Notification` rows are created for confirmations, reminders, cancellations, reschedules, and
internal alerts. A scheduled job (cron endpoint, §2) scans for due, unsent notifications and
sends them, marking `status`/`sentAt`/`attempts` so a retry never double-sends — idempotency is
a property of the `Notification` row's state, not of the send call.

## 9. Security

- Admin routes protected by session-based auth (library choice deferred to Phase 4 —
  Auth.js/NextAuth with credentials + hashed passwords is the default unless a reason emerges to
  do otherwise).
- WhatsApp webhook: `hub.verify_token` check on `GET`, HMAC signature verification on `POST`
  bodies using `META_APP_SECRET`, constant-time comparison.
- Input validation (`zod`) at every API boundary, both website and WhatsApp.
- Rate limiting on public booking endpoints.
- No secrets in the frontend bundle; all Meta/Anthropic/DB credentials server-side only.
- `AuditLog` entries for every admin create/update/cancel/reschedule/block action.
- Customer phone numbers treated as private data — not exposed in any public API response.

## 10. Explicitly out of scope for this MVP

Payments/deposits, loyalty programs, commissions, marketing campaigns, automated review
requests, waitlists, and advanced analytics are **not** implemented now. The data model and
engine are not designed to preclude them later, but no code, schema fields, or UI for them
ships in Phase 0–7 of this plan.
