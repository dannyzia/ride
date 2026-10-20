/**
 * womenOnlyRideGates.ts — S8 §4.3 shared request/schedule gates.
 *
 * Single source for the scooter + women-only eligibility gates applied by
 * POST /api/ride/request and POST /api/ride/schedule (zero logic drift —
 * both routes call checkWomenOnlyRideGates with their parsed body).
 *
 * Gate order (contract §4.3):
 *   1. scooter without its kill switch → 400 scooter_disabled
 *   2. women_only requested:
 *      a. kill switch off → 403 women_only_disabled
 *      b. non-bike vehicle → 400 women_only_bike_only
 *      c. non-female rider → 403 women_only_not_eligible
 *      d. secondary rider set without female attestation
 *         → 400 secondary_rider_attestation_required
 */
import { BIKE_FAMILY, type VehicleTypeEnum } from './vehicleTypes';

export interface WomenOnlyGateInput {
  userGender: string | null | undefined;
  vehicleType: VehicleTypeEnum | string;
  womenOnly: boolean;
  secondaryRiderName?: string | null;
  secondaryRiderPhone?: string | null;
  secondaryRiderFemale: boolean;
  womenOnlyEnabled: boolean;
  scooterEnabled: boolean;
}

export interface WomenOnlyGateRejection {
  ok: false;
  error: string;
  message: string;
  status: number;
}

export function checkWomenOnlyRideGates(
  input: WomenOnlyGateInput,
): { ok: true } | WomenOnlyGateRejection {
  if (input.vehicleType === 'scooter' && !input.scooterEnabled) {
    return {
      ok: false,
      error: 'scooter_disabled',
      message: 'Scooter rides are currently unavailable.',
      status: 400,
    };
  }

  if (!input.womenOnly) return { ok: true };

  if (!input.womenOnlyEnabled) {
    return {
      ok: false,
      error: 'women_only_disabled',
      message: 'Women-only rides are currently unavailable.',
      status: 403,
    };
  }

  if (!BIKE_FAMILY.includes(input.vehicleType as VehicleTypeEnum)) {
    return {
      ok: false,
      error: 'women_only_bike_only',
      message: 'Women-only rides are only available for bike rides.',
      status: 400,
    };
  }

  if (input.userGender !== 'female') {
    return {
      ok: false,
      error: 'women_only_not_eligible',
      message: 'Women-only rides are only available to female users.',
      status: 403,
    };
  }

  if (
    (input.secondaryRiderName || input.secondaryRiderPhone) &&
    !input.secondaryRiderFemale
  ) {
    return {
      ok: false,
      error: 'secondary_rider_attestation_required',
      message: 'Please confirm that the passenger is female.',
      status: 400,
    };
  }

  return { ok: true };
}
