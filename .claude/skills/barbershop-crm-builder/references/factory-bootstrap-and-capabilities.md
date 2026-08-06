# Factory bootstrap, the orchestrator, and the capabilities manifest

This file explains the machinery a new session uses to go from "here's a barbershop in
prose" to a validated, tested, built project — without ever being told where the factory
repository lives, what branch it's on, or what commands to run.

## The three files that make this self-sufficient

- **`../factory.yaml`** — the factory's real coordinates: repository URL, branch,
  minimum commit, current version, and the default local path a clone lands at. Nothing in
  this skill hardcodes these values anywhere else — everything reads them from here.
- **`../capabilities.yaml`** — what the factory can actually deliver right now
  (`supported` / `experimental` / `not-implemented`), mirroring
  `templates/barbershop-booking/src/config/schema.ts`'s `FEATURE_STATUS`. Consult this
  before telling a human a feature is ready — a `features.whatsapp: true` toggle existing
  in the config schema does not mean WhatsApp works.
- **`scripts/bootstrap-factory.mjs`** — turns "where's the factory?" into an absolute,
  verified, dependency-installed path, every time, regardless of where the session started.

## `bootstrap-factory.mjs`: three cases, one script

```bash
node scripts/bootstrap-factory.mjs [--workdir <dir>] [--json]
```

1. **Case A — already exists locally.** The current working directory (or an ancestor) is
   already a checkout of the factory (its `origin` remote matches `factory.yaml`), or the
   well-known default path already has one. Used as-is; if clean, fast-forwarded from
   `origin/<branch>`; if it has local changes, left completely untouched.
2. **Case B — doesn't exist.** Cloned fresh into the default local path.
3. **Case C — a stale copy exists.** If it's missing the required minimum commit *and* has
   local changes, the script does not touch it — it clones a separate, clean, up-to-date
   copy instead (`<defaultLocalPath>-clean-<timestamp>`) and uses that. Local work is never
   discarded, force-pushed over, or silently rebased.

In every case the script verifies `factory.yaml`'s `requiredPaths` actually exist, installs
dependencies if `node_modules` is missing, and prints the resolved absolute path (plus a
JSON result with `--json`). It never deploys anything, never touches a secret, and never
modifies a checkout with uncommitted changes without saying so.

## Why every downstream script re-executes itself from the factory's own copy

`scripts/create-barbershop.mjs` (the orchestrator) and `scripts/build-client-config.mjs`
need real `node_modules` (the `yaml` package, the template's own validator) to run. A
user-scope copy of this skill (`~/.claude/skills/barbershop-crm-builder/`) has no
`node_modules` of its own — it's just files. So `create-barbershop.mjs`'s first move,
after bootstrapping, is to check whether it's currently running from
`<factoryRoot>/.claude/skills/barbershop-crm-builder/scripts/create-barbershop.mjs`; if not,
it re-executes that exact file with the same arguments and exits with its result. This
means the single command below works identically whether you copy-pasted it from the
user-scope skill or the project-scope one:

```bash
node <any-copy-of-this-skill>/scripts/create-barbershop.mjs --context <intermediate.json>
```

## The orchestrator's steps and its resumable state

`create-barbershop.mjs` runs, in order: bootstrap → `build-client-config.mjs` (fails with
exit code `2` and a grouped list of blocking questions if the onboarding context has real
gaps — see `onboarding-context-parser.md`) → `create-client` → `npm install` in the
generated project → `lint` → `typecheck` → `test` → `build` → `scan-contamination` →
`prepare-crm` → a final summary.

Every step's outcome is recorded in `<factoryRoot>/.barbershop-builder/runs/<slug>/state.json`
(never gitignored-but-committed — it's local run state, not a repo artifact; see the
factory's own `.gitignore`). Re-running the exact same command after a failure — a lint
error, a flaky install, an interrupted session — skips every step already marked `"done"`
and resumes from the failure. No secret is ever written to this file.

## What "prepared" means for the CRM — and what it never means

`prepare-crm` (the orchestrator's last automated step) generates `seed.json`, a
`run-import-seed.mjs` script, and `APPS_SCRIPT_CONNECT_GUIDE.md` under
`crm-init/<slug>/` inside the factory checkout. It does **not** create a Google Sheet,
deploy an Apps Script project, or set a Script Property — that requires a human with an
authenticated Google session, which this environment does not have and cannot obtain on
its own. Never describe a client's CRM as "connected" past this point — only "prepared,
pending a human completing `APPS_SCRIPT_CONNECT_GUIDE.md`." Run
`scripts/doctor.mjs` to get an honest, timestamped read on exactly what external
authorization is still outstanding, in this environment, right now.
