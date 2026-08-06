# Onboarding context parser — natural language to client configuration

A new session almost never receives a filled-in `clients/<slug>.yaml`. It receives prose:
"Crea la web y reservas para esta barbería: [business description]." This file is how that
prose becomes a validated configuration, without a human ever hand-writing YAML and without
inventing a single business fact.

## Division of labor

1. **You (the Claude session) extract.** Read the natural-language context and produce an
   *intermediate JSON structure* (shape below) — this is language understanding, which is
   what you do, not a deterministic script.
2. **`scripts/build-client-config.mjs` builds.** It takes that JSON and deterministically
   produces `clients/<slug>.yaml`: generates slugs/ids, infers locale/currency/timezone from
   `business.country` (`scripts/country-defaults.mjs` — a short, deliberately incomplete
   table; a country not in it is left for you/the human, never guessed), resolves
   staff→service references, applies safe non-business-fact defaults, and detects
   contradictions and true blockers.
3. **You group and ask.** If `build-client-config.mjs` exits with code `2`, it printed a
   JSON array of blocking questions. Present all of them to the human in **one** message —
   never one field at a time, never re-asking for something already given.

## The intermediate structure

```json
{
  "business": {
    "name": "string, required",
    "country": "string — used for locale/currency/timezone inference",
    "city": "string",
    "timezone": "IANA string, or omit to try inference",
    "locale": "e.g. es-ES, or omit to try inference",
    "currency": "ISO 4217, or omit to try inference",
    "address": "string", "phone": "string", "email": "string",
    "instagram": "string", "mapsUrl": "string"
  },
  "branding": {
    "styleDescription": "string, verbatim from the human's own words",
    "visualPreset": "minimal | luxury | urban | classic (guess the closest, never blocking)",
    "primaryColor": "#hex", "secondaryColor": "#hex", "backgroundColor": "#hex",
    "logo": "relative path, if a file was actually provided"
  },
  "booking": {
    "minimumNoticeMinutes": "number, omit for a safe default",
    "maximumAdvanceDays": "number, omit for a safe default",
    "slotIntervalMinutes": "number, omit for a safe default",
    "allowAnyStaff": "boolean, omit for a safe default",
    "cancellationNoticeHours": "number, omit for a safe default"
  },
  "services": [
    { "name": "string, required per service", "description": "string",
      "price": "number — omit only if genuinely unknown, never guessed",
      "durationMinutes": "number", "bufferMinutes": "number" }
  ],
  "staff": [
    { "name": "string, required per staff member", "biography": "string",
      "serviceNames": ["must match a services[].name exactly, case-insensitive"],
      "workingHours": { "monday": { "start": "09:00", "end": "18:00" }, "sunday": { "closed": true }, "...": "..." },
      "breaks": [{ "days": ["monday", "..."], "start": "13:00", "end": "14:00" }] }
  ],
  "content": { "heroTitle": "string", "heroSubtitle": "string", "aboutText": "string", "cancellationPolicy": "string" },
  "features": { "whatsapp": false, "aiAssistant": false, "reminders": false, "googleCalendar": false, "emailNotifications": false, "promotions": false, "faqs": false },
  "crm": { "provider": "local | google-sheets-apps-script" },
  "environment": "development | staging | production — default development, never choose production yourself"
}
```

Every field is optional except `business.name`, `services[].name`, and `staff[].name` — omit
anything not actually provided rather than filling in a plausible-looking value yourself.
`build-client-config.mjs` decides, per field, whether the gap is safely defaultable,
safely inferable (and flags it as inferred), or genuinely blocking.

## What counts as a business fact (never invent) vs. a safe default (fine to fill in)

**Never invent** — these are the actual identity of a real business:
business name, address, phone, email, service names, service prices, service durations,
staff names, working hours/days, breaks, any content copy presented as the business's own
words (about text, cancellation policy) if not actually given.

**Safe to default** — these are engineering/design defaults, not claims about the business:
`booking.*` numeric rules (60 min notice / 90 day window / 15 min slots / 24h cancellation —
industry-typical values), `branding.visualPreset` and a neutral color triad when a style is
described but no exact hex values were given (flag as pending design review — this project
already generates `DESIGN_REVIEW_CHECKLIST.md` for exactly this), `content.heroTitle`
defaulting to the business name, `crm.provider` defaulting to `local` when not stated.

**Safe to infer, but must be labeled "inferred"** — `business.timezone` / `currency` /
`locale` from `business.country` via `scripts/country-defaults.mjs`, only for the limited
set of single-timezone countries in that table. A country not in the table, or a country
spanning multiple timezones, is a genuine blocker for `timezone` — do not guess.

## Blocking vs. non-blocking (see also `discovery-and-client-inputs.md`)

Blocking (stops generation, must be grouped into one question to the human):
- `business.name` missing.
- `business.timezone` missing and not inferable.
- `business.currency` missing and not inferable.
- No services at all, or no staff at all.
- A staff member references a service name that doesn't match any defined service.
- `environment: production` requested together with no persistent CRM (`crm.provider` would
  stay `local`) — ask whether they actually mean production, or confirm the persistent CRM.

Everything else becomes a `REEMPLAZAR_*`-tagged placeholder or a labeled default/inference
and generation proceeds — this matches the factory's existing warning-vs-error split in
`templates/barbershop-booking/src/config/validate.ts`; `build-client-config.mjs` only adds a
pre-check for gaps that validator can't see (e.g. "no services were mentioned at all" isn't
a schema violation, it's an empty array).

## Running it

```bash
node <factoryRoot>/.claude/skills/barbershop-crm-builder/scripts/build-client-config.mjs \
  --input <path-to-your-intermediate.json> \
  --factory-root <factoryRoot>
```

Write the intermediate JSON to a temp file yourself (e.g. inside `.barbershop-builder/runs/<slug>/`
— see `factory-bootstrap-and-capabilities.md`) before calling this — there is no stdin mode,
so the JSON is always inspectable on disk for debugging and for the run's state record.

In normal use you will not call this directly — `scripts/create-barbershop.mjs` calls it as
step 3 of the full pipeline. Call it directly only when iterating on the intermediate JSON
itself (e.g. resolving a blocking question) without re-running bootstrap.
