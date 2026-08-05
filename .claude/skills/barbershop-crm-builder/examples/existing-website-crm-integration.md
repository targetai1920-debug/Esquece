# Example: connecting an existing website to a real CRM

## Request

"We already have a nice-looking website with a booking page, but the booking flow is
simulated — nothing is actually saved anywhere. Connect it to a real backend/CRM."

## Expected approach

1. **Preserve the existing design.** This is an integration task, not a redesign — don't
   rewrite visual components, copy, or layout that already work; audit them to understand
   what data they currently fake, so the real integration replaces exactly that.
2. **Audit the current flow** — list every hardcoded service/staff/slot/response the UI
   currently fakes, and every assumption baked into its step order (e.g. does the UI
   assume staff before service, or service before staff? does it assume every staff member
   does every service?).
3. **Introduce the API layer** (`references/public-api-and-booking-website.md`) if it
   doesn't already exist, following the browser → backend API → CRM client layering — never
   have the existing frontend call the CRM directly, even if that seems like the shorter
   path for a page that already exists.
4. **Replace hardcoded data with real API calls**, one screen at a time: business
   settings/hours, services, staff (filtered by selected service), availability, then
   appointment creation.
5. **Add the states the simulated version never needed**: loading, empty, and error states
   for every real fetch (a mock never fails; a real API can).
6. **Add idempotency** (`references/security-and-idempotency.md`) — a simulated "success"
   screen doesn't need a real idempotency key; a real one does.
7. **Handle `SLOT_UNAVAILABLE`** — the simulated flow never had a real conflict to handle;
   wire the actual recovery flow (return to date/time, preserve customer details, offer
   fresh alternatives).
8. **Verify without rewriting what already works** — run the site's existing tests (if
   any) plus new ones for the integration points, confirm visually that nothing about the
   design regressed, and confirm the booking flow now produces a real, persisted
   appointment.

## What a correct result looks like

- The visual design is unchanged (or changed only where the data model genuinely requires
  a different interaction, e.g. a staff list that used to be static now needs a loading
  state).
- No hardcoded service/staff/slot data remains in the shipped frontend.
- A real booking, made through the site, is visible through the admin dashboard / CRM and
  blocks the same slot for any other channel that reads the same CRM.
- `SLOT_UNAVAILABLE` is handled gracefully, not as an unhandled error.

## Common failure to avoid

Treating "connect it to a real backend" as an excuse to rebuild the whole site from
scratch, or leaving the browser calling the CRM/spreadsheet API directly because "it's
already working that way" — both are scope violations of what was actually asked, and the
second one is also a security defect (`references/security-and-idempotency.md`).
