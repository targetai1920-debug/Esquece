import { z } from "zod";

/**
 * Validates what Apps Script returns before Next.js trusts it —
 * SECURITY.md "output validation." A response that doesn't match these
 * shapes becomes a CrmError(CRM_INVALID_RESPONSE), never a silent
 * pass-through of malformed data into the rest of the app.
 */

export const businessSettingsSchema = z
  .object({
    BUSINESS_NAME: z.string(),
    BUSINESS_TIMEZONE: z.string(),
    CURRENCY: z.string(),
    OPENING_TIME: z.string(),
    CLOSING_TIME: z.string(),
    SLOT_INTERVAL_MINUTES: z.number(),
    MIN_BOOKING_NOTICE_MINUTES: z.number(),
    MAX_ADVANCE_BOOKING_DAYS: z.number(),
    SESSION_TIMEOUT_MINUTES: z.number(),
    MONDAY_OPEN: z.boolean(),
    TUESDAY_OPEN: z.boolean(),
    WEDNESDAY_OPEN: z.boolean(),
    THURSDAY_OPEN: z.boolean(),
    FRIDAY_OPEN: z.boolean(),
    SATURDAY_OPEN: z.boolean(),
    SUNDAY_OPEN: z.boolean(),
    DEFAULT_BUFFER_MINUTES: z.number(),
    ALLOW_ANY_BARBER: z.boolean(),
    ENABLE_REMINDERS: z.boolean().default(false),
    ENABLE_CALENDAR_SYNC: z.boolean().default(false),
    BUSINESS_ADDRESS: z.string().default(""),
    GOOGLE_MAPS_URL: z.string().default(""),
    INSTAGRAM_URL: z.string().default(""),
    WHATSAPP_DISPLAY_NUMBER: z.string().default(""),
    PAYMENT_METHODS: z.string().default(""),
    CANCELLATION_POLICY: z.string().default(""),
    LATE_ARRIVAL_POLICY: z.string().default(""),
    NO_SHOW_POLICY: z.string().default(""),
    REMINDER_HOURS_BEFORE: z.number().default(24),
    CRM_SCHEMA_VERSION: z.string().default("1"),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean()]));

export const serviceSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  price: z.number(),
  currency: z.string(),
  durationMinutes: z.number(),
  bufferMinutes: z.number().optional().default(0),
  category: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  active: z.boolean(),
  displayOrder: z.number().optional().default(0),
  demo: z.boolean().optional().default(false),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const barberSchema = z.object({
  barberId: z.string(),
  name: z.string(),
  biography: z.string().optional().default(""),
  specialties: z.string().optional().default(""),
  photoUrl: z.string().optional().default(""),
  phoneE164: z.string().optional().default(""),
  active: z.boolean(),
  publicBooking: z.boolean().optional().default(true),
  displayOrder: z.number().optional().default(0),
  calendarId: z.string().optional().default(""),
  demo: z.boolean().optional().default(false),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const faqSchema = z.object({
  faqId: z.string(),
  category: z.string().optional().default(""),
  question: z.string(),
  answer: z.string(),
  keywords: z.string().optional().default(""),
  active: z.boolean(),
  displayOrder: z.number().optional().default(0),
  updatedAt: z.string().optional().default(""),
});

export const promotionSchema = z.object({
  promotionId: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  validFrom: z.string().optional().default(""),
  validUntil: z.string().optional().default(""),
  active: z.boolean(),
  terms: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const customerSchema = z.object({
  customerId: z.string(),
  name: z.string().optional().default(""),
  phoneE164: z.string(),
  whatsappId: z.string().optional().default(""),
  email: z.string().optional().default(""),
  source: z.string().optional().default(""),
  status: z.string().optional().default(""),
  firstContactAt: z.string().optional().default(""),
  lastContactAt: z.string().optional().default(""),
  totalAppointments: z.number().optional().default(0),
  confirmedAppointments: z.number().optional().default(0),
  completedAppointments: z.number().optional().default(0),
  cancelledAppointments: z.number().optional().default(0),
  noShowAppointments: z.number().optional().default(0),
  notes: z.string().optional().default(""),
  demo: z.boolean().optional().default(false),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const appointmentStatusSchema = z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]);
export const appointmentSourceSchema = z.enum(["WEBSITE", "WHATSAPP", "ADMIN"]);

export const appointmentSchema = z.object({
  appointmentId: z.string(),
  reference: z.string(),
  idempotencyKey: z.string().optional().default(""),
  customerId: z.string(),
  customerNameSnapshot: z.string().optional().default(""),
  customerPhoneSnapshot: z.string().optional().default(""),
  serviceId: z.string(),
  serviceNameSnapshot: z.string().optional().default(""),
  servicePriceSnapshot: z.number().optional().default(0),
  serviceDurationSnapshot: z.number().optional().default(0),
  serviceBufferSnapshot: z.number().optional().default(0),
  barberId: z.string(),
  barberNameSnapshot: z.string().optional().default(""),
  localDate: z.string(),
  localStartTime: z.string(),
  localEndTime: z.string(),
  startUtc: z.string().optional().default(""),
  endUtc: z.string().optional().default(""),
  timezone: z.string().optional().default(""),
  status: appointmentStatusSchema,
  source: appointmentSourceSchema,
  customerNotes: z.string().optional().default(""),
  internalNotes: z.string().optional().default(""),
  calendarEventId: z.string().optional().default(""),
  calendarSyncStatus: z.string().optional().default(""),
  cancellationReason: z.string().optional().default(""),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
  cancelledAt: z.string().optional().default(""),
  completedAt: z.string().optional().default(""),
  demo: z.boolean().optional().default(false),
});

export const availableSlotSchema = z.object({
  localStartTime: z.string(),
  localEndTime: z.string(),
  barberIds: z.array(z.string()),
});

export const slotValidationResultSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
});

export const createAppointmentResultSchema = z.object({
  appointment: appointmentSchema,
  managementToken: z.string().nullable(),
  idempotent: z.boolean(),
});

export const conversationSchema = z.object({
  conversationId: z.string(),
  customerId: z.string().nullable().optional().default(null),
  phoneE164: z.string(),
  state: z.string(),
  scratchDataJson: z.string().nullable().optional().default(null),
  humanHandoffActive: z.boolean(),
  version: z.number(),
  lastInboundMessageAt: z.string().optional().default(""),
  lastOutboundMessageAt: z.string().optional().default(""),
  sessionExpiresAt: z.string().nullable().optional().default(null),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const conversationMessageSchema = z.object({
  messageId: z.string(),
  externalMessageId: z.string().nullable().optional().default(null),
  conversationId: z.string(),
  customerId: z.string().nullable().optional().default(null),
  phoneE164: z.string(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  messageType: z.string().optional().default("text"),
  body: z.string().optional().default(""),
  processingStatus: z.string().optional().default(""),
  receivedAt: z.string().nullable().optional().default(null),
  sentAt: z.string().nullable().optional().default(null),
  createdAt: z.string().optional().default(""),
});

export const humanHandoffSchema = z.object({
  handoffId: z.string(),
  conversationId: z.string(),
  customerId: z.string().optional().default(""),
  phoneE164: z.string().optional().default(""),
  reason: z.string(),
  status: z.enum(["OPEN", "ASSIGNED", "RESOLVED"]),
  assignedTo: z.string().optional().default(""),
  startedAt: z.string().optional().default(""),
  resolvedAt: z.string().optional().default(""),
  resolutionNotes: z.string().optional().default(""),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const notificationSchema = z.object({
  notificationId: z.string(),
  appointmentId: z.string().nullable().optional().default(null),
  customerId: z.string().nullable().optional().default(null),
  conversationId: z.string().nullable().optional().default(null),
  type: z.enum(["CONFIRMATION", "REMINDER", "CANCELLATION", "RESCHEDULE", "INTERNAL_ALERT"]),
  channel: z.string().optional().default("whatsapp"),
  scheduledAt: z.string(),
  status: z.enum(["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"]),
  attemptCount: z.number().optional().default(0),
  lastAttemptAt: z.string().optional().default(""),
  sentAt: z.string().optional().default(""),
  errorCode: z.string().optional().default(""),
  errorMessage: z.string().optional().default(""),
  idempotencyKey: z.string().optional().default(""),
  payloadJson: z.string().nullable().optional().default(null),
  createdAt: z.string().optional().default(""),
  updatedAt: z.string().optional().default(""),
});

export const auditEntrySchema = z.object({
  auditId: z.string(),
  requestId: z.string().nullable().optional().default(null),
  actorType: z.string(),
  actorId: z.string().nullable().optional().default(null),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  beforeJson: z.string().nullable().optional().default(null),
  afterJson: z.string().nullable().optional().default(null),
  metadataJson: z.string().nullable().optional().default(null),
  createdAt: z.string().optional().default(""),
});

export const dashboardSummarySchema = z.object({
  date: z.string(),
  appointmentsToday: z.number(),
  confirmedToday: z.number(),
  completedToday: z.number(),
  cancelledToday: z.number(),
  noShowToday: z.number(),
  upcomingAppointments: z.number(),
  openHandoffs: z.number(),
  failedNotifications: z.number(),
  activeCustomers: z.number(),
  appointmentsThisWeek: z.number(),
  appointmentsThisMonth: z.number(),
  updatedAt: z.string(),
});

export const crmHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  schemaVersion: z.string(),
  apiVersion: z.string(),
  timestamp: z.string(),
});

// --- Admin (Phase G) ---

export const workingHoursSchema = z.object({
  workingHoursId: z.string(),
  barberId: z.string(),
  dayOfWeek: z.number(),
  openingTime: z.string(),
  closingTime: z.string(),
  active: z.boolean(),
});

export const breakRecordSchema = z.object({
  breakId: z.string(),
  barberId: z.string(),
  date: z.string().nullable().optional().default(null),
  dayOfWeek: z.number().nullable().optional().default(null),
  startTime: z.string(),
  endTime: z.string(),
  recurring: z.boolean(),
  reason: z.string().optional().default(""),
  active: z.boolean(),
});

export const timeOffRecordSchema = z.object({
  timeOffId: z.string(),
  barberId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  allDay: z.boolean(),
  reason: z.string().optional().default(""),
  active: z.boolean(),
});

export const blockedSlotRecordSchema = z.object({
  blockedSlotId: z.string(),
  barberId: z.string().nullable().optional().default(null),
  localDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  reason: z.string().optional().default(""),
  active: z.boolean(),
});
