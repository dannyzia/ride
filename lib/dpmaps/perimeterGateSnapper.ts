/**
 * lib/dpmaps/perimeterGateSnapper.ts — dpMaps perimeter gate snapper.
 *
 * For mega-destinations (e.g. Jamuna Future Park, Bashundhara R/A, Dhaka Airport),
 * snapping a pin to the legal entrance/perimeter gate prevents drivers from
 * navigating to expressways, ramps, or the wrong side of boundary walls.
 */

export type VehicleType = 'car' | 'bike' | 'cng';
export type GatePointType = 'perimeter_gate' | 'entrance' | 'curb_stop';

export const GATE_POINT_TYPES: GatePointType[] = ['perimeter_gate', 'entrance', 'curb_stop'];
export const VENUE_DETECTION_RADIUS_M = 150;
export const WALK_SPEED_M_PER_S = 1.2;

export interface VenueHit {
  id: string;
  name: string;
  distanceM: number;
}

export interface GateRow {
  id: string;
  canonical_name: string;
  point_type: GatePointType;
  lng: number;
  lat: number;
  vehicles?: VehicleType[];
}

export interface PedestrianConnector {
  type: 'LineString';
  coordinates: [number, number][];
  walk_distance_m: number;
  walk_time_s: number;
}

export interface GateSnapResult {
  snapped: boolean;
  gate?: GateRow;
  connector?: PedestrianConnector;
  reason: 'snapped' | 'no_venue' | 'no_gate' | 'no_vehicle_gate';
}

export interface GateSnapperDeps {
  findVenueWithin: (lat: number, lng: number, radiusM: number) => Promise<VenueHit | null> | VenueHit | null;
  listChildGates: (venueId: string) => Promise<GateRow[]> | GateRow[];
  distanceM: (aLat: number, aLng: number, bLat: number, bLng: number) => number;
}

function gateAllows(gate: GateRow, vehicle: VehicleType): boolean {
  if (!gate.vehicles || gate.vehicles.length === 0) return true;
  return gate.vehicles.includes(vehicle);
}

export async function snapToGate(
  deps: GateSnapperDeps,
  pinLat: number,
  pinLng: number,
  vehicle: VehicleType,
): Promise<GateSnapResult> {
  const venue = await deps.findVenueWithin(pinLat, pinLng, VENUE_DETECTION_RADIUS_M);
  if (!venue) return { snapped: false, reason: 'no_venue' };

  const gates = await deps.listChildGates(venue.id);
  const legal = gates.filter((g) => GATE_POINT_TYPES.includes(g.point_type) && gateAllows(g, vehicle));
  if (legal.length === 0) {
    return { snapped: false, reason: gates.length === 0 ? 'no_gate' : 'no_vehicle_gate' };
  }

  // Cars prefer primary perimeter gates; bikes/CNG take the nearest legal gate
  const pool =
    vehicle === 'car' && legal.some((g) => g.point_type === 'perimeter_gate')
      ? legal.filter((g) => g.point_type === 'perimeter_gate')
      : legal;

  let best = pool[0];
  let bestD = deps.distanceM(pinLat, pinLng, best.lat, best.lng);
  for (const g of pool.slice(1)) {
    const d = deps.distanceM(pinLat, pinLng, g.lat, g.lng);
    if (d < bestD) {
      best = g;
      bestD = d;
    }
  }

  const walkTimeS = bestD / WALK_SPEED_M_PER_S;
  return {
    snapped: true,
    gate: best,
    connector: {
      type: 'LineString',
      coordinates: [
        [pinLng, pinLat],
        [best.lng, best.lat],
      ],
      walk_distance_m: Math.round(bestD * 10) / 10,
      walk_time_s: Math.round(walkTimeS),
    },
    reason: 'snapped',
  };
}

