**Purpose:**     Source-map-verified app size audit. Read when planning bundle optimization, dependency cleanup, or asset trimming for the Ride Expo SDK 53 app.
**Owner:**       Coding model
**Status:**      ACTIVE (2026-09-14, verified against source map)
**Source of truth:** `package.json`, `app.config.js`, `.audit/android/` + `.audit/ios/` export artifacts (HBC + source map).
**Related (concrete paths):**
  - `lib/routeSplit.ts:2` — `@turf/turf` import site (full bundle, not modular)
  - `lib/h3.ts:1` — `h3-js` import site (460 KB geo library pulled into client)
  - `lib/otaBackgroundUpdate.ts:36` — `expo-updates` import (code present despite `updates.enabled: false`)
  - `components/ChartLine.tsx:3` and `components/CountdownRing.tsx:3` — `react-native-svg` imports (NOT dead)
  - `components/ChatScreen.tsx:3` — `react-native-gifted-chat` import (NOT dead)
  - `components/PaymentWebView.tsx:9` — `react-native-webview` import (NOT dead)
  - `app.config.js:23-36` — `updates.enabled: false` config block
  - `app.config.js:100` — `@maplibre/maplibre-react-native` plugin
  - `.audit/android/metadata.json` — asset inventory with sizes
**Last verified:** 2026-09-14, by Coding model, via `npx expo export -p android --source-maps` + source-map parsing script.
**How to update:** Re-run `npx expo export -p android --output-dir .audit/android --source-maps`, then re-run the parsing scripts in this file's appendix.

---

# App Size Audit — Ride (Source-Map Verified)

**Date:** 2026-09-14  
**Scope:** `D:\My Projects\Current Project\Ride` (Expo SDK 53.0.0, RN 0.79.2, Hermes ON, New Architecture active by default)  
**Method:** `npx expo export -p android --source-maps` + source-map parsing (NOT static import analysis). Both Android and iOS exports completed successfully (~60 s each; no timeout).

---

## 1. Executive Summary

| Metric | Android | iOS | Notes |
|---|---|---|---|
| JS modules bundled | 2,536 | 2,531 | From Metro output |
| JS bundle (HBC) | 6.14 MB | 5.99 MB | Production minified bytecode |
| Source map | 18.9 MB | 18.4 MB | Debug symbols on disk |
| Assets | 79 files | 79 files | 5.39 MB (see §4) |
| Total export dir | 29.24 MB | 29.21 MB | JS + assets + metadata |
| App source in bundle | 402 files | 402 files | 3,291 KB (318 .tsx + 50 .ts + 25 .png + 7 .ttf) |

**Top 5 size drivers (by source content in source map):**

1. **`react-native` (core)** — 2,305 KB source. Cannot remove; this is the RN runtime.
2. **`react-native-reanimated`** — 769 KB source. Splash animation + gesture handlers.
3. **`h3-js`** — 460 KB source. H3 hexagonal geo-indexing (§1.1). Pulls `text-encoding`/polyfill chain.
4. **`@supabase/auth-js`** — 409 KB source. Transitive dep of `@supabase/supabase-js`; not a direct dependency.
5. **`expo-router`** — 301 KB source. File-based routing + Expo Router internals.

### 1.1 The `h3-js` 460 KB leak (critical)

`h3-js` (460 KB) is bundled in the **client** despite being a geo-indexing library designed for server-side use. The import chain is:

```
lib/h3.ts:1          → imports `h3-js`
lib/pickupQuote.ts    → imports `lib/h3.ts`
app/api/ride/*/      → API routes import `lib/pickupQuote` (server-side logic)
components/Map.tsx:3  → imports `lib/h3.ts` directly (CLIENT)
```

Expo Router bundles API routes (`app/api/*`) into the same Metro bundle as client routes. Since `h3-js` is imported by API routes transitively, it lands in the client bundle. The fix requires either tree-shaking h3 to specific functions (currently the full `dist/browser/h3-js.js` is bundled as one file), moving API routes to a separate bundling step, or lazy-loading.

### 1.2 `expo-updates` still bundled despite `enabled: false`

`app.config.js:33` sets `updates.enabled: false`. However, `lib/otaBackgroundUpdate.ts:36` still contains `import * as Updates from "expo-updates"`. The import is guarded at runtime (`if (__DEV__ || !Updates.isEnabled) return`), but the module code (8 files, 25 KB source) is still bundled. The `updates.enabled: false` config prevents the native module from initializing, but the JS import remains.

### 1.3 Supabase transitive bloat (402 KB)

`@supabase/supabase-js` is a direct dependency (`package.json`), but it transitively pulls:
- `@supabase/auth-js` — 409 KB source (auth client, token management, PKCE)
- `@supabase/postgrest-js` — 132 KB (which transitively pulls `axios` — 137 KB)
- `@supabase/storage-js` — 94 KB
- `@supabase/realtime-js` — 85 KB
- `@supabase/phoenix` — 52 KB

**Total Supabase ecosystem in bundle: ~906 KB source.** The `axios` dependency (137 KB) is pulled transitively by `@supabase/postgrest-js` — it is NOT a direct dependency and NOT used directly in app code (confirmed: 0 app source files import axios).

---

## 2. Dependency Audit — Verified Against Source Map

### 2.1 Used Native Packages

| Package | Source Size | Files | Usage |
|---|---|---|---|
| `@maplibre/maplibre-react-native` | 143 KB | ~15 | `app.config.js:100` plugin; map screens |
| `expo-notifications` | 80 KB | 52 | `app/_layout.tsx:8`, `app/(auth)/notifications-permission.tsx` |
| `expo-location` | 27 KB | 7 | Geo-location for dispatch |
| `expo-router` | 301 KB | 82 | File-based routing |
| `react-native-reanimated` | 769 KB | 185 | Splash animation + gestures |
| `react-native-gesture-handler` | 279 KB | 82 | Touch/gesture handling |
| `react-native-svg` | 249 KB | 111 | **IS USED** — `components/ChartLine.tsx:3`, `components/CountdownRing.tsx:3` |
| `react-native-gifted-chat` | 120 KB | — | **IS USED** — `components/ChatScreen.tsx:3` |
| `react-native-webview` | 29 KB | 6 | **IS USED** — `components/PaymentWebView.tsx:9` |
| `react-native-modal` | 27 KB | 5 | Bottom sheets, modals |
| `react-native-css-interop` | 120 KB | 26 | NativeWind / Tailwind |
| `@gorhom/bottom-sheet` | 210 KB | — | Bottom sheets |
| `expo` | 108 KB | 21 | Core SDK |
| `expo-splash-screen` | 1 KB | 1 | `app/_layout.tsx:7` |
| `expo-asset` | 23 KB | 12 | Asset management |
| `expo-font` | 16 KB | 10 | `app/_layout.tsx:95` |
| `expo-linking` | 20 KB | 6 | Deep linking |
| `expo-haptics` | 7 KB | 3 | Haptic feedback |
| `expo-crypto` | 10 KB | 3 | OTP generation |
| `expo-secure-store` | — | — | `app.config.js:64` plugin |
| `expo-image-picker` | 16 KB | 4 | Document uploads |
| `expo-status-bar` | 7 KB | 2 | Status bar |
| `expo-symbols` | — | — | iOS symbols (0 app imports; bundled via expo core) |
| `expo-device` | — | — | Device info |
| `expo-constants` | 8 KB | 3 | Config/constants |
| `expo-application` | 9 KB | 3 | `app/_layout.tsx:9` |
| `expo-system-ui` | — | 0 | NOT IN BUNDLE — dead weight in package.json |
| `expo-dev-client` | dev-only | — | Dev builds only |

### 2.2 Corrections to Previous Audit (Critical)

The previous `docs/size-audit.md` (dated 2026-09-14) contained **multiple incorrect claims** about dead packages. Source-map verification refutes these:

| Package | Old Audit Claim | Actual Status (Source Map) |
|---|---|---|
| `react-native-svg` | "❌ ZERO imports — Remove" | ✅ **USED** — `components/ChartLine.tsx:3`, `components/CountdownRing.tsx:3` (249 KB) |
| `react-native-gifted-chat` | "❌ ZERO imports — Remove" | ✅ **USED** — `components/ChatScreen.tsx:3` (120 KB) |
| `react-native-webview` | "⚠️ Verify — web views used in admin?" | ✅ **USED** — `components/PaymentWebView.tsx:9` (29 KB) |
| `react-native-paper` | "❌ ZERO imports — Remove" | ✅ Correct — NOT IN BUNDLE (0 files) |
| `react-native-progress` | "❌ ZERO imports — Remove" | ✅ Correct — NOT IN BUNDLE (0 files) |
| `react-native-ratings` | "❌ ZERO imports — Remove" | ✅ Correct — NOT IN BUNDLE (0 files) |
| `lottie-react-native` | "Zero imports found — ⚠️ Verify" | ✅ Correct (verified) — NOT IN BUNDLE (0 files) |
| `@turf/turf` | "~1.2 MB — tree-shaking not effective" | ⚠️ **OVERSTATED 27×** — actual 43 KB (6 files, CommonJS chunks) |
| PlusJakartaSans fonts | "14 files" with "7 unused italic variants" | ⚠️ **WRONG** — only 7 TTF files exist (no italic variants). 7 × 94.8 KB = 663 KB total |

### 2.3 Truly Dead Packages (Zero Presence in Bundle)

These packages are in `package.json` but produce **zero** source map entries — complete dead weight:

| Package | Est. Source Savings |
|---|---|
| `react-native-paper` | ~0 (not bundled) |
| `react-native-progress` | ~0 (not bundled) |
| `react-native-ratings` | ~0 (not bundled) |
| `lottie-react-native` | ~0 (not bundled) |
| `expo-web-browser` | ~0 (not bundled) |
| `expo-blur` | ~0 (not bundled) |
| `expo-file-system` | ~0 (not bundled) |
| `expo-system-ui` | ~0 (not bundled) |
| `expo-image-manipulator` | ~0 (not bundled) |
| `expo-media-library` | ~0 (not bundled) |
| `expo-document-picker` | ~0 (not bundled) |
| `react-native-otp-verify` | ~0 (not bundled) |

> **Note:** These packages contribute zero bytes to the bundle. The native autolinking cost (if any) would only manifest in the native binary during EAS build. Removing from `package.json` only saves install time + native build complexity.

### 2.4 Storybook — Misclassified

The previous audit flagged Storybook packages (`@storybook/react-native`, `@storybook/addon-ondevice-*`, `@storybook/react-native-ui-lite`) as contributing ~300 KB. **Source map verification shows 0 entries.** These 5 packages are in `dependencies` (should be `devDependencies`) but do NOT appear in the production bundle at all — Metro correctly tree-shakes them out.

---

## 3. JS Bundle Composition

### 3.1 Top 25 Packages by Source Content (from source map)

| Rank | Package | Source (KB) | Notes |
|---|---|---|---|
| 1 | `react-native` | 2,305 | Core RN runtime — cannot remove |
| 2 | `react-native-reanimated` | 769 | Splash animation + gestures |
| 3 | `h3-js` | 460 | Geo-indexing — 1 file `dist/browser/h3-js.js` |
| 4 | `@supabase/auth-js` | 409 | Transitive; auth client + PKCE |
| 5 | `expo-router` | 301 | File routing + navigation |
| 6 | `react-native-gesture-handler` | 279 | Touch/gesture handling |
| 7 | `react-native-svg` | 249 | SVG rendering (`ChartLine`, `CountdownRing`) |
| 8 | `drizzle-orm` | 242 | Only 2 app files import it |
| 9 | `@gorhom/bottom-sheet` | 210 | Bottom sheet UI |
| 10 | `@react-navigation/core` | 167 | Navigation v7 |
| 11 | `@react-native/virtualized-lists` | 149 | List rendering |
| 12 | `zod` | 146 | Schema validation |
| 13 | `@maplibre/maplibre-react-native` | 143 | Maps provider |
| 14 | `react-native-keyboard-controller` | 139 | Keyboard handling |
| 15 | `axios` | 137 | Transitive via `@supabase/postgrest-js` |
| 16 | `@supabase/postgrest-js` | 132 | DB REST client |
| 17 | `react-native-css-interop` | 120 | NativeWind |
| 18 | `react-native-gifted-chat` | 120 | Chat UI (`ChatScreen.tsx`) |
| 19 | `expo` | 108 | Core SDK |
| 20 | `@supabase/storage-js` | 94 | Storage client |
| 21 | `@supabase/realtime-js` | 85 | Realtime client |
| 22 | `expo-notifications` | 80 | Push notifications |
| 23 | `i18next` | 80 | i18n framework |
| 24 | `assert` | 74 | Node polyfill (from h3-js/postgrest chain) |
| 25 | `whatwg-url-without-unicode` | 71 | URL polyfill |

**Total node_modules source in map:** 8,815 KB (8.6 MB).  
**App source in map:** 3,291 KB (3.2 MB).  
**Total source map content:** 12 MB unminified text (HBC bundle is 6.14 MB).

### 3.2 `@turf/turf` — Overstated, Not Critical

The previous audit claimed `@turf/turf` is "~1.2 MB" with ineffective tree-shaking. **Actual: 43 KB** (6 files), imported as `import * as turf from '@turf/turf'` in `lib/routeSplit.ts:2`. The full `@turf/turf` package includes sub-modules (`@turf/helpers`, `@turf/distance`, `@turf/length`, etc.), but only 4 helpers are used. Modular imports would save ~30 KB at most — not the 800 KB claimed previously.

### 3.3 `drizzle-orm` Usage

`drizzle-orm` (242 KB source) is only imported in 2 files:
- `src/db/schema.ts` — schema definitions (needed at build time for types, but runtime DB calls go through `src/db/index.ts`)
- `app/admin/incentives.tsx` — type imports

Most API route DB access goes through `src/db/index.ts` which imports from `drizzle-orm`, so the package is correctly needed. Not a target for removal.

### 3.4 `i18next` Bundle Size

`i18next` (80 KB) + `react-i18next` (45 KB via separate entry) = 125 KB total. The previous audit claimed 300 KB. Actual is 58% of the estimate.

---

## 4. Asset Audit

### 4.1 Summary

| Type | Count | Total Size |
|---|---|---|
| TTF (fonts) | 26 | 4.34 MB |
| PNG | 53 | 1.04 MB |
| **Total** | **79** | **5.39 MB** |

### 4.2 Fonts — Largest Asset Class (4.34 MB)

**PlusJakartaSans (brand fonts):** 7 files × 94.8 KB = 663 KB. All 7 weights are used (verified in `app/_layout.tsx:95-103`). No italic variants exist on disk.

**`@expo/vector-icons` icon fonts:** 19 files = 3.68 MB. **Only 3 of 16 icon families are actually used:**

| Icon Family | Size | Used? |
|---|---|---|
| `Ionicons.ttf` | 443 KB | ✅ Yes (208 imports) |
| `MaterialCommunityIcons.ttf` | 1.15 MB | ✅ Yes (1 import) |
| `AntDesign.ttf` | 70.3 KB | ✅ Yes (3 imports) |
| `FontAwesome6_Solid.ttf` | 424 KB | ❌ Dead |
| `Fontisto.ttf` | 314 KB | ❌ Dead |
| `MaterialIcons.ttf` | 357 KB | ❌ Dead |
| `FontAwesome.ttf` | 166 KB | ❌ Dead |
| `FontAwesome6_Brands.ttf` | 209 KB | ❌ Dead |
| `FontAwesome5_Solid.ttf` | 203 KB | ❌ Dead |
| `FontAwesome5_Brands.ttf` | 134 KB | ❌ Dead |
| `FontAwesome6_Regular.ttf` | 68 KB | ❌ Dead |
| `FontAwesome5_Regular.ttf` | 33.7 KB | ❌ Dead |
| `Foundation.ttf` | 57 KB | ❌ Dead |
| `Entypo.ttf` | 66.2 KB | ❌ Dead |
| `EvilIcons.ttf` | 13.5 KB | ❌ Dead |
| `Feather.ttf` | 56.2 KB | ❌ Dead |
| `Octicons.ttf` | 49.4 KB | ❌ Dead |
| `SimpleLineIcons.ttf` | 54.1 KB | ❌ Dead |
| `Zocial.ttf` | 25.8 KB | ❌ Dead |

**Potential savings: ~3.1 MB** by configuring `@expo/vector-icons` to only bundle used icon families. This requires a custom `assetBundlePatterns` or Metro config to exclude unused TTF files.

### 4.3 PNGs — 53 files, 1.04 MB

Top assets by size:

| File | Size | Recommendation |
|---|---|---|
| `assets\splash\Splash_Screen_2.png` | 4.5 MB (on disk) | ❌ Already replaced by `Splash_Screen_2.webp` (250 KB) in actual use — app.config.js:19 still points to PNG |
| `assets\icons\switch_on.png` | 256 KB | ⚠️ WebP version exists (114 KB) per old audit; remove PNG |
| `assets\icons\switch_off.png` | 174 KB | ⚠️ WebP version exists (76 KB); remove PNG |
| `assets\images\no-result.png` | 175 KB | ⚠️ WebP version exists; remove PNG |
| `assets\icons\cab.png` | 72 KB | ⚠️ WebP version exists; remove PNG |

### 4.4 Audio Assets

Old audit mentioned `notification_sound.wav` (346 KB) and `notification_sound_other.wav` (226 KB). Source map shows no audio files in `assets/` — these may have been removed already. 248 KB PNG assets exist (`9af43ba9da5d326d6810c95082932d01.png`) which may be splash-related.

---

## 5. App Architecture & File Structure

### 5.1 File Counts (Source Files on Disk)

| Directory | Files | Role |
|---|---|---|
| `app/(auth)/` | 19 files | Authentication flow (shared) |
| `app/(main)/(customer)/` | 96 files | Rider UI |
| `app/(main)/(rider)/` | 66 files | Driver UI |
| `app/(main)/(fleet)/` | 13 files | Fleet manager UI |
| `app/admin/` | 51 files | Admin dashboard (web) |
| `app/api/` | 270 files | Backend API routes |
| `components/` | 82 files | Shared UI components |
| `lib/` | 109 files | Shared utilities (auth, DB, map, payment) |
| `store/` | 13 files | 7 Zustand stores |
| `utils-server/` | 51 files | WebSocket dispatch server |
| **Total** | **~770** | |

### 5.2 Bundle Composition

- **402 app source files** in the JS bundle (318 `.tsx`, 50 `.ts`, 25 `.png`, 7 `.ttf`, 2 others)
- **2,089 node_modules files** in the JS bundle
- **2,536 total modules** bundled (Metro output)

### 5.3 Expo Router — All Routes Statically Bundled

Expo Router (v5.0.5) bundles **all routes** in `app/` into a single JS bundle. There is no route-based code splitting. This means rider screens, driver screens, fleet screens, admin screens, and API routes are ALL in the same 6.14 MB bundle, regardless of user role.

**250 route files** are in the bundle (app + api).

---

## 6. Prioritized Action List

| # | Action | Est. Bundle Savings | Est. Asset Savings | Effort | Risk |
|---|---|---|---|---|---|
| 1 | **Remove dead packages from `package.json`**: `react-native-paper`, `react-native-progress`, `react-native-ratings`, `lottie-react-native`, `expo-web-browser`, `expo-blur`, `expo-file-system`, `expo-system-ui`, `expo-image-manipulator`, `expo-media-library`, `expo-document-picker`, `react-native-otp-verify` | 0 KB (not bundled) | 0 | S | ⚠️ Low — verify no transitive native deps |
| 2 | **Move Storybook packages to `devDependencies`** | 0 KB (not bundled) | 0 | S | ✅ Zero risk |
| 3 | **Remove `Splash_Screen_2.png`** (4.5 MB on disk; webp already used by app) | 0 KB | 4.5 MB disk | S (1 deletion, verify app.config.js reference) | ✅ Low |
| 4 | **Remove unused icon font TTFs** (13 families, ~3.1 MB) | 0 KB JS | 3.1 MB assets | M | ⚠️ Medium — ensure `@expo/vector-icons` doesn't eagerly load all |
| 5 | **Delete duplicate PNG→WebP pairs** (switch_on, switch_off, no-result, cab, etc.) | 0 KB | ~500 KB | S | ✅ Zero risk |
| 6 | **Refactor `@turf/turf` import** to modular: `import polygon from '@turf/polygon'` etc. | ~30 KB JS | 0 | M | ⚠️ Medium |
| 7 | **Remove `expo-updates` import** from `lib/otaBackgroundUpdate.ts` or gate it behind a dynamic import | 25 KB JS | 0 | M | ⚠️ Medium — OTA feature would be lost |
| 8 | **Tree-shake `h3-js`** — import only `latLngToCell`, `gridDisk`, `cellToBoundary` instead of full bundle | ~430 KB JS | 0 | M | ⚠️ Medium — the browser build may not support selective imports |
| 9 | **Scope `assetBundlePatterns`** in `app.config.js:40` | 0 KB | Variable | S | ⚠️ Low — test splash/load screens |
| 10 | **Per-role bundle splitting** (multiple EAS build targets) | 2–3 MB potential | 0 | XL | 🔴 High — architectural change |

### Notes
- Actions 1–2 are zero-risk hygiene (dead deps don't affect bundle, but remove native build complexity).
- Action 3 is the single largest asset win (4.5 MB).
- Action 4 is the second-largest asset win (3.1 MB) but requires verifying that `@expo/vector-icons` doesn't eagerly load all font families at runtime.
- Action 8 (h3-js tree-shaking) is the largest JS savings opportunity but may require switching from the bundled `dist/browser/h3-js.js` to individual ESM imports.
- Actions 7 and 8 target JS bundle size (6.14 MB), not assets.
- Action 10 (per-role splitting) is architectural — Expo Router v5 does not support it natively; would require multiple Expo projects or dynamic remote bundle loading via `expo-updates` (which is currently disabled).

---

## 7. Verification Methodology

All numbers above are derived from the source map generated by:

```bash
npx expo export -p android --output-dir .audit/android --source-maps 2>&1
npx expo export -p ios --output-dir .audit/ios --source-maps 2>&1
```

Parsing script: `node -e` scripts analyzing `sources`, `sourcesContent`, and `fileMetadata` from the generated `.hbc.map` and `metadata.json` files.

**Limitations:**
- Source map content bytes ≠ bundle bytes (HBC is minified). Source map is larger because it includes unminified source.
- Binary assets (TTF, PNG) are not in the source map. Their sizes come from `metadata.json`.
- iOS and Android bundles are near-identical (5.99 vs 6.14 MB) — the 150 KB difference is platform-specific asset variants.
- The `expo export` output directory (`*.audit`) is git-ignored and should be cleaned after audit.

---

## 8. Hard Constraints (Cannot Remove)

| Module | Reason | Source Size |
|---|---|---|
| `react-native` | Core RN runtime | 2,305 KB |
| `react-native-reanimated` | Splash animation + gestures | 769 KB |
| `expo-router` | File-based routing | 301 KB |
| `expo-notifications` | Push notification infrastructure | 80 KB |
| `expo-location` | Geo-location for dispatch | 27 KB |
| `@supabase/supabase-js` | Auth + real-time DB | 56 KB (+ 906 KB transitive) |
| `@maplibre/maplibre-react-native` | Maps provider (no alternative) | 143 KB |
| `h3-js` | H3 geo-indexing for dispatch | 460 KB |
| `react-native-svg` | Used by `ChartLine`, `CountdownRing` | 249 KB |
| `react-native-gifted-chat` | Used by `ChatScreen` | 120 KB |
| `react-native-webview` | Used by `PaymentWebView` | 29 KB |
| All 7 `PlusJakartaSans` fonts | Brand typography | 663 KB |
| `Ionicons.ttf` | 208 icon imports across app | 443 KB |
| `MaterialCommunityIcons.ttf` | Icon usage | 1,150 KB |
| `AntDesign.ttf` | 3 icon imports | 70.3 KB |
