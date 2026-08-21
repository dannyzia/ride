import { latLngToCell, gridDisk, cellToBoundary } from 'h3-js';

const RESOLUTION = 9;

export function getH3Cell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, RESOLUTION);
}

export function getH3Ring(lat: number, lng: number, k: number): string[] {
  return gridDisk(latLngToCell(lat, lng, RESOLUTION), k);
}

/**
 * Returns the hexagonal boundary for an H3 cell at the given lat/lng.
 * Coordinates are returned as [lng, lat] pairs (GeoJSON order) suitable
 * for direct use in MapLibre ShapeSource polygons.
 */
export function getH3Boundary(lat: number, lng: number): [number, number][] {
  const cell = latLngToCell(lat, lng, RESOLUTION);
  const boundary = cellToBoundary(cell);
  // h3-js returns [lat, lng]; GeoJSON needs [lng, lat].
  return boundary.map(([bLat, bLng]) => [bLng, bLat] as [number, number]);
}

