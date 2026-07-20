# SECURITY.md

Concrete security requirements for Esquece, and how each is enforced. Companion to
`ARCHITECTURE.md` §9 and `WHATSAPP_AGENT_DESIGN.md` §1/§8.

## Secrets and environment variables

- All credentials live in environment variables, never in code, docs, commit messages, or logs
  — only variable *names* appear in `.env.example`.
- `.env` is git-ignored. No `.env.local`, `.env.production`, etc. are ever committed either.
- No secret is sent to the browser. Any value prefixed `NEXT_PUBLIC_` is, by Next.js convention,
  public — the codebase must never put `META_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`,
  `ANTHROPIC_API_KEY`, `DATABASE_URL`, or `AUTH_SECRET` behind that prefix.
- If a real credential is ever needed during development, it's requested and stored by the
  human operator directly in their deployment provider's env var UI or local `.env` — never
  typed into a commit, an issue, or a chat transcript as a literal value.

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

## Admin authentication

- Every route under the admin route group is behind session-based authentication (library
  choice finalized in Phase 4; Auth.js/NextAuth with credentials + a strong password hash —
  e.g. `bcrypt`/`argon2` — is the default absent a reason to deviate).
- Passwords are never stored or logged in plaintext.
- Session cookies are `httpOnly`, `secure` in production, `sameSite=lax` at minimum.
- Admin middleware runs before any admin API route handler or server action executes — there is
  no admin data-mutating endpoint reachable without a valid session.

## Input validation

- Every external input boundary — website API routes, WhatsApp webhook payload fields used
  downstream, admin form submissions — is parsed with a `zod` schema before use. Failing
  validation returns a clear error, never a partially-processed write.
- Booking-engine functions (`createAppointment`, etc.) validate their inputs independently of
  whatever validated the HTTP request that called them — the engine does not assume its caller
  already checked everything, since it's also called from the WhatsApp handler and admin server
  actions, not just one HTTP route.

## Database-level protections

- Race conditions in booking are prevented at the database level (Postgres `EXCLUDE` constraint,
  `ARCHITECTURE.md` §5) — the application-level check is a UX nicety for a fast, friendly error,
  not the actual guarantee against double-booking.
- Message deduplication is a single atomic `INSERT ... ON CONFLICT DO NOTHING`
  (`WHATSAPP_AGENT_DESIGN.md` §3), not a separate check-then-write, closing the race the sibling
  project had to specifically fix in SQLite.
- All multi-step writes (appointment create/cancel/reschedule) run inside a Prisma transaction.

## Rate limiting

- Public, unauthenticated endpoints most exposed to abuse — booking creation, availability
  queries, the WhatsApp webhook `POST` — get rate limiting keyed by IP (and, where meaningful,
  by phone number for the webhook) before Phase 7 ships to production. Not yet implemented in
  Phase 1; tracked as a Phase 7 production-readiness item in `PROJECT_PLAN.md`.

## Logging

- Logs never contain: access tokens, app secrets, API keys, database credentials, full webhook
  signature values, or admin passwords/password hashes.
- Customer phone numbers are treated as private data: logged only when operationally necessary
  (e.g. tracing a specific delivery failure), never included in logs shipped to a third-party
  analytics/observability product without that product being an approved data processor.
- Meta API errors are logged with their code/title/message (useful for debugging delivery
  failures) — never with the request's `Authorization` header value.

## Audit logging (application data, not infra logs)

- Every admin-initiated create/update/cancel/reschedule/block action writes an `AuditLog` row:
  actor, action, entity type/id, before/after snapshot, timestamp. This is a persisted,
  queryable record — distinct from process logs — specifically so "who changed this
  appointment and when" is answerable from the admin dashboard itself.

## What's deferred, not skipped

Rate limiting middleware and a formal secret-rotation runbook are Phase 7 items, tracked in
`PROJECT_PLAN.md` — not implemented in Phase 1, and not silently assumed to already exist.
