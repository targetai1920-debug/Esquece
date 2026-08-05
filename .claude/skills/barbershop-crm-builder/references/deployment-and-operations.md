# Deployment and operations

## Order of operations

1. Deploy/configure the CRM backend first — everything else depends on having real
   connection details (URL, API key, signing secret) for it.
2. Deploy this project's backend application, initially with any optional channel
   (messaging, AI) left in mock/off mode if their credentials aren't ready yet. The public
   API and admin dashboard are independently useful at this point.
3. Connect a real messaging channel (e.g. WhatsApp), if in scope, once its credentials are
   ready — this typically needs step 2's live URL for a webhook callback.
4. Connect a real AI provider, if in scope, once its credentials are ready.
5. Hand the deployed backend's base URL and the public API contract to whoever owns the
   public website (which may be a separate project/repo/team).
6. Configure any recurring job (e.g. reminder notifications).

Steps 3 and 4 can happen in either order or be deferred entirely — the system should be
fully functional (bookable via the API and admin dashboard) with both left as mocks. Never
represent mocked functionality as live to the client until it has actually been verified
end-to-end against the real external service.

## Pre-deploy checklist (adapt names to the project's actual config)

- [ ] CRM provider set to the real backend, not a mock/demo provider, and any
      "allow unsafe mocks in production" escape hatch is off.
- [ ] Admin credentials are freshly generated real values, not anything used during
      development.
- [ ] Any cron/internal secret is a freshly generated random value.
- [ ] The public website's real origin is configured for CORS — not a wildcard, not
      `localhost`.
- [ ] Production mode is set correctly for the runtime.
- [ ] Demo-mode/demo-data flags are off once real business data has been loaded — see
      `discovery-and-client-inputs.md`.
- [ ] The CRM's real settings (hours, timezone, currency, policies) reflect the actual
      business, not placeholder defaults.
- [ ] Health-check endpoints report healthy against the real deployment (a general
      liveness check, and a CRM-connectivity check, at minimum).
- [ ] Admin login works with the real credentials, and no plaintext password was ever
      typed into a document, commit, or chat message.
- [ ] If a messaging channel is going live: fully configured, including any required
      approved message templates.
- [ ] If an AI provider is going live: fully configured, and a real conversation was
      manually tested end to end.
- [ ] Any recurring job (reminders, etc.) is actually scheduled, not just implemented.

## Rollback

Persistent business data typically lives independently of the backend application's
deployment (especially with a spreadsheet-backed CRM) — rolling back the application
deployment is usually safe on its own. Rolling back a *CRM-side* code change (e.g. a
scripting-platform backend) is a separate action from rolling back the application, and
doesn't affect already-stored data, only the code that reads/writes it going forward.
Document both rollback paths explicitly for the project's actual stack — don't assume one
covers the other.

## Verification honesty — state exactly what was actually checked

Never collapse these into one claim:

- **Implemented** — code exists, compiles/typechecks.
- **Verified with mocks** — the real code path ran, against a fake external dependency.
- **Verified locally** — a real local process (dev server, local test run) exercised it,
  still no live external service involved.
- **Verified against the real external service** — an actual live CRM backend, messaging
  provider, or AI provider was actually called and responded successfully.
- **Live for real traffic** — the above, in the actual production deployment, actually
  serving real customers.

A feature is only "live"/"production" once every external integration it depends on has
reached the last level for that specific integration. Saying "the booking flow is live"
while the CRM connection has only ever been verified with a mock is a false claim, even if
every line of code is correct — say "implemented and verified with mocks against a real
CRM connection" until that connection has actually been exercised for real.

## Health checks

Expose at least two distinct checks: a general liveness check (the application process is
up) and a CRM-connectivity check (the application can actually reach and authenticate
against the real CRM backend right now). Treat these as separate signals — a green
liveness check with a failing CRM check means the application is up but non-functional for
booking, which is a materially different incident than the process being down.

## Known-scale limitations to document, not hide

- An in-memory rate limiter is only correct for a single backend instance — call this out
  explicitly if the deployment could ever scale horizontally.
- A spreadsheet-backed CRM has execution-time and quota ceilings, and a project-wide
  serialized-write lock as its concurrency mechanism — fine at small scale, a real
  constraint at large scale (see `architecture-and-decisions.md`'s decision tree and
  `google-sheets-apps-script.md`).
- No load testing performed is a different claim from "no double-booking under concurrent
  requests" — the latter is a correctness property that should be proven by tests
  regardless of scale; the former is a throughput/latency claim that requires actual load
  testing to make honestly.
