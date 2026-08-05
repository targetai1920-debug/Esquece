# Discovery and client inputs

Every project starts by collecting real facts, never inventing plausible-looking ones.
Anything missing gets a placeholder explicitly tagged `DEMO_DATA_REPLACE_BEFORE_PRODUCTION`
— never presented to the client, in code comments, or in the UI as if it were confirmed.

## How to ask

- Read everything the user already gave you first. Don't re-ask for a fact already stated.
- Group the genuinely missing items into one or two batched questions — don't interview
  field-by-field when most of the list can proceed with placeholders.
- Use placeholders (not blanks) for anything non-blocking, so the project stays buildable
  while data is pending. Only stop and ask when the absence of a specific fact would make
  the config actually non-functional (e.g. no timezone at all — can't compute a single
  slot without one).
- Never guess a country, currency, timezone, or phone format from a name or brand alone.

## Identity

- Business name, slug/short identifier.
- Logo, primary/secondary/background colors, heading/body fonts, general style description.
- Language(s) and locale (e.g. `es-BO`, `en-US`, `pt-BR`) — affects date/number formatting
  and default copy, not just translated strings.
- Physical address, map link/coordinates.
- Contact channels (phone, email, social links) actually meant to be public.

## Services

For each service: name, description, price, currency, duration (minutes), buffer/prep
time (if it differs from the business-wide default), category, image (optional), display
order, active/inactive.

## Staff

For each staff member: name, photo, short bio/specialties, which services they're
qualified to perform, whether they're visible for public booking, display order, and
their own working-hours schedule if it differs from general business hours.

## Schedule

- Timezone (IANA identifier — never assume no-DST or any other regional shortcut).
- Days open, general opening/closing hours.
- Per-staff working hours (if different from general hours).
- Recurring breaks (per staff or business-wide) and their times.
- Time off / vacations (per staff), with start/end date and optional start/end time for
  partial-day absences.
- Business-wide blackout dates/holidays.
- Manual one-off blocks (e.g. "closed this Saturday for a private event").
- Minimum booking notice (e.g. "at least 2 hours ahead").
- Maximum advance booking window (e.g. "up to 60 days ahead").
- Slot interval (e.g. every 15/30/60 minutes).
- Default buffer between appointments, if any, beyond service duration.

## Policies

- Cancellation policy (minimum notice, whether free, no-show consequences).
- Reschedule policy.
- Payment/deposit policy, if any (this skill's default scope doesn't implement payment
  processing — see `architecture-and-decisions.md` §"Explicitly out of scope by default").
- Privacy notes relevant to what's collected (name, phone, notes).
- Reminder timing preference (e.g. "24h before", "2h before", or both).
- Promotions the business has actually authorized to be shown/mentioned — never invent or
  imply one that isn't explicitly approved and currently valid.

## Technical operation

- Who owns the domain, hosting account, CRM backend account, messaging-provider account
  (if any), AI-provider account (if any), and admin email addresses.
- Who is responsible for renewing tokens/credentials over time — this is an operational
  question, not a code question, but leaving it unanswered means secrets rot silently.

## What "pending" looks like in the codebase

- Config values: use an explicit sentinel, e.g.
  `businessName: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION"` — never a real-sounding fake name.
- Seed/demo data (services, staff, schedules) used to make the system demonstrable before
  real data arrives: mark every such row with a `demo: true`-style flag your schema
  supports removing cleanly later, and never let a "demo mode" flag silently stay on in a
  production deployment (see `deployment-and-operations.md`'s pre-deploy checklist).
- Track outstanding items in one running document (e.g. `CLIENT_INFORMATION_REQUIRED.md`
  in the new project) so nothing gets silently forgotten, and update it as answers arrive
  instead of letting it go stale.

## Anti-pattern

Inventing a "reasonable-sounding" opening time, price, or staff name to keep moving, and
then letting that value quietly become the thing the client sees in a demo. If a screen
needs *something* to render, make the placeholder visibly a placeholder
(`DEMO_DATA_REPLACE_BEFORE_PRODUCTION`, or a UI banner in non-production builds), not a
plausible lie.
