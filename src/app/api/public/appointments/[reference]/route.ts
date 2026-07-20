import { getCrmClient } from "@/lib/crm/factory";
import { CrmError } from "@/lib/crm/errors";
import { publicApiRoute, publicApiPreflight } from "@/lib/http/publicRoute";
import { RATE_LIMITS } from "@/lib/http/rateLimit";

/**
 * Requires ?token=<managementToken> — a reference alone (which the
 * customer's own reference is, effectively public/guessable-ish) must
 * never be enough to view booking details (master spec §6 "Do not expose
 * booking details based only on a guessable reference").
 */
export const GET = publicApiRoute(
  { rateLimit: RATE_LIMITS.mutation, rateLimitKey: "public:appointments:get" },
  async (request, context) => {
    const { reference } = await context.params;
    const managementToken = request.nextUrl.searchParams.get("token");
    if (!managementToken) {
      throw new CrmError("UNAUTHORIZED", "Falta el token de gestión de la reserva.", false);
    }
    return getCrmClient().getAppointmentByReference(reference, managementToken);
  },
);

export const OPTIONS = publicApiPreflight();
