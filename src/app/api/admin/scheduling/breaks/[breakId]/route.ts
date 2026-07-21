import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const DELETE = adminApiRoute({ enforceOrigin: true }, async (_request, context) => {
  const { breakId } = await context.params;
  await getCrmClient().adminDeleteBreak(breakId);
  return { ok: true };
});
