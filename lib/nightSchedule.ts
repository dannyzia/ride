/**
 * Fare Framework v6 — Night multiplier schedule (v6.md §1, §11).
 *
 * Config-driven JSON schedule + night_mult_value.
 * Ships disabled (night_mult_value = 1.000); admin enables with survey-backed value.
 *
 * night_mult applies to ALL time_rate terms (PATCH 2):
 *   - trip_minutes term
 *   - base initiation term (initiation_minutes × time_rate × night_mult)
 *   - waiting term (waiting_rate × billable_wait × night_mult)
 * NEVER: km_rate, zone_fee, pickup fee distance component.
 */

/**
 * Night schedule JSON structure in platform_config:
 * [
 *   { "start_hour": 20, "end_hour": 6, "value": 1.200 },
 *   { "start_hour": 22, "end_hour": 4, "value": 1.500 }
 * ]
 *
 * Values are additive (last matching range wins).
 * Empty array = no night surcharge at any hour.
 */
export interface NightScheduleEntry {
  start_hour: number; // 0-23
  end_hour: number; // 0-23 (wraps past midnight)
  value: number; // multiplier, e.g. 1.200
}

/**
 * Parse the night_schedule JSON string from platform_config.
 * Returns empty array on parse failure (safe default = no night surcharge).
 */
export function parseNightSchedule(json: string): NightScheduleEntry[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: NightScheduleEntry) =>
        typeof e.start_hour === 'number' &&
        typeof e.end_hour === 'number' &&
        typeof e.value === 'number',
    );
  } catch {
    return [];
  }
}

/**
 * Get the night multiplier for a given hour (0-23) in Asia/Dhaka timezone.
 *
 * Range matching: start_hour ≤ hour < end_hour (with midnight wrap).
 * If multiple ranges match, the last one wins.
 * If no range matches, returns 1.000 (disabled).
 */
export function getNightMultiplier(
  schedule: NightScheduleEntry[],
  hour: number,
): number {
  let mult = 1.0;
  for (const entry of schedule) {
    const { start_hour, end_hour, value } = entry;
    if (start_hour <= end_hour) {
      // Same-day range: e.g. 20 → 6 means 20,21,22,23,0,1,2,3,4,5
      // But if start ≤ end, it's a simple range
      if (hour >= start_hour && hour < end_hour) {
        mult = value;
      }
    } else {
      // Wraps past midnight: e.g. 20 → 6
      if (hour >= start_hour || hour < end_hour) {
        mult = value;
      }
    }
  }
  return mult;
}

/**
 * Get the night multiplier for a Date in Asia/Dhaka timezone.
 * Returns 1.000 if schedule is empty or night_mult_value is 1.0.
 */
export function getNightMultiplierForDate(
  nightMultValue: number,
  schedule: NightScheduleEntry[],
  date: Date,
): number {
  // Ship disabled: if night_mult_value = 1.0, skip schedule lookup
  if (nightMultValue <= 1.0) return 1.0;

  // Convert to Asia/Dhaka (UTC+6)
  const bdtHour = (date.getUTCHours() + 6) % 24;
  return getNightMultiplier(schedule, bdtHour) * nightMultValue;
}
