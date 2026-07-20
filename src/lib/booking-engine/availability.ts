import { availabilityQuerySchema, validateSlotInputSchema } from "./schemas";
import { NotImplementedError } from "./errors";
import type { AvailabilityQuery, AvailabilityResult, SlotValidation, ValidateSlotInput } from "./types";

/**
 * Read-only: computes candidate open slots for a service (and a specific
 * barber, or "any available"). See BOOKING_RULES.md #1-2 for the exact
 * nine-point rule this must implement (working schedule, breaks, time off,
 * blocks, existing appointments, lead time, advance-booking window, etc.).
 *
 * STUB — not implemented. Always throws. Website, WhatsApp handler, and
 * admin dashboard must all call this same function once implemented; none
 * of them may compute availability independently.
 */
export async function getAvailableSlots(
  query: AvailabilityQuery,
): Promise<AvailabilityResult> {
  availabilityQuerySchema.parse(query);
  throw new NotImplementedError("getAvailableSlots");
}

/**
 * Read-only re-check of a single slot, used as the first step inside
 * createAppointment's transaction (BOOKING_RULES.md #3). Exposed separately
 * so it can also back a lightweight "is this still free?" UI check.
 *
 * STUB — not implemented. Always throws.
 */
export async function validateSlot(
  input: ValidateSlotInput,
): Promise<SlotValidation> {
  validateSlotInputSchema.parse(input);
  throw new NotImplementedError("validateSlot");
}
