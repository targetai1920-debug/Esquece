# Optional: chat channel (e.g. WhatsApp) and AI

The core system (`SKILL.md` §8 invariants) must work completely without either of these.
Treat both as add-on channels that consume the same engine, never a parallel system.

## Chat channel (e.g. WhatsApp Cloud API)

### Webhook verification

- A verification `GET` handshake: validate the provider's mode/token against your
  configured verify token with a constant-time comparison; return the provider's challenge
  only when valid, reject otherwise.
- An inbound `POST`: read the **raw** request body before any JSON parsing, verify the
  provider's HMAC signature header against that raw body with your app secret, and only
  parse JSON after the signature check passes. **No environment flag ever disables this
  check**, in any environment.
- Return success quickly once the payload is structurally accepted, even if downstream
  processing later fails — most providers retry aggressively on non-success responses, and
  retries must not be able to duplicate side effects (next section handles that).
- Process each event independently (its own error handling) so one malformed event in a
  batch doesn't drop the rest.

### Deduplication — atomic, not check-then-insert

A naive "check if we've seen this event id, then insert if not" done as two separate
steps is a real race under concurrent webhook deliveries. Make the check-and-claim atomic:
under the same lock/transaction used elsewhere in the CRM, look up the external event id;
if absent, insert a "processing" record and proceed; if present, treat as a duplicate and
skip. This is the same mechanism class as the double-booking guard
(`booking-and-availability-rules.md`) — one lock/transaction-guarded read-then-write, not
a unique-constraint-only approach layered on top of a check that already raced.

### Phone number normalization — one function, one place

Normalize phone/identifier values with exactly one function, imported everywhere a phone
number is compared, stored, or sent. A second, slightly-different normalization
implementation appearing anywhere else in the codebase is a defect waiting to cause a
duplicate customer record or a failed lookup — this has happened in practice.

### Conversation state — persisted, not in-memory or reconstructed from history

Store conversation state (current step, scratch data being collected, session expiry) in
the CRM, not in application memory and not reconstructed by replaying chat history. This
matters specifically because application processes can restart or redeploy at any time —
state kept only in memory is silently lost on every restart, including any in-progress
human handoff. Use an explicit, small state-machine table (which state + which event leads
to which next state) rather than ad hoc conditional branching, so "what happens on an
unexpected message" is a lookup, not a guess.

- **Deterministic inputs before AI**: button/list selections, numeric menu choices,
  yes/no, cancel, restart — match these directly, without an AI round-trip, whenever the
  current state expects one of them. Cheaper and more reliable than asking a model to
  re-derive a fixed choice.
- **Global intents** (cancel/reschedule an existing booking, explicit request for a human)
  should be recognized regardless of current state and allowed to interrupt an in-progress
  flow — keep the interrupted flow's scratch data rather than discarding it, in case the
  customer returns to it.
- **Off-topic or unparseable input**: if the AI's interpretation doesn't resolve to a valid
  choice for the current state, or confidence is low, re-ask the same pending question
  rather than guessing or silently advancing state. Every inbound message is still
  recorded, independent of whether it was understood.
- Every state transition should be recorded through one explicit, validated write — using
  optimistic concurrency (a version check) if two deliveries for the same conversation
  could race — so the AI's output never directly mutates state; it only proposes an
  interpretation the backend decides whether to act on.

### Human handoff

- Trigger on an explicit request, a detected signal (e.g. hostility, repeated confusion),
  or an AI-reported "needs human" flag as a safety net independent of the model.
- While a handoff is active, automated replies stop, but message intake never does — every
  inbound message is still recorded.
- Send the "connecting you with a person" notice once, at the moment of transition — not
  repeated on every subsequent inbound message.
- Reactivation is manual only, from an admin surface — never an automatic code path that
  flips a conversation back to bot-handled. If the business has a rule against
  auto-messaging a human staff member's own number, keep "internal alert" and "message the
  advisor directly" as clearly separate mechanisms — an internal alert is a notification
  row/admin-visible signal, not an outbound message to a person's phone, unless the
  business has explicitly authorized that specific behavior.

### Provider errors and the messaging window

Distinguish, at minimum: outside-the-free-response-window errors (which require a
pre-approved template, not free-form text), authentication/token errors, and generic
failures. Track the last inbound message time per conversation; anything sent outside the
provider's free-response window must use an approved template — if no template is
configured, fail safely with a clear configuration error rather than sending free-form in
violation of the window, and never silently drop the notification either.

## AI (interpretation and phrasing only — never booking authority)

The AI layer's job is exactly two things: interpret natural-language input into a
structured intent, and draft a natural-sounding reply in the business's language. It must
never:

- Invent a service, price, staff member, or promotion not actually present and active in
  the CRM.
- Invent or assume availability.
- Create, cancel, or reschedule a booking directly — every mutation still goes through the
  same validated engine path (lock/transaction, re-validation) as any other channel, with
  the AI's output treated as a proposed interpretation, not an authorized action.
- Confirm success to the customer before the actual CRM mutation has returned success.
- Change conversation state on its own — see previous section.

Use a structured-output contract (the model returns a typed interpretation, not free text
to be regex-parsed) so downstream code can validate the interpretation before acting on
any part of it.

Provide a mock AI provider (deterministic, no external call) alongside the real one, so
the whole conversation flow is testable and demonstrable without live credentials — but
**never let a production deployment silently fall back to the mock** for real traffic if
the real provider is unconfigured or fails; fail loudly/visibly instead, so a missing
credential is caught during setup, not discovered as customers receiving mock responses.

## Calendar sync (if used) — best-effort, never authoritative

If syncing bookings to an external calendar, treat it as best-effort: a sync failure must
never block or roll back an otherwise-valid booking (unless the business has explicitly
required the opposite), must be recorded (sync status + error, visible to an admin), and
must leave the CRM as the actual source of truth regardless of sync state. Use a fake/
in-memory calendar implementation for tests — a sync failure is business-relevant to test,
but tests should never touch a real external calendar.
