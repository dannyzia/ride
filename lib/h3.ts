import { latLngToCell, gridDisk, cellToBoundary } from 'h3-js';

const RESOLUTION = 9;

export function getH3Cell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, RESOLUTION);
}

export function getH3Ring(lat: number, lng: number, k: number): string[] {
  return gridDisk(latLngToCell(lat, lng, RESOLUTION), k);
}

