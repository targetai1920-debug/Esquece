import { loadClientConfig } from "../../config/loadConfig";
import { LocalCrmClient, type LocalCrmSeed } from "./localClient";
import { AppsScriptCrmClient } from "./appsScriptClient";
import type { BusinessSettings, CrmClient, Faq, Promotion, Service, Staff } from "./types";
import type { ClientConfig } from "../../config/schema";

export function seedFromClientConfig(config: ClientConfig): LocalCrmSeed {
  const settings: BusinessSettings = {
    name: config.business.name,
    timezone: config.business.timezone,
    locale: config.business.locale,
    currency: config.business.currency,
    address: config.business.address,
    phone: config.business.phone,
    email: config.business.email,
    instagram: config.business.instagram,
    mapsUrl: config.business.mapsUrl,
    minimumNoticeMinutes: config.booking.minimumNoticeMinutes,
    maximumAdvanceDays: config.booking.maximumAdvanceDays,
    slotIntervalMinutes: config.booking.slotIntervalMinutes,
    allowAnyStaff: config.booking.allowAnyStaff,
    cancellationNoticeHours: config.booking.cancellationNoticeHours,
    cancellationPolicy: config.content.cancellationPolicy,
  };

  const services: Service[] = config.services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    price: s.price,
    currency: config.business.currency,
    durationMinutes: s.durationMinutes,
    bufferMinutes: s.bufferMinutes,
    active: s.active,
    image: s.image,
  }));

  const staff: Staff[] = config.staff.map((member) => ({
    id: member.id,
    name: member.name,
    biography: member.biography,
    photo: member.photo,
    active: member.active,
    publicBooking: true,
    serviceIds: member.serviceIds,
    workingHours: Object.fromEntries(
      Object.entries(member.workingHours).map(([day, value]) => [
        day,
        { closed: value.closed === true, start: value.start, end: value.end },
      ]),
    ),
    breaks: member.breaks ?? [],
  }));

  const faqs: Faq[] = config.features.faqs ? [] : [];
  const promotions: Promotion[] = config.features.promotions ? [] : [];

  return { settings, services, staff, faqs, promotions };
}

function requireEnv(varName: string, purpose: string): string {
  const value = process.env[varName];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno "${varName}" (${purpose}). ` +
        `crm.provider está configurado como "google-sheets-apps-script", que requiere credenciales reales en variables de entorno — nunca en el código ni en client-config.json.`,
    );
  }
  return value;
}

function buildCrmClient(config: ClientConfig): CrmClient {
  // Defense in depth: factory/create-client.mjs's validator (single source
  // of truth, src/config/validate.ts) already blocks generating a
  // production config with crm.provider "local" — this repeats the check
  // at runtime so a hand-edited client-config.json (bypassing the
  // generator) can never silently start a production deployment on the
  // in-memory CRM.
  if (config.environment === "production" && config.crm.provider === "local") {
    throw new Error(
      `Error: environment está configurado como "production", pero crm.provider utiliza almacenamiento local no persistente ("local"). Usa "google-sheets-apps-script" (o un backend persistente equivalente) para producción.`,
    );
  }

  if (config.crm.provider === "google-sheets-apps-script") {
    return new AppsScriptCrmClient({
      webAppUrl: requireEnv(config.crm.webAppUrlEnv, "URL del Web App de Apps Script"),
      apiKey: requireEnv(config.crm.apiKeyEnv, "API key del CRM"),
      signingSecret: requireEnv(config.crm.signingSecretEnv, "secreto de firma HMAC del CRM"),
      requestTimeoutMs: config.crm.requestTimeoutMs,
    });
  }

  return new LocalCrmClient(seedFromClientConfig(config));
}

let singleton: CrmClient | null = null;

/** One shared CRM client instance per process — every consumer (public API, admin) calls this. */
export function getCrmClient(): CrmClient {
  if (!singleton) {
    const config = loadClientConfig();
    singleton = buildCrmClient(config);
  }
  return singleton;
}

/** Test-only escape hatch. */
export function __resetCrmClientForTests() {
  singleton = null;
}
