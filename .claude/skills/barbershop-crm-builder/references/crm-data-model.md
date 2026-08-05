# CRM data model

Storage-agnostic entity model. Applies whether the CRM is spreadsheet-backed or a
relational database — table/sheet names and exact columns are illustrative, not a literal
contract to copy verbatim.

## Core entities (required)

- **SETTINGS** — business-wide configuration: timezone, locale, currency, open days,
  general hours, slot interval, minimum notice, maximum advance window, default buffer,
  session timeout (for chat channels), cancellation policy text. One key/value pair per
  setting (or one row per business, if single-tenant) so new settings can be added without
  a schema migration.
- **SERVICES** — id, name, description, price, currency, duration (minutes), buffer
  (minutes), category, image, active flag, display order.
- **STAFF** — id, name, bio, specialties, photo, contact info, active flag, public-booking
  visibility flag, display order, and (optionally) their own working-hours override.
- **STAFF_SERVICES** — join table: which staff can perform which services, each row
  independently active/inactive (a staff member can be temporarily unlinked from a service
  without deleting the relationship's history).
- **WORKING_HOURS** — per staff (or general, when staff is unset) per day-of-week:
  opening/closing time, active flag. A staff-specific row must only ever *restrict*, never
  *expand*, availability beyond general hours.
- **BREAKS** — recurring (by day-of-week) or one-time (by date), per staff or
  business-wide, start/end time, active flag, reason (optional).
- **TIME_OFF** — per staff, start date/time, end date/time (or all-day), reason, active
  flag. Store both the local date/time fields *and* an absolute-instant mirror (e.g. UTC
  ISO timestamps) computed at creation time, so overlap checks don't need to re-derive
  timezone-aware instants from local fields on every read (see
  `production-lessons.md`'s schema/code parity note — a real regression happened here).
- **BLOCKED_SLOTS** — manual blocks, per staff or business-wide (empty staff = whole
  business), date/time range, reason, who created it.
- **CUSTOMERS** — deduped by a normalized identifier (typically E.164 phone). Name, phone,
  optional email, source, status, first/last contact timestamps, running counters
  (total/confirmed/completed/cancelled/no-show appointments — kept in sync by status
  transitions, with a repair/recalculation tool for drift), notes, demo flag.
- **APPOINTMENTS** — id, human-readable reference, idempotency key, management-token hash
  (never the raw token — see `security-and-idempotency.md`), customer id + name/phone
  snapshot, service id + name/price/duration/buffer snapshot, staff id + name snapshot,
  local date/start/end, absolute start/end (UTC) + timezone, status, source
  (`WEBSITE | WHATSAPP | ADMIN | OTHER`), customer notes, internal notes, optional
  calendar-sync fields, cancellation reason, timestamps, demo flag.
- **NOTIFICATIONS** — reminders/confirmations queue: appointment id, type, channel,
  scheduled time, status, attempt count, last attempt, sent time, error info, idempotency
  key, payload.
- **AUDIT_LOG** — request id, actor type/id, action, entity type/id, before/after
  snapshots, metadata, timestamp. Written by every mutation, not just a subset.
- **FAQS**, **PROMOTIONS** — content the public-facing channels may read and (for
  promotions) must filter to currently-valid ones before ever surfacing them, including to
  an AI layer (see `optional-whatsapp-and-ai.md`).

## Optional modules (only if the corresponding channel exists)

- **CONVERSATIONS** / **CONVERSATION_MESSAGES** — per-channel chat session state and
  message log, if a chat channel (e.g. WhatsApp) is in scope.
- **WEBHOOK_EVENTS** — inbound-webhook dedup ledger, if any channel delivers via webhook.
- **HUMAN_HANDOFFS** — handoff-to-a-person state, if an AI/bot channel exists.

## Required properties of the appointment record

- **Snapshots, not live references.** `serviceNameSnapshot`, `servicePriceSnapshot`,
  `serviceDurationSnapshot`, `staffNameSnapshot`, `customerNameSnapshot`,
  `customerPhoneSnapshot` are copied at booking time and never recomputed later. Editing a
  service's price tomorrow must not change what a booking made today shows as its price.
- **Source tracking.** Every appointment records which channel created it
  (`WEBSITE | WHATSAPP | ADMIN | OTHER`), for reporting only — never used to alter
  availability logic.
- **Status lifecycle**: typically `PENDING → CONFIRMED → COMPLETED`, with `CANCELLED` and
  `NO_SHOW` reachable from `PENDING` or `CONFIRMED`. Only the "active" statuses (normally
  `PENDING`/`CONFIRMED`) block a slot — `CANCELLED`/`COMPLETED`/`NO_SHOW` never do. Make
  the exact blocking-status set configurable per project rather than hardcoded in more
  than one place.

## Customer deduplication

- Normalize the identifying field (usually phone, to E.164) at every write boundary before
  comparing — never compare raw, differently-formatted strings.
- A partial update must never erase previously-known fields. If a chat channel only
  captures a name, that write must not null out an email the website previously captured.
  Implement this as a merge (`existing ?? incoming` per field, preferring non-empty
  incoming values, never blind overwrite), not a full-row replace.

## Schema/code parity

Whatever declares the schema (a header-row constant, an ORM model, a migration file) must
be checked against the code that actually reads and writes each entity — a column that's
computed but forgotten in the schema declaration is a silent data-loss bug (see
`production-lessons.md` for a real instance: absolute-instant columns on a time-off record
were dropped from the header list and silently never written, breaking overlap checks that
depended on them). Add an explicit check (a test, or a startup validation) that the
declared schema and the actual write path agree, and re-run it whenever either changes.

## Setup/migration idempotency

Whatever creates or updates the schema (a setup function, a migration) must be safe to run
more than once: it should add missing tables/columns/settings without ever deleting
existing data or duplicating rows, and should never overwrite a value that's already been
set by a human. This matters most for spreadsheet-backed CRMs with no formal migration
tool — see `google-sheets-apps-script.md`.
