/**
 * Dedicated TRUCK RENTAL screen — one of the three rental entry points split
 * out of the old single-form index (ISSUE-117). Truck mode lists trucks the
 * Bangladeshi way (ft × ton × open/covered, use-case tabs) and keeps cargo
 * fields prominent. Renders the shared request form with the category locked
 * to truck_rental. POSTs /api/rental/requests — backend unchanged.
 */
import { RentalRequestForm } from "./_components/RentalRequestForm";

export default function TruckRentalScreen() {
  return <RentalRequestForm category="truck_rental" />;
}
