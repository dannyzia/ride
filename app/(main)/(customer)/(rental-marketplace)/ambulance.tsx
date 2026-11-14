/**
 * Dedicated SCHEDULED AMBULANCE RENTAL screen — one of the three rental entry
 * points split out of the old single-form index (ISSUE-117). This is the
 * scheduled/biddable ambulance rental (urgency='alarm', service_level,
 * patient fields) — distinct from the emergency ambulance booking flow.
 * Renders the shared request form with the category locked to
 * ambulance_scheduled. POSTs /api/rental/requests — backend unchanged.
 */
import { RentalRequestForm } from "./_components/RentalRequestForm";

export default function AmbulanceRentalScreen() {
  return <RentalRequestForm category="ambulance_scheduled" />;
}
