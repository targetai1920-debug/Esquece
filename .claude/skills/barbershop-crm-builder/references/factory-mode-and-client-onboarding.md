# Factory mode: onboarding a new client onto an existing template

This skill's deepest commercial value isn't teaching how to design this kind of system
once — it's making every *additional* client fast, because the architecture, engine, CRM
client, tests, and deployment pipeline are already proven. Read this file whenever the
request is "build this for another barbershop/salon" and a working template/reference
project already exists, rather than "design this system from scratch."

## Default process: reuse, don't redesign

```
Audit the existing template
  → Create a clean copy/branch for the new client
    → Fill in a client configuration
      → Apply identity/branding
        → Load real business data (services, staff, schedule)
          → Configure the CRM instance
            → Run the full test suite
              → Prepare for deployment
```

**Not** this process, unless there's a concrete, stated technical reason the template is
actually incompatible with the new client's needs:

```
Redesign the architecture
  → Build a new system from zero
  → Reimplement booking logic
  → Reimplement the CRM
```

If a genuine incompatibility exists (e.g. this client needs the relational-database path
from `architecture-and-decisions.md` while the template is spreadsheet-backed), say so
explicitly and treat it as a scoped architectural decision, not a reason to freelance a
different design for unrelated parts of the system.

## What must vary between clients vs. what must not

**Should vary per client**: configuration, brand identity/assets, content copy, services,
prices, staff, schedules, policies, credentials, domain.

**Should not be rewritten per client** (reuse as-is unless a real bug or a stated new
requirement demands a change): the availability engine, the double-booking prevention
mechanism, the CRM client interface and its implementation(s), the public API contract and
its validation, error handling, the base admin dashboard, the security model, the
concurrency test suite, and the deployment pipeline shape.

## Client configuration as data, not scattered code edits

Centralize everything that differs between clients into one place — a single validated
configuration file/schema, or a small number of clearly-separated config modules — rather
than hand-editing values across many files. A schema (whatever validation tool the
project's stack already uses) should reject a config that's missing a required field or
has an invalid value, rather than letting a typo silently ship as a wrong business hour or
a broken phone-format rule.

Illustrative shape (adapt to the actual project's config conventions):

```yaml
business:
  name:
  slug:
  country:
  city:
  timezone:
  locale:
  currency:
  address:
  phone:
  email:
  socialLinks:
  mapsUrl:

branding:
  logo:
  primaryColor:
  secondaryColor:
  backgroundColor:
  headingFont:
  bodyFont:
  styleDescription:

booking:
  minimumNoticeMinutes:
  maximumAdvanceDays:
  slotIntervalMinutes:
  allowAnyStaff:
  cancellationPolicy:

services:
  - name:
    description:
    price:
    durationMinutes:
    bufferMinutes:
    image:

staff:
  - name:
    biography:
    photo:
    services:
    workingHours:
```

Fill in every value that's safely derivable or already given; mark only the genuinely
missing, blocking fields as pending (see `discovery-and-client-inputs.md`) — don't turn
onboarding into a long interview when most answers are already available.

## Minimal-question onboarding

- Read everything already provided before asking anything.
- Never re-ask for a fact already stated.
- Batch the truly missing items into one focused round of questions.
- Use placeholders for anything non-blocking so work continues in parallel with the client
  supplying the rest.
- Only stop and ask when a field's absence would make the configuration genuinely
  non-functional (e.g. no timezone at all).

## Automating the new-client setup

Where the project's tooling supports it, provide a single entry point that takes a
client's config and produces a working project/deployment-ready artifact, e.g.:

```bash
npm run create-client -- --config ./clients/new-client.yaml
```

This command must never contain or require pasting a real secret into source — secrets
stay in the target deployment's own secret store, referenced by name only. What it *should*
do, to the extent the project's tooling allows:

- Instantiate a new project/branch/directory from the template.
- Apply the new client's naming/slug throughout generated identifiers.
- Copy in the new client's brand assets.
- Generate the client-specific configuration from the schema above.
- Seed the CRM with the client's real services/staff/schedule (or clearly-marked
  placeholders for anything still pending).
- Generate a fresh `.env.example`-equivalent listing every required variable name (never
  a real value).
- Verify all required configuration is present (or explicitly flagged pending) before
  declaring setup complete.
- Search for and flag any leftover trace of a *different* client's brand/name/data that
  might have been copied from the template by mistake.
- Run the full test suite and build.
- Produce a delivery report (see below).

## Redaction check before handing off a new client's project

Before considering a new client's project ready for review, actively search it for:

- Any other client's business name, brand assets, staff names, or real address.
- Any other client's real domain, deployment URL, or account identifiers.
- Any secret value (not just a variable name) committed anywhere.
- Demo data that was never replaced and isn't clearly marked as a placeholder.

## Delivery report for each new client

At the end of a new-client build, report:

- What's configured and working (website, CRM, services/staff/schedule loaded, admin
  dashboard, tests passing, build passing).
- What credentials/access are still needed from the client or the business owner, and
  exactly who needs to provide them.
- What demo/placeholder data is still present and needs replacing before real launch.
- Explicit confirmation that no other client's identity, data, or secrets are present in
  this project.
- A short checklist of what remains for a human to do (get credentials, review design,
  approve content, connect accounts that need human-authorized access) — the goal is that
  the remaining manual work is limited to things that genuinely require a human (obtaining
  business data and account access, visual/content approval, authorizing external
  integrations), not further engineering.

## What this mode does not change

Every invariant and antipattern in `SKILL.md` §8/§9 and `production-lessons.md` still
applies in full to every client built this way — factory mode is about *reuse speed*, not
a license to skip validation, security, or testing for a "fast" client build.
