// Country -> {currency, timezone, locale} inference table, used only to
// FILL A GAP the human didn't specify, never to override an explicit
// value. Deliberately limited to countries with one dominant timezone —
// a country spanning multiple timezones (e.g. "United States", "Brazil",
// "Russia") is intentionally left out, because inferring a single
// timezone from country alone would be a guess, not a safe default (see
// references/discovery-and-client-inputs.md: "Never guess a country,
// currency, timezone, or phone format from a name or brand alone" — this
// table exists precisely to avoid that guess where genuinely safe, and to
// stay silent (blocking) where it isn't).
//
// Every value produced from this table must be reported as INFERRED, not
// confirmed — see references/onboarding-context-parser.md.
export const COUNTRY_DEFAULTS = {
  "netherlands": { currency: "EUR", timezone: "Europe/Amsterdam", locale: "nl-NL" },
  "países bajos": { currency: "EUR", timezone: "Europe/Amsterdam", locale: "nl-NL" },
  "spain": { currency: "EUR", timezone: "Europe/Madrid", locale: "es-ES" },
  "españa": { currency: "EUR", timezone: "Europe/Madrid", locale: "es-ES" },
  "portugal": { currency: "EUR", timezone: "Europe/Lisbon", locale: "pt-PT" },
  "france": { currency: "EUR", timezone: "Europe/Paris", locale: "fr-FR" },
  "francia": { currency: "EUR", timezone: "Europe/Paris", locale: "fr-FR" },
  "germany": { currency: "EUR", timezone: "Europe/Berlin", locale: "de-DE" },
  "alemania": { currency: "EUR", timezone: "Europe/Berlin", locale: "de-DE" },
  "italy": { currency: "EUR", timezone: "Europe/Rome", locale: "it-IT" },
  "italia": { currency: "EUR", timezone: "Europe/Rome", locale: "it-IT" },
  "belgium": { currency: "EUR", timezone: "Europe/Brussels", locale: "nl-BE" },
  "bélgica": { currency: "EUR", timezone: "Europe/Brussels", locale: "nl-BE" },
  "ireland": { currency: "EUR", timezone: "Europe/Dublin", locale: "en-IE" },
  "united kingdom": { currency: "GBP", timezone: "Europe/London", locale: "en-GB" },
  "reino unido": { currency: "GBP", timezone: "Europe/London", locale: "en-GB" },
  "uk": { currency: "GBP", timezone: "Europe/London", locale: "en-GB" },
  "bolivia": { currency: "BOB", timezone: "America/La_Paz", locale: "es-BO" },
  "mexico": { currency: "MXN", timezone: "America/Mexico_City", locale: "es-MX" },
  "méxico": { currency: "MXN", timezone: "America/Mexico_City", locale: "es-MX" },
  "colombia": { currency: "COP", timezone: "America/Bogota", locale: "es-CO" },
  "peru": { currency: "PEN", timezone: "America/Lima", locale: "es-PE" },
  "perú": { currency: "PEN", timezone: "America/Lima", locale: "es-PE" },
  "chile": { currency: "CLP", timezone: "America/Santiago", locale: "es-CL" },
  "ecuador": { currency: "USD", timezone: "America/Guayaquil", locale: "es-EC" },
  "uruguay": { currency: "UYU", timezone: "America/Montevideo", locale: "es-UY" },
  "paraguay": { currency: "PYG", timezone: "America/Asuncion", locale: "es-PY" },
  "panama": { currency: "PAB", timezone: "America/Panama", locale: "es-PA" },
  "panamá": { currency: "PAB", timezone: "America/Panama", locale: "es-PA" },
  "costa rica": { currency: "CRC", timezone: "America/Costa_Rica", locale: "es-CR" },
  "dominican republic": { currency: "DOP", timezone: "America/Santo_Domingo", locale: "es-DO" },
  "república dominicana": { currency: "DOP", timezone: "America/Santo_Domingo", locale: "es-DO" },
};

export function lookupCountryDefaults(country) {
  if (!country) return null;
  const key = country.trim().toLowerCase();
  return COUNTRY_DEFAULTS[key] ?? null;
}
