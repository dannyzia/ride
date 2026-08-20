/**
 * Single source of truth for @maplibre/maplibre-react-native imports.
 * Module-level cache prevents duplicate native view registration ("Tried to register
 * two views with the same name MLRNCamera").
 *
 * All app code should import MapLibre from this file, never directly from
 * @maplibre/maplibre-react-native.
 */

/** The library's real module shape, derived from its TypeScript types. */
export type MapLibreModule = typeof import("@maplibre/maplibre-react-native");

// This require() runs once at module load time and is cached by Node.js/RN
// module system. Any subsequent import from this file reuses the same module
// instance. `unknown` keeps the CJS/ESM interop honest — resolveModule narrows.
const raw: unknown = require("@maplibre/maplibre-react-native");

function hasMapView(m: unknown): m is MapLibreModule {
  return !!m && typeof m === "object" && "MapView" in m;
}

/** CJS/ESM interop: prefer the namespace object, fall back to `.default`. */
function resolveModule(m: unknown): MapLibreModule | null {
  if (hasMapView(m)) return m;
  if (m && typeof m === "object" && "default" in m) {
    const def = (m as { default: unknown }).default;
    if (hasMapView(def)) return def;
  }
  return null;
}

const MapLibreGL = resolveModule(raw);
export default MapLibreGL;
