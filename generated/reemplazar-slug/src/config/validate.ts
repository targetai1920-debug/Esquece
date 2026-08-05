import fs from "node:fs";
import path from "node:path";
import { clientConfigSchema, hexColorPattern, slugPattern, hhmmPattern, WEEKDAYS } from "./schema";
import type { ClientConfig, FlowStep } from "./schema";

/**
 * Two-tier validation, on purpose:
 *
 *  - `errors`: structural/logical problems that must always block
 *    generation, in every mode (duplicate ids, a staff member linked to a
 *    service that doesn't exist, end time before start time, a day marked
 *    both closed and with hours, an invalid flow order, ...). These are
 *    never "just pending data" — they're contradictions in the config
 *    itself.
 *  - `warnings`: a value that's syntactically present but looks like an
 *    unfilled placeholder (matches the `REEMPLAZAR_*` sentinel convention)
 *    or fails a real-world format check (invalid IANA timezone, invalid
 *    ISO currency code, invalid BCP-47 locale, invalid hex color, a
 *    referenced image file that doesn't exist on disk). These do not block
 *    a local/demo generation — see factory/create-client.mjs's --strict
 *    flag, which promotes every warning to a blocking error for a real
 *    production deploy.
 *
 * Every message is written to be understandable by a non-technical reader
 * (names the offending id/value, says exactly what's wrong).
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  config: ClientConfig | null;
}

const PLACEHOLDER_PATTERN = /^REEMPLAZAR/;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

function isValidLocale(locale: string): boolean {
  try {
    const canonical = Intl.getCanonicalLocales(locale);
    return canonical.length > 0;
  } catch {
    return false;
  }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export interface ValidateOptions {
  /** Absolute directory image paths are resolved against, if checking file existence. */
  assetsBaseDir?: string;
}

export function validateClientConfig(raw: unknown, options: ValidateOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const parsed = clientConfigSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const p = issue.path.join(".") || "(root)";
      errors.push({ path: p, message: `Falta o es inválido el campo "${p}": ${issue.message}` });
    }
    return { ok: false, errors, warnings, config: null };
  }

  const config = parsed.data;

  // --- Business: slug ------------------------------------------------------
  if (!slugPattern.test(config.business.slug)) {
    errors.push({
      path: "business.slug",
      message: `El slug "${config.business.slug}" no es válido — solo minúsculas, números y guiones, sin espacios ni guiones al inicio/fin.`,
    });
  }

  // --- Business: timezone / currency / locale (warning-tier, format only) --
  if (isPlaceholder(config.business.timezone)) {
    warnings.push({ path: "business.timezone", message: `Falta la zona horaria real del negocio (valor actual: "${config.business.timezone}").` });
  } else if (!isValidTimezone(config.business.timezone)) {
    errors.push({ path: "business.timezone", message: `"${config.business.timezone}" no es una zona horaria IANA válida (ej. "America/Mexico_City").` });
  }

  if (isPlaceholder(config.business.currency)) {
    warnings.push({ path: "business.currency", message: `Falta la moneda real del negocio (valor actual: "${config.business.currency}").` });
  } else if (!isValidCurrency(config.business.currency)) {
    errors.push({ path: "business.currency", message: `"${config.business.currency}" no es un código de moneda ISO 4217 válido (ej. "USD", "MXN").` });
  }

  if (isPlaceholder(config.business.locale)) {
    warnings.push({ path: "business.locale", message: `Falta el locale real del negocio (valor actual: "${config.business.locale}").` });
  } else if (!isValidLocale(config.business.locale)) {
    errors.push({ path: "business.locale", message: `"${config.business.locale}" no es un locale válido (ej. "es-MX", "en-US").` });
  }

  for (const field of ["name", "slug", "country", "city", "address", "phone", "email", "instagram", "mapsUrl"] as const) {
    const value = config.business[field];
    if (isPlaceholder(value)) {
      warnings.push({ path: `business.${field}`, message: `El campo "business.${field}" todavía tiene un valor pendiente de reemplazar: "${value}".` });
    }
  }

  for (const field of ["heroTitle", "heroSubtitle", "aboutTitle", "aboutText", "bookingTitle", "cancellationPolicy", "footerText"] as const) {
    const value = config.content[field];
    if (isPlaceholder(value)) {
      warnings.push({ path: `content.${field}`, message: `El campo "content.${field}" todavía tiene un valor pendiente de reemplazar: "${value}".` });
    }
  }
  if (isPlaceholder(config.branding.styleDescription)) {
    warnings.push({ path: "branding.styleDescription", message: `El campo "branding.styleDescription" todavía tiene un valor pendiente de reemplazar: "${config.branding.styleDescription}".` });
  }

  // --- Branding: colors ------------------------------------------------------
  for (const field of ["primaryColor", "secondaryColor", "backgroundColor"] as const) {
    const value = config.branding[field];
    if (isPlaceholder(value)) {
      warnings.push({ path: `branding.${field}`, message: `Falta el color real para "branding.${field}" (valor actual: "${value}").` });
    } else if (!hexColorPattern.test(value)) {
      errors.push({ path: `branding.${field}`, message: `"${value}" no es un color hexadecimal válido para "branding.${field}" (ej. "#1a1a1a").` });
    }
  }

  if (config.branding.logo && isPlaceholder(config.branding.logo)) {
    warnings.push({ path: "branding.logo", message: `Falta la ruta real del logo (valor actual: "${config.branding.logo}").` });
  } else if (config.branding.logo && options.assetsBaseDir) {
    const resolved = path.resolve(options.assetsBaseDir, config.branding.logo);
    if (!fs.existsSync(resolved)) {
      warnings.push({ path: "branding.logo", message: `La imagen de logo referenciada no existe todavía en el sistema de archivos: "${config.branding.logo}".` });
    }
  }

  // --- Services: duplicate ids, negative price, invalid duration/buffer ----
  const seenServiceIds = new Set<string>();
  for (const [i, service] of config.services.entries()) {
    const p = `services[${i}] (${service.id || "sin id"})`;
    if (seenServiceIds.has(service.id)) {
      errors.push({ path: p, message: `El id de servicio "${service.id}" está duplicado — cada servicio necesita un id único.` });
    }
    seenServiceIds.add(service.id);

    if (service.price < 0) {
      errors.push({ path: p, message: `El servicio "${service.id}" tiene un precio negativo (${service.price}).` });
    }
    if (!Number.isFinite(service.durationMinutes) || service.durationMinutes <= 0) {
      errors.push({ path: p, message: `El servicio "${service.id}" tiene una duración inválida (${service.durationMinutes} minutos) — debe ser mayor a 0.` });
    }
    if (!Number.isFinite(service.bufferMinutes) || service.bufferMinutes < 0) {
      errors.push({ path: p, message: `El servicio "${service.id}" tiene un buffer inválido (${service.bufferMinutes} minutos) — no puede ser negativo.` });
    }
    if (service.price === 0) {
      warnings.push({ path: p, message: `El servicio "${service.id}" tiene precio 0 — confirma si es un valor real o un dato pendiente.` });
    }
    if (service.image && isPlaceholder(service.image)) {
      warnings.push({ path: p, message: `Falta la imagen real del servicio "${service.id}" (valor actual: "${service.image}").` });
    } else if (service.image && options.assetsBaseDir) {
      const resolved = path.resolve(options.assetsBaseDir, service.image);
      if (!fs.existsSync(resolved)) {
        warnings.push({ path: p, message: `La imagen del servicio "${service.id}" no existe todavía en el sistema de archivos: "${service.image}".` });
      }
    }
  }

  if (!config.services.some((s) => s.active)) {
    errors.push({ path: "services", message: "El negocio no tiene ningún servicio activo — se necesita al menos uno para poder recibir reservas." });
  }

  // --- Staff: duplicate ids, service references, working hours, breaks -----
  const seenStaffIds = new Set<string>();
  for (const [i, member] of config.staff.entries()) {
    const p = `staff[${i}] (${member.id || "sin id"})`;
    if (seenStaffIds.has(member.id)) {
      errors.push({ path: p, message: `El id de trabajador "${member.id}" está duplicado — cada trabajador necesita un id único.` });
    }
    seenStaffIds.add(member.id);

    if (isPlaceholder(member.name)) {
      warnings.push({ path: p, message: `Falta el nombre real del trabajador (valor actual: "${member.name}").` });
    }

    if (member.serviceIds.length === 0) {
      errors.push({ path: p, message: `El trabajador "${member.id}" no tiene ningún servicio asignado — no podrá recibir reservas.` });
    }
    for (const serviceId of member.serviceIds) {
      if (!seenServiceIds.has(serviceId)) {
        errors.push({
          path: p,
          message: `El trabajador "${member.id}" utiliza el servicio "${serviceId}", pero ese servicio no existe.`,
        });
      }
    }

    if (member.photo && isPlaceholder(member.photo)) {
      warnings.push({ path: p, message: `Falta la foto real del trabajador "${member.id}" (valor actual: "${member.photo}").` });
    } else if (member.photo && options.assetsBaseDir) {
      const resolved = path.resolve(options.assetsBaseDir, member.photo);
      if (!fs.existsSync(resolved)) {
        warnings.push({ path: p, message: `La foto del trabajador "${member.id}" no existe todavía en el sistema de archivos: "${member.photo}".` });
      }
    }

    // Working hours: closed+hours conflict, end before start, unknown day handled by schema.
    for (const day of WEEKDAYS) {
      const entry = member.workingHours[day];
      if (!entry) continue;
      const dp = `${p}.workingHours.${day}`;
      const hasHours = typeof entry.start === "string" && typeof entry.end === "string";
      const isClosed = entry.closed === true;
      if (isClosed && hasHours) {
        errors.push({ path: dp, message: `El día "${day}" del trabajador "${member.id}" está marcado como cerrado y con horario a la vez — debe ser uno u otro.` });
        continue;
      }
      if (hasHours) {
        const start = entry.start as string;
        const end = entry.end as string;
        if (!hhmmPattern.test(start) || !hhmmPattern.test(end)) {
          errors.push({ path: dp, message: `El horario del "${day}" del trabajador "${member.id}" tiene un formato de hora inválido (usa HH:mm).` });
          continue;
        }
        if (minutesOf(end) <= minutesOf(start)) {
          errors.push({ path: dp, message: `El horario del "${day}" del trabajador "${member.id}" tiene la hora final ("${end}") antes o igual a la inicial ("${start}").` });
        }
      }
    }

    // Breaks: must fall within that day's working hours.
    for (const [bi, brk] of (member.breaks ?? []).entries()) {
      const bp = `${p}.breaks[${bi}]`;
      if (!hhmmPattern.test(brk.start) || !hhmmPattern.test(brk.end)) {
        errors.push({ path: bp, message: `El descanso del trabajador "${member.id}" tiene un formato de hora inválido (usa HH:mm).` });
        continue;
      }
      if (minutesOf(brk.end) <= minutesOf(brk.start)) {
        errors.push({ path: bp, message: `El descanso del trabajador "${member.id}" tiene la hora final antes o igual a la inicial.` });
        continue;
      }
      for (const day of brk.days) {
        const entry = member.workingHours[day];
        const dayLabel = day;
        const dayHasHours = entry && typeof entry.start === "string" && typeof entry.end === "string";
        if (!entry || entry.closed === true || !dayHasHours) {
          errors.push({ path: bp, message: `El descanso del trabajador "${member.id}" cae en "${dayLabel}", pero ese día el trabajador no tiene horario laboral (está cerrado).` });
          continue;
        }
        const dayStart = entry.start as string;
        const dayEnd = entry.end as string;
        if (minutesOf(brk.start) < minutesOf(dayStart) || minutesOf(brk.end) > minutesOf(dayEnd)) {
          errors.push({
            path: bp,
            message: `El descanso del trabajador "${member.id}" (${brk.start}-${brk.end}) cae fuera de su horario laboral del "${dayLabel}" (${dayStart}-${dayEnd}).`,
          });
        }
      }
    }
  }

  if (!config.staff.some((s) => s.active)) {
    errors.push({ path: "staff", message: "El negocio no tiene ningún trabajador activo — se necesita al menos uno para poder recibir reservas." });
  }

  // --- Booking flow order ---------------------------------------------------
  const requiredSteps: FlowStep[] = ["service", "staff", "datetime", "customer", "confirmation"];
  const flowSet = new Set(config.booking.flowOrder);
  const missingSteps = requiredSteps.filter((s) => !flowSet.has(s));
  const duplicateSteps = config.booking.flowOrder.length !== flowSet.size;
  if (missingSteps.length > 0 || duplicateSteps) {
    errors.push({
      path: "booking.flowOrder",
      message: `El orden del flujo de reservas es inválido — debe contener exactamente una vez cada uno de: ${requiredSteps.join(", ")}. Falta o está repetido en: [${config.booking.flowOrder.join(", ")}].`,
    });
  }
  // "confirmation" must be last, "datetime" must come after both service and staff selection points
  // that are actually present (both always are, per requiredSteps) — enforce the one ordering
  // constraint that's load-bearing for the UI: confirmation is always the final step.
  if (config.booking.flowOrder[config.booking.flowOrder.length - 1] !== "confirmation" && missingSteps.length === 0) {
    errors.push({ path: "booking.flowOrder", message: `"confirmation" debe ser siempre el último paso del flujo de reservas.` });
  }

  return { ok: errors.length === 0, errors, warnings, config: errors.length === 0 ? config : null };
}

/** Promotes every warning to a blocking error — used for a real production generation. */
export function toStrictResult(result: ValidationResult): ValidationResult {
  if (result.warnings.length === 0) return result;
  return {
    ok: false,
    errors: [...result.errors, ...result.warnings],
    warnings: [],
    config: null,
  };
}
