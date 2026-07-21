# ANTHROPIC_SETUP.md

Exact steps to connect the WhatsApp conversational agent to real Claude requests. No real values
are included here — fill them in yourself, and never commit them. Until this is done,
`AI_PROVIDER=mock` keeps the entire booking/cancel/reschedule conversation flow fully
demonstrable (see `src/lib/ai/mockProvider.ts`) with zero external API calls or cost.

## 1. Create an Anthropic account and API key

At [console.anthropic.com](https://console.anthropic.com), create (or use an existing)
organization, add a payment method, and generate an API key under **API Keys**. Treat it exactly
like a password — anyone with it can make billed requests as this account.

## 2. Configure Next.js

Set in the Next.js deployment's environment (Render, or local `.env`):

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=<the key from step 1>
ANTHROPIC_MODEL=claude-sonnet-5
```

`ANTHROPIC_MODEL` defaults to `claude-sonnet-5` if unset (`src/lib/env/server.ts`) — only set it
explicitly if a different model is actually wanted. Never prefix either variable with
`NEXT_PUBLIC_` — that would bundle the key into the browser.

## 3. What "real" means here

`src/lib/ai/anthropicProvider.ts` calls `@anthropic-ai/sdk`'s `messages.create` with a forced
tool-use (`tool_choice: {type: "tool", name: "interpret_message"}`), so Claude's response is
always a structured, Zod-validated object — never free-form text this codebase then has to guess
at. The system prompt is rebuilt on every turn with the *actual* current CRM data (real service
names, real barber names, today's real date) and explicit instructions never to invent a service,
barber, price, or availability, and never to confirm/cancel/reschedule an appointment itself (see
the "Claude may not" list in the master spec, and `ARCHITECTURE.md` §7). This provider only ever
*interprets* — `src/lib/conversation/orchestrator.ts` is the only code that mutates CRM state.

## 4. Verify it end to end

With `AI_PROVIDER=anthropic` configured and deployed, send a real message through WhatsApp (once
`META_SETUP.md` is also complete) or, for a cheaper/faster check, temporarily point
`/dev/whatsapp-simulator` at the same deployment (it always uses whichever `AI_PROVIDER` is
currently configured server-side — the simulator itself is what's dev-only, not the AI provider
selection). Confirm free-text messages like "quiero un corte para mañana a las 3" resolve to a
sensible interpretation without inventing any service/barber/price not present in the CRM.

## 5. Cost and rate-limit awareness

Every non-deterministic inbound message (i.e. one that doesn't match a button id, numeric menu
choice, or the small fixed keyword set in `lib/conversation/deterministicIntent.ts`) costs one
Anthropic API call. There is currently no per-conversation or global request cap beyond Anthropic's
own account-level rate limits — if usage grows significantly, consider adding an explicit
application-level cap (tracked in `LIMITATIONS.md`).

## Troubleshooting

- **Every message gets a generic "no entendí" reply**: check `ANTHROPIC_API_KEY` is set and the
  key is active (not revoked) in the Anthropic console; check application logs for an
  `AI_INVALID_RESPONSE` error (the tool-use response failed schema validation) or an HTTP error
  from the SDK.
- **`getAnthropicConfig() called but AI_PROVIDER is not 'anthropic'`**: `AI_PROVIDER` is still
  `mock` (or unset, which defaults to `mock`) — set it explicitly to `anthropic`.
