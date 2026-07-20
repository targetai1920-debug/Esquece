/**
 * CRM domain types — mirror the Apps Script CRM's sheets (CRM_SCHEMA.md)
 * and actions (API_CONTRACT.md). This is the contract every interface
 * (website API, WhatsApp handler, admin dashboard) programs against via
 * CrmClient — none of them talk to Apps Script or Google Sheets directly.
 */

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type AppointmentSource = "WEBSITE" | "WHATSAPP" | "ADMIN";
export type ConversationState =
  | "IDLE"
  | "SELECTING_SERVICE"
  | "SELECTING_BARBER"
  | "SELECTING_DATE"
  | "SELECTING_TIME"
  | "REQUESTING_NAME"
  | "REVIEWING_BOOKING"
  | "AWAITING_CONFIRMATION"
  | "BOOKING_CONFIRMED"
  | "CANCELLING_BOOKING"
  | "RESCHEDULING_BOOKING"
  | "HUMAN_HANDOFF";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type HandoffStatus = "OPEN" | "ASSIGNED" | "RESOLVED";
export type NotificationType = "CONFIRMATION" | "REMINDER" | "CANCELLATION" | "RESCHEDULE" | "INTERNAL_ALERT";
export type NotificationStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED";
export type ActorType = "customer" | "admin" | "system";

export interface BusinessSettings {
  BUSINESS_NAME: string;
  BUSINESS_TIMEZONE: string;
  CURRENCY: string;
  OPENING_TIME: string;
  CLOSING_TIME: string;
  SLOT_INTERVAL_MINUTES: number;
  MIN_BOOKING_NOTICE_MINUTES: number;
  MAX_ADVANCE_BOOKING_DAYS: number;
  SESSION_TIMEOUT_MINUTES: number;
  MONDAY_OPEN: boolean;
  TUESDAY_OPEN: boolean;
  WEDNESDAY_OPEN: boolean;
  THURSDAY_OPEN: boolean;
  FRIDAY_OPEN: boolean;
  SATURDAY_OPEN: boolean;
  SUNDAY_OPEN: boolean;
  DEFAULT_BUFFER_MINUTES: number;
  ALLOW_ANY_BARBER: boolean;
  ENABLE_REMINDERS: boolean;
  ENABLE_CALENDAR_SYNC: boolean;
  BUSINESS_ADDRESS: string;
  GOOGLE_MAPS_URL: string;
  INSTAGRAM_URL: string;
  WHATSAPP_DISPLAY_NUMBER: string;
  PAYMENT_METHODS: string;
  CANCELLATION_POLICY: string;
  LATE_ARRIVAL_POLICY: string;
  NO_SHOW_POLICY: string;
  REMINDER_HOURS_BEFORE: number;
  CRM_SCHEMA_VERSION: string;
  [key: string]: string | number | boolean;
}

export interface Service {
  serviceId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationMinutes: number;
  bufferMinutes: number;
  category: string;
  imageUrl: string;
  active: boolean;
  displayOrder: number;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Barber {
  barberId: string;
  name: string;
  biography: string;
  specialties: string;
  photoUrl: string;
  phoneE164: string;
  active: boolean;
  publicBooking: boolean;
  displayOrder: number;
  calendarId: string;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Faq {
  faqId: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  active: boolean;
  displayOrder: number;
  updatedAt: string;
}

export interface Promotion {
  promotionId: string;
  name: string;
  description: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
  terms: string;
  updatedAt: string;
}

export interface Customer {
  customerId: string;
  name: string;
  phoneE164: string;
  whatsappId: string;
  email: string;
  source: string;
  status: string;
  firstContactAt: string;
  lastContactAt: string;
  totalAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  notes: string;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  appointmentId: string;
  reference: string;
  idempotencyKey: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  serviceId: string;
  serviceNameSnapshot: string;
  servicePriceSnapshot: number;
  serviceDurationSnapshot: number;
  serviceBufferSnapshot: number;
  barberId: string;
  barberNameSnapshot: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  startUtc: string;
  endUtc: string;
  timezone: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  customerNotes: string;
  internalNotes: string;
  calendarEventId: string;
  calendarSyncStatus: string;
  cancellationReason: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string;
  completedAt: string;
  demo: boolean;
}

export interface AvailableSlot {
  localStartTime: string;
  localEndTime: string;
  barberIds: string[];
}

export interface SlotValidationResult {
  valid: boolean;
  reason?: string;
}

export interface Conversation {
  conversationId: string;
  customerId: string;
  phoneE164: string;
  state: ConversationState;
  scratchDataJson: string;
  humanHandoffActive: boolean;
  version: number;
  lastInboundMessageAt: string;
  lastOutboundMessageAt: string;
  sessionExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface HumanHandoff {
  handoffId: string;
  conversationId: string;
  customerId: string;
  phoneE164: string;
  reason: string;
  status: HandoffStatus;
  assignedTo: string;
  startedAt: string;
  resolvedAt: string;
  resolutionNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  notificationId: string;
  appointmentId: string | null;
  customerId: string | null;
  conversationId: string | null;
  type: NotificationType;
  channel: string;
  scheduledAt: string;
  status: NotificationStatus;
  attemptCount: number;
  lastAttemptAt: string;
  sentAt: string;
  errorCode: string;
  errorMessage: string;
  idempotencyKey: string;
  payloadJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  auditId: string;
  requestId: string | null;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  metadataJson: string | null;
  createdAt: string;
}

// --- CrmClient method input/output types ---

export interface AvailabilityInput {
  serviceId: string;
  localDate: string;
  barberId?: string;
  anyBarber?: boolean;
}

export interface ValidateSlotInput {
  serviceId: string;
  barberId: string;
  localDate: string;
  localStartTime: string;
}

export interface CreateAppointmentInput {
  idempotencyKey: string;
  source: AppointmentSource;
  serviceId: string;
  barberId?: string;
  anyBarber?: boolean;
  localDate: string;
  localStartTime: string;
  customer: { name: string; phoneE164: string };
  customerNotes?: string;
}

export interface CreateAppointmentResult {
  appointment: Appointment;
  managementToken: string | null;
  idempotent: boolean;
}

export interface GetAppointmentInput {
  appointmentId?: string;
  reference?: string;
  managementToken?: string;
}

export interface CancelAppointmentInput {
  appointmentId?: string;
  reference?: string;
  managementToken?: string;
  actor: { type: ActorType; id?: string };
  reason?: string;
}

export interface RescheduleAppointmentInput {
  appointmentId: string;
  managementToken?: string;
  actor: { type: ActorType; id?: string };
  newLocalDate: string;
  newLocalStartTime: string;
}

export interface UpsertCustomerInput {
  phoneE164: string;
  name?: string;
  whatsappId?: string;
  email?: string;
  notes?: string;
  source?: string;
}

export interface RegisterWebhookEventInput {
  externalEventId: string;
  eventType: string;
  phoneE164?: string;
  payloadHash?: string;
}

export interface RegisterWebhookEventResult {
  isDuplicate: boolean;
  eventId: string;
}

export interface ApplyConversationTurnInput {
  conversationId: string;
  expectedVersion: number;
  newState?: ConversationState;
  newScratchData?: Record<string, unknown>;
  inboundMessage?: { externalMessageId?: string; messageType: string; body?: string };
  outboundMessage?: { messageType: string; body?: string };
  reason?: string;
  sessionExpiresAt?: string;
}

export interface ActivateHandoffInput {
  conversationId: string;
  reason: string;
}

export interface ResolveHandoffInput {
  handoffId: string;
  resolutionNotes?: string;
  reactivateBot?: boolean;
}

export interface CreateNotificationInput {
  appointmentId?: string;
  customerId?: string;
  conversationId?: string;
  type: NotificationType;
  channel?: string;
  scheduledAt?: string;
  payload?: Record<string, unknown>;
}

export interface CrmHealth {
  status: "ok" | "degraded";
  schemaVersion: string;
  apiVersion: string;
  timestamp: string;
}

/**
 * The one interface every part of this application uses to reach the CRM.
 * Implemented by AppsScriptCrmClient (real) and MockCrmClient (in-memory,
 * same rules) — see ARCHITECTURE.md §2 and factory.ts for provider
 * selection.
 */
export interface CrmClient {
  health(): Promise<CrmHealth>;
  getApiVersion(): Promise<{ apiVersion: string; schemaVersion: string }>;

  getBusinessSettings(): Promise<BusinessSettings>;
  listServices(): Promise<Service[]>;
  getService(serviceId: string): Promise<Service>;
  listBarbers(): Promise<Barber[]>;
  getBarber(barberId: string): Promise<Barber>;
  listBarbersForService(serviceId: string): Promise<Barber[]>;
  listFaqs(): Promise<Faq[]>;
  listPromotions(): Promise<Promotion[]>;

  getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]>;
  validateSlot(input: ValidateSlotInput): Promise<SlotValidationResult>;

  findCustomerByPhone(phoneE164: string): Promise<Customer | null>;
  upsertCustomer(input: UpsertCustomerInput): Promise<Customer>;
  getCustomer(customerId: string): Promise<Customer>;
  listCustomers(search?: string): Promise<Customer[]>;
  getCustomerHistory(customerId: string): Promise<{ customer: Customer; appointments: Appointment[] }>;

  createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult>;
  getAppointment(input: GetAppointmentInput): Promise<Appointment>;
  getAppointmentByReference(reference: string, managementToken?: string): Promise<Appointment>;
  listAppointments(filter?: { localDate?: string; barberId?: string; status?: AppointmentStatus }): Promise<Appointment[]>;
  listCustomerAppointments(customerId: string): Promise<Appointment[]>;
  cancelAppointment(input: CancelAppointmentInput): Promise<Appointment>;
  rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment>;
  updateAppointmentStatus(appointmentId: string, status: AppointmentStatus, actor: { type: ActorType; id?: string }): Promise<Appointment>;

  getOrCreateConversation(phoneE164: string): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation>;
  applyConversationTurn(input: ApplyConversationTurnInput): Promise<Conversation>;
  resetConversation(conversationId: string): Promise<Conversation>;
  appendConversationMessage(conversationId: string, message: { direction: MessageDirection; messageType: string; body?: string; externalMessageId?: string }): Promise<void>;

  registerWebhookEvent(input: RegisterWebhookEventInput): Promise<RegisterWebhookEventResult>;
  markWebhookEventProcessed(externalEventId: string): Promise<void>;
  markWebhookEventFailed(externalEventId: string, errorCode: string): Promise<void>;

  activateHumanHandoff(input: ActivateHandoffInput): Promise<HumanHandoff>;
  resolveHumanHandoff(input: ResolveHandoffInput): Promise<HumanHandoff>;
  listOpenHumanHandoffs(): Promise<HumanHandoff[]>;

  createNotification(input: CreateNotificationInput): Promise<Notification>;
  listDueNotifications(): Promise<Notification[]>;
  claimNotification(notificationId: string): Promise<Notification>;
  markNotificationSent(notificationId: string): Promise<Notification>;
  markNotificationFailed(notificationId: string, errorCode: string, errorMessage: string): Promise<Notification>;
  cancelNotification(notificationId: string): Promise<Notification>;

  createAuditEntry(input: { actorType: string; actorId?: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: unknown }): Promise<void>;
  listAuditEntries(filter?: { entityType?: string; entityId?: string }): Promise<AuditEntry[]>;
}
