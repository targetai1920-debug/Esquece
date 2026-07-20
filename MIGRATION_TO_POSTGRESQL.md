# MIGRATION_TO_POSTGRESQL.md

Documented future path — **not scheduled, not started**. Google Sheets + Apps Script is the
current and intended source of truth for Esquece's actual scale (`ARCHITECTURE.md` §3). This
file exists so that if a future client (or Esquece itself, at much higher volume) outgrows Apps
Script's execution-time/quota limits and `LockService`'s serialized-writes throughput ceiling,
the migration path is already thought through instead of improvised under pressure.

## What would trigger this

- Appointment-creation request volume high enough that `LockService` serialization becomes a
  visible latency problem (Apps Script quotas: roughly 30-second execution limit per script
  invocation, daily trigger/URL-fetch quotas that scale with account type).
- Need for real relational queries/reporting beyond what Sheets formulas and the `DASHBOARD`
  sheet can reasonably do.
- Multi-location or multi-tenant requirements where per-business Google Sheets stop being
  operationally manageable.

## What stays the same

The domain model doesn't change — it's the same entities either way (Business/Settings, Barber,
Service, BarberService, WorkingSchedule, Break, TimeOff, BlockedSlot, Customer, Appointment,
Conversation, ConversationMessage, HumanHandoff, Notification, AuditLog). A prior version of
this repository (commit `66bee17`) already had a complete Prisma schema for exactly this model
— see git history — which is a usable starting point, not a from-scratch redesign, if this
migration is ever undertaken.

The `CrmClient` interface (`ARCHITECTURE.md` §2, Phase E) is the seam: everything in Next.js —
website, WhatsApp handler, admin dashboard — talks to `CrmClient`, never to Apps Script or a
database directly. A `PostgresCrmClient` implementing the same interface is, in principle, a
drop-in replacement for `AppsScriptCrmClient` at the call-site level. What's genuinely new work:

1. Reintroducing Prisma/Postgres (schema close to the `66bee17` version, adjusted for anything
   learned from the Sheets implementation).
2. Reimplementing the double-booking guarantee as a Postgres `EXCLUDE USING gist` constraint
   (already designed in that same historical commit) instead of `LockService`.
3. A one-time data migration: read every row out of the Sheets CRM via the existing Apps Script
   `list*`/`get*` actions and write it into Postgres — no new export mechanism needed, the read
   API already exists.
4. Re-pointing conversation/webhook dedup logic at Postgres transactions instead of Apps
   Script's lock-guarded sheet writes.

## What this is not

Not a hedge that should slow down the current Apps Script implementation, not a "just in case"
abstraction layer beyond the `CrmClient` interface that already exists for interface-decoupling
reasons anyway, and not a reason to keep Prisma dependencies installed today. They were removed
(Phase A) precisely because carrying unused dependencies and contradictory documentation is
worse than re-adding them later when actually needed.
