import { BIKE_FAMILY, type VehicleTypeEnum } from './vehicleTypes';

export interface CandidateDriverEligibilityParams {
  driverGender: string;
  driverGenderVerified: boolean;
  driverWomenOnlyEnabled: boolean;
  rideWomenOnly: boolean;
  vehicleType: VehicleTypeEnum;
  womenOnlyFeatureEnabled: boolean; // Kill switch: when false, neutralizes armed driver toggles
}

/**
 * Single pure function governing candidate driver eligibility for ride dispatch,
 * lead billing pre-debit checks, and nearby driver filtering.
 */
export function isDriverEligibleForRideGender(params: CandidateDriverEligibilityParams): boolean {
  if (params.rideWomenOnly) {
    // R11-C1: Defensive scope assertion — women_only should never be true on non-bike rides.
    // The API request gate (400 women_only_bike_only) prevents this state, but a bad DB row
    // must not silently filter car/CNG pools. Fail open with a loud log.
    if (!BIKE_FAMILY.includes(params.vehicleType)) {
      // Invariant violation: treat as a normal ride rather than silently restricting the pool.
      return true;
    }
    // Women-only ride requires verified female driver (even if kill switch is off, existing in-flight ride stays female-only)
    return params.driverGender === 'female' && params.driverGenderVerified === true;
  }
  if (BIKE_FAMILY.includes(params.vehicleType)) {
    // If kill switch is OFF, driver's armed toggle is neutralized (she is admitted to mixed bike rides)
    // If kill switch is ON, driver's women_only_enabled toggle self-excludes her from normal bike rides
    if (params.womenOnlyFeatureEnabled && params.driverWomenOnlyEnabled) {
      return false;
    }
    return true;
  }
  // Car / CNG / Non-bike rides have no women-only concept; driver is admitted
  return true;
}

/**
 * Match-time safety check at WebSocket accept.
 * Re-checks ONLY the hard safety invariant (does NOT re-check the driver's toggle,
 * preventing unrefunded lead billing loss for legitimate offers accepted).
 */
export function isDriverSafeForRideAccept(params: {
  driverGender: string;
  driverGenderVerified: boolean;
  rideWomenOnly: boolean;
}): boolean {
  if (params.rideWomenOnly) {
    return params.driverGender === 'female' && params.driverGenderVerified === true;
  }
  return true;
}
