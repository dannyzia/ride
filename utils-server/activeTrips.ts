/**
 * Active Trip Cache — in-memory registry of rides with an assigned driver
 * (Plan 28 Stage 3, ISSUE-87).
 *
 * Populated at startup (hydration of matched / driver_arriving /
 * driver_arrived / in_progress rides) and at match commit; updated on
 * arrive/start transitions; cleared on completion / cancellation. The
 * location:update WS handler gates telematics ingestion on this map, and
 * the live-coords endpoint reads through it to the breadcrumb buffer.
 *
 * TD-15 acceptable: INSTANCE_COUNT=1, so a single in-process map is the
 * source of truth. On crash the map vanishes; startup hydration rebuilds
 * it from the rides table.
 *
 * ZERO circular imports: this module imports nothing from index.ts.
 */

export interface ActiveTripInfo {
  driverId: string;
  status: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

const activeTrips = new Map<string, ActiveTripInfo>();

/** Register (or re-register) a ride's active trip. Overwrites on re-entry. */
export function registerActiveTrip(rideId: string, trip: ActiveTripInfo): void {
  activeTrips.set(rideId, trip);
}

/** Update a registered trip's status. No-op when the ride is not tracked. */
export function updateActiveTripStatus(rideId: string, status: string): void {
  const trip = activeTrips.get(rideId);
  if (trip) {
    trip.status = status;
  }
}

/** Read a registered trip, or undefined when the ride is not tracked. */
export function getActiveTrip(rideId: string): ActiveTripInfo | undefined {
  return activeTrips.get(rideId);
}

/** Stop tracking a ride. No-op when the ride is not tracked. */
export function unregisterActiveTrip(rideId: string): void {
  activeTrips.delete(rideId);
}

/** Test helper — wipe the registry. */
export function clearActiveTrips(): void {
  activeTrips.clear();
}

/** Test helper — ids currently tracked. */
export function getActiveTripIds(): string[] {
  return [...activeTrips.keys()];
}
