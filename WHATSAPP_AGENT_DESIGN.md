# WHATSAPP_AGENT_DESIGN.md — implementation-level design

Implementation-level companion to `ARCHITECTURE.md` §7 and the master spec's §9/§28/§29/§40-58.
Ports the generic, proven infrastructure from TargetAI's `whatsapp-bot-inmobiliaria` pilot to
TypeScript, with persistence in the Google Sheets CRM (via Apps Script) instead of a local
database — same capabilities, corrected weaknesses (see §7 below). No real-estate behavior or
data carries over, only the infrastructure pattern.

> Superseded 2026-07-20: conversation/message persistence and dedup moved from a
> Postgres/Prisma design to the CRM's `CONVERSATIONS`/`CONVERSATION_MESSAGES`/`WEBHOOK_EVENTS`
> sheets, reached through the Apps Script API. The webhook itself (verification, HMAC, parsing)
> still lives in Next.js — that never depended on Postgres and is unchanged.

> Implemented 2026-07-21 (Phase H): §1–§3 (webhook route, phone normalization, dedup) are built
> and tested — see `IMPLEMENTATION_STATUS.md`'s Phase H entry for exactly what was verified and
> how. §4 onward (conversation state machine wiring, the actual booking/cancel/reschedule flows,
> human handoff triggers, Claude integration) is Phase I, not yet built — this document describes
> the target design for both, not a claim that all of it exists yet.

## 1. Webhook endpoints (`src/app/api/whatsapp/webhook/route.ts`)

**`GET`** — Meta verification: compare `hub.mode === "subscribe"` and `hub.verify_token` against
`META_VERIFY_TOKEN` using a constant-time comparison (`crypto.timingSafeEqual`, matched-length
buffers), return `hub.challenge` on success, `403` otherwise.

**`POST`** — inbound events:

1. Read the raw request body as text/bytes *before* any JSON parsing — HMAC must be computed
   over the exact raw payload.
2. Verify `X-Hub-Signature-256` against `META_APP_SECRET` with HMAC-SHA256, constant-time
   compare. **No environment flag disables this check**, in production or locally.
3. Parse JSON only after signature verification passes.
4. Always return `200` quickly once the payload is structurally accepted (even if downstream
   processing later fails) — Meta retries aggressively on non-200, and retries must not be able
   to duplicate side effects (dedup in §3 handles that).
5. Iterate `entry[].changes[].value`: handle `statuses[]` (delivery events) and `messages[]`
   (inbound messages) separately, each wrapped in its own try/catch so one bad event doesn't
   drop the rest of the batch.

## 2. Phone normalization

One function, `normalizeWaId(value: string | null | undefined): string | null`, in
`lib/whatsapp/phone.ts`. Strips `+` and whitespace, returns `null` for empty input. Every module
that needs a phone number (webhook handler, CRM client calls, message sending) imports this — no
second implementation anywhere, which was a proven weakness in the sibling project (duplicated
normalization in `bot_logic.py` and `wa_api.py` before it was centralized).

## 3. Message/event deduplication — atomic, via the CRM lock, not check-then-insert

The sibling project's SQLite version already fixed a real race (its `try_claim_message` comment
explains: separate `SELECT` + `INSERT OR IGNORE` allowed two concurrent workers to both pass the
check under Gunicorn). Esquece keeps that lesson, now enforced inside Apps Script:

- Before processing any inbound webhook payload, Next.js calls the CRM action
  `registerWebhookEvent(externalEventId, ...)`.
- Inside Apps Script, this action acquires `LockService.getScriptLock()`, searches
  `WEBHOOK_EVENTS` for the external id, and — only while still holding the lock — either finds
  an existing row (return "duplicate", `PROCESSING` or already `PROCESSED`/`FAILED`) or appends
  a new row with status `PROCESSING` and returns "new, proceed."
- This lock-guarded read-then-write is the atomic equivalent of Postgres's
  `INSERT ... ON CONFLICT DO NOTHING` — the lock, not a unique constraint, is what makes it
  correct under concurrent webhook deliveries.
- After processing completes, Next.js calls `markWebhookEventProcessed` or
  `markWebhookEventFailed` to close out the row.
- Duplicate events must never create duplicate `CONVERSATION_MESSAGES`, duplicate `CUSTOMERS`,
  duplicate `APPOINTMENTS`, duplicate outbound sends, or duplicate handoffs — this is the
  mechanism that guarantees it project-wide, not a per-feature check.

## 4. Conversation session model

- `CONVERSATIONS` sheet, keyed by normalized phone number (`phoneE164`, unique), holds `state`,
  `scratchDataJson` (in-progress service/barber/date/time/name, or which appointment is being
  cancelled/rescheduled), `humanHandoffActive`, `version`, `lastInboundMessageAt`,
  `lastOutboundMessageAt`, `sessionExpiresAt`.
- **State lives in the CRM sheet, not in what gets sent to Claude.** Each turn, the handler loads
  the conversation fresh via `getOrCreateConversation`, decides the next state deterministically
  in code, commits it via `applyConversationTurn`, and only then asks Claude to phrase a reply —
  Claude never decides the state, it interprets intent within the state the backend already
  committed to (`ARCHITECTURE.md` §7).
- `applyConversationTurn` uses **optimistic version checking**: the caller passes the `version`
  it read; Apps Script rejects the write with `CONVERSATION_CONFLICT` if the row has since
  changed (e.g. two webhook deliveries for the same phone number processed concurrently), so the
  caller re-reads and retries rather than silently overwriting a newer state.
- Session expiry: if `now - lastInboundMessageAt > SESSION_TIMEOUT_MINUTES` (`SETTINGS`, default
  60 min) when a new message arrives, the handler resets `state = IDLE` and clears
  `scratchDataJson` **before** processing the new message, but the `CUSTOMERS` row and past
  `APPOINTMENTS` are untouched — expiry resets the conversation, not the customer relationship.

## 5. Validated state transitions

States: `IDLE`, `SELECTING_SERVICE`, `SELECTING_BARBER`, `SELECTING_DATE`, `SELECTING_TIME`,
`REQUESTING_NAME`, `REVIEWING_BOOKING`, `AWAITING_CONFIRMATION`, `BOOKING_CONFIRMED`,
`CANCELLING_BOOKING`, `RESCHEDULING_BOOKING`, `HUMAN_HANDOFF`.

- A small table in code (`lib/conversation/transitions.ts`) declares which `(fromState, event)`
  pairs are legal and what state they lead to. The handler looks up the transition; an event
  with no legal transition from the current state does **not** silently change state — it either
  re-prompts for the same missing piece of information or, for global intents (§6), jumps state
  via an explicitly allowed override (any non-handoff state → `HUMAN_HANDOFF` is always legal;
  `HUMAN_HANDOFF → IDLE` only through explicit manual reactivation, never automatically).
- Every transition is part of the `applyConversationTurn` call and its `reason` is recorded —
  this is the audit trail that makes "why did the bot do that" debuggable after the fact,
  instead of relying on chat transcripts alone.

## 6. Unexpected messages during an active flow

Two categories, checked before the state-specific handler runs (see also §47/§48 of the master
spec — deterministic handling before AI):

- **Deterministic inputs first**: button IDs, list IDs, numeric option selections, "sí"/"no"/
  "cancelar"/"empezar de nuevo", and anything the current state explicitly expects are matched
  without calling Claude at all — cheaper and more reliable than an AI round-trip for a fixed
  choice.
- **Global intents**, recognized regardless of current state: cancel/reschedule an existing
  appointment, explicit request for a human, a clear complaint/hostility signal. These interrupt
  `SELECTING_*`/`AWAITING_CONFIRMATION` flows — the in-progress `scratchDataJson` is kept (not
  discarded) in case the customer returns to it, and the state jumps per §5's override table.
- **Off-topic or unparseable input** within a state: Claude's structured output still returns
  *some* interpretation (`ARCHITECTURE.md` §7), but if it doesn't resolve to a valid entity for
  the current state or confidence is low, the handler re-asks the same pending question rather
  than guessing or advancing state. It never silently drops the message — every inbound message
  is persisted via `CONVERSATION_MESSAGES` before any interpretation happens (§3), independent
  of whether the bot understood it.

## 7. Interrupted-conversation recovery

Because state and scratch data are committed to the CRM sheet after every turn (not held
in-memory or reconstructed from chat history), a customer resuming after minutes, hours, or days
continues exactly where they left off — the next inbound message is handled against the
persisted conversation row, no different from a message one second later. This is the direct fix
for the sibling project's known risk (`TA-007`: Render's ephemeral filesystem wipes SQLite on
every redeploy, silently losing every conversation's state and any active human handoff).
Esquece's state lives in the Google Sheet, which survives Next.js redeploys entirely — this is
the primary reason a database-in-the-app-process was never acceptable for this project, whether
that database was SQLite or Postgres.

## 8. Human handoff

- Trigger detection (from Claude's `needsHumanHandoff` flag, or a global-intent keyword match as
  a safety net independent of the model): call `activateHumanHandoff` — creates a
  `HUMAN_HANDOFFS` row (reason, status `OPEN`, startedAt) and sets
  `CONVERSATIONS.humanHandoffActive = true`, `state = HUMAN_HANDOFF`, all under the same
  conversation lock as any other state transition.
- While `humanHandoffActive`, the webhook **still records every inbound message**
  (`CONVERSATION_MESSAGES`, §3/§6) — only the automated-reply path is skipped. Nothing about
  intake stops.
- No automated reply is generated or sent while handoff is active — not even a repeated "an
  agent will help you" message on every new inbound text; one handoff notice is sent once, at
  the moment of transition.
- Reactivation is **only** manual, from the admin dashboard (`resolveHumanHandoff`,
  `ARCHITECTURE.md` §8) — there is no code path that flips `humanHandoffActive` back to `false`
  automatically, matching the project's permanent rule against auto-reactivating a handed-off
  conversation.
- Per project rules, the bot never messages the human advisor's own number automatically;
  "internal alert" means a `NOTIFICATIONS` row (type `INTERNAL_ALERT`) for staff-facing channels
  (admin dashboard, email), not a WhatsApp message to the advisor.

## 9. Meta API errors and the 24-hour window

- Distinguish, in `lib/whatsapp/send.ts`, at least: `131047` (re-engagement/outside the 24-hour
  customer-initiated window — requires an approved template, not free-form text), auth/token
  errors, and generic failures. Log the Meta error code/title/message (no tokens) and record
  delivery status back onto `CONVERSATION_MESSAGES`/`NOTIFICATIONS` via the CRM client, same
  pattern as the sibling project's `message_statuses` table.
- Track `lastInboundMessageAt` per conversation (§4). Reminders and any message sent outside the
  24-hour customer-initiated window must use an approved WhatsApp template
  (`WHATSAPP_REMINDER_TEMPLATE_NAME`, etc.), never a free-form message. If the required template
  isn't configured, the notification is marked `FAILED` with a configuration error — never sent
  as free-form in violation of the window, and never silently dropped either.

## Reference, not a dependency

The above ports **behavior and lessons**, not code — Esquece has no import from, and no runtime
dependency on, `whatsapp-bot-inmobiliaria`. Nothing real-estate-specific (property flows,
advisor handoff phone number, qualification questions) is part of this design. (Note: this
project's *own* use of Google Sheets, via Apps Script as a CRM API, is unrelated to the sibling
project's direct Google Sheets sync via Apps Script Web App for lead export — the pattern name
is coincidentally similar; the architecture and purpose are not.)
