# WEBSITE_INTEGRATION.md

How the **separate** public Esquece website (built outside this repository — see
`ARCHITECTURE.md`) integrates with the booking API this repository exposes. Written to be
complete enough to connect that website without inspecting this backend's internals. Machine-
readable version: `openapi.yaml`.

## Base URL

Local development: `http://localhost:3000`. Production: `NEXT_PUBLIC_APP_URL` of this repo's
Render deployment — see `RENDER_SETUP.md`. All endpoints below are relative to that base.

**The website calls this API. It never calls Google Apps Script directly and never receives a
CRM secret.** This API is the only thing that knows `CRM_API_KEY`/`CRM_SIGNING_SECRET`.

## Authentication

None for public reads. Appointment management (view/cancel/reschedule) requires the
`managementToken` issued at creation time (see below) — not a login, not a cookie.

## CORS

Set `PUBLIC_WEBSITE_ORIGIN` in this repo's environment to the website's exact origin(s)
(comma-separated for more than one, e.g. staging + production). Requests from any other
`Origin` are rejected on mutation endpoints (create/cancel/reschedule) even if CORS preflight is
somehow bypassed — this API validates `Origin` server-side too, not just via CORS headers.
Requests with no `Origin` header at all (server-to-server calls, not a browser) are not subject
to this check. In development, `http://localhost:3000` is allowed automatically.

## Response envelope

Every endpoint returns this shape, `data` type varies:

```json
{ "ok": true, "requestId": "uuid", "data": { }, "error": null }
```

```json
{ "ok": false, "requestId": "uuid", "data": null, "error": { "code": "SLOT_UNAVAILABLE", "message": "El horario ya no está disponible.", "retryable": false } }
```

`error.code` is one of the stable codes in `API_CONTRACT.md` (`SERVICE_NOT_FOUND`,
`SLOT_UNAVAILABLE`, `WEEKEND_CLOSED`, `RATE_LIMITED`, etc.). `error.message` is a safe, ready-
to-display Spanish string — the website doesn't need its own error-code-to-message mapping,
though it can override specific messages for its own copy/tone if desired. `error.retryable`
indicates whether the same request is worth retrying (e.g. after a timeout) versus needing user
input to change (e.g. picking a different slot).

## Rate limiting

In-memory, per-endpoint-category, keyed by client IP: 120 req/min for reads, 60 req/min for
availability queries, 20 req/min for appointment mutations. Exceeding the limit returns
`RATE_LIMITED` (HTTP 429) with a `Retry-After` header (seconds). Not currently safe across
multiple backend instances — fine at Esquece's expected traffic; revisit if this API is ever
horizontally scaled (`SECURITY.md`).

## Endpoints

### Business data (`GET`, no body)

| Endpoint | Returns |
|---|---|
| `GET /api/public/settings` | `BusinessSettings` — hours, timezone, currency, address, policies, etc. |
| `GET /api/public/services` | `Service[]`, active only, sorted by `displayOrder` |
| `GET /api/public/services/{serviceId}` | `Service` |
| `GET /api/public/barbers` | `Barber[]`, active + public-booking only |
| `GET /api/public/barbers/{barberId}` | `Barber` |
| `GET /api/public/barbers?serviceId={id}` | `Barber[]` eligible for that service — call this after the customer picks a service |
| `GET /api/public/faqs` | `Faq[]` |
| `GET /api/public/promotions` | `Promotion[]`, already filtered to currently-valid ones |

### Availability (`POST`)

`POST /api/public/availability`

```json
{ "serviceId": "svc_1", "localDate": "2026-07-23", "anyBarber": true }
```

or with a specific barber: `{ "serviceId": "...", "localDate": "...", "barberId": "brb_1" }`.
Returns `AvailableSlot[]`: `{ localStartTime, localEndTime, barberIds }[]`, sorted by time.
**Never trust this as final** — re-validate at confirmation (see below); it can go stale between
when the customer looks and when they confirm, especially since WhatsApp/admin bookings on the
same slot are possible at any moment (`ARCHITECTURE.md` §10).

`POST /api/public/availability/validate` — lighter-weight single-slot check:
`{ "serviceId", "barberId", "localDate", "localStartTime" }` → `{ "valid": true }` or
`{ "valid": false, "reason": "SLOT_UNAVAILABLE" }`. Useful right before showing the confirmation
screen, but still not the actual guarantee — `createAppointment` is.

### Creating an appointment (`POST`)

`POST /api/public/appointments`

```json
{
  "idempotencyKey": "client-generated-uuid",
  "serviceId": "svc_1",
  "barberId": "brb_1",
  "localDate": "2026-07-23",
  "localStartTime": "10:00",
  "customer": { "name": "Juan Pérez", "phoneE164": "+59171234567" },
  "customerNotes": "optional"
}
```

(`barberId` may be omitted if `"anyBarber": true` is set instead.)

**`idempotencyKey` is required.** Generate a fresh UUID client-side per booking attempt, and
reuse the *same* key if you retry after a network error/timeout — a retry with the same key and
same request data returns the original appointment (`idempotent: true` in the response), not a
duplicate. Reusing the key with *different* data returns `IDEMPOTENCY_CONFLICT` — generate a new
key for a genuinely new booking attempt.

Success response:

```json
{
  "ok": true,
  "data": {
    "appointment": { "reference": "ESQ-20260723-AB12", "status": "CONFIRMED", "...": "..." },
    "managementToken": "raw-token-shown-once",
    "idempotent": false
  }
}
```

**Save `managementToken` immediately** — it is returned exactly once, at creation. Only its hash
is ever stored server-side; it cannot be recovered later. Construct your own management page URL
however fits your site, e.g. `https://your-domain/gestionar-reserva/{reference}?token={managementToken}`
— this API has no opinion on that URL's shape, it only issues the token.

If the slot was taken between when you queried availability and when you confirmed, this
returns `SLOT_UNAVAILABLE` (HTTP 409). Recovery: re-call `POST /api/public/availability` for
fresh options and let the customer pick again — **preserve** the name/phone/notes they already
entered; don't make them retype anything.

### Managing an existing appointment

All three below require `?token={managementToken}` (GET) or `"managementToken"` in the body
(POST) — a reference alone is not sufficient to view or change a booking.

`GET /api/public/appointments/{reference}?token={managementToken}` → `Appointment`. Missing or
wrong token → `UNAUTHORIZED` (401).

`POST /api/public/appointments/{reference}/cancel`
```json
{ "managementToken": "...", "reason": "optional" }
```
Idempotent — cancelling an already-cancelled appointment succeeds without error. Cancelling a
completed one returns `APPOINTMENT_NOT_CHANGEABLE`.

`POST /api/public/appointments/{reference}/reschedule`
```json
{ "managementToken": "...", "newLocalDate": "2026-07-24", "newLocalStartTime": "11:00" }
```
The new slot is validated before the old one is touched — a rejected reschedule
(`SLOT_UNAVAILABLE`) leaves the original appointment completely unchanged; show fresh
availability and let the customer pick again, same recovery pattern as creation.

## How a website booking affects WhatsApp (and vice versa) immediately

There is no cache or sync delay to account for. The moment `POST /api/public/appointments`
returns `ok: true`, that slot is written to the same Google Sheet the WhatsApp agent and admin
dashboard read from — the very next `getAvailability` call from any channel already reflects it.
See `ARCHITECTURE.md` §10 for the full guarantee and what backs it (one shared `CrmClient`, one
Apps Script API, one Sheet, one `LockService`-guarded write path).

## Displaying closed days and business hours

`GET /api/public/settings` returns `MONDAY_OPEN`...`SUNDAY_OPEN` (booleans),
`OPENING_TIME`/`CLOSING_TIME`, and `SLOT_INTERVAL_MINUTES` — use these to disable closed days in
your date picker and set reasonable UI expectations, but **the server still enforces this
independently** on every availability/creation call regardless of what your UI allows the
customer to click.

## Service duration and barber eligibility

`Service.durationMinutes` (+ `bufferMinutes`, or the business's `DEFAULT_BUFFER_MINUTES` from
settings if the service doesn't override it) determines how long a slot actually blocks — don't
hardcode duration assumptions in your UI. Always call
`GET /api/public/barbers?serviceId={id}` after a service is selected, rather than showing every
barber for every service — a barber not linked to a service will be rejected at booking time
with `BARBER_NOT_ELIGIBLE` if you skip this.

## Avoiding stale slot state

Re-fetch availability whenever: the customer changes service, barber, or date; more than ~2
minutes have passed since the last fetch on the current screen; or a booking attempt just
returned `SLOT_UNAVAILABLE`. Don't cache availability responses beyond the current step.

## Request size limits

Standard Next.js body size limits apply (a few MB) — irrelevant in practice, since every request
body here is a small JSON object; nothing here accepts file uploads.

## Development / mock mode

This repo can run with `CRM_PROVIDER=mock` (the default), which serves the exact same API
contract against an in-memory store seeded with demo services/barbers
(`DEMO_DATA_REPLACE_BEFORE_PRODUCTION`) — useful for developing the website against a stable,
zero-credential local backend before Apps Script is deployed. See `README.md`.

## Production configuration checklist (this repo's side)

- `CRM_PROVIDER=appscript` with real `CRM_APPS_SCRIPT_URL`/`CRM_API_KEY`/`CRM_SIGNING_SECRET`
  (`APPS_SCRIPT_SETUP.md`).
- `PUBLIC_WEBSITE_ORIGIN` set to the real website's origin(s).
- `NEXT_PUBLIC_APP_URL` set to this API's real deployed URL (so the website knows what to call).
