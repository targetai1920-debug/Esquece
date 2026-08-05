# Redaction report — barbershop-crm-builder skill

Records what pilot-project-specific information was found while extracting lessons for
this skill, and confirms it was excluded from every file in
`.claude/skills/barbershop-crm-builder/`.

## Source material audited

`README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `BOOKING_RULES.md`, `CRM_SCHEMA.md`,
`CRM_APPS_SCRIPT.md`, `API_CONTRACT.md`, `WEBSITE_INTEGRATION.md`, `SECURITY.md`,
`TESTING.md`, `DEPLOYMENT.md`, `LIMITATIONS.md`, `CLIENT_INFORMATION_REQUIRED.md`,
`WHATSAPP_AGENT_DESIGN.md`, `MIGRATION_TO_POSTGRESQL.md`, `.env.example`,
`.github/workflows/pages.yml`, `apps-script/*.gs` (notably `Security.gs`, `Sheets.gs`,
`Availability.gs`, `Router.gs`, `Tests.gs`), `apps-script/tests/run-tests.mjs`,
`tests/crm-signing.test.ts`, plus the repository's git history for this session (commits,
PR #5 and #6 and their descriptions).

`APPS_SCRIPT_SETUP.md`, `RENDER_SETUP.md`, `META_SETUP.md`, `ANTHROPIC_SETUP.md`,
`OPERATIONS.md`, `PROJECT_PLAN.md`, `IMPLEMENTATION_STATUS.md`, and the `src/` application
code were consulted at the level already established earlier in this session (deep,
repeated review across prior tasks in this same conversation) rather than re-read in full
during this specific task — no new client-identifying detail was drawn from them beyond
what's covered by the files listed above.

## Specific client-identifying data found

| Category | Real value found in source docs | Files it appeared in |
|---|---|---|
| Business name | "Esquece Barber Studio" | `README.md`, `ARCHITECTURE.md`, most other docs' headers |
| Developer/agency name | "TargetAI" | `ARCHITECTURE.md`, `CLAUDE.md`, session context |
| Location | "Cochabamba, Bolivia" (address left as "confirm" in `CLIENT_INFORMATION_REQUIRED.md`) | `ARCHITECTURE.md`, `CLIENT_INFORMATION_REQUIRED.md` |
| GitHub identity | `targetai1920-debug/Esquece` repository | session/git context, not this skill |
| Deployment URLs | `esquece.onrender.com` (backend), `targetai1920-debug.github.io/Esquece` (demo pages) | session/git context, `.github/workflows/pages.yml` |
| Currency | `BOB` used as the demo default in `SETTINGS` | `BOOKING_RULES.md`, `.env.example` (as a default, not a client-confirmed real value) |
| Timezone | `America/La_Paz` used as the demo default | `BOOKING_RULES.md`, `.env.example` |
| Phone prefix | `+591` appears in demo/example phone numbers | `WEBSITE_INTEGRATION.md`, apps-script test fixtures |
| Brand assets (never actually supplied) | Described only as "crowned smiling face, X-eyes" logo and an "electric" accent color, both explicitly still-pending per `CLIENT_INFORMATION_REQUIRED.md` | `CLIENT_INFORMATION_REQUIRED.md` |
| Contract signing test secret | `test-signing-secret` — explicitly a **test-only** placeholder value already documented as non-real in `API_CONTRACT.md`, not a real credential | `API_CONTRACT.md`, `tests/crm-signing.test.ts`, `apps-script/Tests.gs` |

## What was excluded from this skill

Every item in the table above. None of the skill's files (`SKILL.md`, `references/*.md`,
`examples/*.md`, `evals/evals.json`, this file, `TRACEABILITY.md`) contain: the business
name, the developer/agency name, the real location, any real GitHub org/repo/username, any
real deployment URL, `BOB` presented as a required currency, `America/La_Paz` presented as
a required timezone, `+591` presented as a required phone prefix, or any description of
the pilot's specific (still-pending, never actually received) logo/color/brand identity.

No real secret, API key, HMAC signing secret, or token was ever present in the source
material to begin with — `CLIENT_INFORMATION_REQUIRED.md` records that the pilot project
never received real client business data at all (services, staff, schedules, brand assets
all remained demo/placeholder for the pilot's entire build), and the one signing-secret
string appearing in test fixtures (`test-signing-secret`) is itself a documented,
non-secret placeholder used only to make signing test vectors reproducible — it was kept
in this skill's `security-and-idempotency.md` example illustration for exactly that
reason (it is not a real credential), consistent with `SKILL.md` §4's rule that example
values must be obviously synthetic.

## What was substituted

Every place a concrete client fact would otherwise appear uses the placeholder vocabulary
defined in `SKILL.md` §4: `BUSINESS_NAME`, `BUSINESS_SLUG`, `BUSINESS_TIMEZONE`,
`BUSINESS_LOCALE`, `CURRENCY_CODE`, `COUNTRY_CALLING_CODE`, `PHONE_VALIDATION_RULES`,
`PUBLIC_SITE_ORIGIN`, `BACKEND_BASE_URL`, `CRM_WEB_APP_URL`, `ADMIN_EMAIL`,
`BUSINESS_ADDRESS`. Where an illustrative example value was still useful (e.g. showing the
*shape* of a currency code or country prefix), multiple neutral examples are used together
(`USD`, `MXN`, `EUR`; `+1`, `+52`, `+44`) rather than the pilot's actual currency/prefix,
so no single value could be mistaken for a mandated default.

## What generic knowledge was kept

The architecture pattern (shared engine, one CRM, layered API), the full entity model
(`crm-data-model.md`), the twelve-point availability check and locking/idempotency
mechanism (`booking-and-availability-rules.md`, `security-and-idempotency.md`), the
spreadsheet-backend-specific lessons (type coercion, date-serial handling, read
amplification, central action router — `google-sheets-apps-script.md`), the HMAC-charset
cross-runtime bug and its fix (`security-and-idempotency.md`,
`production-lessons.md` — described mechanically, with no reference to which specific
client hit it), the testing strategy (`testing-and-ci.md`), deployment order and
verification-honesty discipline (`deployment-and-operations.md`), and the WhatsApp/AI
channel design (`optional-whatsapp-and-ai.md`). All of this is business-agnostic and
carries over to any client.

## Confirmation

No secrets, credentials, real identifiers, or the pilot client's business identity were
copied into `.claude/skills/barbershop-crm-builder/`. This report itself contains no
secret value — only the fact that a category of information (e.g. "a signing secret
variable name") existed, never a real value.
