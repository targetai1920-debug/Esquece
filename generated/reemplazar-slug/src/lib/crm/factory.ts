import { loadClientConfig } from "../../config/loadConfig";
import { LocalCrmClient, type LocalCrmSeed } from "./localClient";
import type { BusinessSettings, Faq, Promotion, Service, Staff } from "./types";
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

let singleton: LocalCrmClient | null = null;

/** One shared CRM client instance per process — every consumer (public API, admin) calls this. */
export function getCrmClient(): LocalCrmClient {
  if (!singleton) {
    const config = loadClientConfig();
    singleton = new LocalCrmClient(seedFromClientConfig(config));
  }
  return singleton;
}

/** Test-only escape hatch. */
export function __resetCrmClientForTests() {
  singleton = null;
}
