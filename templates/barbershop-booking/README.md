# barbershop-booking (template)

Generic, client-agnostic booking website + CRM template for barbershops and similar
staff-based appointment businesses. Built from the lessons in
[`.claude/skills/barbershop-crm-builder/`](../../.claude/skills/barbershop-crm-builder/README.md)
— read that skill before modifying this template's core logic (config schema, booking
engine, signing).

**Do not edit this template to build one specific client's site.** Use the generator
(`factory/create-client.mjs` at the repo root) to produce a new, independent project from
a client configuration — see the repo root `docs/OPERATOR_GUIDE.md`.

## What's here

- `src/config/` — typed client-configuration schema and two-tier (error/warning)
  validation.
- `src/lib/crm/` — the `CrmClient` interface, an in-process `LocalCrmClient` seeded from
  the client config, and request-signing utilities for a future networked CRM backend.
- `src/lib/booking/` — the storage-agnostic availability engine and an in-process lock
  emulating a script-level lock.
- `src/lib/branding/` — visual presets (`minimal`/`luxury`/`urban`/`classic`) and CSS
  custom-property generation.
- `src/app/` — the public booking website (landing + `/reservar`, flow order driven by
  `client-config.json`) and a minimal, read-only-scope admin dashboard.
- `client-config.json` — a demo configuration shipped so the bare template
  lints/typechecks/tests/builds standalone. **Overwritten by the generator** for a real
  client.

## Commands

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Optional modules

`client-config.json`'s `features` block toggles WhatsApp, an AI assistant, reminders,
Google Calendar sync, email notifications, promotions, and FAQs. Every one of these is off
by default in the demo config and in a freshly generated client unless explicitly enabled
— the build, the public booking flow, and the admin dashboard all work with every optional
module disabled. See
`.claude/skills/barbershop-crm-builder/references/optional-whatsapp-and-ai.md` for what's
required if a module is turned on.

## What's intentionally reduced scope in this template

- The admin dashboard is read-only (services/staff/appointments) — an explicit MVP scope
  reduction, not an oversight, consistent with
  `.claude/skills/barbershop-crm-builder/references/admin-dashboard.md`.
- The default CRM (`LocalCrmClient`) is in-process/in-memory, seeded from
  `client-config.json` at startup — appropriate for a demo/preview and for small-scale
  real use where the process itself stays up; a real production deployment on ephemeral
  infrastructure should back it with persistent storage (a networked spreadsheet+script
  backend, or a database) implementing the same `CrmClient` interface. `src/lib/crm/signing.ts`
  is included and tested for exactly that future step.
