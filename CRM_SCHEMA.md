# CRM_SCHEMA.md — Google Sheets CRM schema

Authoritative column-level schema, generated from `apps-script/Sheets.gs` (the actual source —
if this file and that one ever disagree, `Sheets.gs` is correct and this file needs updating).
Created/maintained by `apps-script/Setup.gs`'s `setupCRM()`. See `ARCHITECTURE.md` §4 for the
architecture-level view and `CRM_APPS_SCRIPT.md` for how the Apps Script project is organized.

Every sheet has its header row frozen. `setupCRM()` adds missing sheets/columns without ever
deleting existing data — safe to run repeatedly.

## SETTINGS

`key, value, type, description, editable, updatedAt`

Business-wide configuration, one row per key. Default rows (all `DEMO_DATA_REPLACE_BEFORE_PRODUCTION`
where the value is genuinely business-specific) are listed in `BOOKING_RULES.md` §0 and defined
in `apps-script/Setup.gs`'s `DEFAULT_SETTINGS_ROWS_`. `setupCRM()` never overwrites a key that
already has a value — it only adds keys that are missing.

## SERVICES

`serviceId, name, description, price, currency, durationMinutes, bufferMinutes, category,
imageUrl, active, displayOrder, demo, createdAt, updatedAt`

## BARBERS

`barberId, name, biography, specialties, photoUrl, phoneE164, active, publicBooking,
displayOrder, calendarId, demo, createdAt, updatedAt`

## BARBER_SERVICES

`barberServiceId, barberId, serviceId, active, createdAt, updatedAt`

Join table — which barbers can perform which services (`BOOKING_RULES.md` §1.1).

## WORKING_HOURS

`workingHoursId, barberId, dayOfWeek, openingTime, closingTime, active, createdAt, updatedAt`

`dayOfWeek`: 0 = Sunday … 6 = Saturday. An empty `barberId` represents general business hours;
barber-specific rows further restrict (never expand) availability beyond general hours.

## BREAKS

`breakId, barberId, date, dayOfWeek, startTime, endTime, recurring, reason, active, createdAt,
updatedAt`

Either `date` (one-time) or `dayOfWeek` (weekly recurring) is set, not both. Empty `barberId` =
business-wide break.

## TIME_OFF

`timeOffId, barberId, startDate, endDate, startTime, endTime, allDay, reason, active, createdAt,
updatedAt`

## BLOCKED_SLOTS

`blockedSlotId, barberId, localDate, startTime, endTime, reason, active, createdBy, createdAt,
updatedAt`

Empty `barberId` blocks the entire business for that interval.

## CUSTOMERS

`customerId, name, phoneE164, whatsappId, email, source, status, firstContactAt, lastContactAt,
totalAppointments, confirmedAppointments, completedAppointments, cancelledAppointments,
noShowAppointments, notes, demo, createdAt, updatedAt`

Upserted by normalized `phoneE164` — never duplicated by phone. Counters are kept in sync by
appointment-status transitions and repairable via `recalculateCustomerCounters()` (Phase D).

## APPOINTMENTS

`appointmentId, reference, idempotencyKey, managementTokenHash, customerId,
customerNameSnapshot, customerPhoneSnapshot, serviceId, serviceNameSnapshot,
servicePriceSnapshot, serviceDurationSnapshot, serviceBufferSnapshot, barberId,
barberNameSnapshot, localDate, localStartTime, localEndTime, startUtc, endUtc, timezone, status,
source, customerNotes, internalNotes, calendarEventId, calendarSyncStatus, cancellationReason,
createdAt, updatedAt, cancelledAt, completedAt, demo`

`status`: `PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW`. `source`:
`WEBSITE | WHATSAPP | ADMIN`. Snapshots (`*Snapshot` columns) are copied at booking time and
never recomputed — editing a service/barber later doesn't rewrite history (`BOOKING_RULES.md`
§6). `managementTokenHash` is the only trace of the customer-facing management token — the raw
token is never persisted (`SECURITY.md`).

## CONVERSATIONS

`conversationId, customerId, phoneE164, state, scratchDataJson, humanHandoffActive, version,
lastInboundMessageAt, lastOutboundMessageAt, sessionExpiresAt, createdAt, updatedAt`

One row per phone number (unique). `version` is used for optimistic concurrency in
`applyConversationTurn` (`WHATSAPP_AGENT_DESIGN.md` §4).

## CONVERSATION_MESSAGES

`messageId, externalMessageId, conversationId, customerId, phoneE164, direction, messageType,
body, interactivePayloadJson, processingStatus, errorCode, receivedAt, sentAt, createdAt`

`direction`: `INBOUND | OUTBOUND`. `externalMessageId` (Meta's message id) is treated as unique
for display/audit; the actual dedup gate is `WEBHOOK_EVENTS` below.

## WEBHOOK_EVENTS

`eventId, externalEventId, eventType, phoneE164, payloadHash, processingStatus, receivedAt,
processedAt, errorCode, createdAt`

Lock-guarded dedup ledger for inbound Meta webhook deliveries (`WHATSAPP_AGENT_DESIGN.md` §3).

## HUMAN_HANDOFFS

`handoffId, conversationId, customerId, phoneE164, reason, status, assignedTo, startedAt,
resolvedAt, resolutionNotes, createdAt, updatedAt`

`status`: `OPEN | ASSIGNED | RESOLVED`.

## NOTIFICATIONS

`notificationId, appointmentId, customerId, conversationId, type, channel, scheduledAt, status,
attemptCount, lastAttemptAt, sentAt, errorCode, errorMessage, idempotencyKey, payloadJson,
createdAt, updatedAt`

`status`: `PENDING | PROCESSING | SENT | FAILED | CANCELLED`.

## AUDIT_LOG

`auditId, requestId, actorType, actorId, action, entityType, entityId, beforeJson, afterJson,
metadataJson, createdAt`

## FAQS

`faqId, category, question, answer, keywords, active, displayOrder, updatedAt`

## PROMOTIONS

`promotionId, name, description, validFrom, validUntil, active, terms, updatedAt`

Claude must never mention a promotion not present and active here (`ARCHITECTURE.md` §7).

## DASHBOARD

Generated summary view (`apps-script/Dashboard.gs`, `rebuildDashboard_`) — today's appointment
counts by status, upcoming count, open handoffs, failed notifications, active customers,
week/month counts. Regenerated on demand (setup, menu action); not the source of truth for
anything, safe to clear and rebuild at any time.
