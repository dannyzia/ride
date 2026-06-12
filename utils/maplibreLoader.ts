/**
 * Single source of truth for @maplibre/maplibre-react-native imports.
 * Module-level cache prevents duplicate native view registration ("Tried to register
 * two views with the same name MLRNCamera").
 *
 * All app code should import MapLibre from this file, never directly from
 * @maplibre/maplibre-react-native.
 */

// This require() runs once at module load time and is cached by Node.js/RN module system.
// Any subsequent import from this file reuses the same module instance.
const MapLibreGL = require('@maplibre/maplibre-react-native');

export default MapLibreGL;
