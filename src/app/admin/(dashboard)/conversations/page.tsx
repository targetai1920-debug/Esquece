import { getCrmClient } from "@/lib/crm/factory";
import { ConversationsClient } from "./ConversationsClient";

export default async function AdminConversationsPage() {
  const crm = getCrmClient();
  const [conversations, handoffs] = await Promise.all([crm.adminListConversations(), crm.listOpenHumanHandoffs()]);
  return <ConversationsClient initialConversations={conversations} initialHandoffs={handoffs} />;
}
