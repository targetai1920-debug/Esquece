import "server-only";
import { z } from "zod";

/**
 * Server-only environment configuration. Importing "server-only" makes any
 * accidental import from client code a build-time error — this file (and
 * anything that imports it) can never end up in the browser bundle.
 *
 * Fails fast and clearly at first use if a selected provider
 * (CRM_PROVIDER=appscript, AI_PROVIDER=anthropic, WHATSAPP_PROVIDER=meta)
 * is missing its required credentials — SECURITY.md: "the app must fail
 * fast and clearly... rather than silently falling back to a mock in
 * production."
 */

const providerSchema = z.enum(["mock", "appscript"]);
const aiProviderSchema = z.enum(["mock", "anthropic"]);
const whatsAppProviderSchema = z.enum(["mock", "meta"]);

const rawEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  PUBLIC_WEBSITE_ORIGIN: z.string().optional(),
  BUSINESS_TIMEZONE: z.string().default("America/La_Paz"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DEMO_MODE: z.string().optional(),

  CRM_PROVIDER: providerSchema.default("mock"),
  CRM_APPS_SCRIPT_URL: z.string().optional(),
  CRM_API_KEY: z.string().optional(),
  CRM_SIGNING_SECRET: z.string().optional(),
  CRM_REQUEST_TIMEOUT_MS: z.string().optional(),

  AI_PROVIDER: aiProviderSchema.default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  WHATSAPP_PROVIDER: whatsAppProviderSchema.default("mock"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),

  AUTH_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  INTERNAL_ALERT_PHONE: z.string().optional(),
  INTERNAL_ALERT_EMAIL: z.string().optional(),

  WHATSAPP_REMINDER_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_REMINDER_TEMPLATE_LANGUAGE: z.string().default("es"),
  WHATSAPP_CANCELLATION_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_RESCHEDULE_TEMPLATE_NAME: z.string().optional(),
});

function readRawEnv() {
  const parsed = rawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

let cached: ReturnType<typeof readRawEnv> | null = null;
function raw() {
  if (!cached) cached = readRawEnv();
  return cached;
}

export function isProduction(): boolean {
  return raw().NODE_ENV === "production";
}

export function isDemoMode(): boolean {
  return raw().DEMO_MODE !== "false";
}

export function getBusinessTimezone(): string {
  return raw().BUSINESS_TIMEZONE;
}

export function getPublicAppUrl(): string {
  return raw().NEXT_PUBLIC_APP_URL;
}

export function getPublicWebsiteOrigin(): string | null {
  return raw().PUBLIC_WEBSITE_ORIGIN || null;
}

export function getLogLevel(): "debug" | "info" | "warn" | "error" {
  return raw().LOG_LEVEL;
}

export interface CrmConfig {
  provider: "mock" | "appscript";
  appsScriptUrl: string;
  apiKey: string;
  signingSecret: string;
  requestTimeoutMs: number;
}

/**
 * Only AppsScriptCrmClient (Phase E) may call this — it's the sole holder
 * of these three secrets, per SECURITY.md.
 */
export function getCrmConfig(): CrmConfig {
  const env = raw();
  if (env.CRM_PROVIDER !== "appscript") {
    throw new Error("getCrmConfig() called but CRM_PROVIDER is not 'appscript'.");
  }
  const missing: string[] = [];
  if (!env.CRM_APPS_SCRIPT_URL) missing.push("CRM_APPS_SCRIPT_URL");
  if (!env.CRM_API_KEY) missing.push("CRM_API_KEY");
  if (!env.CRM_SIGNING_SECRET) missing.push("CRM_SIGNING_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `CRM_PROVIDER=appscript but missing required environment variables: ${missing.join(", ")}. ` +
        "See APPS_SCRIPT_SETUP.md. Refusing to silently fall back to a mock in production.",
    );
  }
  return {
    provider: "appscript",
    appsScriptUrl: env.CRM_APPS_SCRIPT_URL!,
    apiKey: env.CRM_API_KEY!,
    signingSecret: env.CRM_SIGNING_SECRET!,
    requestTimeoutMs: Number(env.CRM_REQUEST_TIMEOUT_MS) || 12000,
  };
}

export function getCrmProvider(): "mock" | "appscript" {
  return raw().CRM_PROVIDER;
}

export function getAiProvider(): "mock" | "anthropic" {
  return raw().AI_PROVIDER;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export function getAnthropicConfig(): AnthropicConfig {
  const env = raw();
  if (env.AI_PROVIDER !== "anthropic") {
    throw new Error("getAnthropicConfig() called but AI_PROVIDER is not 'anthropic'.");
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing. See ANTHROPIC_SETUP.md.");
  }
  return { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || "claude-sonnet-5" };
}

export function getWhatsAppProvider(): "mock" | "meta" {
  return raw().WHATSAPP_PROVIDER;
}

export interface MetaConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  appSecret: string;
  verifyToken: string;
  graphApiVersion: string;
}

export function getMetaConfig(): MetaConfig {
  const env = raw();
  if (env.WHATSAPP_PROVIDER !== "meta") {
    throw new Error("getMetaConfig() called but WHATSAPP_PROVIDER is not 'meta'.");
  }
  const missing: string[] = [];
  if (!env.WHATSAPP_ACCESS_TOKEN) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!env.WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) missing.push("WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (!env.META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!env.META_VERIFY_TOKEN) missing.push("META_VERIFY_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `WHATSAPP_PROVIDER=meta but missing required environment variables: ${missing.join(", ")}. See META_SETUP.md.`,
    );
  }
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN!,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
    appSecret: env.META_APP_SECRET!,
    verifyToken: env.META_VERIFY_TOKEN!,
    graphApiVersion: env.META_GRAPH_API_VERSION,
  };
}

export interface MetaWebhookConfig {
  appSecret: string;
  verifyToken: string;
}

/**
 * Deliberately NOT gated on WHATSAPP_PROVIDER=meta (unlike getMetaConfig()
 * above) — receiving and verifying real Meta webhook traffic is
 * independent of which provider currently handles *outbound* sends (e.g.
 * WHATSAPP_PROVIDER could still be "mock" while the webhook itself is
 * exercised against real or synthetic signed requests, as this repo's own
 * webhook tests do). Only requires the two webhook-specific secrets.
 */
export function getMetaWebhookConfig(): MetaWebhookConfig {
  const env = raw();
  const missing: string[] = [];
  if (!env.META_APP_SECRET) missing.push("META_APP_SECRET");
  if (!env.META_VERIFY_TOKEN) missing.push("META_VERIFY_TOKEN");
  if (missing.length > 0) {
    throw new Error(`WhatsApp webhook requires: ${missing.join(", ")}. See META_SETUP.md.`);
  }
  return { appSecret: env.META_APP_SECRET!, verifyToken: env.META_VERIFY_TOKEN! };
}

export interface AdminAuthConfig {
  email: string;
  passwordHash: string;
  authSecret: string;
}

export function getAdminAuthConfig(): AdminAuthConfig | null {
  const env = raw();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH || !env.AUTH_SECRET) return null;
  return { email: env.ADMIN_EMAIL, passwordHash: env.ADMIN_PASSWORD_HASH, authSecret: env.AUTH_SECRET };
}

export function getCronSecret(): string | null {
  return raw().CRON_SECRET || null;
}

export function getWhatsAppTemplates() {
  const env = raw();
  return {
    reminderName: env.WHATSAPP_REMINDER_TEMPLATE_NAME || null,
    reminderLanguage: env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE,
    cancellationName: env.WHATSAPP_CANCELLATION_TEMPLATE_NAME || null,
    rescheduleName: env.WHATSAPP_RESCHEDULE_TEMPLATE_NAME || null,
  };
}

/** Test-only: clears the cached parsed env so tests can vary process.env between cases. */
export function _resetEnvCacheForTests() {
  cached = null;
}
