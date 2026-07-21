# RENDER_SETUP.md

Exact steps to deploy this Next.js application to Render. No real values are included here — fill
them in yourself, and never commit them.

## 1. Prerequisites

Complete `APPS_SCRIPT_SETUP.md` first (a working Apps Script `/exec` URL is required for
`CRM_PROVIDER=appscript`). `META_SETUP.md` and `ANTHROPIC_SETUP.md` can be completed before or
after this — the application runs correctly with `WHATSAPP_PROVIDER=mock`/`AI_PROVIDER=mock` in
the meantime (just without live WhatsApp/Claude traffic).

## 2. Create the Web Service

In the Render dashboard: **New → Web Service**, connect this repository, and configure:

| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start` |
| Health Check Path | `/api/health` |
| Instance Type | Any — this app is not compute-heavy; pick based on expected traffic |

Render sets `PORT` automatically; Next.js's `next start` already respects it — no extra
configuration needed.

## 3. Set environment variables

In the service's **Environment** tab, set every variable from `.env.example`. At minimum, for a
real production deployment:

```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://<this-service>.onrender.com   (or a custom domain, once attached)
PUBLIC_WEBSITE_ORIGIN=https://<the-separate-public-website's-real-domain>
BUSINESS_TIMEZONE=America/La_Paz
LOG_LEVEL=info
DEMO_MODE=false

CRM_PROVIDER=appscript
CRM_APPS_SCRIPT_URL=<from APPS_SCRIPT_SETUP.md>
CRM_API_KEY=<from APPS_SCRIPT_SETUP.md>
CRM_SIGNING_SECRET=<from APPS_SCRIPT_SETUP.md>

AUTH_SECRET=<a fresh long random string — openssl rand -hex 32>
ADMIN_EMAIL=<the real admin login email>
ADMIN_PASSWORD_HASH=<npm run hash-password -- "..." — see .env.example's escaping note>

CRON_SECRET=<a fresh long random string>
```

Add `WHATSAPP_*`/`META_*` (see `META_SETUP.md`) and `AI_PROVIDER`/`ANTHROPIC_*` (see
`ANTHROPIC_SETUP.md`) once those are ready. Never set `ALLOW_UNSAFE_MOCKS_IN_PRODUCTION=true` on
a real deployment serving real customers — it exists only to unblock local experimentation and is
checked explicitly by `lib/crm/factory.ts`/`lib/ai/factory.ts`/`lib/whatsapp/factory.ts`.

**`ADMIN_PASSWORD_HASH` contains literal `$` characters** (a bcrypt hash). Render's environment
variable editor stores the value verbatim — it does not perform the `$VARIABLE`-expansion Next.js's
own local `.env` file loader does, so no escaping is needed here (unlike a local `.env.local` file
— see the note next to `ADMIN_PASSWORD_HASH` in `.env.example`).

## 4. Deploy

Trigger the first deploy (push to the connected branch, or **Manual Deploy** in the dashboard).
Watch the build logs — `npm run build` runs the exact same production build verified locally
throughout this project's development (`IMPLEMENTATION_STATUS.md` records every phase's `npm run
build` result).

## 5. Verify the live deployment

```bash
curl https://<this-service>.onrender.com/api/health
curl https://<this-service>.onrender.com/api/health/crm
```

Both should report a healthy status. `/api/health/crm` specifically confirms the deployed Apps
Script `/exec` URL is reachable, authenticated, and schema-version-compatible — this is the first
point at which the CRM connection can be honestly described as verified against the real Google
Apps Script deployment from this environment, not just against `MockCrmClient`.

Then log into `/admin/login` with the real `ADMIN_EMAIL`/password, and confirm the dashboard shows
real (or freshly-seeded, then removed) data from the actual Google Sheet.

## 6. Point the separate website and Meta at this deployment

- Give the separate website team this deployment's base URL and `WEBSITE_INTEGRATION.md` — they
  configure their own environment to call `https://<this-service>.onrender.com/api/public/*`.
- If not already done in `META_SETUP.md`, set the Meta webhook callback URL to
  `https://<this-service>.onrender.com/api/whatsapp/webhook`.

## 7. Configure the notification cron job

Render's own **Cron Jobs** feature (a separate resource type from the Web Service) can hit
`/api/cron/notifications` on a schedule:

```bash
curl -X POST https://<this-service>.onrender.com/api/cron/notifications \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Every 5–15 minutes is reasonable — the endpoint is cheap when nothing is due
(`{"processed": 0}`), and every notification is claimed atomically so overlapping runs never
double-send (`lib/notifications/processor.ts`).

## Redeploying after a code change

Render redeploys automatically on a push to the connected branch (unless auto-deploy is disabled
in the service settings), or via **Manual Deploy**. No special migration step exists — there is no
application database; all persistent state lives in the Google Sheet via Apps Script.

## A note on scale

The in-memory rate limiter (`lib/http/rateLimit.ts`) and the Apps Script `LockService`-based
concurrency guarantee are both documented as single-instance-safe, not multi-instance-safe (see
`SECURITY.md`). Running more than one Render instance of this Web Service would need a shared
rate-limit store; the actual booking-correctness guarantee (no double-booking) does **not**
depend on Next.js instance count at all — it's enforced entirely inside Apps Script's own
`LockService`, which is correct regardless of how many Next.js instances call it concurrently.
