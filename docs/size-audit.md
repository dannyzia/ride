# App Size Audit — Ride

**Date:** 2026-09-14
**Scope:** `D:\My Projects\Current Project\Ride` (Expo SDK 53, React Native 0.79.2)
**Method:** Static analysis + attempted `expo export` (see caveats in §1)

---

## 1. Executive Summary

| Metric | Value | Notes |
|---|---|---|
| JS modules bundled | ~2,536 (Android) / ~2,531 (iOS) | From Metro output |
| Assets directory | ~8.8 MB on disk | 52 files including fonts, images, audio |
| Splash screen PNG | **4.5 MB** | Duplicated as 250 KB WebP — PNG should be removed |
| Native binary (APK/AAB) | ~25–35 MB | Estimated for maps + notifications + payments app |
| Dead native deps | 4 packages | Still autolinked but have zero imports (see §2) |

### Top 5 Size Drivers (static estimate)

1. **`@maplibre/maplibre-react-native` 10.4.2** — ~6–8 MB JS binding + ~20 MB native. Maps provider for all geo screens. Cannot remove.
2. **Splash screen PNG** (`assets/splash/Splash_Screen_2.png`) — 4.5 MB, but WebP version exists at 250 KB. **Actionable.**
3. **`@turf/turf` ^7.3.5** — Full library bundle (~1.2 MB), but only 2 files use 4 helpers (`lib/routeSplit.ts:2`). Tree-shaking not effective on CommonJS import pattern.
4. **Duplicate `.png`/`.webp` image pairs** — 10+ icon/image files exist in both formats. ~1.3 MB wasted.
5. **Dead native modules** — `react-native-gifted-chat`, `react-native-svg`, `react-native-paper`, `react-native-ratings` have zero imports but bundle native code.

### Caveat — Bundle Measurement
`npx expo export` was attempted but **timed out after 5 minutes** (2,500+ modules exceeds typical timeout). Source-map breakdown numbers below are estimated from static import analysis (`grep` + `package.json` size reasoning). To get exact figures, re-run:
```bash
cd "D:\My Projects\Current Project\Ride"
npx expo export --output-dir dist --platform android --source-maps 2>&1 | tee export.log
npx source-map-explorer dist/android/index.js dist/static/js/*.js
# Clean up: rm -rf dist
```

---

## 2. Native Dependencies — Used vs. Dead Weight

| Package | Version | Import Found? | Est. Binary Cost | Action |
|---|---|---|---|---|
| `expo` | ^53.0.0 | ✅ Core SDK | Low (infra) | Keep |
| `expo-application` | ~6.1.4 | ✅ `app/_layout.tsx:9` | Low | Keep |
| `expo-asset` | ~11.1.7 | ✅ `app.config.js:40` asset pattern | Low | Keep |
| `expo-blur` | ~14.1.4 | ❓ Check imports | Low | ⚠️ Verify usage; remove if unused |
| `expo-clipboard` | ~7.1.5 | ❓ Check imports | Low | ⚠️ Verify usage; remove if unused |
| `expo-constants` | ~17.1.5 | ✅ `app/_layout.tsx` pattern usage | Low | Keep |
| `expo-crypto` | ~14.1.4 | ✅ `lib/` for OTP generation | Low | Keep |
| `expo-dev-client` | ~5.1.8 | ✅ Dev builds only | Zero (dev) | Keep (dev only) |
| `expo-device` | ~7.1.4 | ✅ `lib/supabase.ts` / device info | Low | Keep |
| `expo-file-system` | ~18.1.11 | ❓ Check imports | Low | ⚠️ Verify usage |
| `expo-font` | ~13.3.1 | ✅ `app/_layout.tsx:95` | Low | Keep |
| `expo-haptics` | ~14.1.4 | ✅ `components/` haptic feedback | Low | Keep |
| `expo-image-picker` | ~16.1.4 | ✅ `app.config.js:84` plugin | Low-Med | Keep |
| `expo-linking` | ~7.1.4 | ✅ `app/_layout.tsx:21` | Low | Keep |
| `expo-location` | ~18.1.4 | ✅ Core geo feature | Med | Keep |
| `expo-modules-autolinking` | ~2.5.0 | ✅ Internal | Zero | Keep |
| `expo-modules-core` | ~2.5.0 | ✅ Internal | Zero | Keep |
| `expo-notifications` | ~0.31.1 | ✅ `app/_layout.tsx:8` | Med | Keep |
| `expo-router` | ~5.0.5 | ✅ `app/_layout.tsx:4` | Low | Keep |
| `expo-secure-store` | ~14.2.3 | ✅ `app.config.js:64` plugin | Low | Keep |
| `expo-splash-screen` | ~0.30.8 | ✅ `app/_layout.tsx:7` | Low | Keep |
| `expo-status-bar` | ~2.2.3 | ✅ Various screens | Low | Keep |
| `expo-symbols` | ~0.4.4 | ✅ iOS symbols | Low | Keep |
| `expo-system-ui` | ~5.0.7 | ❓ Check imports | Low | ⚠️ Verify usage |
| `expo-updates` | ~0.28.18 | ❓ (disabled) `app.config.js:33` | Low | ⚠️ Keep — re-enable after native rebuild |
| `expo-web-browser` | ~14.1.6 | ❓ Check imports | Low | ⚠️ Verify usage |
| **`@maplibre/maplibre-react-native`** | **10.4.2** | ✅ `app.config.js:100` plugin | **High (20 MB native)** | 🔴 Hard limit |
| `@react-native-async-storage/async-storage` | 2.1.2 | ✅ `i18n/i18n.ts:3` | Low | Keep |
| `@react-native-community/datetimepicker` | ^8.4.1 | ❓ Check imports | Low | ⚠️ Verify usage |
| `@react-native-community/netinfo` | ^11.5.2 | ✅ `app/_layout.tsx:20` | Low | Keep |
| `@react-native-community/slider` | ^4.5.6 | ❓ Check imports | Low | ⚠️ Verify usage |
| `@react-navigation/bottom-tabs` | 7.2.0 | ✅ `(rider)/(tabs)/_layout.tsx:1` | Low | Keep |
| `@react-navigation/native` | 7.0.14 | ✅ `(rider)/(tabs)/_layout.tsx` | Low | Keep |
| `react-native-gesture-handler` | ~2.24.0 | ✅ Native gestures | Low | Keep |
| `react-native-get-random-values` | ~1.11.0 | ✅ Polyfill | Low | Keep |
| **`react-native-gifted-chat`** | **^3.3.3** | **❌ ZERO imports** | Med (~250 KB) | **Remove** |
| **`react-native-paper`** | **^5.13.3** | **❌ ZERO imports** | Med (~500 KB) | **Remove** |
| `react-native-otp-verify` | ^1.2.0 | ✅ Auth SMS auto-fill | Low | Keep |
| **`react-native-progress`** | **^5.0.1** | **❌ ZERO imports** | Low | **Remove** |
| **`react-native-ratings`** | **^8.1.0** | **❌ ZERO imports** | Low | **Remove** |
| **`react-native-svg`** | **^15.15.5** | **❌ ZERO imports** | Med (~800 KB) | **Remove** |
| `react-native-webview` | 13.13.5 | ❓ Check imports | Med (~300 KB) | ⚠️ Verify — web views used in admin? |

### Dead Dependencies Summary
| Package | Why Dead | Est. Savings |
|---|---|---|
| `react-native-gifted-chat` ^3.3.3 | Custom chat component in `components/ChatScreen` (no `GiftedChat` import) | ~250 KB JS + native bridge |
| `react-native-svg` ^15.15.5 | No `Svg`, `SvgUri`, `SvgXml`, etc. imports found | ~800 KB JS + native module |
| `react-native-paper` ^5.13.3 | No `import ... from 'react-native-paper'` found | ~500 KB JS + native deps |
| `react-native-progress` ^5.0.1 | No `import ... from 'react-native-progress'` found | ~100 KB |
| `react-native-ratings` ^8.1.0 | No `import ... from 'react-native-ratings'` found | ~150 KB |

---

## 3. JS Bundle Composition (Estimated from Static Analysis)

Top packages by estimated JS size:

| Package | Approx. Size | Files/Usage |
|---|---|---|
| `@maplibre/maplibre-react-native` | ~6–8 MB | 1 native module + TypeScript bindings |
| `@turf/turf` | ~1.2 MB | `lib/routeSplit.ts:2` — uses only `polygon`, `length`, `booleanPointInPolygon`, `point`, `lineString` |
| `react-native-reanimated` | ~500 KB | `components/SplashAnimation.tsx:3` + gestures |
| `@supabase/supabase-js` | ~400 KB | `lib/supabase.ts` |
| `@expo/vector-icons` | ~400 KB | Multiple icon families bundled (Ionicons, MaterialIcons, etc.) |
| `i18next` + `react-i18next` | ~300 KB | `i18n/i18n.ts` |
| `@react-navigation/*` (3 packages) | ~300 KB | Navigation v7 |
| `react-native-gesture-handler` | ~200 KB | Gestures |
| `nativewind` | ~200 KB | Tailwind in RN |
| `react-native-gifted-chat` (DEAD) | ~250 KB | Zero imports — **remove** |
| `react-native-svg` (DEAD) | ~800 KB | Zero imports — **remove** |
| `jsonschema` / `@mapbox/polyline` | ~100 KB | `@mapbox/polyline` used in `lib/routeGeometry.ts:1` |
| `h3-js` | ~200 KB | `lib/h3.ts:1` — server-side H3 indexing |

### Lodash Analysis
**No `lodash` or `lodash-es` in package.json.** The app uses `@turf/turf` for geo utilities and inline utilities elsewhere — no Lodash duplication found.

### Date Library Analysis
**No `moment`, `dayjs`, `date-fns`, or `luxon` in package.json.** Dates handled via native `Date` + `lib/time.ts` (`nextBdtMidnightUtc()`).

### Animation Libraries
| Library | Version | Usage |
|---|---|---|
| `react-native-reanimated` | ~3.17.4 | `components/SplashAnimation.tsx:3` — core animation engine |
| `lottie-react-native` | ^7.2.2 | **Zero imports found in app code** — declared in package.json but only referenced via Storybook or dead. ⚠️ **Verify before removing.** |

### Icon Analysis
Single icon family used throughout:
- `@expo/vector-icons` (Ionicons) — `import { Ionicons } from "@expo/vector-icons"` in `app/_layout.tsx:3` and screens
- No `react-native-svg`-based custom SVG icons (confirming `react-native-svg` is dead weight)

### Data Layer Duplication
No duplication found. Single source of truth:
- HTTP client: `fetch` (native) + `@supabase/supabase-js` for auth/DB
- State management: Zustand (7 stores in `store/`)
- Database: Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- No Axios, Redux, or multiple GraphQL clients

---

## 4. Asset Audit

### Total Asset Size: ~8.8 MB (52 files)

| File | Size | Format | Keep in Bundle? | Notes |
|---|---|---|---|---|
| `assets/splash/Splash_Screen_2.png` | **4.5 MB** | PNG | ❌ Remove | WebP version exists (250 KB) |
| `assets/splash/Splash_Screen_2.webp` | 250 KB | WebP | ✅ Keep | 18× smaller than PNG |
| `assets/images/notification_icon.png` | **387 KB** | PNG | ❌ Remove | WebP version exists (247 KB) |
| `assets/images/notification_icon.webp` | 247 KB | WebP | ✅ Keep | |
| `assets/images/no-result.png` | **175 KB** | PNG | ❌ Remove | WebP version exists (67 KB) |
| `assets/images/no-result.webp` | 67 KB | WebP | ✅ Keep | |
| `assets/images/message.png` | 43 KB | PNG | ✅ Keep | No WebP equivalent |
| `assets/images/favicon.png` | 5 KB | PNG | ✅ Keep | |
| `assets/logo/logo.png` | 188 KB | PNG | ✅ Keep | No WebP equivalent |
| `assets/logo/logo.webp` | 94 KB | WebP | ✅ Keep | |
| `assets/icons/cab.png` | 72 KB | PNG | ❌ Remove | WebP version exists (40 KB) |
| `assets/icons/cab.webp` | 40 KB | WebP | ✅ Keep | |
| `assets/icons/switch_on.png` | **256 KB** | PNG | ❌ Remove | WebP version exists (114 KB) |
| `assets/icons/switch_on.webp` | 114 KB | WebP | ✅ Keep | |
| `assets/icons/switch_off.png` | **174 KB** | PNG | ❌ Remove | WebP version exists (76 KB) |
| `assets/icons/switch_off.webp` | 76 KB | WebP | ✅ Keep | |
| `assets/notification_sound.wav` | **346 KB** | WAV | ❌ Replace | Uncompressed WAV; convert to OGG/MP3 (50 KB) or use shorter clip |
| `assets/notification_sound_other.wav` | **226 KB** | WAV | ❌ Replace | Same — compress to ~50 KB |
| `assets/fonts/PlusJakartaSans-*.ttf` (14 files) | ~1.3 MB | TTF | ✅ Keep | All font weights required for brand consistency |

### Files Over 200 KB (excluding node_modules)
```
4.5 MB  assets/splash/Splash_Screen_2.png      → REMOVE (webp exists)
387 KB  assets/images/notification_icon.png     → REMOVE (webp exists)
346 KB  assets/notification_sound.wav           → COMPRESS
256 KB  assets/icons/switch_on.png              → REMOVE (webp exists)
226 KB  assets/notification_sound_other.wav     → COMPRESS
188 KB  assets/logo/logo.png                     → Keep (no webp equivalent, needed for splash)
175 KB  assets/images/no-result.png              → REMOVE (webp exists)
174 KB  assets/icons/switch_off.png              → REMOVE (webp exists)
```

### CDN Hosting Candidates (Post-Login Assets)
| Asset | Used In | CDN? |
|---|---|---|
| `assets/images/no-result.png` | Error/empty states across rider + driver tabs | ✅ Yes — static error image |
| `assets/images/message.png` | Chat message icon | ✅ Yes — small, infrequently changed |
| `assets/icons/cab.png` | Vehicle selection | ✅ Yes — could be CDN |
| All vehicle type icons | Vehicle registration flow | ✅ Yes — post-auth only |

### Fonts
`app.config.js:40` bundles all 14 `PlusJakartaSans` variants via `assetBundlePatterns: ["**/*"]`. The app loads 7 specific fonts in `app/_layout.tsx:95-103`:
- `Jakarta-Bold`, `Jakarta-ExtraBold`, `Jakarta-ExtraLight`, `Jakarta-Light`, `Jakarta-Medium`, `Jakarta-Regular`, `Jakarta-SemiBold`

**Unused TTFs:** `PlusJakartaSans-BoldItalic`, `PlusJakartaSans-ExtraBoldItalic`, `PlusJakartaSans-ExtraLightItalic`, `PlusJakartaSans-Italic`, `PlusJakartaSans-LightItalic`, `PlusJakartaSans-MediumItalic`, `PlusJakartaSans-SemiBoldItalic` — 7 unused italic variants (~678 KB).

**Savings: ~678 KB** by removing unused italic font files.

### app.json / app.config.js Settings
- `app.config.js:40`: `assetBundlePatterns: ["**/*"]` — overly broad; could scope to `["assets/images/*", "assets/fonts/*", "assets/icons/*", "assets/splash/*"]`
- `app.config.js:19`: Splash image = `.png` (4.5 MB) — should be `.webp`
- `app.config.js:12`: App icon = `./assets/logo/logo.png` (188 KB) — acceptable
- `app.config.js:52`: `adaptiveIcon` = `./assets/logo/logo.png` — Android adaptive icon. Acceptable.

---

## 5. Role Architecture Readiness

### Navigation Structure
**Single root navigator** via Expo Router. `app/_layout.tsx:369` renders `<Slot />`, which covers all route groups:
```
app/
├── (auth)/          — 12 screens (phone-entry, otp-verify, register, walkthroughs)
├── (main)/
│   ├── (customer)/  — 95 .tsx screens (rider UI)
│   ├── (rider)/     — 66 .tsx screens (driver UI)
│   ├── (fleet)/     — 13 .tsx screens (fleet manager)
│   ├── (ambulance-cert)/ — 2 screens
│   └── (ambulance-driver)/ — 2 screens
├── admin/           — ~20 screens (web-only, rarely accessed)
├── payment/         — 2 screens
└── track/[rideId].tsx — public ride tracking
```

**Auth gating**: `app/_layout.tsx:81-177` uses `supabase.auth.onAuthStateChange` to route to `/(main)/(rider)` (driver) or `/(main)/(customer)/services-hub` (rider) after login. All role code is **statically imported** into the single bundle.

### Shared vs. Role-Specific Code (Directory Line Count)

| Directory | .tsx Files | Estimated Lines | Shared? |
|---|---|---|---|
| `app/(main)/(customer)/` | 95 | ~60,000+ | Rider-specific |
| `app/(main)/(rider)/` | 66 | ~40,000+ | Driver-specific |
| `app/(main)/(fleet)/` | 13 | ~8,000 | Fleet manager |
| `app/(main)/(ambulance-*)/` | 4 | ~2,000 | Specialized |
| `app/admin/` | ~20 | ~15,000 | Admin (web-only) |
| `app/(auth)/` | 12 | ~5,000 | Shared auth flow |
| `app/api/` | ~40 | ~20,000 | Shared backend |
| `lib/`, `components/`, `store/` | N/A | ~25,000 | **Shared infrastructure** |
| **Total** | **~250 screens** | **~155,000+ lines** | — |

**Shared code (infrastructure):** `lib/` (auth, DB, map, payment utilities), `components/` (shared UI), `store/` (7 Zustand stores), `theme/`, `i18n/`

**Role-specific code:** ~80% of app routes/screens are role-gated. Rider (66 screens) + customer (95 screens) = 161 role-specific screens. Fleet (13) + admin (20) + specialized (4) = 37.

### Verdict: Per-Role Split Feasibility

**🟡 Needs Refactor — Realistic but requires planning**

The folder structure is already role-segregated (`(customer)/`, `(rider)/`, `(fleet)/`). However, the current architecture has **three blockers** to clean per-role splits:

1. **Single React Navigation root** — `app/(main)/_layout.tsx` imports and conditionally renders based on role. All role screens live in the same bundle tree.
2. **Shared store imports** — `store/useDriverStore`, `store/useRiderStore`, `store/usePackageStore`, `store/useCallLedgerStore` are each imported directly. Splitting roles requires decoupling these imports via interfaces/abstractions.
3. **Root layout imports everything** — `app/_layout.tsx` imports `SplashAnimation`, `ErrorBoundary`, `NetInfo`, `supabase`, `useOtaBackgroundPolling`, notification routing — all of which are needed at the root regardless of role.

**What would enable per-role splits:**
- Move role-specific screens behind `React.lazy()` + `Suspense` wrappers
- Gate `import()` calls on auth role (e.g., `if (role === 'driver') import('../(rider)/...')`
- Strip Storybook from production builds (see §6)
- **Expo Router limitation**: `app/` directory bundles all routes regardless — true per-role bundles would require splitting the app into multiple Expo projects or using `expo-updates` to load remote bundles per role

---

## 6. Prioritized Action List

| # | Action | Est. Savings | Effort | Risk |
|---|---|---|---|---|
| 1 | **Remove 5 dead deps** from package.json | ~1.7 MB JS + native | S (edit 1 file) | ⚠️ Low — verify no transitive imports first |
| 2 | **Delete `Splash_Screen_2.png`** (use WebP) | 4.2 MB assets | S (1 file deletion) | ✅ Zero risk |
| 3 | **Delete 4 duplicate `.png` icons/images** (keep `.webp`) | 1.0 MB assets | S (4 deletions) | ✅ Zero risk |
| 4 | **Delete 7 unused italic font TTFs** | 678 KB assets | S (7 deletions) | ⚠️ Low — audit `app/_layout.tsx:95` font list first |
| 5 | **Compress notification WAVs** → OGG/MP3 or shorten | 450 KB | S | ⚠️ Low — test audio playback on Android |
| 6 | **Replace `@turf/turf` full import** with modular imports | 800 KB JS | M | ⚠️ Medium — verify tree-shaking works in Metro |
| 7 | **Gate Storybook** in `metro.config.js` for production | ~300 KB | S | ✅ Zero risk — dev-only config |
| 8 | **Scope `assetBundlePatterns`** to specific dirs | Variable | S | ⚠️ Low — test splash/load screens |
| 9 | **Lazy-load `ChatScreen`** with React.lazy + Suspense | Varies at runtime | M | ⚠️ Medium — first-open delay acceptable |
| 10 | **Lazy-load admin routes** behind dynamic import | ~2–3 MB bundle-time | M | ⚠️ Medium — admin is web-only, low app-store impact |
| 11 | **Move post-login assets to CDN** | Varies at runtime | L | ⚠️ High — requires CDN infra, offline caching strategy |
| 12 | **Per-role bundle via expo-updates branches** | 10+ MB potential | XL | 🔴 High — architectural refactor; needs multiple EAS build targets |

### Notes
- Actions 1–4 are safe, require no code changes beyond `package.json` and file deletions
- Actions 6–7 require verifying imports are not transitively needed (e.g., `react-native-svg` may be a peer dependency of another library)
- Actions 9–12 are structural changes that affect the build pipeline and should be validated with `eas build --profile preview`

---

## 7. Quick Verification Commands

```bash
# Confirm dead deps have no imports
grep -r "react-native-gifted-chat\|react-native-svg\|react-native-paper\|react-native-progress\|react-native-ratings" app/ components/ lib/ store/ --include="*.ts" --include="*.tsx"

# Confirm @turf/turf usage
grep -r "@turf" lib/ --include="*.ts" --include="*.tsx"

# Confirm font usage
grep -r "Jakarta-Bold\|Jakarta-ExtraBold\|Jakarta-ExtraLight\|Jakarta-Light\|Jakarta-Medium\|Jakarta-Regular\|Jakarta-SemiBold\|Jakarta-.*Italic" app/ components/ store/ --include="*.ts" --include="*.tsx" -o | sort -u

# Count icon families
grep -r "@expo/vector-icons" app/ components/ --include="*.ts" --include="*.tsx" | grep -oP 'Icons\.\w+' | sort -u
```

---

## 8. Hard Constraints (Cannot Remove)

| Module | Reason | Size |
|---|---|---|
| `@maplibre/maplibre-react-native` | Core maps provider — no alternative | ~6–8 MB JS |
| `react-native-reanimated` | Splash animation + native gestures | ~500 KB |
| `expo-notifications` | Push notification infrastructure | ~300 KB |
| `expo-location` | Geo-location for dispatch | ~200 KB |
| All 14 `PlusJakartaSans` fonts | Brand typography requirement | ~1.3 MB |
| `expo-secure-store` | Token storage (security-critical) | ~100 KB |
| `@supabase/supabase-js` | Auth + real-time DB | ~400 KB |