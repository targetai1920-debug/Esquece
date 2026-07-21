# OPERATIONS.md

Day-to-day operational guidance for whoever runs Esquece Barber Studio's booking system once
deployed — not a developer document, though developers will also need it.

## Daily use: the admin dashboard

Log in at `/admin/login` with the email/password set up during deployment
(`RENDER_SETUP.md`/`npm run hash-password`).

- **Panel** (`/admin`): today's appointment counts, upcoming appointments, open human handoffs,
  failed notifications, and CRM/provider health at a glance.
- **Citas** (`/admin/appointments`): filter by date/barber/status, manually create a booking for a
  walk-in or phone call (uses the exact same availability check and booking engine as the website
  and WhatsApp — a manual booking can never create a double-booking), cancel, reschedule, mark
  completed or no-show.
- **Clientes** (`/admin/customers`): search by name or phone, view a customer's full appointment
  history and stats.
- **Servicios** / **Barberos** (`/admin/services`, `/admin/barbers`): create/edit/activate/
  deactivate. Deactivating hides something from the public website and WhatsApp immediately —
  existing appointments referencing it are untouched.
- **Horarios** (`/admin/schedule`): per-barber weekly hours, recurring or one-time breaks, time
  off, and blocked slots (business-wide or barber-specific). Changes take effect immediately for
  every channel.
- **Conversaciones** (`/admin/conversations`): recent WhatsApp conversations, their current state,
  and open human handoffs. Resolving a handoff with "reactivate bot" hands the conversation back
  to the automated agent — resolving without it leaves the bot silent for that customer until a
  future explicit reactivation. **There is no automatic reactivation** — a customer whose
  conversation was handed to a person stays with a person until staff explicitly resolve it.
- **Notificaciones** (`/admin/notifications`): pending/processing/sent/failed/cancelled
  notifications, with the failure reason for anything that didn't send (commonly
  `TEMPLATE_REQUIRED` if reminders were enabled before a WhatsApp template was approved — see
  `META_SETUP.md`).
- **Configuración** (`/admin/config`): read-only view of business settings and system health —
  never shows a secret or credential.

## The Google Sheet is the source of truth

Every screen above is a view onto (and a controlled way to change) the same Google Sheet that
Apps Script owns. Editing a cell directly in the Sheet is possible but **not recommended** for
anything the admin dashboard already covers — direct edits bypass the validation, locking, and
audit logging every dashboard action gets for free. Direct edits to `SETTINGS` (opening hours,
timezone, currency, etc.) are fine and expected — there is no admin-dashboard screen for that yet
(see `LIMITATIONS.md`).

## Monitoring

- `GET /api/health` — application-level health (always fast, no external dependency).
- `GET /api/health/crm` — confirms the Apps Script `/exec` URL is reachable, authenticated, and
  schema-version-compatible. Point an uptime monitor at this one specifically.
- The admin Panel screen's "CRM health"/"provider health" fields mirror the same data for a human
  glancing at the dashboard.

## Common situations

- **A customer says they never got a confirmation/reminder**: check
  `/admin/notifications`, filter by their appointment. `TEMPLATE_REQUIRED` means the relevant
  WhatsApp template isn't approved yet (`META_SETUP.md` §7). `SEND_ERROR` with a high attempt
  count means WhatsApp itself is rejecting the send — check the Meta app's health in Meta's own
  dashboard.
- **A customer is stuck talking to the bot and needs a person**: they can ask directly ("quiero
  hablar con una persona"), or staff can activate a handoff manually if the bot isn't recognizing
  the request. Check `/admin/conversations` for open handoffs.
- **Wrong business hours/prices showing everywhere**: check `/admin/config` first (or the
  `SETTINGS`/`SERVICES` sheet tabs directly) — a change there is authoritative and immediate for
  every channel; there is no per-channel cache to clear.
- **A double-booking appears to have happened**: this should be structurally impossible (Apps
  Script's `LockService` re-validates every booking under lock immediately before writing) — if
  one is ever seen, it's a priority bug report, not a "just cancel one" situation; capture the
  exact appointment IDs/references and reference numbers before touching anything.

## Notification cron job

`/api/cron/notifications` must be hit on a schedule (Render Cron Job, or any external scheduler)
for reminders/confirmations/cancellations/reschedules to actually send — see `RENDER_SETUP.md` §7.
If notifications are piling up as `PENDING` in `/admin/notifications` and never moving to `SENT`,
the cron job likely isn't running or its `CRON_SECRET` doesn't match.

## Backups

The Google Sheet has Google's own version history (File → Version history in Sheets) — a
reasonable point-in-time recovery mechanism on its own. No separate database backup exists
because no separate database exists.
