// Plain-JS port of templates/barbershop-booking/src/config/validate.ts's
// validation rules, used by the generator CLI before it ever touches the
// filesystem. Kept in sync BY HAND with the TypeScript version — see
// docs/OPERATOR_GUIDE.md and the factory report generator's known-limitations
// note. Both implement the same 20-point check list; if you change one,
// change the other and re-run both test suites (tests/factory/*.test.ts and
// templates/barbershop-booking/tests/config-schema.test.ts).

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const FLOW_STEPS = ["service", "staff", "datetime", "customer", "confirmation"];
const VISUAL_PRESETS = ["minimal", "luxury", "urban", "classic"];
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const hhmmPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLACEHOLDER_PATTERN = /^REEMPLAZAR/;

function isPlaceholder(value) {
  return typeof value === "string" && PLACEHOLDER_PATTERN.test(value.trim());
}
function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function isValidCurrency(code) {
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}
function isValidLocale(locale) {
  try {
    return Intl.getCanonicalLocales(locale).length > 0;
  } catch {
    return false;
  }
}
function minutesOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function requireFields(obj, fields, prefix, errors) {
  for (const f of fields) {
    if (obj == null || obj[f] === undefined || obj[f] === null || obj[f] === "") {
      errors.push({ path: `${prefix}.${f}`, message: `Falta el campo obligatorio "${prefix}.${f}".` });
    }
  }
}

/**
 * @param {unknown} raw
 * @param {{ assetsBaseDir?: string, fs?: typeof import("node:fs") }} [options]
 */
export function validateClientConfig(raw, options = {}) {
  const errors = [];
  const warnings = [];
  const fsModule = options.fs;

  if (raw === null || typeof raw !== "object") {
    return { ok: false, errors: [{ path: "(root)", message: "El archivo de configuración está vacío o no es un objeto válido." }], warnings, config: null };
  }
  const config = raw;

  requireFields(config.business, ["name", "slug", "country", "city", "timezone", "locale", "currency", "address", "phone", "email"], "business", errors);
  requireFields(config.branding, ["primaryColor", "secondaryColor", "backgroundColor", "visualPreset"], "branding", errors);
  requireFields(config.content, ["heroTitle"], "content", errors);
  if (!config.booking || !Array.isArray(config.booking.flowOrder)) {
    errors.push({ path: "booking.flowOrder", message: "Falta el campo obligatorio \"booking.flowOrder\"." });
  }
  if (!Array.isArray(config.services)) errors.push({ path: "services", message: "Falta el campo obligatorio \"services\" (debe ser una lista)." });
  if (!Array.isArray(config.staff)) errors.push({ path: "staff", message: "Falta el campo obligatorio \"staff\" (debe ser una lista)." });

  if (errors.length > 0) return { ok: false, errors, warnings, config: null };

  if (config.branding.visualPreset && !VISUAL_PRESETS.includes(config.branding.visualPreset)) {
    errors.push({ path: "branding.visualPreset", message: `"${config.branding.visualPreset}" no es un preset visual válido — usa uno de: ${VISUAL_PRESETS.join(", ")}.` });
  }

  if (!slugPattern.test(config.business.slug)) {
    errors.push({ path: "business.slug", message: `El slug "${config.business.slug}" no es válido — solo minúsculas, números y guiones, sin espacios ni guiones al inicio/fin.` });
  }

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
  for (const field of ["name", "slug", "country", "city", "address", "phone", "email", "instagram", "mapsUrl"]) {
    if (isPlaceholder(config.business[field])) {
      warnings.push({ path: `business.${field}`, message: `El campo "business.${field}" todavía tiene un valor pendiente de reemplazar: "${config.business[field]}".` });
    }
  }
  if (config.content) {
    for (const field of ["heroTitle", "heroSubtitle", "aboutTitle", "aboutText", "bookingTitle", "cancellationPolicy", "footerText"]) {
      if (isPlaceholder(config.content[field])) {
        warnings.push({ path: `content.${field}`, message: `El campo "content.${field}" todavía tiene un valor pendiente de reemplazar: "${config.content[field]}".` });
      }
    }
  }
  if (isPlaceholder(config.branding.styleDescription)) {
    warnings.push({ path: "branding.styleDescription", message: `El campo "branding.styleDescription" todavía tiene un valor pendiente de reemplazar: "${config.branding.styleDescription}".` });
  }

  for (const field of ["primaryColor", "secondaryColor", "backgroundColor"]) {
    const value = config.branding[field];
    if (isPlaceholder(value)) {
      warnings.push({ path: `branding.${field}`, message: `Falta el color real para "branding.${field}" (valor actual: "${value}").` });
    } else if (!hexColorPattern.test(value)) {
      errors.push({ path: `branding.${field}`, message: `"${value}" no es un color hexadecimal válido para "branding.${field}" (ej. "#1a1a1a").` });
    }
  }
  if (config.branding.logo) {
    if (isPlaceholder(config.branding.logo)) {
      warnings.push({ path: "branding.logo", message: `Falta la ruta real del logo (valor actual: "${config.branding.logo}").` });
    } else if (options.assetsBaseDir && fsModule) {
      const resolved = `${options.assetsBaseDir}/${config.branding.logo}`;
      if (!fsModule.existsSync(resolved)) {
        warnings.push({ path: "branding.logo", message: `La imagen de logo referenciada no existe todavía en el sistema de archivos: "${config.branding.logo}".` });
      }
    }
  }

  const seenServiceIds = new Set();
  for (const [i, service] of config.services.entries()) {
    const p = `services[${i}] (${service.id || "sin id"})`;
    if (!service.id) {
      errors.push({ path: p, message: "Cada servicio necesita un id." });
      continue;
    }
    if (seenServiceIds.has(service.id)) {
      errors.push({ path: p, message: `El id de servicio "${service.id}" está duplicado — cada servicio necesita un id único.` });
    }
    seenServiceIds.add(service.id);
    if (typeof service.price !== "number" || service.price < 0) {
      errors.push({ path: p, message: `El servicio "${service.id}" tiene un precio negativo o inválido (${service.price}).` });
    } else if (service.price === 0) {
      warnings.push({ path: p, message: `El servicio "${service.id}" tiene precio 0 — confirma si es un valor real o un dato pendiente.` });
    }
    if (!Number.isFinite(service.durationMinutes) || service.durationMinutes <= 0) {
      errors.push({ path: p, message: `El servicio "${service.id}" tiene una duración inválida (${service.durationMinutes} minutos) — debe ser mayor a 0.` });
    }
    const buffer = service.bufferMinutes ?? 0;
    if (!Number.isFinite(buffer) || buffer < 0) {
      errors.push({ path: p, message: `El servicio "${service.id}" tiene un buffer inválido (${buffer} minutos) — no puede ser negativo.` });
    }
    if (service.image) {
      if (isPlaceholder(service.image)) {
        warnings.push({ path: p, message: `Falta la imagen real del servicio "${service.id}" (valor actual: "${service.image}").` });
      } else if (options.assetsBaseDir && fsModule && !fsModule.existsSync(`${options.assetsBaseDir}/${service.image}`)) {
        warnings.push({ path: p, message: `La imagen del servicio "${service.id}" no existe todavía en el sistema de archivos: "${service.image}".` });
      }
    }
  }
  if (!config.services.some((s) => s.active !== false)) {
    errors.push({ path: "services", message: "El negocio no tiene ningún servicio activo — se necesita al menos uno para poder recibir reservas." });
  }

  const seenStaffIds = new Set();
  for (const [i, member] of config.staff.entries()) {
    const p = `staff[${i}] (${member.id || "sin id"})`;
    if (!member.id) {
      errors.push({ path: p, message: "Cada trabajador necesita un id." });
      continue;
    }
    if (seenStaffIds.has(member.id)) {
      errors.push({ path: p, message: `El id de trabajador "${member.id}" está duplicado — cada trabajador necesita un id único.` });
    }
    seenStaffIds.add(member.id);
    if (isPlaceholder(member.name)) {
      warnings.push({ path: p, message: `Falta el nombre real del trabajador (valor actual: "${member.name}").` });
    }
    const serviceIds = member.serviceIds ?? [];
    if (serviceIds.length === 0) {
      errors.push({ path: p, message: `El trabajador "${member.id}" no tiene ningún servicio asignado — no podrá recibir reservas.` });
    }
    for (const serviceId of serviceIds) {
      if (!seenServiceIds.has(serviceId)) {
        errors.push({ path: p, message: `El trabajador "${member.id}" utiliza el servicio "${serviceId}", pero ese servicio no existe.` });
      }
    }
    if (member.photo) {
      if (isPlaceholder(member.photo)) {
        warnings.push({ path: p, message: `Falta la foto real del trabajador "${member.id}" (valor actual: "${member.photo}").` });
      } else if (options.assetsBaseDir && fsModule && !fsModule.existsSync(`${options.assetsBaseDir}/${member.photo}`)) {
        warnings.push({ path: p, message: `La foto del trabajador "${member.id}" no existe todavía en el sistema de archivos: "${member.photo}".` });
      }
    }

    const workingHours = member.workingHours ?? {};
    for (const day of WEEKDAYS) {
      const entry = workingHours[day];
      if (!entry) continue;
      const dp = `${p}.workingHours.${day}`;
      const hasHours = typeof entry.start === "string" && typeof entry.end === "string";
      const isClosed = entry.closed === true;
      if (isClosed && hasHours) {
        errors.push({ path: dp, message: `El día "${day}" del trabajador "${member.id}" está marcado como cerrado y con horario a la vez — debe ser uno u otro.` });
        continue;
      }
      if (hasHours) {
        if (!hhmmPattern.test(entry.start) || !hhmmPattern.test(entry.end)) {
          errors.push({ path: dp, message: `El horario del "${day}" del trabajador "${member.id}" tiene un formato de hora inválido (usa HH:mm).` });
          continue;
        }
        if (minutesOf(entry.end) <= minutesOf(entry.start)) {
          errors.push({ path: dp, message: `El horario del "${day}" del trabajador "${member.id}" tiene la hora final ("${entry.end}") antes o igual a la inicial ("${entry.start}").` });
        }
      }
    }

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
      for (const day of brk.days ?? []) {
        const entry = workingHours[day];
        const hasHours = entry && typeof entry.start === "string" && typeof entry.end === "string";
        if (!entry || entry.closed === true || !hasHours) {
          errors.push({ path: bp, message: `El descanso del trabajador "${member.id}" cae en "${day}", pero ese día el trabajador no tiene horario laboral (está cerrado).` });
          continue;
        }
        if (minutesOf(brk.start) < minutesOf(entry.start) || minutesOf(brk.end) > minutesOf(entry.end)) {
          errors.push({ path: bp, message: `El descanso del trabajador "${member.id}" (${brk.start}-${brk.end}) cae fuera de su horario laboral del "${day}" (${entry.start}-${entry.end}).` });
        }
      }
    }
  }
  if (!config.staff.some((s) => s.active !== false)) {
    errors.push({ path: "staff", message: "El negocio no tiene ningún trabajador activo — se necesita al menos uno para poder recibir reservas." });
  }

  const flowOrder = config.booking.flowOrder;
  const flowSet = new Set(flowOrder);
  const missingSteps = FLOW_STEPS.filter((s) => !flowSet.has(s));
  const duplicateSteps = flowOrder.length !== flowSet.size;
  const unknownSteps = flowOrder.filter((s) => !FLOW_STEPS.includes(s));
  if (missingSteps.length > 0 || duplicateSteps || unknownSteps.length > 0) {
    errors.push({
      path: "booking.flowOrder",
      message: `El orden del flujo de reservas es inválido — debe contener exactamente una vez cada uno de: ${FLOW_STEPS.join(", ")}. Valor actual: [${flowOrder.join(", ")}].`,
    });
  } else if (flowOrder[flowOrder.length - 1] !== "confirmation") {
    errors.push({ path: "booking.flowOrder", message: `"confirmation" debe ser siempre el último paso del flujo de reservas.` });
  }

  return { ok: errors.length === 0, errors, warnings, config: errors.length === 0 ? config : null };
}

export function toStrictResult(result) {
  if (result.warnings.length === 0) return result;
  return { ok: false, errors: [...result.errors, ...result.warnings], warnings: [], config: null };
}
