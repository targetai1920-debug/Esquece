import type { NotificationStatus } from "@/lib/crm/types";
import { getCrmClient } from "@/lib/crm/factory";
import { adminApiRoute } from "@/lib/auth/adminRoute";

const NOTIFICATION_STATUSES: NotificationStatus[] = ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"];

export const GET = adminApiRoute({}, async (request) => {
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam && NOTIFICATION_STATUSES.includes(statusParam as NotificationStatus) ? (statusParam as NotificationStatus) : undefined;
  return getCrmClient().adminListNotifications(status);
});
