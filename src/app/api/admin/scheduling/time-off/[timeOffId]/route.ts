import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const DELETE = adminApiRoute({ enforceOrigin: true }, async (_request, context) => {
  const { timeOffId } = await context.params;
  await getCrmClient().adminDeleteTimeOff(timeOffId);
  return { ok: true };
});
