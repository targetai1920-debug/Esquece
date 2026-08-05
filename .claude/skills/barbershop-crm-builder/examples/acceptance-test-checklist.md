# Example: multi-channel concurrency and AI-boundary acceptance

## Request

"We want a booking website, an admin panel, and a WhatsApp channel, all for the same
barbershop, and we're worried about double-booking across channels."

## Expected approach

1. **One engine.** Confirm (and if necessary, refactor toward) all three channels calling
   the exact same `CrmClient`-shaped interface — no channel gets its own availability
   logic or its own write path (`SKILL.md` §1/§8, `references/architecture-and-decisions.md`).
2. **Deduplication for the chat channel** — atomic webhook-event dedup under the same
   lock/transaction mechanism used for bookings, not a separate check-then-insert
   (`references/optional-whatsapp-and-ai.md`).
3. **Locking/transaction for every mutation**, regardless of which channel triggered it
   (`references/booking-and-availability-rules.md`, `references/security-and-idempotency.md`).
4. **Cross-channel tests** (`references/testing-and-ci.md`) that actually race two
   channels against the identical slot and assert exactly one booking survives.
5. **Human handoff** for the chat channel, with automated replies fully suspended while
   active, reactivated only manually.
6. **AI boundary** (`references/optional-whatsapp-and-ai.md`) — the AI layer never has
   booking authority: it interprets and drafts replies only; every actual booking mutation
   goes through the same validated path as the website and admin panel.

## What a correct result looks like

- A test proves: booking made via the website → immediately unavailable via WhatsApp →
  immediately unavailable via admin, and every permutation of "made via X, checked via Y."
- A test races website vs. WhatsApp for the identical slot; exactly one booking is
  created; the loser gets a graceful recovery (`SLOT_UNAVAILABLE` on the website,
  "someone just booked that, here are other times" on WhatsApp) — not a crash, not a
  silent double-booking.
- A test proves the AI provider cannot cause a booking to be created without the same
  validated mutation call every other channel uses — e.g. by asserting the AI-facing code
  path only ever calls the same `createAppointment`-equivalent function, never writes
  directly.
- An admin-created block is honored identically by the website and WhatsApp — same test,
  same assertion, both channels.

## Common failure to avoid

Building three separately-plausible-looking booking flows that each independently "seem"
correct in isolation, without a test that actually races them against each other — this is
exactly the kind of bug that only shows up under real concurrent traffic, which unit tests
of each channel alone will never catch.
