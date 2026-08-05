# Security and idempotency

## Signed backend ↔ CRM requests

When the backend and the CRM implementation are separate runtimes communicating over the
network (common with a spreadsheet+script backend reachable only via HTTP), sign every
request instead of trusting network-level access control alone.

Envelope shape (adapt field names to the project, keep the concept):

```
version, action, requestId, timestamp, nonce, apiKey, payload, signature
```

Requirements:

- **HMAC-SHA256** over a canonical string built from the envelope's fields in a fixed
  order, joined by a fixed separator, with the payload serialized via a **stable**
  algorithm: object keys sorted recursively at every nesting level, array order preserved
  exactly, numbers required finite, `undefined`/functions rejected outright (never
  silently dropped — the signer and verifier must never be able to disagree about what was
  actually included).
- **Timestamp** with a bounded acceptance window (e.g. a few minutes) on both sides of
  now, rejecting anything older or from the future beyond that window.
- **Nonce**, checked against a persisted-or-cached set of already-seen values, rejecting a
  repeat — replay protection.
- **Constant-time comparison** for the signature and API key checks — a timing-sensitive
  comparison leaks information about how much of the value already matched.
- **Generic failure messages** — don't reveal *which* specific check failed to the caller
  (wrong key vs. wrong signature vs. expired vs. replayed) in the response, even though the
  server's own logs/error code can be specific for debugging.
- **Explicit UTF-8 charset on both signing and verifying sides.** This is not a
  theoretical concern — a real production bug matched this pattern exactly: one side's
  HMAC implementation (Node's crypto library) correctly encodes a JavaScript string as
  UTF-8 bytes before hashing; the other side's implementation, on a *different* runtime
  (Google Apps Script), used an HMAC function overload with **no explicit charset**,
  which does not reliably produce UTF-8 bytes for non-ASCII input. Every action that only
  ever carried ASCII payloads (health checks, listing services, checking availability)
  worked fine — bytes were identical either way for ASCII. The one action that carried
  free-text user input (a customer's name or note, containing an accented character) failed
  signature verification in production, because the two sides computed the HMAC over
  different byte sequences for the identical string. **Always pass the charset explicitly**
  wherever the platform's crypto API supports it, on **every** runtime involved, not just
  the one that happens to default correctly. Cover this with shared test vectors —
  identical canonical strings and expected signatures — run on *both* runtimes/
  implementations, including at minimum: plain ASCII, accented Latin characters, other
  non-Latin letters if relevant to the business's locale, emoji, embedded newlines, nested
  objects, arrays, `null`, and booleans. A same-runtime self-signed-then-self-verified test
  will **not** catch this class of bug — it only surfaces when two independent
  implementations must agree, which is exactly the real cross-runtime call.

## Retries vs. logical operations — never reuse a signed envelope

Distinguish the *logical* operation (e.g. "create this appointment") from each *physical*
network attempt to perform it. Every physical retry must build a **fresh** envelope: new
nonce, new timestamp, new signature. The business payload and the idempotency key
(next section) stay identical across retries — reusing the same signed envelope on a
retry will be rejected by nonce-replay protection, by design; that's correct behavior, not
a bug to work around by disabling replay protection. Only retry operations that are
actually idempotent end-to-end (the receiving side must guarantee a repeat with the same
idempotency key returns the original result, not a duplicate or an error).

## Idempotency keys

- Required on every mutating public endpoint that creates something (bookings, at
  minimum).
- Client generates a fresh key per logical attempt, reuses it across physical retries of
  that same attempt, generates a new one for a genuinely new attempt.
- Server persists enough to detect a repeat: given the same key and the same request
  content, return the original result (`idempotent: true`-style flag in the response, not
  a duplicate write). Given the same key with *different* content, return a distinct
  conflict error — never silently apply the new content to the old record, and never
  silently create a second record.

## CORS, origin checks, rate limiting

See `public-api-and-booking-website.md` for the specifics. Principle: CORS headers are a
browser-side convention; the server must independently validate `Origin` on mutations, and
must never use a wildcard origin for anything that writes data.

## Never expose

- CRM/backend signing secrets, API keys, or the CRM's private URL, in any browser-shipped
  code or public API response.
- Raw management tokens after their one-time issuance — persist only a hash, verify by
  hashing the presented token and comparing (constant-time) against the stored hash.
- Admin credentials or hashes in logs, error responses, or committed files.
- Internal error detail (stack traces, internal ids, raw exception messages) in a public
  API error response — log the detail server-side with a request id the client also
  receives, so a report can be correlated without leaking internals.

## Payload and request limits

Enforce a reasonable request-body size limit even where no upload is expected — never
assume "our JSON bodies are always small" is a security boundary by itself.
