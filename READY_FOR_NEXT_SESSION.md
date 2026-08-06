# Ready for the next session

The `barbershop-crm-builder` skill is installed (project-scoped in this repo, and
user-scoped on this machine at `~/.claude/skills/barbershop-crm-builder/`) and verified —
see the session report for the full evidence. You can close this conversation now.

## What to send in your next session

Anywhere, in any directory — you do not need to be inside this repository:

```
Crea el sistema completo para esta barbería usando barbershop-crm-builder:

[pegar aquí todo el contexto del negocio: nombre, país/ciudad, servicios con precios,
trabajadores con horarios, estilo visual, qué necesitás (web pública, panel admin,
CRM persistente, WhatsApp, etc.)]
```

It also works without naming the skill — a plain description of a barbershop that needs a
booking website and CRM is enough for it to be picked automatically.

The more of the business's real facts you include up front, the fewer questions come back.
Nothing you don't provide gets invented — missing pieces are asked about (grouped into one
message) or left as clearly-marked placeholders that don't block the build.

## How to tell it activated

The session will mention locating or cloning "the factory" and will start creating files
(`clients/<slug>.yaml`, then a full project under `generated/<slug>/`) rather than just
describing what it would do.

## External authorizations that may come up

- **Google** (only if you want the persistent CRM connected, not just prepared): creating
  the spreadsheet and deploying the Apps Script backend needs a human with a Google
  account — the session will hand you an exact, short guide
  (`APPS_SCRIPT_CONNECT_GUIDE.md`) rather than a generic explanation.
- **Credentials/domain**: admin password, hosting, and a real domain are always manual —
  listed per project in `CREDENTIALS_PENDING.md`.

Everything else (website, config, build, tests, CRM preparation, repository) proceeds
without asking you for anything.

## Resuming an interrupted run

Send the same message again (or re-run
`node .claude/skills/barbershop-crm-builder/scripts/create-barbershop.mjs --context <file>`
if you're working from the command line yourself) — progress is saved per client at
`.barbershop-builder/runs/<slug>/state.json` inside the factory checkout, so already-completed
steps are skipped and the run picks up where it stopped.
