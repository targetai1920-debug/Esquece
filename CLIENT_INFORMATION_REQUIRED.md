# CLIENT_INFORMATION_REQUIRED.md — Esquece Barber Studio

Information to request from Esquece Barber Studio before real (non-demo) data can replace the
`DEMO_DATA_REPLACE_BEFORE_PRODUCTION`-marked placeholders. Nothing in this list should be
guessed or invented in the meantime.

## Services

- Final list of services offered.
- Price per service (and currency — assumed BOB, confirm).
- Duration per service (minutes).
- Buffer/prep time per service, if any differs from the business-wide default.
- Which services should be marked featured / display order.
- Service images, if any.

## Barbers

- Full list of barbers currently working.
- Photo for each.
- Short bio / specialties for each.
- Which services each barber is qualified to perform (`BarberService` mapping).

## Schedules

- Working schedule per barber per day of week (start/end times).
- Recurring breaks per barber (e.g. lunch) and their times.
- Days off (recurring, e.g. "closed Sundays") and one-off time off (vacations, etc.), per
  barber.
- Whether any blackout dates apply business-wide (holidays, etc.).
- Minimum lead time required to book (e.g. "at least 2 hours ahead").
- Maximum number of days in advance a customer may book.
- Default buffer time between appointments, if the business wants one beyond service duration.

## Location

- Exact address (confirm: Av. Portales / Calle Tomás Frías, Cochabamba — currently only
  approximate).
- Google Maps link or coordinates.

## Payments and policy

- Accepted payment methods (cash, QR, card, etc.).
- Cancellation policy: minimum notice, whether cancellations are free, no-show consequences.
- Any promotions currently authorized for the bot/website to mention.

## WhatsApp / Meta

- Business WhatsApp number.
- Meta Business Manager / WhatsApp Business Account (WABA) access.
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- Access token generation (`WHATSAPP_ACCESS_TOKEN`) — who owns/renews it.
- `META_APP_SECRET`, chosen `META_VERIFY_TOKEN`.

## Claude API

- `ANTHROPIC_API_KEY` — whether TargetAI provisions this or the client does.

## Brand assets

- Official logo files (crowned smiling face, X-eyes) — not to be recreated/approximated; a
  placeholder is used until these arrive.
- Accent "electric" color — exact hex code.
- Additional photography (studio, barbers at work) for the website.

## Operations

- Names/numbers of people who should receive internal alerts (new booking, human handoff) —
  note: per project rules, the bot must never message the human advisor automatically; this is
  for future internal-alert configuration only, requires separate explicit authorization.
- Preferred reminder timing (e.g. "24h before", "2h before", or both).
- Any existing booking data to migrate (if the studio currently tracks appointments somewhere).

## Status

Nothing on this list has been received yet. All service/barber/schedule/price data currently in
the codebase, if any, must be treated as demo data only.
