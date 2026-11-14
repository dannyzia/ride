/**
 * Dedicated CAR RENTAL screen — one of the three rental entry points split
 * out of the old single-form index (ISSUE-117: "three separate car rental,
 * truck rental and ambulance rental … each its own screen"). Renders the
 * shared request form with the category locked to car_rental.
 * POSTs /api/rental/requests — backend unchanged.
 */
import { RentalRequestForm } from "./_components/RentalRequestForm";

export default function CarRentalScreen() {
  return <RentalRequestForm category="car_rental" />;
}
