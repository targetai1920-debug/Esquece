/**
 * DEMO_DATA_REPLACE_BEFORE_PRODUCTION
 *
 * Everything in this file is a placeholder for the homepage preview only.
 * None of it is sourced from Esquece Barber Studio yet — see
 * CLIENT_INFORMATION_REQUIRED.md. Nothing here is read by the booking
 * engine; it exists purely so Phase 1's homepage has something to render
 * before Service/Barber rows exist in the database (Phase 2+).
 */

export const DEMO_TAGLINE = "La barbería más diferenciada de Bolivia";

export const DEMO_SERVICES = [
  {
    id: "demo-service-1",
    name: "Corte clásico",
    durationMinutes: 30,
    priceLabel: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION",
  },
  {
    id: "demo-service-2",
    name: "Corte y barba",
    durationMinutes: 45,
    priceLabel: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION",
  },
  {
    id: "demo-service-3",
    name: "Diseño / arte",
    durationMinutes: 45,
    priceLabel: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION",
  },
] as const;

export const DEMO_BARBERS = [
  { id: "demo-barber-1", name: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION" },
  { id: "demo-barber-2", name: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION" },
] as const;

export const DEMO_LOCATION = {
  addressLine: "Av. Portales / Calle Tomás Frías — DEMO_DATA_REPLACE_BEFORE_PRODUCTION",
  city: "Cochabamba, Bolivia",
  hoursLabel: "DEMO_DATA_REPLACE_BEFORE_PRODUCTION",
} as const;

export const DEMO_CONTACT = {
  instagramHandle: "@esquece.barber.studio",
  whatsappHref: "#", // DEMO_DATA_REPLACE_BEFORE_PRODUCTION — no real WhatsApp number wired yet
} as const;
