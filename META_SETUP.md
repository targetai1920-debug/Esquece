# META_SETUP.md

Exact steps to connect this application to a real Meta WhatsApp Cloud API app. No real values are
included here — fill them in yourself, and never commit them. Until these steps are done,
`WHATSAPP_PROVIDER=mock` keeps everything (webhook tests, the conversation orchestrator, the
`/dev/whatsapp-simulator`) fully demonstrable with zero Meta traffic.

## 1. Create a Meta developer app

At [developers.facebook.com](https://developers.facebook.com), create an app, add the
**WhatsApp** product, and (for production use, not just testing) go through Meta's business
verification for the associated Business Manager account.

## 2. Get a test or production phone number

Meta provides a free test number during development (limited to a handful of verified recipient
numbers). For production, add and verify Esquece's real WhatsApp Business number in the same app.
Note the **Phone Number ID** and the **WhatsApp Business Account ID** — both shown in the app's
WhatsApp → API Setup page.

## 3. Generate an access token

- **Development**: the temporary token shown on the API Setup page (expires in 24 hours — fine
  for manual testing, not for a real deployment).
- **Production**: create a System User in Business Manager, generate a permanent token for it
  scoped to `whatsapp_business_messaging` and `whatsapp_business_management`, and assign it to
  the WhatsApp app.

## 4. Configure the webhook

In the Meta app's WhatsApp → Configuration page, set:

- **Callback URL**: `https://<your-render-domain>/api/whatsapp/webhook`
- **Verify token**: any long random string you choose — this must exactly match
  `META_VERIFY_TOKEN` in the Next.js deployment's environment (see step 6). Meta calls this the
  webhook verify token; it has nothing to do with the access token from step 3.

Click **Verify and save**. This triggers the `GET` handshake this app already implements
(`src/app/api/whatsapp/webhook/route.ts`) — it must succeed before Meta will deliver any events.

Subscribe the webhook to at least the `messages` field (Manage → Webhook fields).

## 5. Get the App Secret

App dashboard → Settings → Basic → **App Secret** (click "Show"). This is `META_APP_SECRET` —
used to verify `X-Hub-Signature-256` on every inbound webhook call
(`src/lib/whatsapp/signature.ts`). Never expose this value client-side; it must only ever live in
the Next.js server's environment.

## 6. Configure Next.js

Set in the Next.js deployment's environment (Render, or local `.env`):

```
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=<from step 3>
WHATSAPP_PHONE_NUMBER_ID=<from step 2>
WHATSAPP_BUSINESS_ACCOUNT_ID=<from step 2>
META_APP_SECRET=<from step 5>
META_VERIFY_TOKEN=<the string you chose in step 4>
META_GRAPH_API_VERSION=v21.0
```

Redeploy so the new environment variables take effect, then repeat step 4's "Verify and save" —
it will now hit the real deployment with `WHATSAPP_PROVIDER=meta` already configured.

## 7. Approve WhatsApp message templates

Any notification sent **outside** the 24-hour customer-service window (reminders sent well in
advance, cancellations/reschedules when the customer hasn't messaged recently — see
`WHATSAPP_AGENT_DESIGN.md` §9) must use a pre-approved template, never free-form text. In Meta's
WhatsApp Manager → Message Templates, create and submit templates for:

- A reminder template (maps to `WHATSAPP_REMINDER_TEMPLATE_NAME`)
- A cancellation template (`WHATSAPP_CANCELLATION_TEMPLATE_NAME`)
- A reschedule template (`WHATSAPP_RESCHEDULE_TEMPLATE_NAME`)

Approval can take anywhere from minutes to a few days. Until a template is approved and its name
configured, `lib/notifications/processor.ts` fails that notification safely with a
`TEMPLATE_REQUIRED` error (never sends free-form in violation of the window, never sends nothing
silently) — this is expected, correct behavior until this step is done, not a bug.

## 8. Send a real test message

With everything above configured and deployed, message the business number from a verified test
recipient (development) or any real number (production). Confirm in the Next.js logs (or the
admin dashboard's Conversations view) that the inbound message was recorded and the agent
responded. This is the first point at which this system's WhatsApp behavior can be honestly
described as tested against live Meta traffic, not just mocks.

## Troubleshooting

- **Webhook verification fails**: double-check `META_VERIFY_TOKEN` matches exactly (no trailing
  whitespace) between Meta's dashboard and the Next.js environment, and that the deployment is
  already running with that environment variable before clicking "Verify and save".
- **401 on every real inbound message**: `META_APP_SECRET` mismatch, or the callback URL is
  pointed at a different deployment/environment than the one holding the current secret.
- **Reminders/cancellations never send**: check `WHATSAPP_*_TEMPLATE_NAME` are set and the
  corresponding templates are `APPROVED` (not `PENDING`/`REJECTED`) in WhatsApp Manager.
