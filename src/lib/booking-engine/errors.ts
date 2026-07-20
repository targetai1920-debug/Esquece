/**
 * Thrown by every booking-engine stub in Phase 1. Callers must not treat a
 * caught NotImplementedError as "booking failed" (a validation_error / slot
 * unavailable result) — it means the operation genuinely doesn't exist yet.
 */
export class NotImplementedError extends Error {
  constructor(fn: string) {
    super(
      `${fn} is not implemented yet (Phase 2 — see PROJECT_PLAN.md). ` +
        "This is a typed stub, not a functional booking operation.",
    );
    this.name = "NotImplementedError";
  }
}
