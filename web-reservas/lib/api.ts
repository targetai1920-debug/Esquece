/**
 * Thin client for the Esquece public booking API (`/api/public/*`).
 * This is the only place in web-reservas that talks HTTP — it never
 * calls Google Apps Script or Google Sheets directly, and it never
 * receives CRM_API_KEY / CRM_SIGNING_SECRET (those stay server-side in
 * the Esquece backend). See ../WEBSITE_INTEGRATION.md for the full
 * contract this mirrors.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://esquece.onrender.com";

export interface BusinessSettings {
  BUSINESS_NAME: string;
  BUSINESS_TIMEZONE: string;
  CURRENCY: string;
  OPENING_TIME: string;
  CLOSING_TIME: string;
  SLOT_INTERVAL_MINUTES: number;
  MIN_BOOKING_NOTICE_MINUTES: number;
  MAX_ADVANCE_BOOKING_DAYS: number;
  MONDAY_OPEN: boolean;
  TUESDAY_OPEN: boolean;
  WEDNESDAY_OPEN: boolean;
  THURSDAY_OPEN: boolean;
  FRIDAY_OPEN: boolean;
  SATURDAY_OPEN: boolean;
  SUNDAY_OPEN: boolean;
  ALLOW_ANY_BARBER: boolean;
  BUSINESS_ADDRESS: string;
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
}

export interface Barber {
  barberId: string;
  name: string;
  biography: string;
  specialties: string;
  photoUrl: string;
  active: boolean;
  publicBooking: boolean;
  displayOrder: number;
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

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface Appointment {
  reference: string;
  serviceId: string;
  serviceNameSnapshot: string;
  servicePriceSnapshot: number;
  serviceDurationSnapshot: number;
  barberId: string;
  barberNameSnapshot: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  status: AppointmentStatus;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  customerNotes: string;
}

export interface CreateAppointmentResult {
  appointment: Appointment;
  managementToken: string | null;
  idempotent: boolean;
}

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
  serviceId: string;
  barberId?: string;
  anyBarber?: boolean;
  localDate: string;
  localStartTime: string;
  customer: { name: string; phoneE164: string };
  customerNotes?: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  requestId: string;
  data: T | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export class ApiError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
      true,
    );
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(
      "INVALID_RESPONSE",
      "El servidor respondió de forma inesperada. Inténtalo de nuevo.",
      true,
    );
  }

  if (!envelope.ok || envelope.data === null) {
    const error = envelope.error;
    throw new ApiError(
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Ocurrió un error inesperado. Inténtalo de nuevo.",
      error?.retryable ?? false,
    );
  }

  return envelope.data;
}

export function getBusinessSettings(): Promise<BusinessSettings> {
  return apiFetch<BusinessSettings>("/api/public/settings");
}

export function getServices(): Promise<Service[]> {
  return apiFetch<Service[]>("/api/public/services");
}

export function getBarbers(serviceId?: string): Promise<Barber[]> {
  const query = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : "";
  return apiFetch<Barber[]>(`/api/public/barbers${query}`);
}

export function getAvailability(input: AvailabilityInput): Promise<AvailableSlot[]> {
  return apiFetch<AvailableSlot[]>("/api/public/availability", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function validateSlot(input: ValidateSlotInput): Promise<SlotValidationResult> {
  return apiFetch<SlotValidationResult>("/api/public/availability/validate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
  return apiFetch<CreateAppointmentResult>("/api/public/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Normalizes a Bolivian phone number to E.164 (+591XXXXXXXX). Accepts a
 * bare 8-digit local number, a number already prefixed with 591 or +591,
 * and strips spaces/dashes/parens. `valid` reflects the shape Bolivian
 * mobile numbers actually take (8 digits, starting with 6 or 7) — this
 * is a UI sanity check, not a substitute for server-side validation.
 */
export function normalizeBolivianPhone(raw: string): { value: string; valid: boolean } {
  const stripped = raw.trim().replace(/[^\d+]/g, "");
  let value: string;
  if (stripped.startsWith("+591")) {
    value = stripped;
  } else if (stripped.startsWith("591")) {
    value = `+${stripped}`;
  } else if (stripped.startsWith("+")) {
    value = stripped;
  } else {
    value = `+591${stripped.replace(/^0+/, "")}`;
  }
  const valid = /^\+591[67]\d{7}$/.test(value);
  return { value, valid };
}

/** Fresh client-generated UUID for `idempotencyKey` — falls back to a manual v4 if `crypto.randomUUID` is unavailable. */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
