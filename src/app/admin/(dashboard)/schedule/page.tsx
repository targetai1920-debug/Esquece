import { getCrmClient } from "@/lib/crm/factory";
import { ScheduleClient } from "./ScheduleClient";

export default async function AdminSchedulePage() {
  const crm = getCrmClient();
  const [barbers, workingHours, breaks, timeOff, blockedSlots] = await Promise.all([
    crm.adminListBarbers(),
    crm.adminListWorkingHours(),
    crm.adminListBreaks(),
    crm.adminListTimeOff(),
    crm.adminListBlockedSlots(),
  ]);
  return (
    <ScheduleClient
      barbers={barbers}
      initialWorkingHours={workingHours}
      initialBreaks={breaks}
      initialTimeOff={timeOff}
      initialBlockedSlots={blockedSlots}
    />
  );
}
