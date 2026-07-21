import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

export const DELETE = adminApiRoute({ enforceOrigin: true }, async (_request, context) => {
  const { blockedSlotId } = await context.params;
  await getCrmClient().adminDeleteBlockedSlot(blockedSlotId);
  return { ok: true };
});
