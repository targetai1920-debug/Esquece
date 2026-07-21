import { getCrmClient } from "@/lib/crm/factory";
import { NotificationsClient } from "./NotificationsClient";

export default async function AdminNotificationsPage() {
  const notifications = await getCrmClient().adminListNotifications();
  return <NotificationsClient initialNotifications={notifications} />;
}
