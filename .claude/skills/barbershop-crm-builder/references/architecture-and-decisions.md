# Architecture and decisions

## Core principle

The product is a **shared booking-and-availability engine backed by a CRM**, not a
website and not a chatbot. Every interface — public booking website, admin dashboard,
optional WhatsApp/AI agent, future mobile app, internal tools — is a *consumer* of one
engine and one source of truth. No interface computes, caches, or trusts its own
availability logic; the CRM/backend is the only thing allowed to actually create, cancel,
or reschedule a booking.

```
   Public website          Optional channel (e.g. WhatsApp)     Admin dashboard
   (may be a separate            │                                     │
    repo/host/domain)            │ webhook / API                       │ same backend,
        │                        │                                     │ authenticated
        ▼                        ▼                                     ▼
                    Backend application (this project)
                                   │
                                   ▼
                Central server-side CRM client (CrmClient interface)
                                   │
                                   ▼
                              CRM implementation
                          (spreadsheet+script, or a
                           relational database, etc.)
```

Everything below "Backend application" is identical regardless of which interface
triggered the request — that identity is what makes cross-channel guarantees hold
automatically instead of needing per-channel special-casing (see
`testing-and-ci.md`'s cross-channel tests).

## Storage decision tree

Don't default to one storage choice. Decide per project.

### Spreadsheet + script backend (e.g. Google Sheets + Apps Script)

Good fit when most of these are true:
- One location, or a small number.
- Low-to-medium booking volume.
- Tight budget, no dedicated backend infra desired.
- The owner wants to be able to open a spreadsheet and read/edit data directly.
- Fast time-to-first-demo matters more than long-term throughput headroom.
- No one on the team is available to operate a database.
- This is a pilot / early-stage engagement, not yet proven to need more.

Tradeoffs to document honestly, not hide: script execution-time and quota limits, a
project-wide serialized-write lock as the concurrency mechanism (a throughput ceiling, not
a correctness gap — see `google-sheets-apps-script.md` and
`booking-and-availability-rules.md`), and no relational querying beyond what the
spreadsheet platform's own tools support.

### Relational database (e.g. PostgreSQL)

Better fit when any of these apply:
- High concurrent write volume where lock-based serialization becomes a visible latency
  problem.
- Many locations / multi-tenant requirements.
- Multiple admin roles with different permissions.
- Serious reporting/analytics needs beyond what spreadsheet formulas support.
- Payments, deposits, or accounting integrations with audit requirements.
- Regulatory/compliance needs for data handling, retention, or audit trails.
- Need for real database migrations and schema versioning tooling.

## The interface that must not change between the two storage options

Whichever storage is chosen, keep the same conceptual interfaces so a future migration is
a new implementation, not a rewrite of every consumer:

```
CrmClient            — all business data reads/writes (settings, services, staff,
                        schedules, customers, appointments, ...)
BookingEngine         — orchestrates a booking attempt: validate → lock/transact →
                        re-validate → write → snapshot
AvailabilityEngine    — computes candidate slots for display (read-only, never trusted
                        as final)
NotificationProvider  — reminders/confirmations, channel-agnostic at the interface level
MessagingProvider     — inbound/outbound chat channel (e.g. WhatsApp), if used
```

Never let the public website, admin dashboard, or any channel call a spreadsheet API,
a database driver, or a messaging provider's SDK directly — always through these
interfaces. See `MIGRATION_TO_POSTGRESQL.md`-style documents as a model for recording a
*documented, not-yet-scheduled* migration path when the current choice's limits are
reached — write that document at the time storage is chosen, not after the fact.

## Deployment target decisions

Don't assume a specific host, PaaS, or static-site platform. Decide based on:
- Does the backend need to run server-side code continuously (webhooks, cron), or can it
  be serverless/static plus a thin API?
- Does the public website need server-side rendering, or is a static export sufficient
  (common when the website is a separate project consuming this backend's public API)?
- What does the client already have access to (existing hosting, domain, accounts)?

Whatever is chosen, keep the same separation: public website → this project's backend API
→ CRM client → CRM. Never let the public website's own host/CDN talk to the CRM directly.

## Explicitly out of scope by default

Unless the client specifically requires it and it's scoped as its own phase: payments and
deposits, loyalty programs, staff commissions, marketing campaign automation, automated
review requests, waitlists, and advanced analytics. State this explicitly in the new
project's own docs so "not built yet" and "decided against" aren't confused later.

## Recording decisions

Keep a running decisions log in the new project (name it whatever fits that project's doc
conventions) that records: what was decided, why, what alternative was rejected and why,
and — if a decision is later superseded — that it was superseded and by what, without
deleting the original entry. Future sessions (and future team members) should never have
to reverse-engineer *why* a choice was made from code alone.
