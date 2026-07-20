# SECURITY.md

Concrete security requirements for Esquece, and how each is enforced. Companion to
`ARCHITECTURE.md` §9 and `WHATSAPP_AGENT_DESIGN.md` §1/§8.

## Secrets and environment variables

- All credentials live in environment variables, never in code, docs, commit messages, or logs
  — only variable *names* appear in `.env.example`.
- `.env` is git-ignored. No `.env.local`, `.env.production`, etc. are ever committed either.
- No secret is sent to the browser. Any value prefixed `NEXT_PUBLIC_` is, by Next.js convention,
  public — the codebase must never put `META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`,
  `ANTHROPIC_API_KEY`, `CRM_API_KEY`, `CRM_SIGNING_SECRET`, or `AUTH_SECRET` behind that prefix.
- Apps Script secrets (`CRM_API_KEY`, `CRM_SIGNING_SECRET`, `CRM_SPREADSHEET_ID`) live in Script
  Properties on the Apps Script side, never in visible spreadsheet cells, and are only ever sent
  from the Next.js server — never the browser (see "CRM request signing" below).
- If a real credential is ever needed during development, it's requested and stored by the
  human operator directly in their deployment provider's env var UI, Apps Script's Script
  Properties, or local `.env` — never typed into a commit, an issue, or a chat transcript as a
  literal value.
- Server-side environment access is validated at startup (`lib/env`) — the app must fail fast
  and clearly if a required variable for the selected provider (`CRM_PROVIDER=appscript`,
  `AI_PROVIDER=anthropic`, `WHATSAPP_PROVIDER=meta`) is missing, rather than silently falling
  back to a mock in production (see `ARCHITECTURE.md` §2, provider architecture).

## Webhook signature verification (Meta)

- `POST /api/whatsapp/webhook` **always** verifies `X-Hub-Signature-256` against
  `META_APP_SECRET` using HMAC-SHA256 with a constant-time comparison. There is intentionally
  **no environment variable that can disable this** — no `ALLOW_INSECURE_WEBHOOK`-style escape
  hatch exists in this codebase, even for local development, because that kind of flag is one
  misconfigured deploy away from an open webhook.
- `GET` verification compares `hub.verify_token` against `META_VERIFY_TOKEN` with a
  constant-time comparison (`crypto.timingSafeEqual` on equal-length buffers; unequal length is
  treated as "no match" without leaking length information via timing).
- Missing signature, missing secret, or mismatched signature all result in `403`, logged without
  including the secret or the raw signature value.

## CRM request signing (Next.js ↔ Apps Script)

Since there is no shared database or private network between Next.js and Apps Script, every
CRM call is an explicitly signed request over the public internet:

- Envelope: `{ version, action, requestId, timestamp, nonce, apiKey, payload, signature }`.
- `signature = HMAC-SHA256(canonicalString, CRM_SIGNING_SECRET)`, hex-encoded, where
  `canonicalString` joins `version`, `timestamp`, `nonce`, `requestId`, `action`, and a
  stable (recursively key-sorted) JSON serialization of `payload`, one per line.
- The stable-serialization algorithm is implemented identically in Next.js (`lib/crm/signing.ts`)
  and Apps Script (`Security.gs`), verified against shared test vectors in `API_CONTRACT.md` so
  the two independent implementations can't silently drift apart.
- Apps Script rejects the request (without revealing which check failed) if: the API key doesn't
  match, the signature doesn't match (constant-time compare), the timestamp is more than 5
  minutes old or from the future, the nonce was already seen (`CacheService`), the action/version
  is unsupported, or the payload fails validation.
- The Apps Script Web App is **never called from the browser** — only server-side Next.js code
  holds `CRM_API_KEY`/`CRM_SIGNING_SECRET`.
- Mutating actions additionally require a client-supplied idempotency key, checked against
  already-processed requests before any write, so a retried request can't double-book, double-
  cancel, or double-create a customer.

## Admin authentication

- MVP approach (no separate user database — see `ARCHITECTURE.md`): `ADMIN_EMAIL` +
  `ADMIN_PASSWORD_HASH` environment variables, with a documented command to generate the hash.
  A future multi-user/role system is explicitly a later addition, not assumed now.
- Passwords are never stored or logged in plaintext; only the hash lives in the environment.
- Session cookie is signed (`AUTH_SECRET`), `httpOnly`, `secure` in production, `sameSite=lax`
  or stricter, with an expiration.
- Admin middleware runs before any admin page, admin API route, or admin server action executes
  — there is no admin data-mutating endpoint reachable without a valid session.
- Admin login is rate-limited (see "Rate limiting" below).
- Sensitive admin mutations validate request origin as a CSRF-safe pattern (same-origin check on
  top of the session cookie).

## Input validation

- Every external input boundary — website API routes, WhatsApp webhook payload fields used
  downstream, admin form submissions — is parsed with a `zod` schema before use. Failing
  validation returns a clear error, never a partially-processed write.
- Booking-engine functions (`createAppointment`, etc.) validate their inputs independently of
  whatever validated the HTTP request that called them — the engine does not assume its caller
  already checked everything, since it's also called from the WhatsApp handler and admin server
  actions, not just one HTTP route.

## CRM-level protections against races

- Race conditions in booking are prevented inside Apps Script via `LockService.getScriptLock()`
  (`ARCHITECTURE.md` §5, `BOOKING_RULES.md` §3) — the application-level check on the Next.js
  side is a UX nicety for a fast, friendly error, not the actual guarantee against
  double-booking.
- Webhook/message deduplication is a lock-guarded read-then-write against the `WEBHOOK_EVENTS`
  sheet (`WHATSAPP_AGENT_DESIGN.md` §3), not a separate check-then-write without a lock — closing
  the same race the sibling project had to specifically fix in SQLite.
- All multi-step CRM writes (appointment create/cancel/reschedule, conversation turns) happen
  inside a single Apps Script script-lock acquisition, with `SpreadsheetApp.flush()` before
  release — there is no partial-write state visible between concurrent requests.
- Appointment management tokens (`gestionar-reserva`) are stored only as a hash
  (`managementTokenHash`) in `APPOINTMENTS`; the raw token is returned to the customer once, at
  creation time, and never persisted in plaintext.

## Rate limiting

- Public, unauthenticated endpoints most exposed to abuse — booking creation, availability
  queries, the WhatsApp webhook `POST`, booking-management attempts, admin login — get rate
  limiting keyed by IP (and, where meaningful, by phone number for the webhook). MVP
  implementation is an in-memory provider abstraction (documented as not multi-instance-safe);
  a stronger external provider can be swapped in later without changing call sites. Tracked as a
  Phase K production-readiness item in `PROJECT_PLAN.md`.

## Logging

- Logs never contain: access tokens, app secrets, API keys, database credentials, full webhook
  signature values, or admin passwords/password hashes.
- Customer phone numbers are treated as private data: logged only when operationally necessary
  (e.g. tracing a specific delivery failure), never included in logs shipped to a third-party
  analytics/observability product without that product being an approved data processor.
- Meta API errors are logged with their code/title/message (useful for debugging delivery
  failures) — never with the request's `Authorization` header value.

## Audit logging (application data, not infra logs)

- Every admin-initiated (and significant system-initiated) create/update/cancel/reschedule/block
  action writes an `AUDIT_LOG` row via the CRM: actor type/id, action, entity type/id,
  before/after snapshot, timestamp. This is a persisted, queryable record — distinct from
  process logs — specifically so "who changed this appointment and when" is answerable from the
  Google Sheet itself, not just application logs.

## What's deferred, not skipped

Rate limiting middleware and a formal secret-rotation runbook are Phase K items, tracked in
`PROJECT_PLAN.md` — not implemented yet, and not silently assumed to already exist.
