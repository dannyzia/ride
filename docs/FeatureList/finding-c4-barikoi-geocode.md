**Purpose:**     C4 investigation verdict — what "Backend Partial" means for FEATURES.md §1 #9 (Map view) and #10 (Current location + reverse geocode). Read before editing those rows again.
**Owner:**       Coding model (this session); Zia ratifies the row flips.
**Status:**      CLOSED — verdict recorded 2026-09-10.
**Source of truth:** this file (for the #9/#10 verdict); `docs/FeatureList/FEATURES.md` §1 for the rows themselves.
**Related (concrete paths):**
  - `docs/FeatureList/FEATURES.md` §1 rows 9–10 — the "Partial" claims under verdict
  - `components/Map.tsx` — the live map implementation (MapLibre + Barikoi style JSON)
  - `lib/useBarikoiMapStyle.ts` — URL helpers incl. the **dead** `getBarikoiReverseGeocodeUrl`
  - `app/(main)/(customer)/(tabs)/home/index.tsx` — the two live v1 reverse-geocode call sites
  - `lib/barikoi.ts` — server-side route/distance (not under verdict; fully wired + tested)
**Last verified:** 2026-09-10, coding model, by reading every file listed and grepping all call sites.

## Verdict: (a) "Partial" is stale — both features are functionally complete. Two hygiene residues noted below.

### Row #9 — Map view (MapLibre + Barikoi) → YES

Evidence (all on disk):
- `components/Map.tsx` renders a real MapLibre `MapView` via `utils/maplibreLoader.ts`, styled with Barikoi vector tiles (`https://map.barikoi.com/styles/{barikoi-dark|osm-liberty}/style.json` — dark/light aware via `useIsDark`).
- Full feature surface: ShapeSource+LineLayer route polyline, ShapeSource+CircleLayer vehicle markers (`vehicleMarkers` — the R3.4 nearby-driver dots), hotspot overlay mode (demand heat), static origin/destination snapshot mode, `onMapPress` coordinate passthrough, camera fitting, graceful no-native fallback (`MapViewLib ?? null` guard renders a coordinate readout instead of crashing).
- Home renders it full-screen: `app/(main)/(customer)/(tabs)/home/index.tsx:1284` — `<Map route={routeGeo} vehicleMarkers={vehicleMarkers} onMapPress={handleMapPress} />`.
- Native plugin wired: `app.config.js:100` lists `@maplibre/maplibre-react-native`; TD-28 documents the v10.4.2 pin rationale.

### Row #10 — Current location + reverse geocode → YES

Evidence:
- **Current location**: `components/Map.tsx:151-154` centers the camera on `useCustomer()` store coords (`displayLat`/`displayLng`) — location flows through the rider store (row #7 chain), and `autocomplete/index.tsx:104-107` passes `userLatitude`/`userLongitude` to Barikoi as proximity bias. The app-wide current-location pipeline exists and is consumed.
- **Reverse geocode — two live call sites**: `home/index.tsx:545` (map-press pin address) and `home/index.tsx:958` (select-on-map center address). Both fetch Barikoi geocode/reverse and populate `mapPinAddress` from `data.address || data.name`, non-blocking on error.

## Hygiene residues (NOT blockers; recorded for the next cleanup batch — no code changed this session per C4 scope)

1. **Dead v2 helper**: `lib/useBarikoiMapStyle.ts:45` `getBarikoiReverseGeocodeUrl()` (full v2 params, `bangla: true`) has **zero call sites** — grep-verified across the whole repo. Either wire it or delete it.
2. **Hardcoded v1 endpoint**: both live reverse-geocode call sites bypass the helper layer and inline `https://barikoi.xyz/v1/api/geocode/reverse/...`. v1 works today but diverges from the v2 URL-helper convention used by autocomplete/details/route/matrix. If Barikoi sunsets v1, both call sites break silently (they swallow errors non-blocking).

Recommended follow-up (one small PR): switch home's two call sites to a v2 helper and delete or wire the dead one; then delete residue note 2 from this file.

## How to update

If #9/#10 rows are ever set back to Partial, the evidence above must be re-verified first (Copy Truth Rule). If the v1→v2 cleanup lands, append the commit hash here and clear the residues.
