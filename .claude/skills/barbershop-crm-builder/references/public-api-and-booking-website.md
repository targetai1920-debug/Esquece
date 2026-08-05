# Public API and booking website

## Layering — never skip a layer

```
Browser
  → This project's public backend API
    → Server-side CRM client
      → CRM implementation
```

The browser never receives CRM credentials, signing secrets, internal/private URLs,
admin credentials, or any third-party integration secret (messaging provider, AI
provider). The browser never calls the CRM backend directly when the operation needs a
secret, authorization, central business-rule enforcement, or origin validation — which in
practice means: never, for any mutating operation, and never for reads that would expose
more than the public API intentionally chooses to expose.

## Response envelope

Use one consistent shape for every endpoint:

```json
{ "ok": true, "requestId": "uuid", "data": { }, "error": null }
```

```json
{
  "ok": false,
  "requestId": "uuid",
  "data": null,
  "error": { "code": "SLOT_UNAVAILABLE", "message": "Safe, user-facing message", "retryable": false }
}
```

`error.code` must be a stable, documented enum the frontend switches on — never make the
frontend parse or pattern-match `error.message` to decide what to do next. `message` is
safe to display as-is but is not the contract; `code` is. `retryable` tells the caller
whether resubmitting the identical request is worth it (e.g. after a timeout) versus
requiring the user to change something (e.g. pick a different slot).

## Minimum endpoint set

- Public business data: settings (hours, timezone, currency, policies), services list,
  single service, staff list, single staff, staff filtered by service, FAQs, currently-
  valid promotions.
- Availability: a list-candidate-slots query, and a lighter single-slot validity check
  (useful right before showing a confirmation screen — still not the actual guarantee,
  confirmation is).
- Appointment creation.
- Safe appointment lookup/cancel/reschedule, gated by a management token issued once at
  creation (not a login) — see `security-and-idempotency.md`.

## CORS and origin enforcement

- Configure an explicit allow-list of origins (the real public website's origin(s)) —
  never a wildcard for any mutating endpoint.
- Validate `Origin` **server-side**, independent of CORS headers, on every mutation — CORS
  alone is a browser-enforced convention, not a server-side guarantee.
- Requests with no `Origin` header (server-to-server, not a browser) are a separate case —
  decide deliberately whether to allow them per endpoint, don't leave it as an accident of
  how the origin check happens to be written.

## Rate limiting

Per-endpoint-category limits (reads more permissive than availability queries, mutations
most restricted), keyed by client identity (e.g. IP). A limit exceeded returns a stable
rate-limit error code with retry guidance. An in-memory limiter is fine for a single
backend instance and **not** safe once horizontally scaled — document this explicitly
rather than silently letting it degrade under scale-out.

## Booking website requirements

- Mobile-first layout.
- Load real configuration/services/staff from the API on page load — never hardcode a
  service, staff member, or time slot as a UI default.
- Staff list filtered by the selected service (call the service-scoped staff endpoint,
  don't show every staff member for every service and rely on a later error).
- Calendar/date picker driven by real business-hours configuration — closed days disabled,
  advance-booking limit enforced in the UI *and* independently re-enforced server-side.
- Real availability query, not a static/generated placeholder.
- Explicit loading, empty, and error states for every fetch — never silently show nothing
  or stale data.
- Buttons disabled during in-flight submissions.
- Client-side form validation, plus server-side validation as the actual authority.
- Configurable phone-number normalization (country-specific — never hardcode one country's
  rules as universal, see `discovery-and-client-inputs.md`).
- A review/summary step before final confirmation.
- A real confirmation screen showing the actual reference/status/price returned by the
  API — never a client-invented "your booking is saved" message not backed by an actual
  successful mutation response.
- Basic accessibility (labeled inputs, focus management, sufficient contrast).
- Back-navigation that preserves already-entered data.

**On any API failure, show an honest error and a retry option — never fall back to
fabricated services/staff/slots to keep the UI looking populated.**

## Default flow

```
Service → Staff (or "any available") → Date & time → Customer details → Review → Confirm
```

Some businesses prefer picking staff before service — that's a legitimate variant, but
remember the staff list usually depends on the chosen service (a person may not perform
every service), so reordering this flow means re-deriving that dependency, not just
re-arranging screens.

## Idempotency from the frontend

- Generate a fresh idempotency key client-side per *logical* booking attempt.
- Reuse the exact same key when retrying the *same* attempt after a network failure.
- Generate a *new* key if the customer changes service, staff, date, time, or any other
  field that changes the booking's actual content.
- Don't rely on a disabled button alone to prevent duplicate submission — the backend must
  independently enforce idempotency (see `security-and-idempotency.md`); the frontend
  behavior is a UX nicety, not the correctness mechanism.

## Handling `SLOT_UNAVAILABLE` at confirmation time

When the backend reports the slot just became unavailable:

- Do **not** clear the customer's already-entered details.
- Do **not** show a false success state.
- Return to the date/time step.
- Re-query availability for fresh options.
- Explain plainly that the slot was just taken, and offer alternatives.

## Reschedule/cancel via management token

Viewing, cancelling, or rescheduling an existing booking requires the management token
issued once at creation — a reference number alone is never sufficient. A missing or wrong
token returns an unauthorized-style error, not a lookup by reference alone.

## Staleness

Re-fetch availability whenever the customer changes service, staff, or date; after roughly
a couple of minutes of inactivity on the same screen; or immediately after a
`SLOT_UNAVAILABLE` response. Never cache an availability response across a mutation
attempt.
