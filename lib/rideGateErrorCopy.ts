/**
 * S8 §4.9: rider-side booking-gate error codes → i18n copy keys.
 *
 * Consumed wherever POST /api/ride/request or /api/ride/schedule failures are
 * surfaced (home booking sheet, schedule-ride submit). Only codes whose copy
 * exists in BOTH locales belong here — every other code falls back to the
 * server's honest English message at the call site (Copy Truth Rule: a key we
 * ship must be the string we actually show).
 *
 * The map is exported (not inlined per screen) so the i18n orphan auditor
 * resolves it through its imported-table evidence tier: the t(gateCopy) sites
 * follow the identifier chain to this initializer and shield both values.
 */
export const RIDE_GATE_ERROR_COPY: Record<string, string> = {
  scooter_disabled: 'error_scooter_disabled',
  secondary_rider_attestation_required: 'error_secondary_rider_attestation_required',
};
