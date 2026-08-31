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

let MapLibreGL: MapLibreModule | null = null;

try {
  const raw: unknown = require("@maplibre/maplibre-react-native");
  MapLibreGL = resolveModule(raw);
  if (MapLibreGL) {
    // Silence the single known cosmetic noise: in-flight tile/glyph/sprite
    // requests canceled when the map view unmounts or the camera moves
    // (library already demotes this exact message from "warning" → "info"
    // internally — see its effectiveLevel). Everything else, including all
    // other [info] lines, all warnings, and all errors, keeps its default
    // console output. The callback contract: return true to swallow.
    MapLibreGL.Logger.setLogCallback((log: { message: string; level: string; tag?: string }) => {
      if (log.tag === "Mbgl-HttpRequest" && log.message.startsWith("Request failed due to a permanent error: Canceled")) {
        return true;
      }
      return false;
    });
  }
} catch {
  MapLibreGL = null;
}

export default MapLibreGL;
