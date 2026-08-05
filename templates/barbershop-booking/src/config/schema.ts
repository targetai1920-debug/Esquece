import { z } from "zod";

/**
 * Typed schema for a client configuration file (see clients/*.yaml at the
 * repo root, and factory/create-client.mjs which reads one of these).
 * Structural errors here always block generation, regardless of mode.
 * Placeholder/pending values (anything starting with "REEMPLAZAR" or an
 * empty string in an optional-but-expected field) are NOT structural
 * errors — see src/config/validate.ts for the two-tier (error/warning)
 * validation this schema feeds into.
 */

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const hhmmPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const VISUAL_PRESETS = ["minimal", "luxury", "urban", "classic"] as const;
export type VisualPreset = (typeof VISUAL_PRESETS)[number];

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const FLOW_STEPS = ["service", "staff", "datetime", "customer", "confirmation"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export const ENVIRONMENTS = ["development", "staging", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const CRM_PROVIDERS = ["local", "google-sheets-apps-script"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

// Feature implementation status, distinct from whether a client has it
// enabled — see src/config/validate.ts and
// .claude/skills/barbershop-crm-builder/references/optional-whatsapp-and-ai.md.
// "not-implemented" features can be toggled on outside production (as a
// harmless no-op, with a loud warning) but never in production — a boolean
// flag alone must never be read as "this feature actually works."
export const FEATURE_STATUS = {
  publicBookingWebsite: "supported",
  adminDashboard: "supported",
  promotions: "supported",
  faqs: "supported",
  emailNotifications: "experimental",
  whatsapp: "not-implemented",
  aiAssistant: "not-implemented",
  reminders: "not-implemented",
  googleCalendar: "not-implemented",
} as const;
export type FeatureKey = keyof typeof FEATURE_STATUS;

const businessSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
  timezone: z.string().min(1),
  locale: z.string().min(1),
  currency: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().min(1),
  instagram: z.string().optional().default(""),
  mapsUrl: z.string().optional().default(""),
});

const brandingSchema = z.object({
  logo: z.string().optional().default(""),
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
  backgroundColor: z.string().min(1),
  headingFont: z.string().optional().default(""),
  bodyFont: z.string().optional().default(""),
  visualPreset: z.enum(VISUAL_PRESETS),
  styleDescription: z.string().optional().default(""),
});

// Deliberately a single plain object, not a union of "{closed:true}" vs.
// "{start,end}" — a union with a strict closed-only branch would let zod
// silently strip start/end from a contradictory "{closed:true,start,end}"
// input (objects default to stripping unknown keys per branch), which
// would hide exactly the "day marked closed and with hours at once"
// mistake src/config/validate.ts exists to catch. Keeping all three fields
// always present (closed optional, defaults to false/absent = open) lets
// that contradiction survive parsing so validate.ts can report it.
const workingDaySchema = z.object({
  closed: z.boolean().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

const workingHoursSchema = z.record(z.enum(WEEKDAYS), workingDaySchema);

const breakSchema = z.object({
  days: z.array(z.enum(WEEKDAYS)).min(1),
  start: z.string(),
  end: z.string(),
});

const staffSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  biography: z.string().optional().default(""),
  photo: z.string().optional().default(""),
  active: z.boolean().default(true),
  serviceIds: z.array(z.string().min(1)),
  workingHours: workingHoursSchema,
  breaks: z.array(breakSchema).optional().default([]),
});

const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  price: z.number(),
  durationMinutes: z.number(),
  bufferMinutes: z.number().default(0),
  active: z.boolean().default(true),
  image: z.string().optional().default(""),
});

const bookingSchema = z.object({
  flowOrder: z.array(z.enum(FLOW_STEPS)).min(1),
  minimumNoticeMinutes: z.number().int().nonnegative(),
  maximumAdvanceDays: z.number().int().positive(),
  slotIntervalMinutes: z.number().int().positive(),
  allowAnyStaff: z.boolean().default(true),
  cancellationNoticeHours: z.number().int().nonnegative().default(0),
  customerFields: z.object({
    name: z.boolean().default(true),
    phone: z.boolean().default(true),
    email: z.boolean().default(false),
    notes: z.boolean().default(false),
  }),
});

const contentSchema = z.object({
  heroTitle: z.string().min(1),
  heroSubtitle: z.string().optional().default(""),
  aboutTitle: z.string().optional().default("Sobre nosotros"),
  aboutText: z.string().optional().default(""),
  bookingTitle: z.string().optional().default("Reserva tu cita"),
  confirmationMessage: z.string().optional().default("Tu reserva fue registrada correctamente."),
  cancellationPolicy: z.string().optional().default(""),
  footerText: z.string().optional().default(""),
});

const featuresSchema = z.object({
  publicBookingWebsite: z.boolean().default(true),
  adminDashboard: z.boolean().default(true),
  whatsapp: z.boolean().default(false),
  aiAssistant: z.boolean().default(false),
  reminders: z.boolean().default(false),
  googleCalendar: z.boolean().default(false),
  emailNotifications: z.boolean().default(false),
  promotions: z.boolean().default(false),
  faqs: z.boolean().default(false),
});

// The config never holds a real CRM credential — only the NAME of the
// environment variable the running app should read it from at runtime
// (defaults match .env.example). Values live exclusively in the
// deployment's own environment/secret store. See
// .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md.
const crmSchema = z.object({
  provider: z.enum(CRM_PROVIDERS).default("local"),
  webAppUrlEnv: z.string().min(1).default("CRM_WEB_APP_URL"),
  apiKeyEnv: z.string().min(1).default("CRM_API_KEY"),
  signingSecretEnv: z.string().min(1).default("CRM_SIGNING_SECRET"),
  requestTimeoutMs: z.number().int().positive().default(12000),
});

export const clientConfigSchema = z.object({
  environment: z.enum(ENVIRONMENTS).default("development"),
  business: businessSchema,
  branding: brandingSchema,
  booking: bookingSchema,
  services: z.array(serviceSchema),
  staff: z.array(staffSchema),
  content: contentSchema,
  features: featuresSchema,
  crm: crmSchema.default({
    provider: "local",
    webAppUrlEnv: "CRM_WEB_APP_URL",
    apiKeyEnv: "CRM_API_KEY",
    signingSecretEnv: "CRM_SIGNING_SECRET",
    requestTimeoutMs: 12000,
  }),
});

export type ClientConfig = z.infer<typeof clientConfigSchema>;
export type ServiceConfig = z.infer<typeof serviceSchema>;
export type StaffConfig = z.infer<typeof staffSchema>;

export { slugPattern, hexColorPattern, hhmmPattern };
