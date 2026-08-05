import { loadClientConfig } from "@/config/loadConfig";
import { BookingFlow } from "./BookingFlow";

// Server component reads the validated config once and passes only the
// fields the client flow needs — no CRM secrets exist to leak here since
// this template's default CRM is in-process (see src/lib/crm/localClient.ts).
export default function ReservarPage() {
  const config = loadClientConfig();
  return (
    <main className="container">
      <h1>{config.content.bookingTitle}</h1>
      <BookingFlow
        flowOrder={config.booking.flowOrder}
        currencyCode={config.business.currency}
        confirmationMessage={config.content.confirmationMessage}
        customerFields={config.booking.customerFields}
      />
    </main>
  );
}
