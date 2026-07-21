# API_CONTRACT.md — Next.js ↔ Apps Script CRM API

Authoritative request/response contract for the signed CRM API. Implemented server-side in
`apps-script/Api.gs`/`Router.gs`/`Security.gs`; the matching Next.js-side signer
(`lib/crm/signing.ts`) is Phase E — until then, this document and the Apps Script source are the
only implementation, and the test vectors below exist precisely so the Phase E implementation
can be verified against them independently, without guessing whether it matches.

## Transport

- `POST` only, to the deployed Apps Script Web App's `/exec` URL (never `/dev` in production —
  see `APPS_SCRIPT_SETUP.md`).
- Body: a single JSON object (the "envelope", below).
- Called only from the Next.js server. Never from the browser — the browser never sees
  `CRM_API_KEY`/`CRM_SIGNING_SECRET`.

## Request envelope

```json
{
  "version": "1",
  "action": "createAppointment",
  "requestId": "uuid",
  "timestamp": 1710000000000,
  "nonce": "random-value",
  "apiKey": "secret",
  "payload": { "...": "action-specific" },
  "signature": "hex-hmac"
}
```

- `version`: currently always `"1"`. A request with any other value is rejected with
  `UNSUPPORTED_VERSION`.
- `timestamp`: milliseconds since epoch. Rejected with `REQUEST_EXPIRED` if more than 5 minutes
  old or more than 5 minutes in the future.
- `nonce`: unique per request. Apps Script tracks recently-seen nonces in `CacheService` (5
  minute TTL, matching the timestamp freshness window) and rejects a repeat with
  `NONCE_REUSED`.
- `apiKey`: compared to `CRM_API_KEY` (Script Property) with a constant-time comparison.
- `signature`: see "Signing" below.

## Signing

```
canonicalString =
  version + "\n" +
  timestamp + "\n" +
  nonce + "\n" +
  requestId + "\n" +
  action + "\n" +
  stableJson(payload)

signature = lowercase-hex( HMAC-SHA256(canonicalString, CRM_SIGNING_SECRET) )
```

`stableJson` is a specific, deterministic serialization — **not** `JSON.stringify` directly,
because plain `JSON.stringify` does not guarantee key order across engines/objects built in a
different order. Rules:

- Object keys are sorted alphabetically, recursively, at every nesting level.
- Array element order is preserved exactly as given.
- Numbers must be finite (`NaN`/`Infinity` are rejected as `INVALID_PAYLOAD`).
- `undefined` and functions are rejected (`INVALID_PAYLOAD`) — never silently dropped, so the
  signer and verifier can never disagree about what was actually included.
- No extra whitespace (`JSON.stringify`'s default compact form for primitives, comma-joined for
  arrays/objects — see the Apps Script reference implementation, `Security.gs`, for the exact
  recursive algorithm).

Reference implementation: `apps-script/Security.gs`'s `stableStringify_`/`buildCanonicalString_`.
The Next.js implementation (Phase E, `lib/crm/signing.ts`) must produce byte-identical output —
verify against the test vectors below before trusting it.

### Shared test vectors

All three vectors use signing secret `test-signing-secret` (not a real secret — for verifying
the algorithm only). Generated and verified with Node's `crypto` module against the same
algorithm implemented in `Security.gs`.

**Vector 1** — key sorting:

```
payload:   {"b":1,"a":2}
version:   1
timestamp: 1700000000000
nonce:     test-nonce
requestId: test-request-id
action:    health

stableJson(payload): {"a":2,"b":1}

canonicalString:
1
1700000000000
test-nonce
test-request-id
health
{"a":2,"b":1}

signature: d7eaa26d18d5db099c793f4674cdb116d7ad09a88fd8c8a8ed33a0f594b7bdf0
```

**Vector 2** — nested object, null, array, boolean:

```
payload: {"serviceId":"svc_1","barberId":null,"anyBarber":true,"localDate":"2026-07-21","localStartTime":"10:00","tags":["a","b"]}
version:   1
timestamp: 1700000000000
nonce:     test-nonce-2
requestId: test-request-id-2
action:    createAppointment

stableJson(payload): {"anyBarber":true,"barberId":null,"localDate":"2026-07-21","localStartTime":"10:00","serviceId":"svc_1","tags":["a","b"]}

canonicalString:
1
1700000000000
test-nonce-2
test-request-id-2
createAppointment
{"anyBarber":true,"barberId":null,"localDate":"2026-07-21","localStartTime":"10:00","serviceId":"svc_1","tags":["a","b"]}

signature: 5a29b9f0e91b339ba5f2cb20c8b2b307acd1647a6cf6fdd078f40b83065f252b
```

**Vector 3** — empty payload:

```
payload:   {}
version:   1
timestamp: 1700000000000
nonce:     test-nonce-3
requestId: test-request-id-3
action:    health

stableJson(payload): {}

canonicalString:
1
1700000000000
test-nonce-3
test-request-id-3
health
{}

signature: 19a7d590f15cf4c81e7be74fb7d042262d143296eb139fd7f353db11e194879d
```

## Response envelope

Success:

```json
{
  "ok": true,
  "requestId": "request-id",
  "data": {},
  "error": null,
  "meta": { "version": "1" }
}
```

Error:

```json
{
  "ok": false,
  "requestId": "request-id",
  "data": null,
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "El horario ya no está disponible.",
    "retryable": false,
    "details": null
  },
  "meta": { "version": "1" }
}
```

Never includes a stack trace, spreadsheet ID, or any secret. See `apps-script/Response.gs`.

## Error codes

Defined in `apps-script/Errors.gs`: `UNAUTHORIZED`, `INVALID_SIGNATURE`, `REQUEST_EXPIRED`,
`NONCE_REUSED`, `INVALID_REQUEST`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_ACTION`,
`INVALID_PAYLOAD`, `NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `SERVICE_NOT_FOUND`, `BARBER_NOT_FOUND`,
`SERVICE_INACTIVE`, `BARBER_INACTIVE`, `BARBER_NOT_ELIGIBLE`, `BUSINESS_CLOSED`,
`WEEKEND_CLOSED`, `OUTSIDE_BUSINESS_HOURS`, `DATE_IN_PAST`, `BOOKING_TOO_SOON`,
`BOOKING_TOO_FAR_IN_ADVANCE`, `SLOT_UNAVAILABLE`, `APPOINTMENT_NOT_FOUND`,
`APPOINTMENT_ALREADY_CANCELLED`, `APPOINTMENT_NOT_CHANGEABLE`, `IDEMPOTENCY_CONFLICT`,
`LOCK_TIMEOUT`, `CONVERSATION_CONFLICT`, `RATE_LIMITED`, `CALENDAR_SYNC_FAILED`,
`INTERNAL_ERROR`. Next.js maps each to a safe Spanish user-facing message (Phase E) — the code
itself is stable and machine-readable; the message in the response is a reasonable default, not
necessarily the final customer-facing copy.

## Actions implemented so far (Phases B–D)

| Action | Status |
|---|---|
| `health` | Implemented (Phase B) |
| `getApiVersion` | Implemented (Phase B) |
| `validateCrmStructure` | Implemented (Phase B) |
| `getBusinessSettings` | Implemented (Phase C) |
| `listServices` | Implemented (Phase C) |
| `getService` | Implemented (Phase C) |
| `listBarbers` | Implemented (Phase C) |
| `getBarber` | Implemented (Phase C) |
| `listBarbersForService` | Implemented (Phase C) |
| `listFaqs` | Implemented (Phase C) |
| `listPromotions` | Implemented (Phase C) |
| `findCustomerByPhone` | Implemented (Phase C) |
| `upsertCustomer` | Implemented (Phase C) |
| `getCustomer` | Implemented (Phase C) |
| `listCustomers` | Implemented (Phase C) |
| `getCustomerHistory` | Implemented (Phase C) — reads `APPOINTMENTS` directly |
| `getAvailability` | Implemented (Phase D) — read-only, the twelve-point check (BOOKING_RULES.md §1) |
| `validateSlot` | Implemented (Phase D) — single-slot version of the same check |
| `createAppointment` | Implemented (Phase D) — `LockService`-guarded, idempotency-key required, re-validates under the lock |
| `getAppointment` | Implemented (Phase D) |
| `getAppointmentByReference` | Implemented (Phase D) — optionally verifies a management token |
| `listAppointments` | Implemented (Phase D) — filterable by date/barber/status |
| `listCustomerAppointments` | Implemented (Phase D) |
| `cancelAppointment` | Implemented (Phase D) — idempotent, requires a management token for `actor.type === "customer"` |
| `rescheduleAppointment` | Implemented (Phase D) — validates the new slot before touching the old one |
| `updateAppointmentStatus` | Implemented (Phase D) — admin-only status transitions (e.g. `COMPLETED`, `NO_SHOW`) |
| `createAuditEntry` | Implemented (Phase D) |
| `listAuditEntries` | Implemented (Phase D) |
| `createNotification` | Implemented (Phase D) — row creation only, sending is Phase J |
| `listDueNotifications` | Implemented (Phase D) |
| `claimNotification` | Implemented (Phase D) — `LockService`-guarded PENDING→PROCESSING transition |
| `markNotificationSent` | Implemented (Phase D) |
| `markNotificationFailed` | Implemented (Phase D) |
| `cancelNotification` | Implemented (Phase D) |
| `getOrCreateConversation` | Implemented (Phase G, built ahead of Phase H — see note below) |
| `getConversation` | Implemented (Phase G) |
| `applyConversationTurn` | Implemented (Phase G) — lock-guarded, optimistic version check, appends message rows |
| `resetConversation` | Implemented (Phase G) |
| `appendConversationMessage` | Implemented (Phase G) |
| `registerWebhookEvent` | Implemented (Phase G) — lock-guarded dedup by `externalEventId` |
| `markWebhookEventProcessed` | Implemented (Phase G) |
| `markWebhookEventFailed` | Implemented (Phase G) |
| `activateHumanHandoff` | Implemented (Phase G) — lock-guarded, sets conversation state to `HUMAN_HANDOFF` |
| `resolveHumanHandoff` | Implemented (Phase G) — optional `reactivateBot` |
| `listOpenHumanHandoffs` | Implemented (Phase G) |
| `adminListServices` / `adminCreateService` / `adminUpdateService` | Implemented (Phase G) |
| `adminListBarbers` / `adminCreateBarber` / `adminUpdateBarber` | Implemented (Phase G) |
| `adminSetBarberServices` / `adminGetBarberServices` | Implemented (Phase G) |
| `adminListWorkingHours` / `adminSetWorkingHours` | Implemented (Phase G) |
| `adminListBreaks` / `adminCreateBreak` / `adminDeleteBreak` | Implemented (Phase G) — soft-delete via `active=false` |
| `adminListTimeOff` / `adminCreateTimeOff` / `adminDeleteTimeOff` | Implemented (Phase G) |
| `adminListBlockedSlots` / `adminCreateBlockedSlot` / `adminDeleteBlockedSlot` | Implemented (Phase G) |
| `adminListNotifications` | Implemented (Phase G) — any status, unlike `listDueNotifications` |
| `adminListConversations` | Implemented (Phase G) — optional `handoffActiveOnly` filter |
| `adminGetConversationMessages` | Implemented (Phase G) |
| `adminGetDashboardSummary` | Implemented (Phase G) — same figures as the `DASHBOARD` sheet, returned as JSON |

Conversation/webhook-dedup/human-handoff actions were originally planned to land together with
Phase H (WhatsApp infrastructure), their first *WhatsApp-side* consumer — but Phase G's admin
dashboard needed a conversations/handoffs view before Phase H started, so they were built now
instead, with this exception documented at the time (see `IMPLEMENTATION_STATUS.md`'s Phase G
entry). Every action here is listed directly in `apps-script/Router.gs`'s `ACTION_HANDLERS_`
object literal (not via `registerAction_` from another file's top-level scope — see the comment
at the top of `Router.gs` for why that would be an ordering hazard), and this table is updated in
the same commit as the code that adds an entry — check `git log` on this file, or
`IMPLEMENTATION_STATUS.md`, for the current truth if this table is ever stale.
