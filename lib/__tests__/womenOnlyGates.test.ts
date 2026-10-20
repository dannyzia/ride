/**
 * S8b-10 (plan §4.3/§4.5) — the two shared women-only pure functions.
 *
 * checkWomenOnlyRideGates (lib/womenOnlyRideGates.ts): the SINGLE gate both
 * POST /api/ride/request and POST /api/ride/schedule call — its gate ORDER and
 * exact error codes are the client contract (finding-driver's no-fallback
 * sheet keys off them). Pinning order matters: a reorder changes which 4xx a
 * multi-gate violation reports.
 *
 * isDriverEligibleForRideGender (lib/womenOnlyEligibility.ts): the dispatch
 * pool predicate — also used by nearby-drivers. The fail-open invariant on a
 * corrupted non-bike women_only row (R11-C1) is load-bearing: a bad DB row
 * must not silently shrink car/CNG pools to zero.
 */
import { checkWomenOnlyRideGates } from '@/lib/womenOnlyRideGates';
import {
  isDriverEligibleForRideGender,
  isDriverSafeForRideAccept,
} from '@/lib/womenOnlyEligibility';
import type { WomenOnlyGateInput } from '@/lib/womenOnlyRideGates';

/** Verified female bike rider with the feature on — the fully-passing row. */
const PASSING: WomenOnlyGateInput = {
  userGender: 'female',
  vehicleType: 'bike_standard',
  womenOnly: true,
  secondaryRiderName: null,
  secondaryRiderPhone: null,
  secondaryRiderFemale: false,
  womenOnlyEnabled: true,
  scooterEnabled: false,
};

describe('checkWomenOnlyRideGates — gate ORDER and codes (§4.3 contract)', () => {
  it('passes a verified female bike women-only request', () => {
    expect(checkWomenOnlyRideGates(PASSING)).toEqual({ ok: true });
  });

  it('passes a plain (non-women-only) ride regardless of gender/flags', () => {
    expect(
      checkWomenOnlyRideGates({
        ...PASSING,
        womenOnly: false,
        userGender: 'male',
        womenOnlyEnabled: false,
      }),
    ).toEqual({ ok: true });
  });

  it('gate 1: scooter without its kill switch → 400 scooter_disabled (fires BEFORE the women-only arm)', () => {
    const r = checkWomenOnlyRideGates({
      ...PASSING,
      vehicleType: 'scooter',
      scooterEnabled: false,
    });
    expect(r).toMatchObject({ ok: false, error: 'scooter_disabled', status: 400 });
  });

  it('scooter with its kill switch ON passes a plain ride', () => {
    expect(
      checkWomenOnlyRideGates({ ...PASSING, womenOnly: false, vehicleType: 'scooter', scooterEnabled: true }),
    ).toEqual({ ok: true });
  });

  it('gate 2a: kill switch off → 403 women_only_disabled (BEFORE the bike/gender checks)', () => {
    const r = checkWomenOnlyRideGates({ ...PASSING, womenOnlyEnabled: false, vehicleType: 'cng', userGender: 'male' });
    expect(r).toMatchObject({ ok: false, error: 'women_only_disabled', status: 403 });
  });

  it('gate 2b: non-bike vehicle → 400 women_only_bike_only (BEFORE the gender check)', () => {
    const r = checkWomenOnlyRideGates({ ...PASSING, vehicleType: 'car_economy', userGender: 'male' });
    expect(r).toMatchObject({ ok: false, error: 'women_only_bike_only', status: 400 });
  });

  it('gate 2c: non-female rider → 403 women_only_not_eligible', () => {
    const r = checkWomenOnlyRideGates({ ...PASSING, userGender: 'male' });
    expect(r).toMatchObject({ ok: false, error: 'women_only_not_eligible', status: 403 });
  });

  it('gate 2c also fires for an UNDECLARED gender (null/undefined is not female)', () => {
    for (const userGender of [null, undefined]) {
      expect(checkWomenOnlyRideGates({ ...PASSING, userGender })).toMatchObject({
        ok: false,
        error: 'women_only_not_eligible',
      });
    }
  });

  it('gate 2d: secondary rider without female attestation → 400 secondary_rider_attestation_required', () => {
    for (const over of [
      { secondaryRiderName: 'Abbu' },
      { secondaryRiderPhone: '01711111111' },
      { secondaryRiderName: 'Abbu', secondaryRiderPhone: '01711111111' },
    ]) {
      expect(checkWomenOnlyRideGates({ ...PASSING, ...over })).toMatchObject({
        ok: false,
        error: 'secondary_rider_attestation_required',
        status: 400,
      });
    }
  });

  it('gate 2d satisfied: secondary rider WITH female attestation passes', () => {
    expect(
      checkWomenOnlyRideGates({
        ...PASSING,
        secondaryRiderName: 'Apa',
        secondaryRiderFemale: true,
      }),
    ).toEqual({ ok: true });
  });

  it('attestation is only required when a secondary rider is actually set', () => {
    expect(
      checkWomenOnlyRideGates({ ...PASSING, secondaryRiderFemale: false }),
    ).toEqual({ ok: true });
  });
});

describe('isDriverEligibleForRideGender — dispatch/nearby pool predicate (§4.5)', () => {
  const base = {
    driverGender: 'female',
    driverGenderVerified: true,
    driverWomenOnlyEnabled: false,
    rideWomenOnly: false,
    vehicleType: 'bike_standard' as const,
    womenOnlyFeatureEnabled: true,
  };

  it('women-only ride: admits ONLY verified female drivers', () => {
    expect(isDriverEligibleForRideGender({ ...base, rideWomenOnly: true })).toBe(true);
    expect(
      isDriverEligibleForRideGender({ ...base, rideWomenOnly: true, driverGender: 'male' }),
    ).toBe(false);
    expect(
      isDriverEligibleForRideGender({
        ...base,
        rideWomenOnly: true,
        driverGenderVerified: false,
      }),
    ).toBe(false);
  });

  it('R11-C1 fail-open: a women_only flag on a NON-bike row must not shrink the car/CNG pool', () => {
    expect(
      isDriverEligibleForRideGender({ ...base, rideWomenOnly: true, vehicleType: 'car_economy' }),
    ).toBe(true);
    expect(
      isDriverEligibleForRideGender({ ...base, rideWomenOnly: true, vehicleType: 'cng' }),
    ).toBe(true);
  });

  it('in-flight safety: an armed driver stays female-only for women-only rides even with the kill switch OFF', () => {
    expect(
      isDriverEligibleForRideGender({
        ...base,
        rideWomenOnly: true,
        womenOnlyFeatureEnabled: false,
      }),
    ).toBe(true); // she is still eligible — the ride is women-only and she IS female+verified
  });

  it('plain bike ride: an armed toggle self-excludes her ONLY while the kill switch is ON', () => {
    expect(
      isDriverEligibleForRideGender({ ...base, driverWomenOnlyEnabled: true, womenOnlyFeatureEnabled: true }),
    ).toBe(false);
    expect(
      isDriverEligibleForRideGender({ ...base, driverWomenOnlyEnabled: true, womenOnlyFeatureEnabled: false }),
    ).toBe(true);
  });

  it('plain ride, no toggle: admitted on every tier', () => {
    for (const vehicleType of ['bike_basic', 'scooter', 'car_economy', 'cng'] as const) {
      expect(isDriverEligibleForRideGender({ ...base, vehicleType })).toBe(true);
    }
  });

  it('male driver on plain bike rides is never filtered (the predicate is not a general gender filter)', () => {
    expect(
      isDriverEligibleForRideGender({ ...base, driverGender: 'male' }),
    ).toBe(true);
  });
});

describe('isDriverSafeForRideAccept — match-time safety re-check', () => {
  it('women-only rides re-check ONLY the hard invariant: verified female', () => {
    expect(
      isDriverSafeForRideAccept({ driverGender: 'female', driverGenderVerified: true, rideWomenOnly: true }),
    ).toBe(true);
    expect(
      isDriverSafeForRideAccept({ driverGender: 'male', driverGenderVerified: true, rideWomenOnly: true }),
    ).toBe(false);
    expect(
      isDriverSafeForRideAccept({ driverGender: 'female', driverGenderVerified: false, rideWomenOnly: true }),
    ).toBe(false);
  });

  it('plain rides accept anyone (no toggle re-check — no lead-billing loss at accept)', () => {
    expect(
      isDriverSafeForRideAccept({ driverGender: 'male', driverGenderVerified: false, rideWomenOnly: false }),
    ).toBe(true);
  });
});
