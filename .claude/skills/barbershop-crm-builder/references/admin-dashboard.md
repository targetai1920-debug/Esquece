# Admin dashboard

## Same engine, same mutations

The admin dashboard is another consumer of the same `CrmClient`-shaped interface as the
public website and any optional channel — it must never write an appointment (or any
other entity) through a separate path that skips the same validation the public API uses.
An admin-created booking still goes through the same availability check and the same
lock/transaction as a customer-created one; the difference is authorization, not
validation.

## Typical scope

Depending on the project's needs: appointments, customers, services, staff, staff-service
links, working hours, breaks, time off, blocked slots, conversations/handoffs (if a chat
channel exists), notifications, business settings, audit log.

Not every project needs a UI for every one of these on day one — a read-only display for
low-churn settings (e.g. business hours) is a legitimate MVP scope reduction, as long as
it's an explicit, documented scope decision, not a silent gap discovered later.

## Auth (MVP-appropriate, state the tradeoff)

- Configurable admin identity (e.g. an email) and a securely hashed password — never a
  plaintext password in config, logs, commits, or chat.
- Signed session cookie: `httpOnly`, `secure` in production, an explicit `sameSite`
  policy, and an expiration.
- Rate-limit login attempts.
- Every admin page and every admin API route independently checks the session — don't
  rely on a single client-side route guard.
- CSRF/origin protection on every admin mutation, same principle as the public API's
  origin enforcement (`public-api-and-booking-website.md`).
- A single shared admin account is a legitimate, explicit MVP choice for a small
  single-location business — document it as a stated tradeoff, not an oversight, and
  revisit if the client later needs multiple roles/permissions (a signal that also points
  toward the relational-database path in `architecture-and-decisions.md`).

## What never belongs in the admin surface

- A way to write an appointment/entity that bypasses the shared validation/lock path.
- Secrets (CRM credentials, signing secrets, third-party API keys) rendered in any admin
  page, even to an authenticated admin — display redacted/masked values or "configured/not
  configured" status only.
- Silent data mutation with no audit trail — every admin mutation should produce the same
  audit-log entry any other channel's mutation would.
