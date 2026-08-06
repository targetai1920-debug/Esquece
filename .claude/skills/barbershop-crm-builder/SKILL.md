---
name: barbershop-crm-builder
description: Builds, connects, tests, and prepares for deployment a booking website with a persistent CRM for a barbershop, salon, or other staff-based appointment business. Given a business description in natural language, this skill locates or clones its own factory repository, extracts business facts (never inventing them), generates a validated client configuration, runs the generator, and verifies the result end to end (lint, typecheck, tests, build, contamination scan, CRM preparation) — no manual YAML editing or command lookup required from the user. Trigger on requests such as: crear una página/web para una barbería, crear un sistema de reservas para una barbería, crear una web conectada a CRM para una barbería, generar un nuevo cliente de la fábrica, configurar servicios/trabajadores/horarios de una barbería, crear una nueva barbería a partir de contexto, reutilizar la plantilla de reservas para barberías, usar barbershop-crm-builder — and their English equivalents: build/create a barbershop or salon booking website, add multi-barber scheduling, prevent double-booking, add an admin dashboard for appointments, spin up a new client from the factory, reuse this booking template for another shop. Not for generic e-commerce, restaurant table reservations with no per-staff scheduling, brochure sites with no reservation logic, or modifying this skill's own pilot project's production system.
---

# Barbershop CRM Builder

Build a **shared booking-and-availability engine** with a CRM as its single source of
truth, exposed through a secure API, and consumed by one or more interfaces (public
website, admin dashboard, optional WhatsApp agent). This skill generalizes lessons from a
real production pilot — see `references/production-lessons.md` — but is not tied to that
pilot's business, brand, country, or stack choices. Never carry a previous client's name,
logo, colors, copy, prices, staff, or credentials into a new project (§"Redaction rule"
below).

**This skill is self-sufficient.** Every fact a new session needs — where its factory
repository lives, what branch/commit it needs, what commands to run, what "done" looks
like — is in this file, `factory.yaml`, `capabilities.yaml`, and `references/`/`scripts/`
below. Never rely on "as discussed earlier," "the repository you already know," or any
other memory of a previous conversation — a session using this skill for the first time,
with no prior context, must be able to complete a build from these files alone.

## 1. Purpose

The deliverable is never "a pretty booking page." It is a system where:

```
Public booking page(s)
        │
        ▼
Secure backend API
        │
        ▼
Central booking & availability engine
        │
        ▼
CRM (single source of truth)
```

Every interface — public website, admin dashboard, optional WhatsApp agent, future mobile
app — calls the **same** engine and reads/writes the **same** CRM. There is no per-channel
availability logic, ever. See `references/architecture-and-decisions.md`.

## 2. When to use this skill

Use it when the user asks to:
- Build a booking/reservation website for a barbershop, salon, or similar staff-based
  appointment business.
- Connect an existing website's booking UI to a real backend/CRM.
- Design a multi-staff calendar that must not double-book.
- Add an admin dashboard for appointments, staff, services, or schedules.
- Add WhatsApp (or another channel) as an additional booking surface.
- Reuse this exact architecture for a **new** client ("factory mode" — see
  `references/factory-mode-and-client-onboarding.md`).
- Any variant of "create a barbershop/salon website with reservations and CRM from this
  business description," even when the skill isn't named explicitly and even when the
  message is only a paragraph of prose about a specific shop — that prose is the input,
  see `references/onboarding-context-parser.md`.

## 2b. Before writing anything: locate the factory

This skill does not design a booking system from zero — it drives an existing, tested
factory (generator + template + CRM). Before extracting a single business fact, resolve
where that factory is:

```bash
node .claude/skills/barbershop-crm-builder/scripts/bootstrap-factory.mjs --json
```

Run this from wherever the session started — it locates an existing checkout, updates it
safely, or clones one, per `references/factory-bootstrap-and-capabilities.md`, and prints
the factory's absolute path. If it fails, run
`node .claude/skills/barbershop-crm-builder/scripts/doctor.mjs` for a full, honest
readiness report before doing anything else.

## 3. When NOT to use this skill

- Generic e-commerce (product catalog + cart + shipping) with no per-staff time slots.
- A restaurant table-reservation system with no individually-schedulable staff (the
  engine's `staff × service × time` model doesn't fit; adapt, don't force).
- A brochure/marketing site with no reservation logic at all — that's a normal web build,
  not this skill.
- A request to modify **this session's own pilot project's production system** (secrets,
  real Apps Script deployment, real Render env vars) — that is operating an existing
  system, not building a new one from this skill, and is out of scope here regardless.

## 4. Redaction rule — read this before writing anything business-specific

This skill's own files (`references/`, `examples/`, `evals/`) must never contain a real
client's business name, logo, staff names, real address, real phone/WhatsApp number, real
API keys/secrets/URLs, or a hardcoded country/currency/timezone presented as universal.
Use the placeholder vocabulary below everywhere a concrete value would otherwise go.

When you *use* this skill to build a project for an actual client, the client's real data
belongs in that project's own config/CRM — never back-ported into this skill's files.

| Placeholder | Meaning |
|---|---|
| `BUSINESS_NAME` | Display name of the shop |
| `BUSINESS_SLUG` | URL-safe / config-key identifier |
| `BUSINESS_TIMEZONE` | IANA timezone, e.g. business-specific, never assumed |
| `BUSINESS_LOCALE` | e.g. `es-BO`, `en-US` — never assumed |
| `CURRENCY_CODE` | ISO 4217, e.g. `USD`, `MXN`, `EUR` — never hardcoded as *the* currency |
| `COUNTRY_CALLING_CODE` | e.g. `+1`, `+52`, `+44` — never hardcoded as *the* prefix |
| `PHONE_VALIDATION_RULES` | Country-specific phone shape, configurable |
| `PUBLIC_SITE_ORIGIN` | The booking website's real origin, for CORS |
| `BACKEND_BASE_URL` | This project's deployed API base URL |
| `CRM_WEB_APP_URL` | The CRM backend's deployed URL (never in browser code) |
| `ADMIN_EMAIL` | Admin login identity |
| `BUSINESS_ADDRESS` | Physical address / map link |

Any concrete example values used to *illustrate* a mechanism (e.g. a test HMAC vector, a
sample slot calculation) must be obviously synthetic (`svc_demo`, `staff_demo`,
`2026-07-30`, `test-signing-secret`) — never a real client's actual data, even as an
"example."

## 5. Initial information gathering — never invent business facts

Before writing client-specific config, collect (or explicitly mark pending) the categories
in `references/discovery-and-client-inputs.md`: identity, services, staff, schedule,
policies, and technical operation ownership. Anything not yet provided gets a value
explicitly tagged `DEMO_DATA_REPLACE_BEFORE_PRODUCTION` — never a plausible-looking
invented fact presented as real. Group missing-data questions; don't interview the user
field-by-field when most answers are already given or safely inferable-and-flagged.

If this is a **new client on an existing template** (factory mode), read
`references/factory-mode-and-client-onboarding.md` first — the discovery step becomes
"fill the client config schema," not "design a system from zero."

When the input is a natural-language business description (the normal case for a new
client), read `references/onboarding-context-parser.md` for exactly how to turn that prose
into the intermediate structure `scripts/build-client-config.mjs` consumes, and which gaps
are genuinely blocking versus safe to default or infer.

## 5b. Capabilities — check before promising a feature

Read `capabilities.yaml` before telling anyone a feature is ready. A `not-implemented`
feature (currently: `whatsapp`, `aiAssistant`, `googleCalendar`, `reminders`) can be toggled
on in a client's config outside production as a harmless no-op, but never claim it works,
and never enable it in `environment: production` (the generator's own validator blocks
that). `experimental` (currently: `emailNotifications`) works but isn't proven for real
production traffic — say so.

## 6. Architecture decision tree

Read `references/architecture-and-decisions.md` in full before writing code. Summary:

- **Storage**: Spreadsheet-backed CRM (e.g. Google Sheets + Apps Script) for one-or-few
  locations, low/medium volume, tight budget, non-technical owner who wants to see their
  own data. A relational database (e.g. PostgreSQL) for high concurrent volume, many
  locations, multiple admin roles, serious reporting, payments/accounting, or regulatory
  audit needs. **Decide per project — never assume the spreadsheet path is always right.**
- **Interfaces are consumers, not owners**: the public website, admin dashboard, and any
  WhatsApp/AI channel all depend on one `CrmClient`-shaped interface. Swapping storage
  means writing a new implementation of that interface, not touching every consumer.
- **The browser never holds CRM secrets.** Public website → this project's own backend API
  → server-side CRM client → CRM. Never public website → CRM directly.

## 7. Implementation phases

**For a new client on the existing factory (the common case), the mandatory flow is:**

```
Receive context (natural language)
  → Locate/clone the factory (bootstrap-factory.mjs)
    → Extract business facts (never invented)
      → Classify missing data: blocking vs. non-blocking
        → Create clients/<slug>.yaml (build-client-config.mjs)
          → Validate it
            → Generate the project (create-client)
              → Install dependencies
                → Lint → Typecheck → Test → Build
                  → Scan for contamination from a previous client
                    → Prepare the CRM (never deploy it)
                      → Prepare the repository
                        → Prepare deployment docs
                          → Ask ONLY for the authorizations that are truly unavoidable
```

`scripts/create-barbershop.mjs` executes this entire flow as one resumable command — see
`references/factory-bootstrap-and-capabilities.md` for exactly what it runs and how it
resumes after a failure or a blocking-questions pause:

```bash
node .claude/skills/barbershop-crm-builder/scripts/create-barbershop.mjs \
  --context <path-to-intermediate-onboarding.json>
```

This script **executes** — it does not just print instructions for a human to run. It
creates files, runs the real generator and test suite, and fixes what it can fix itself; it
only stops to ask a human for something a human alone can provide (a Google account
authorizing Apps Script, credential values, visual/content approval).

For designing or modifying the underlying engine itself (not just onboarding a new client
onto it), work through these phases in order; each has its own invariants and completion
criteria detailed in the references. Don't start a phase's code before its prerequisite
decisions/docs exist.

| Phase | Goal | Reference |
|---|---|---|
| 0 | Audit existing project/template, gather client inputs | `discovery-and-client-inputs.md`, `factory-mode-and-client-onboarding.md` |
| 1 | Architecture decisions (storage, interfaces, deployment target) | `architecture-and-decisions.md` |
| 2 | Write booking/availability rules in prose before code | `booking-and-availability-rules.md` |
| 3 | Design CRM schema and API contract | `crm-data-model.md` |
| 4 | Implement the availability engine (read-only check) | `booking-and-availability-rules.md` |
| 5 | Implement atomic mutations (lock/transaction + re-validate) | `security-and-idempotency.md` |
| 6 | Implement the server-side CRM client | `crm-data-model.md`, `google-sheets-apps-script.md` |
| 7 | Build the secure public API | `public-api-and-booking-website.md` |
| 8 | Build the booking website | `public-api-and-booking-website.md` |
| 9 | Build the admin dashboard | `admin-dashboard.md` |
| 10 | Optional channels (WhatsApp, AI) | `optional-whatsapp-and-ai.md` |
| 11 | Tests and CI | `testing-and-ci.md` |
| 12 | Deployment and live verification | `deployment-and-operations.md` |
| 13 | Documentation and handoff | `deployment-and-operations.md` |

## 8. Non-negotiable invariants

These hold regardless of stack, client, or storage choice — violating any of them is a
defect, not a stylistic choice:

1. **One engine, one source of truth.** No channel computes or caches its own
   availability; every channel re-reads the same CRM through the same client.
2. **Displayed availability is informational, not a guarantee.** Confirming a booking
   always re-validates atomically (lock or transaction) before writing.
3. **No double-booking, ever**, under concurrent requests from the same or different
   channels — proven by a test that races two confirmations for the identical slot.
4. **Idempotent mutations.** A client-supplied idempotency key makes a retried creation
   return the original result, never a duplicate. A network-level retry gets a *fresh*
   transport envelope (new nonce/timestamp/signature if signed requests are used) but the
   *same* idempotency key and business payload.
5. **The browser never sees CRM credentials**, signing secrets, or admin secrets.
6. **Historical snapshots don't drift.** A booking records the service/staff/price at the
   time it was made; editing the service later doesn't rewrite past bookings.
7. **Customer identity dedupes on a normalized key** (typically E.164 phone), and a
   partial update never erases previously-known fields.
8. **AI, if used, has no booking authority.** It interprets language and drafts replies；
   it never invents prices/services/availability and never creates/changes a booking
   without going through the same validated mutation path as every other channel.
9. **Distinguish verification levels honestly**: implemented, tested with mocks, tested
   locally, tested against a real external service, live for real traffic. Never claim a
   higher level than what was actually done — see §11.

## 9. Antipatterns — read `references/production-lessons.md` §"Antipatterns" for the full list

Most common ones to catch in review: frontend writing directly to the CRM storage;
secrets in public/browser-exposed config; hardcoded demo data presented as real; per-channel
availability logic; confirming a booking before the CRM mutation actually succeeds;
booking without a lock/transaction; trusting a previously-fetched slot as still valid;
reusing a signed request's nonce on retry; HMAC without an explicit UTF-8 charset on both
signing/verifying sides; normalizing a phone number in more than one place; assuming a
spreadsheet cell's stored type will be what's read back; wildcard CORS on mutation
endpoints; describing a mock integration as production-verified.

## 10. Which reference to read for which need

- Gathering client facts / new-client onboarding → `discovery-and-client-inputs.md`,
  `factory-mode-and-client-onboarding.md`
- Turning a natural-language business description into a config →
  `onboarding-context-parser.md`
- Locating/cloning the factory, the orchestrator's steps, resumable state, what "CRM
  prepared" means → `factory-bootstrap-and-capabilities.md`
- Storage/interface/deployment decisions → `architecture-and-decisions.md`
- Exact availability rules, slot math, tie-breaks → `booking-and-availability-rules.md`
- Schema design (any storage backend) → `crm-data-model.md`
- Spreadsheet-backed CRM specifics (coercion, locking, batch tests) →
  `google-sheets-apps-script.md`
- API contract, error envelope, website UX requirements →
  `public-api-and-booking-website.md`
- Admin dashboard scope and auth → `admin-dashboard.md`
- Signing, idempotency, CORS, rate limiting → `security-and-idempotency.md`
- What to test and how to run CI → `testing-and-ci.md`
- Deploy order, health checks, verification honesty → `deployment-and-operations.md`
- WhatsApp/AI as optional add-ons → `optional-whatsapp-and-ai.md`
- Real bugs this pattern has already caused and how they were fixed →
  `production-lessons.md`

## 11. Communicating verification status

Always distinguish, in every status report to the user:

- **Code inspected** — you read it, didn't necessarily run it.
- **Documented results** — a doc claims a result; you haven't reproduced it yourself.
- **Verified with mocks** — real code path, fake external dependency.
- **Verified locally** — real dev server / real local test run, still no live external
  service.
- **Verified against the real external service** — an actual deployed CRM backend, a real
  webhook provider, etc.
- **Pending verification** — explicitly say so; never imply a level you haven't reached.

Never state that an external platform (hosting dashboard, CRM backend console, messaging
provider console) was inspected unless you actually had access to it in that session.

## 12. Final checklist before calling a build "done"

- [ ] Client discovery data collected or explicitly marked pending — nothing invented.
- [ ] Architecture decisions recorded with reasons (storage, interfaces, deploy target).
- [ ] Availability rules written in prose and matched by tests (see §8 invariants).
- [ ] CRM schema documented and matches the actual read/write code.
- [ ] Public API has a stable error-code contract; website never guesses from message text.
- [ ] Idempotency and locking/transaction covered by a concurrency test.
- [ ] No secret reachable from browser-shipped code.
- [ ] CI runs lint/typecheck/tests/build for every subproject, on PRs, without deploying.
- [ ] A clean-checkout validation was actually run, not assumed.
- [ ] Deployment order followed; health checks passed; verification level stated honestly
      per §11 for every external integration.
- [ ] No previous client's identity, secrets, or demo data leaked into this project.
- [ ] Factory bootstrap succeeded (`bootstrap-factory.mjs` / `doctor.mjs`), and every
      blocking question was grouped into one message rather than asked piecemeal.

## 13. See also

`references/production-lessons.md` for the fullest detail on concrete bugs this
architecture has already hit (spreadsheet type coercion, date-serial handling, HMAC
charset mismatch, nonce-reuse-on-retry, read amplification, schema/code drift) — read it
before assuming a corner case is hypothetical.
