import { setConfig } from "barikoiapis";
import { Platform } from "react-native";
import { logger } from "@/lib/logger";
import type { MapLibreModule } from "./maplibreLoader";

// ── Barikoi client initialiser (client-side) ───────────────

const BARIKOI_API_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";

export function createBarikoiClient(): void {
  if (!BARIKOI_API_KEY) {
    logger.warn("[mapUtils] BARIKOI_API_KEY not configured");
    return;
  }
  setConfig({ apiKey: BARIKOI_API_KEY, version: "v1" });
}

// ── Map style presets ───────────────────────────────────────

export const BARIKOI_DARK_STYLE =
  `https://map.barikoi.com/styles/barikoi-dark/style.json?key=${BARIKOI_API_KEY}`;
export const BARIKOI_LIGHT_STYLE =
  `https://map.barikoi.com/styles/osm-liberty/style.json?key=${BARIKOI_API_KEY}`;

export interface MapStylePreset {
  dark: string;
  light: string;
}

export const MAP_STYLE_PRESETS: MapStylePreset = {
  dark: BARIKOI_DARK_STYLE,
  light: BARIKOI_LIGHT_STYLE,
};

// No default coordinates — GPS must be resolved before rendering maps.
// If GPS is unavailable, show a loading state or error, never fake coordinates.

export function useBarikoiMapStyle(dark = false): string {
  return dark ? MAP_STYLE_PRESETS.dark : MAP_STYLE_PRESETS.light;
}

// ── Validation ─────────────────────────────────────────────

export function validateCoordinates(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// ── Haversine distance (km) — client-side fallback ─────────

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return (
    Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000) / 1000
  );
}

// ── Platform-conditional MapLibre dynamic import ────────────
// SINGLE SOURCE OF TRUTH: All MapLibre imports go through this module.
// Module-level cache prevents duplicate native view registration.

type MapLibreSubset = Pick<MapLibreModule, "MapView" | "PointAnnotation" | "Camera">;

let _mapLibreCache: MapLibreSubset | null | undefined = undefined;

export function loadMapLibre(): MapLibreSubset | null {
  if (_mapLibreCache !== undefined) return _mapLibreCache;
  if (Platform.OS === "web") {
    _mapLibreCache = null;
    return null;
  }
  try {
    const ML: unknown = require("@maplibre/maplibre-react-native");
    if (ML && typeof ML === "object" && "MapView" in ML) {
      const m = ML as MapLibreModule;
      _mapLibreCache = {
        MapView: m.MapView,
        PointAnnotation: m.PointAnnotation,
        Camera: m.Camera,
      };
    } else if (
      ML &&
      typeof ML === "object" &&
      "default" in ML &&
      (ML as { default: unknown }).default &&
      typeof (ML as { default: unknown }).default === "object" &&
      "MapView" in (ML as { default: Record<string, unknown> }).default
    ) {
      const m = (ML as { default: MapLibreModule }).default;
      _mapLibreCache = {
        MapView: m.MapView,
        PointAnnotation: m.PointAnnotation,
        Camera: m.Camera,
      };
    } else {
      _mapLibreCache = null;
    }
    return _mapLibreCache;
  } catch {
    _mapLibreCache = null;
    return null;
  }
}

export const MapLibreMapView = loadMapLibre()?.MapView;
export const MapLibrePointAnnotation = loadMapLibre()?.PointAnnotation;
export const MapLibreCamera = loadMapLibre()?.Camera;
