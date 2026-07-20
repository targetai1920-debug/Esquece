# WHATSAPP_AGENT_DESIGN.md — implementation-level design

Implementation-level companion to `ARCHITECTURE.md` §7. Ports the generic, proven infrastructure
from TargetAI's `whatsapp-bot-inmobiliaria` pilot to TypeScript/Postgres/Prisma — same
capabilities, corrected weaknesses (see §7 below). No real-estate behavior or data carries over,
only the infrastructure pattern.

## 1. Webhook endpoints (`src/app/api/whatsapp/webhook/route.ts`)

**`GET`** — Meta verification: compare `hub.mode === "subscribe"` and `hub.verify_token` against
`META_VERIFY_TOKEN` using a constant-time comparison (`crypto.timingSafeEqual`, matched-length
buffers), return `hub.challenge` on success, `403` otherwise.

**`POST`** — inbound events:

1. Read the raw request body as text/bytes *before* any JSON parsing — HMAC must be computed
   over the exact raw payload.
2. Verify `X-Hub-Signature-256` against `META_APP_SECRET` with HMAC-SHA256, constant-time
   compare. **No environment flag disables this check.** If `META_APP_SECRET` is unset or the
   signature is missing/invalid, reject with `403` — unlike the sibling project's
   `ALLOW_INSECURE_WEBHOOK` escape hatch, Esquece has no way to run signature verification
   optional, in production or locally (local testing uses a real test app/secret or a signed
   fixture, not a bypass).
3. Parse JSON only after signature verification passes.
4. Always return `200` quickly once the payload is structurally accepted (even if downstream
   processing later fails) — Meta retries aggressively on non-200, and retries must not be able
   to duplicate side effects (dedup in §3 handles that), but they also shouldn't be invited by a
   slow or failing response.
5. Iterate `entry[].changes[].value`: handle `statuses[]` (delivery events) and `messages[]`
   (inbound messages) separately, each wrapped in its own try/catch so one bad event doesn't
   drop the rest of the batch.

## 2. Phone normalization

One function, `normalizeWaId(value: string | null | undefined): string | null`, in
`lib/whatsapp/phone.ts`. Strips `+` and whitespace, returns `null` for empty input. Every module
that needs a phone number (webhook handler, conversation lookup, message sending, `Customer`
matching) imports this — no second implementation anywhere, which was a proven weakness in the
sibling project (duplicated normalization in `bot_logic.py` and `wa_api.py` before it was
centralized).

## 3. Message deduplication — atomic, not check-then-insert

The sibling project's SQLite version already fixed a real race (see its `try_claim_message`
comment: separate `SELECT` + `INSERT OR IGNORE` allowed two concurrent workers to both pass the
check under Gunicorn). Esquece keeps that lesson and enforces it at the database level instead
of relying on “first `INSERT` wins” being remembered as a convention:

- `ConversationMessage.externalId` (Meta's `message.id`) has a **`UNIQUE` constraint** in
  Postgres.
- `claimInboundMessage(externalId, ...)` does a single `INSERT ... ON CONFLICT (externalId) DO
  NOTHING RETURNING id`. If a row comes back, this is the first time the message is seen —
  process it. If no row comes back, it's a duplicate (Meta retry or duplicate webhook
  delivery) — skip processing, still return `200`.
- This is one atomic statement, not a read followed by a write, so it's correct even with
  multiple serverless/edge invocations running concurrently — which SQLite-with-one-process
  never had to prove.

## 4. Conversation session model

- `Conversation` is keyed by normalized phone number (`waId`, unique), holds `state`
  (`ConversationState` enum), `scratchData` (JSON: in-progress service/barber/date/time/name, or
  which appointment is being cancelled/rescheduled), `lastMessageAt`, `humanHandoffActive`,
  `sessionExpiresAt`.
- **State lives in Postgres, not in what gets sent to Claude.** Each turn, the handler loads
  `Conversation` fresh from the DB, decides the next state deterministically in code, writes it
  back, and only then asks Claude to phrase a reply — Claude never decides the state, it
  interprets intent within the state the backend already committed to (`ARCHITECTURE.md` §7).
- Session expiry: if `now - lastMessageAt > SESSION_IDLE_TIMEOUT` (config, default 30 min) when
  a new message arrives, the handler resets `state = IDLE` and clears `scratchData` **before**
  processing the new message, but the `Customer` and past `Appointment` records are untouched —
  expiry resets the conversation, not the customer relationship.

## 5. Validated state transitions

States: `IDLE`, `SELECTING_SERVICE`, `SELECTING_BARBER`, `SELECTING_DATE`, `SELECTING_TIME`,
`REQUESTING_NAME`, `AWAITING_CONFIRMATION`, `BOOKING_CONFIRMED`, `HUMAN_HANDOFF`.

- A small table in code (`lib/conversation/transitions.ts`) declares which `(fromState,
  event)` pairs are legal and what state they lead to. The handler looks up the transition;
  an event with no legal transition from the current state does **not** silently change state —
  it either re-prompts for the same missing piece of information or, for global intents (see
  §6), jumps state via an explicitly allowed override.
- Every transition (successful or rejected) is written to `ConversationStateLog` (from, to,
  reason, timestamp) — this is the audit trail `ARCHITECTURE.md` §4 describes, and it's what
  makes "why did the bot do that" debuggable after the fact, unlike relying on chat transcripts
  alone.

## 6. Unexpected messages during an active flow

Two categories, checked before the state-specific handler runs:

- **Global intents**, recognized regardless of current state: cancel/reschedule an existing
  appointment, explicit request for a human, a clear complaint/hostility signal. These are
  allowed to interrupt `SELECTING_*`/`AWAITING_CONFIRMATION` flows — the in-progress
  `scratchData` is kept (not discarded) in case the customer returns to it, and the state jumps
  per §5's override table (e.g. to `HUMAN_HANDOFF`, or into a cancellation flow).
- **Off-topic or unparseable input** within a state (e.g. a random message while
  `SELECTING_TIME`): Claude's structured output still returns *some* interpretation
  (`ARCHITECTURE.md` §7), but if it doesn't resolve to a valid entity for the current state or
  confidence is low, the handler re-asks the same pending question rather than guessing or
  advancing state. It never silently drops the message — every inbound message is persisted via
  `ConversationMessage` before any interpretation happens (§3), independent of whether the bot
  understood it.

## 7. Interrupted-conversation recovery

Because state and scratch data are committed to Postgres after every turn (not held in-memory
or reconstructed from chat history), a customer resuming after minutes, hours, or days continues
exactly where they left off — the next inbound message is handled against the persisted
`Conversation` row, no different from a message one second later. This is the direct fix for the
sibling project's known risk (`TA-007`: Render's ephemeral filesystem wipes SQLite on every
redeploy, silently losing every conversation's state and any active human handoff). Esquece's
state lives in managed Postgres, which survives deploys — this is the primary reason Postgres
was non-negotiable for this project even before the double-booking requirement.

## 8. Human handoff

- Trigger detection (from Claude's `needs_human_handoff` flag, or a global-intent keyword match
  as a safety net independent of the model): create a `HumanHandoff` row (reason, conversation,
  status, startedAt), set `Conversation.humanHandoffActive = true`, `state = HUMAN_HANDOFF`.
- While `humanHandoffActive`, the webhook **still records every inbound message**
  (`ConversationMessage`, §3/§6) — only the automated-reply path is skipped. Nothing about
  intake stops.
- No automated reply is generated or sent while handoff is active — not even a repeated "an
  agent will help you" message on every new inbound text; one handoff notice is sent once, at
  the moment of transition.
- Reactivation is **only** manual, from the admin dashboard (`ARCHITECTURE.md` §9) — there is no
  code path that flips `humanHandoffActive` back to `false` automatically, matching the
  project's permanent rule against auto-reactivating a handed-off conversation.
- Per project rules, the bot never messages the human advisor's own number automatically;
  "internal alert" means a `Notification` record for staff-facing channels configured later
  (admin dashboard, email, etc.), not a WhatsApp message to the advisor.

## 9. Meta API errors and the 24-hour window

- Distinguish, in `lib/whatsapp/send.ts`, at least: `131047` (re-engagement/outside the 24-hour
  customer-initiated window — requires an approved template, not free-form text), auth/token
  errors, and generic failures. Log the Meta error code/title/message (no tokens) and record
  delivery status via the `statuses` webhook events, same as the sibling project's
  `message_statuses` pattern, now as `Notification`/`ConversationMessage` status fields in
  Postgres.
- Reminders and any message sent outside a customer-initiated 24-hour window must use an
  approved WhatsApp template, not a free-form message — the notification-sending code checks
  which case applies before choosing the send method. Template setup/approval itself is a Phase
  6 concern; this file only fixes the constraint so Phase 6 doesn't have to relearn it.

## Reference, not a dependency

The above ports **behavior and lessons**, not code — Esquece has no import from, and no runtime
dependency on, `whatsapp-bot-inmobiliaria`. Nothing real-estate-specific (property flows, Google
Sheets sync, advisor handoff phone number, qualification questions) is part of this design.
