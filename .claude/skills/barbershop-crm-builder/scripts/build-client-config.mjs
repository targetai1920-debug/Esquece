#!/usr/bin/env node
// Turns an "onboarding context" JSON (business facts already extracted by
// the Claude session from natural language — see
// ../references/onboarding-context-parser.md for the exact intermediate
// shape) into a validated clients/<slug>.yaml, without ever inventing a
// business fact. Must be run from inside a bootstrapped factory checkout
// (it imports "yaml" resolved from the factory's own node_modules) — see
// scripts/create-barbershop.mjs, which always runs it that way.
//
// Usage:
//   node build-client-config.mjs --input <context.json> --factory-root <dir> [--output <path>]
//
// Exit codes:
//   0 - clients/<slug>.yaml written, no blocking gaps.
//   1 - malformed input / internal error.
//   2 - clients/<slug>.yaml still written (with placeholders), but one or
//       more BLOCKING questions remain — printed as JSON on stdout. The
//       caller (create-barbershop.mjs, or a human) must resolve these
//       before generation can produce a working project.
import fs from "node:fs";
import path from "node:path";
import { stringify as toYaml } from "yaml";
import { lookupCountryDefaults } from "./country-defaults.mjs";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const PLACEHOLDER = (label) => `REEMPLAZAR_${label}`;

function parseArgs(argv) {
  const args = { input: null, factoryRoot: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--factory-root") args.factoryRoot = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
  }
  return args;
}

function slugify(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base, used) {
  let id = base || "item";
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n++}`;
  }
  used.add(id);
  return id;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.factoryRoot) {
    console.error("Uso: node build-client-config.mjs --input <context.json> --factory-root <dir> [--output <path>]");
    process.exit(1);
  }

  const ctx = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  const blocking = [];
  const inferred = [];
  const defaulted = [];

  // --- business --------------------------------------------------------
  const b = ctx.business || {};
  if (!b.name) blocking.push({ field: "business.name", message: "Falta el nombre del negocio — no se puede generar un proyecto sin él." });
  const slug = slugify(ctx.business?.slug || b.name);
  if (!slug) blocking.push({ field: "business.slug", message: "No se pudo derivar un slug válido del nombre del negocio." });

  let timezone = b.timezone || null;
  let currency = b.currency || null;
  let locale = b.locale || null;
  const countryDefaults = lookupCountryDefaults(b.country);
  for (const [field, current] of [["timezone", timezone], ["currency", currency], ["locale", locale]]) {
    if (!current) {
      if (countryDefaults?.[field]) {
        inferred.push({ field: `business.${field}`, value: countryDefaults[field], reason: `inferido de business.country="${b.country}"` });
      }
    }
  }
  timezone = timezone || countryDefaults?.timezone || null;
  currency = currency || countryDefaults?.currency || null;
  locale = locale || countryDefaults?.locale || null;
  if (!timezone) blocking.push({ field: "business.timezone", message: `No se especificó zona horaria y no se pudo inferir de forma segura de country="${b.country || ""}"/city="${b.city || ""}". Sin esto no se puede calcular un solo horario disponible.` });
  if (!currency) blocking.push({ field: "business.currency", message: `No se especificó moneda y no se pudo inferir de forma segura de country="${b.country || ""}". Los precios no tienen sentido sin ella.` });
  if (!locale) { locale = "es-ES"; defaulted.push({ field: "business.locale", value: locale, reason: "valor por defecto genérico — no se pudo inferir ni fue provisto" }); }

  const business = {
    name: b.name || PLACEHOLDER("NOMBRE_DE_LA_BARBERIA"),
    slug,
    country: b.country || PLACEHOLDER("PAIS"),
    city: b.city || PLACEHOLDER("CIUDAD"),
    timezone: timezone || PLACEHOLDER("ZONA_HORARIA"),
    locale,
    currency: currency || PLACEHOLDER("MONEDA"),
    address: b.address || PLACEHOLDER("DIRECCION"),
    phone: b.phone || PLACEHOLDER("TELEFONO"),
    email: b.email || PLACEHOLDER("EMAIL"),
    instagram: b.instagram || "",
    mapsUrl: b.mapsUrl || "",
  };

  // --- branding ----------------------------------------------------------
  const br = ctx.branding || {};
  const visualPreset = ["minimal", "luxury", "urban", "classic"].includes(br.visualPreset) ? br.visualPreset : "minimal";
  if (!br.visualPreset) defaulted.push({ field: "branding.visualPreset", value: visualPreset, reason: "no especificado — se usó un valor por defecto neutral; ver DESIGN_REVIEW_CHECKLIST.md en el proyecto generado" });
  const branding = {
    logo: br.logo || "",
    primaryColor: br.primaryColor || "#111111",
    secondaryColor: br.secondaryColor || "#8a8a8a",
    backgroundColor: br.backgroundColor || "#ffffff",
    headingFont: br.headingFont || "",
    bodyFont: br.bodyFont || "",
    visualPreset,
    styleDescription: br.styleDescription || "",
  };
  if (!br.primaryColor || !br.secondaryColor || !br.backgroundColor) {
    defaulted.push({ field: "branding.colors", value: `${branding.primaryColor}/${branding.secondaryColor}/${branding.backgroundColor}`, reason: "color(es) no especificado(s) — placeholder neutral, pendiente de revisión visual real antes de producción (ver DESIGN_REVIEW_CHECKLIST.md)" });
  }

  // --- services ------------------------------------------------------------
  const usedServiceIds = new Set();
  const serviceNameToId = new Map();
  const services = (ctx.services || []).map((s) => {
    const id = uniqueId(slugify(s.id || s.name), usedServiceIds);
    serviceNameToId.set((s.name || "").trim().toLowerCase(), id);
    if (s.price === undefined || s.price === null) defaulted.push({ field: `services.${s.name}.price`, value: 0, reason: "precio no especificado" });
    if (!s.durationMinutes) defaulted.push({ field: `services.${s.name}.durationMinutes`, value: 30, reason: "duración no especificada" });
    return {
      id,
      name: s.name || PLACEHOLDER("NOMBRE_DEL_SERVICIO"),
      description: s.description || "",
      price: s.price ?? 0,
      durationMinutes: s.durationMinutes ?? 30,
      bufferMinutes: s.bufferMinutes ?? 0,
      active: s.active !== false,
      image: s.image || "",
    };
  });
  if (services.length === 0) blocking.push({ field: "services", message: "No se especificó ningún servicio — no hay nada que reservar." });

  // --- staff -----------------------------------------------------------
  const usedStaffIds = new Set();
  const staff = (ctx.staff || []).map((m) => {
    const id = uniqueId(slugify(m.id || m.name), usedStaffIds);
    const serviceIds = [];
    for (const name of m.serviceNames || m.services || []) {
      const resolved = serviceNameToId.get(String(name).trim().toLowerCase());
      if (resolved) serviceIds.push(resolved);
      else blocking.push({ field: `staff.${m.name}.services`, message: `"${m.name}" ofrece "${name}", pero ningún servicio con ese nombre fue definido — nombres de servicios inconsistentes.` });
    }
    const workingHours = {};
    for (const day of WEEKDAYS) {
      const given = m.workingHours?.[day];
      if (given && given.closed !== true && given.start && given.end) {
        workingHours[day] = { start: given.start, end: given.end };
      } else {
        workingHours[day] = { closed: true };
      }
    }
    const breaks = (m.breaks || []).map((brk) => ({ days: brk.days, start: brk.start, end: brk.end }));
    return {
      id,
      name: m.name || PLACEHOLDER("NOMBRE_DEL_TRABAJADOR"),
      biography: m.biography || "",
      photo: m.photo || "",
      active: m.active !== false,
      serviceIds,
      workingHours,
      breaks,
    };
  });
  if (staff.length === 0) blocking.push({ field: "staff", message: "No se especificó ningún trabajador — no hay quién atienda las reservas." });
  for (const m of staff) {
    if (m.serviceIds.length === 0) blocking.push({ field: `staff.${m.name}`, message: `"${m.name}" no tiene ningún servicio válido asociado.` });
  }

  // --- booking -----------------------------------------------------------
  const bk = ctx.booking || {};
  const booking = {
    flowOrder: bk.flowOrder && bk.flowOrder.length ? bk.flowOrder : ["service", "staff", "datetime", "customer", "confirmation"],
    minimumNoticeMinutes: bk.minimumNoticeMinutes ?? 60,
    maximumAdvanceDays: bk.maximumAdvanceDays ?? 90,
    slotIntervalMinutes: bk.slotIntervalMinutes ?? 15,
    allowAnyStaff: bk.allowAnyStaff ?? true,
    cancellationNoticeHours: bk.cancellationNoticeHours ?? 24,
    customerFields: { name: true, phone: true, email: bk.customerFields?.email ?? true, notes: bk.customerFields?.notes ?? true },
  };
  for (const [field, given] of [["minimumNoticeMinutes", bk.minimumNoticeMinutes], ["maximumAdvanceDays", bk.maximumAdvanceDays], ["slotIntervalMinutes", bk.slotIntervalMinutes]]) {
    if (given === undefined || given === null) defaulted.push({ field: `booking.${field}`, value: booking[field], reason: "no especificado — valor por defecto razonable" });
  }

  // --- content -------------------------------------------------------------
  const c = ctx.content || {};
  const content = {
    heroTitle: c.heroTitle || business.name,
    heroSubtitle: c.heroSubtitle || "",
    aboutTitle: c.aboutTitle || "Sobre nosotros",
    aboutText: c.aboutText || PLACEHOLDER("DESCRIPCION_REAL"),
    bookingTitle: c.bookingTitle || "Reserva tu cita",
    confirmationMessage: c.confirmationMessage || "Tu reserva fue registrada correctamente.",
    cancellationPolicy: c.cancellationPolicy || PLACEHOLDER("POLITICA_DE_CANCELACION"),
    footerText: c.footerText || "",
  };
  if (!c.aboutText) defaulted.push({ field: "content.aboutText", value: content.aboutText, reason: "no provisto — placeholder, no bloqueante" });
  if (!c.cancellationPolicy) defaulted.push({ field: "content.cancellationPolicy", value: content.cancellationPolicy, reason: "no provisto — placeholder, no bloqueante" });

  // --- features / crm / environment ---------------------------------------
  const f = ctx.features || {};
  const features = {
    publicBookingWebsite: f.publicBookingWebsite ?? true,
    adminDashboard: f.adminDashboard ?? true,
    whatsapp: f.whatsapp ?? false,
    aiAssistant: f.aiAssistant ?? false,
    reminders: f.reminders ?? false,
    googleCalendar: f.googleCalendar ?? false,
    emailNotifications: f.emailNotifications ?? false,
    promotions: f.promotions ?? false,
    faqs: f.faqs ?? false,
  };

  const crmProvider = ctx.crm?.provider === "google-sheets-apps-script" ? "google-sheets-apps-script" : ctx.crm?.provider === "local" ? "local" : "local";
  if (!ctx.crm?.provider) defaulted.push({ field: "crm.provider", value: crmProvider, reason: "no especificado — por defecto local (solo desarrollo/preview); cambiar a google-sheets-apps-script explícitamente para producción" });
  const crm = { provider: crmProvider, webAppUrlEnv: "CRM_WEB_APP_URL", apiKeyEnv: "CRM_API_KEY", signingSecretEnv: "CRM_SIGNING_SECRET", requestTimeoutMs: 12000 };

  const environment = ["development", "staging", "production"].includes(ctx.environment) ? ctx.environment : "development";
  if (environment === "production" && crm.provider === "local") {
    blocking.push({ field: "environment", message: "environment=production requiere crm.provider=google-sheets-apps-script — local pierde las reservas al reiniciar." });
  }

  const config = { environment, business, branding, booking, services, staff, content, features, crm };

  // --- write output -----------------------------------------------------
  const outputPath = args.output ? path.resolve(args.output) : path.join(path.resolve(args.factoryRoot), "clients", `${slug}.yaml`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const header = [
    `# Generado por build-client-config.mjs a partir del contexto en lenguaje natural`,
    `# provisto para este cliente. Campos "REEMPLAZAR_*" son datos genuinamente`,
    `# pendientes (nunca inventados) — ver el reporte de bloqueos/inferencias`,
    `# emitido junto a este archivo.`,
    "",
  ].join("\n");
  fs.writeFileSync(outputPath, header + toYaml(config));

  const reportPath = outputPath.replace(/\.yaml$/, ".onboarding-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ slug, blocking, inferred, defaulted }, null, 2) + "\n");

  console.log(`Configuración escrita: ${outputPath}`);
  console.log(`Reporte de inferencias/pendientes: ${reportPath}`);
  console.log(`${inferred.length} valor(es) inferido(s), ${defaulted.length} valor(es) con default no bloqueante, ${blocking.length} bloqueante(s).`);

  if (blocking.length > 0) {
    console.log("\n=== PREGUNTAS BLOQUEANTES (agrupar en un único mensaje al humano) ===");
    console.log(JSON.stringify(blocking, null, 2));
    process.exit(2);
  }
  process.exit(0);
}

main();
