import { setConfig } from "barikoiapis";
import Constants from "expo-constants";
import { Platform } from "react-native";

// ── Barikoi client initialiser (client-side) ───────────────

const BARIKOI_API_KEY =
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_BARIKOI_API_KEY as string) ?? "";

export function createBarikoiClient(): void {
  if (!BARIKOI_API_KEY) {
    console.warn("[mapUtils] BARIKOI_API_KEY not configured");
    return;
  }
  setConfig({ apiKey: BARIKOI_API_KEY, version: "v1" });
}

// ── Map style presets ───────────────────────────────────────

export const BARIKOI_DARK_STYLE =
  "https://tiles.barikoi.com/styles/barikoi-dark/style.json";
export const BARIKOI_LIGHT_STYLE =
  "https://tiles.barikoi.com/styles/barikoi-light/style.json";

export interface MapStylePreset {
  dark: string;
  light: string;
}

export const MAP_STYLE_PRESETS: MapStylePreset = {
  dark: BARIKOI_DARK_STYLE,
  light: BARIKOI_LIGHT_STYLE,
};

// ── Dhaka defaults ─────────────────────────────────────────

export const DEFAULT_COORDINATES = {
  latitude: 23.8103,
  longitude: 90.4125,
};

export const CAMERA_CONFIG = {
  centerCoordinate: [
    DEFAULT_COORDINATES.longitude,
    DEFAULT_COORDINATES.latitude,
  ] as [number, number],
  zoomLevel: 12,
};

// ── Hook for theme-aware map style ─────────────────────────

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

let _mapLibreCache:
  | {
      MapView: any;
      PointAnnotation: any;
      Camera: any;
    }
  | null
  | undefined = undefined;

export function loadMapLibre(): {
  MapView: any;
  PointAnnotation: any;
  Camera: any;
} | null {
  if (_mapLibreCache !== undefined) return _mapLibreCache;
  if (Platform.OS === "web") {
    _mapLibreCache = null;
    return null;
  }
  try {
    const ML = require("@maplibre/maplibre-react-native");
    _mapLibreCache = {
      MapView: ML.MapView || ML.default,
      PointAnnotation: ML.PointAnnotation,
      Camera: ML.Camera,
    };
    return _mapLibreCache;
  } catch {
    _mapLibreCache = null;
    return null;
  }
}

export const MapLibreMapView = loadMapLibre()?.MapView;
export const MapLibrePointAnnotation = loadMapLibre()?.PointAnnotation;
export const MapLibreCamera = loadMapLibre()?.Camera;
