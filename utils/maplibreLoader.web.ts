/**
 * Web platform stub for @maplibre/maplibre-react-native.
 *
 * Metro resolves `.web.ts` for web builds, so this file replaces
 * `maplibreLoader.ts` during `expo export --platform web`. The native
 * package is never imported — avoiding the MLRNModule Object.create(undefined)
 * error that propagates through guardedLoadModule.
 *
 * Map.tsx already handles `null` MapLibreGL (renders a coordinate-display
 * fallback instead of the native map view).
 */

export type MapLibreModule = typeof import("@maplibre/maplibre-react-native");

/** Native map components are unavailable on web. */
const MapLibreGL: null = null;

export default MapLibreGL;
