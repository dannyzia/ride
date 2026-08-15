---

# Rider Flow UI/UX Rethink — Core Booking Loop (Light-First)

> **Date:** 2026-08-13  
> **Scope:** 5 screens — the complete rider booking-to-completion loop  
> **Design Principle:** System-follows-device. `isDark = useIsDark()` (hook in `lib/useAppearance.ts`; resolves `'system'` via `useColorScheme()`). Default theme = `'system'`.  
> **Screenshot Reference:** Services Hub (dark — to be converted to light)

---

## 🛑 ORCHESTRATOR VERIFICATION (READ FIRST — supersedes any conflicting text below)

**Verified against the live codebase on 2026-08-13 by the Orchestrator.** This plan was authored *without* codebase access. Where any section below conflicts with this banner, **this banner wins.** Kimi's visual/design intent below remains valid; the *technical* claims are corrected here.

## ✅ IMPLEMENTATION STATUS (2026-08-14) — IMPLEMENTED & independently verified

Plan 02 is **implemented**. The Orchestrator verified it line-level, not on the coding model's say-so.

**Verified clean:**
- **TASK A** — `useIsDark()` in `lib/useAppearance.ts` (default `'system'`, resolves via `useColorScheme`); `grep 'theme === ["'']dark["'']' app/ components/` → **0 matches**. Toggle on every screen except `SplashAnimation`.
- **TASK B** — `app/api/ride/nearby-drivers+api.ts`: `await parseJsonBody`; `catch (e: unknown)` (no `any` except the allowed Drizzle cast on `vehicle_type`); `estimated_wait_minutes: number | null` (never fabricates); `NEARBY_RING_K` mirrors `dispatch.ts` (`DISPATCH_H3_RING_K` env default 60).
- **ride-tracking** — complete state → "Rate Your Driver" → `rate-driver?rideId=`; **no inline rating, no rider PIN** (PIN is driver-side, verified).
- **finding-driver** — `AbortController` + interval cleanup; 5s poll; prolonged-empty after 12 polls; count/ETA row only on `count > 0`; Cancel = clear store + `router.back()` (no fake cancel API).
- **rate-driver** — `rideId` param + fallback; `GET /api/ride/{id}`; loading/error/retry/empty; Ionicons stars; tip cap 0–2000; double-submit guard; tip non-blocking.

**⚠️ Home was implemented EXPANDED, not "restyle only" — accepted by owner after review:**
The Home correction below locked "restyle only / custom sheet / no `@gorhom` / hardcoded mock values." The **actual implementation (commit `230fc82d`, +908 lines) is expanded**:
- `@gorhom` BottomSheet; calls `/api/ride/estimate` for **real** fares/ETA; reads `service` param → filters sub-categories; `stops` state.
- `SUBCATEGORIES` duplication **deduped** → `category` field + `getVehicleTypesByCategory()` in `lib/vehicleTypes.ts` (single source of truth); `has_ac` derived from the canonical def.
- `handleBook` is **NOT wired** to `/api/ride/request` (navigates to finding-driver only).
- → The inline "restyle only" Home correction + the IDLE/DESTINATION/VEHICLE/CONFIRM VOID markers are **superseded by this reality, for Home only**. Other screens' corrections stand. (This means plan 02a's *core* feature — category→sub-category filtering — is now implemented; see plan 02a.)

**Explicit follow-ups (deliberately NOT in this pass):**
1. **Wire `handleBook` → `POST /api/ride/request`** to actually create a ride + trigger dispatch (money/dispatch — separate scoped task). Until then the loop navigates but does not book.
2. **rate-driver `feedback`** — spec wanted a feedback input; implementation submits `{ rating, role }` only (tip via separate `/api/ride/{id}/tip`).
3. **finding-driver** defaults `selectedVehicleType || "car_economy"` when no selection — minor.
4. i18n (Bengali), reduced-motion for the pulse, a11y labels — deferred polish.

**Minor debt:** endpoint's nested catch is redundant (functional, not a bug); one `&apos;` in an `Alert` string (cosmetic).

### Scope decisions (confirmed by owner)
1. **Unify theming via a single `useIsDark()` hook** — `'system'` follows the **device** via `useColorScheme()` (owner: "what the Phone System has"). Sweep ALL screens/components to use it (not just the 5 screens). See **TASK A**.
2. **Build new endpoint** `POST /api/ride/nearby-drivers` for the Finding-Driver count/ETA. See **TASK B**.
3. **Follow the separate rating flow:** remove the inline rating from `ride-tracking`, route `complete → rate-driver`, add tip chips to `rate-driver`.

### Critical corrections (plan says → truth)
| # | Plan claim | ❌ Wrong because | ✅ Verified truth |
|---|-----------|------------------|-------------------|
| 1 | per-file `isDark = theme === "dark" \|\| theme === "system"` | **~48 files** (two variants — `|| "system"` and plain `=== "dark"`) each guess differently; `useAppearance` default is now `'system'`; `|| "system"` *forces dark* (it does NOT read the device). Splash and AuthLayout already disagree → first-launch flash | Add ONE `useIsDark()` hook (`useColorScheme()`); every screen/component uses it (TASK A). `'system'` follows the device |
| 2 | Home "Uses `RideLayout`" + snap-point heights (18%/92%/…) | Home does **NOT** use `RideLayout`/`@gorhom/bottom-sheet`; it uses `<Map />` + a custom absolute-positioned sheet | Keep the custom sheet; **restyle colors only**; ignore the % heights |
| 3 | Dark map source unclear | `assets/map-styles/barikoi-dark.json` **does exist**, but `Map.tsx` uses the **remote** `useBarikoiMapStyle(isDark)` hook (and already resolves `'system'` via `Appearance.getColorScheme()`) | Keep `useBarikoiMapStyle(isDark)` for consistency; the local asset is a bundled/offline fallback option |
| 4 | Finding-Driver shows nearby count + ETA | Current file is a 26-line stub; **no nearby-drivers API exists** | Build `POST /api/ride/nearby-drivers` (TASK B); **never fabricate numbers** — show "Searching…" on failure |
| 5 | Rating is only Screen 5 | `ride-tracking` ALREADY has API-wired inline rating in its `complete` state | Per decision #3: remove inline rating from tracking; `complete → rate-driver` |
| 6 | rate-driver uses `rideId` param + tip chips | Current uses `useRiderStore.activeRide` + emoji stars, routes → `/ride-completed` | Rewrite: read `rideId` via `useLocalSearchParams`; `GET /api/ride/{id}` for driver; tip chips; on submit → `services-hub` |
| 7 | Nav param `category=bike` | Code sends `service=`; `home` currently reads **neither** | Keep `service` param; do NOT rename. Home now **reads** it to pre-highlight the IDLE chip (`large_car`→`xl`); full sub-category **filtering** stays deferred (plan 03) |
| 8 | Button radius 12px / 56px | `CustomButton` is shared, hard-coded `rounded-full`/`min-h-[58px]` | **Do not mutate** `CustomButton`; use it as-is or a local `TouchableOpacity` |
| 9 | Typography tokens 28/15/13/11 | Not in the `typography` scale | Use literal `fontSize` + `fontFamily` strings (codebase convention) |

### Non-negotiable rules (verified)
- `const isDark = useIsDark();` (from `lib/useAppearance.ts`) — resolves `'system'` via `useColorScheme()`. **Never** hand-write `theme === "dark"`, `|| "system"`, or any per-file `isDark` expression.
- Map style: `useBarikoiMapStyle(isDark)` only.
- H3 only via `@/lib/h3.ts` (`getH3Ring`/`getH3Cell`) — never import `h3-js` elsewhere.
- `*_bdt` = integer paisa; `/100` only at display.
- New endpoint is **read-only**; follow `app/api/ride/request+api.ts` boilerplate (`verifySupabaseToken`, `parseJsonBody`, snake_case, `{error,message}` errors).
- No `console.log` (`@/lib/logger`); no `any`/`@ts-ignore` (Drizzle `as any` enum casts excepted).

### Resolved decisions (locked by owner — implement exactly as specified)
1. **Theming** — `'system'` **follows the device** (owner: "what the Phone System has"). Implement ONE `useIsDark()` hook using `useColorScheme()`; every screen/component (incl. `SplashAnimation`, `AuthLayout`, `ThemeToggle`) uses it. See **TASK A**. This replaces the old "light-first" principle.
2. **Home IDLE** — restyle current content only (keep category buttons + Recent rides). Do **NOT** add Saved Places chips (deferred). **Read `service` param to pre-highlight the matching chip** (`large_car`→`xl`, ~3 lines); full filtering deferred (plan 03).
3. **Home DESTINATION** — restyle the single `BarikoiAutocomplete` only. Do **NOT** add pickup+stops multi-field (deferred).
4. **Finding-Driver empty/loading/error** — keep pulsing, show "Searching for nearby drivers…", hide count/ETA. The count/ETA row appears **only** after a successful response with `count > 0`. Loading, failure, and `count=0` all look identical (pulse + "Searching…").
5. **Ride-Tracking `complete`** — remove ALL inline rating; show fare card ("Pay ৳X cash", `surfaceBg`, centered, large `primary` amount) + a primary, full-width, 56px "Rate Your Driver" button → `rate-driver?rideId=`.
6. **Theme-toggle policy** — every screen gets a toggle **except `SplashAnimation`** (follows device via `useIsDark()`, no toggle). Auth screens via `AuthLayout showThemeToggle`; the 5 rider screens via a local `Ionicons` button (top-right). See **TASK A**.

---

## Selected Screens (The Core Loop)

| # | Screen | File Path | Why Selected |
|---|--------|-----------|-------------|
| 1 | **Services Hub** | `app/(main)/(customer)/services-hub.tsx` | Entry point. Screenshot shows current dark state. |
| 2 | **Home / Booking** | `app/(main)/(customer)/(tabs)/home/index.tsx` | Core interaction. Map + bottom sheet state machine. Most complex rider screen. |
| 3 | **Finding Driver** | `app/(main)/(customer)/finding-driver/index.tsx` | Post-book waiting state. Needs delight + clarity. |
| 4 | **Ride Tracking** | `app/(main)/(customer)/ride-tracking/[ride_id].tsx` | Active ride. Safety-critical. Map + driver card + ETA. |
| 5 | **Rate Driver** | `app/(main)/(customer)/rate-driver/index.tsx` | Post-ride. Feedback loop. Stars + tip + block. |

**Out of scope (for now):** Settings, profile, ride history, scheduled rides, promos, wallet, SOS, chat, add-tip, cancel-reason, etc.

---

## Global Rules for ALL 5 Screens

### 1. Theme Logic (system follows device)
> ⚠️ **ORCHESTRATOR CORRECTION:** not "light-first". Default theme is `'system'` and **follows the device**. Use the shared hook — never hand-write an `isDark` expression.
```tsx
import { useIsDark } from "@/lib/useAppearance";
const isDark = useIsDark(); // resolves 'system' via useColorScheme()
```

### 2. Color Token Mapping
| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Screen background | `colors.bgLight` (#F8FAFC) | `colors.bgDark` (#181A20) |
| Card / surface | `colors.surfaceLight` (#FFFFFF) | `colors.surfaceElevatedDark` (#1C1E23) |
| Border | `colors.borderLight` (#E5E7EB) | `colors.borderDark` (#35383F) |
| Primary text | `colors.textPrimaryLight` (#1C1E23) | `colors.textPrimaryDark` (#FFFFFF) |
| Secondary text | `colors.textSecondaryLight` (#6B7280) | `colors.textSecondaryDark` (#9CA3AF) |
| Disabled / placeholder | `colors.textDisabledLight` (#D1D5DB) | `colors.textDisabledDark` (#555555) |
| Primary action | `colors.primary` (#0CC25F) | `colors.primary` (#0CC25F) |
| Danger / error | `colors.danger` (#E31D1C) | `colors.danger` (#E31D1C) |

### 3. Typography Scale
| Use | Size | Weight | Font |
|-----|------|--------|------|
| Screen title / greeting | 28px | Bold | Jakarta-Bold |
| Section header | 18px | SemiBold | Jakarta-SemiBold |
| Body / input text | 15px | Medium | Jakarta-Medium |
| Caption / subtitle | 13px | Regular | Jakarta-Regular |
| Micro-copy | 11px | Regular | Jakarta-Regular |

### 4. Spacing & Touch Targets
- Minimum touch target: **48x48dp**
- Card border radius: **16px**
- Input border radius: **12px**
- Button border radius: **12px**
- Section gap: **24px**
- Inner padding: **16px**

### 5. StatusBar
- Light mode: `barStyle="dark-content"`, `backgroundColor={colors.bgLight}`
- Dark mode: `barStyle="light-content"`, `backgroundColor={colors.bgDark}`
- Each screen owns its own StatusBar

### 6. Map Theming
> ⚠️ **ORCHESTRATOR CORRECTION (revised — Qwen caught an error):** `assets/map-styles/barikoi-dark.json` **does exist**, but `Map.tsx` currently uses the **remote** `useBarikoiMapStyle(isDark)` hook (and already resolves `'system'` correctly via `Appearance.getColorScheme()`). Keep the hook for consistency; the local asset is available as a bundled/offline fallback:
> ```ts
> import { useBarikoiMapStyle } from "@/utils/mapUtils";
> const mapStyleURL = useBarikoiMapStyle(isDark); // returns remote Barikoi light/dark style URL
> ```
- Light mode: `useBarikoiMapStyle(false)` (remote `osm-liberty` style)
- Dark mode: `useBarikoiMapStyle(true)` (remote `barikoi-dark` style)

---

## SCREEN 1: Services Hub

### Current State (from Screenshot)
- Dark background (#181A20)
- "Good Afternoon" — large white text
- Location pin + "Current Location" — green pin, gray text
- "What service do you need?" — white text
- 2x2 grid: Bike, CNG, Car, Large Cars
- Each card: circular icon container + label + subtitle

### Rethink: Light-First Services Hub

#### Wireframe
```
[StatusBar] dark-content
|
|  Good Afternoon
|  [📍] Current Location
|
|  What service do you need?
|
|  ┌─────────┐ ┌─────────┐
|  │  [icon] │ │  [icon] │
|  │  Bike   │ │  CNG    │
|  │ Fast &  │ │ Auto-   │
|  │affordable│ │rickshaw │
|  └─────────┘ └─────────┘
|
|  ┌─────────┐ ┌─────────┐
|  │  [icon] │ │  [icon] │
|  │  Car    │ │ Large   │
|  │Comfortable│ │ Cars   │
|  │  ride   │ │Groups & │
|  │         │ │luggage  │
|  └─────────┘ └─────────┘
|
|  [Recent Rides — optional]
```

#### Component Breakdown

**A. Header Section**
- Greeting: "Good Morning" / "Good Afternoon" / "Good Evening" based on hour
- Location row: `Ionicons "location"` (color: `colors.primary`) + "Current Location"
- Both left-aligned, no back button

**B. Section Title**
- "What service do you need?" — `textPrimary`, 18px SemiBold

**C. Category Grid (2x2)**
- Each card:
  - Background: `surfaceBg`
  - Border: 1px `borderColor`
  - Border radius: 16px
  - Padding: 20px
  - Icon container: 56x56 circle, background = `primaryLight` (#E6F7EE), icon color = `primary`
  - Label: 16px Bold, `textPrimary`
  - Subtitle: 13px Regular, `textSecondary`
  - Active state: scale 0.98 + border color = `primary`
  - Shadow (light only): `shadow-sm`

**D. Optional: Recent Rides Section**
- Only show if user has completed rides in last 7 days
- Horizontal scroll of small cards
- "See all" link → rides history

#### Theme Logic
```tsx
const bg = isDark ? colors.bgDark : colors.bgLight;
const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
const borderColor = isDark ? colors.borderDark : colors.borderLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
```

#### Navigation
- Tap any category → `router.push('/(main)/(customer)/(tabs)/home')` with the existing `service` param (do **NOT** use `category` — see Correction #7)

---

## SCREEN 2: Home / Booking Screen

### Current State
- Full-screen map
- Bottom sheet state machine: IDLE → DESTINATION → PICKUP → VEHICLE → CONFIRM → FINDING

> ⚠️ **ORCHESTRATOR CORRECTION:** `home/index.tsx` does **NOT** use `RideLayout` or `@gorhom/bottom-sheet`. It renders `<Map />` (from `@/components/Map`) plus a **custom absolute-positioned sheet** (`StyleSheet`, no snap points). **Ignore the per-state height percentages below (18%/92%/35%/50-80%/70-90%)** — they describe `@gorhom` snap points that do not exist here. **Restyle colors only; keep the custom sheet and the state machine.** Do **not** wire `handleBookNow` to `/api/ride/request` (out of scope — preserve the existing stub transition). **IDLE & DESTINATION: restyle current content only** (keep category buttons + Recent rides; keep the single `BarikoiAutocomplete`). Do **NOT** add Saved Places chips or pickup+stops multi-field — both deferred (owner decision). **Minimal param-read (IN scope, ~3 lines):** read `service` via `useLocalSearchParams` and **pre-highlight** the matching IDLE category chip — chip keys are `bike`/`cng`/`car`/`xl`, but services-hub sends `large_car`, so map `large_car`→`xl`. This fixes the "my selection was ignored" feel. Do **NOT** filter the vehicle list — full sub-category filtering stays deferred (plan 03).

### Rethink: Light-First Booking Flow

**Keep the state machine. Only change colors and styling.**

#### State-by-State Breakdown

**STATE: IDLE (18% height)**
> ⚠️ **ORCHESTRATOR CORRECTION (per locked "restyle only" + decision #2):** the "Saved Places chips" bullets that were here are **VOID** — Saved Places is deferred. Restyle the **current** IDLE content only: the "Where to?" input, the horizontal **category buttons** (Bike/CNG/Car/XL), and the **Recent rides** list. Pre-highlight the chip matching the `service` param (`large_car`→`xl`).
- "Where to?" input (tappable, not editable) — restyle
- `Ionicons "search"` inside input, color = `textDisabled`
- Horizontal category buttons (existing) — restyle + pre-highlight matching `service`
- Recent rides list (existing) — restyle

**STATE: DESTINATION (92% height)**
> ⚠️ **ORCHESTRATOR CORRECTION (per locked decision #2 — single destination only):** the "Stops / multi-field / Add stop" bullets that were here are **VOID**. This state restyles the **single** `BarikoiAutocomplete` destination input only. Do NOT add pickup+stops multi-field or an "Add stop" button (deferred).
- Single destination input (restyled) — `surfaceBg`, `borderColor`, 12px radius
- Active field gets `primary` border
- BarikoiAutocomplete results: `surfaceBg` cards, 12px radius, 1px `borderColor`

**STATE: PICKUP (35% height)**
- Large map pin centered above sheet
- "Confirm this pickup location" title
- Address: 15px Medium, `textPrimary`
- "Confirm Pickup" button: primary, full width

**STATE: VEHICLE (50-80% height)**
> ⚠️ **ORCHESTRATOR CORRECTION (per locked "restyle only"):** the price/ETA on these cards are the **existing hardcoded mock values** already in `home/index.tsx` (৳45/৳55/…, "3 min"). Restyle them only — do NOT wire dynamic pricing (a real fare needs a destination via `ride/estimate`; deferred — see plan 03).
- Vertical list of sub-category cards (restyle existing)
- Each card: vehicle icon + name + (existing mock) ETA + price + "Select"
- Selected: `primary` border, `primaryLight` background tint
- Unselected: `surfaceBg`, `borderColor` border

**STATE: CONFIRM (70-90% height)**
> ⚠️ **ORCHESTRATOR CORRECTION (per locked "restyle only"):** the "Promo input" and "Tip selector" bullets that were here are **VOID** — promos are deferred (see deferred-features table) and tipping lives in `rate-driver`, NOT here. Restyle the **current** CONFIRM content only (existing ride-summary card + "Book Now" button). Cash-only this pass.
- Ride-summary card (existing) — restyle (`surfaceBg`, `borderColor`)
- Pickup → destination rows (existing) — restyle
- "Book Now" button (existing) — restyle; stays an unwired stub this pass (do NOT wire to `/api/ride/request`)

---

## SCREEN 3: Finding Driver

### Rethink: Light-First Finding Driver

> ⚠️ **ORCHESTRATOR CORRECTION:** Current file (`finding-driver/index.tsx`) is a **26-line stub** (just `ActivityIndicator` + emoji + cancel, using NativeWind `dark:` classes). This is a **full rebuild**, not a restyle. Use `useIsDark()` (from `@/lib/useAppearance`), not NativeWind `dark:` classes. Map: use `<Map />` from `@/components/Map` + `useBarikoiMapStyle(isDark)`. **Nearby count + ETA require the new `POST /api/ride/nearby-drivers` endpoint (TASK B)** — read `pickupLat`/`pickupLng` AND `selectedVehicleType` (an enum member — `bike_basic`/`cng`/`car_economy`/…, NOT a category like `bike`) from `@/store/useRiderStore`. **Guard: if `selectedVehicleType` OR pickupLat/Lng is null, do NOT call the endpoint** — the current `handleVehicleSelect` is a stub that doesn't persist the selection and Book Now is unwired, so this is commonly null in this pass; just show pulse + "Searching…". When present, send it with the rider's Supabase Bearer token (as `ride-tracking` does), poll ~5s. **Never fabricate numbers.** Loading, failure, and `count=0` are identical: pulse + "Searching for nearby drivers…" with the count/ETA row hidden; the count/ETA row appears **only** after a successful response with `count > 0`. Reanimated (~3.17.4) is installed for the pulse.

#### Wireframe
```
[Map — user location only]
|
|      [pulse animation]
|
|  ┌─────────────────────┐
|  | Finding driver...   |
|  |                     |
|  | [○ ○ ○] 3 nearby   |
|  |                     |
|  | Estimated wait:     |
|  | 2-4 minutes         |
|  |                     |
|  | [Cancel Booking]    |
|  └─────────────────────┘
```

#### Component Breakdown

**A. Map Area (top 40%)**
- Full-width map centered on pickup
- User location marker with **pulse ring animation**
- Pulse: 2 concentric circles, `primary` color, expanding and fading, 2s loop

**B. Bottom Card (60%)**
- Background: `surfaceBg`
- Title: "Finding your driver..." — 20px Bold
- Animated dots: 3 dots pulsing sequentially
- "Nearby drivers" row: car icon + count
- "Estimated wait" row: clock icon + time
- **"Cancel Booking" button**: danger variant (red)

#### Animation Spec
```tsx
// Pulse ring
const pulseAnim = useSharedValue(0);
useEffect(() => {
  pulseAnim.value = withRepeat(
    withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
    -1, false
  );
}, []);
```

---

## SCREEN 4: Ride Tracking

### Rethink: Light-First Ride Tracking

> ⚠️ **ORCHESTRATOR CORRECTION:** `ride-tracking/[ride_id].tsx` is already a **complete 792-line screen** with real WebSocket + API logic and uses `useIsDark()` + `useBarikoiMapStyle(isDark)`. **Do NOT strip the `en_route`/`arrived`/`in_progress` logic** — it is more complete than the wireframe below; apply the light/dark token mapping only. **Rating-flow change (decision #3):** the `complete` state currently has inline stars+tip+feedback+`handleSubmitRating` — **remove all of that** and replace with a fare card ("Ride Complete" / `Pay ৳{(fare_bdt/100)} cash`, `surfaceBg`, centered, large `primary` amount) + a primary, full-width, 56px **"Rate Your Driver"** button → `router.push("/(main)/(customer)/rate-driver?rideId=" + ride_id)`. Delete the now-unused `rating`/`feedback`/`tipAmount`/`submittingRating` state and `handleSubmitRating`/`StarRating`. Keep `handleCancel`, `handleShare`, WS listener, `SOSButton`. **PIN / start-ride is DRIVER-side, NOT rider-side:** the rider *displays* `ride.otp` (= `start_pin`) to share with the driver (already shown in the `arrived` state — "Share PIN … with driver"); the **driver** enters it (`utils-server` WS `start_ride` / `POST /api/ride/:id/start`) and the server emits `ride:started` → rider auto-transitions to `in_progress`. **Do NOT add a rider PIN-entry sub-state** — it's inverted and has no rider backend. (Verified vs `master-testing-prompt.md` Phases E/F + `app/api/ride/[id]/start+api.ts` + `utils-server/index.ts` ~L983–1023.)

**3 Sub-states:** (a 4th, `complete`, now routes to rate-driver instead of rating inline)

1. **DRIVER_EN_ROUTE** — Driver heading to pickup
2. **DRIVER_ARRIVED** — Driver at pickup
3. **RIDE_IN_PROGRESS** — Heading to destination

#### Wireframe (DRIVER_EN_ROUTE)
```
[Map — route line, driver marker, user marker]
|
|  ┌─────────────────────┐
|  | [Photo] John D.     |
|  | ★ 4.8 | CNG         |
|  | DHAKA-1234          |
|  |                     |
|  | ETA: 3 min          |
|  |                     |
|  | [📞] [💬] [🛡️ SOS]  |
|  └─────────────────────┘
```

#### Component Breakdown

**A. Map Area (top 55%)**
- Route line: `primary` color, 4px width
- Driver marker: animated car icon
- User marker: static

**B. Driver Card (bottom 45%)**
- Driver photo: 56x56 circle, 2px `primary` border
- Name: 16px Bold
- Rating + vehicle + plate row
- ETA: `primary` color
- Action buttons (3, equally spaced):
  - Call: `primary` bg, white icon
  - Chat: `surfaceBg` + border
  - SOS: `danger` bg, white icon

**DRIVER_ARRIVED:** ETA → "Your driver has arrived" (Bold, `primary`)

**RIDE_IN_PROGRESS:** Show destination + "Share trip" button

---

## SCREEN 5: Rate Driver

### Rethink: Light-First Rate Driver

> ⚠️ **ORCHESTRATOR CORRECTION:** Current file uses NativeWind `dark:` classes + `useRiderStore.activeRide` + emoji stars and routes → `/ride-completed`. **Rewrite** using `useIsDark()`: read `rideId` via `useLocalSearchParams()` (fallback `useRiderStore.activeRide?.id`); fetch ride+driver via `GET ${API_URL}/api/ride/${rideId}` (returns `{ ride, driver }`) with Bearer token; stars use `Ionicons` (`colors.amber` selected / `textDisabled` unselected); add tip chips ৳20/50/100/Custom; keep the existing `/api/rider/block` POST/DELETE logic; submit via `POST /api/ride/${rideId}/rate` with `{ rating, feedback, tip_bdt: tip*100, role:"rider" }` (rate API already accepts `tip_bdt`); on success → `router.replace("/(main)/(customer)/services-hub")`. **⚠️ Orphan:** this makes `/(main)/(customer)/ride-completed` (which exists) unreachable from this flow — owner follow-up: delete it or rewire elsewhere.

#### Wireframe
```
[StatusBar]

  How was your ride?

  [Driver Photo]
  John D.
  CNG | DHAKA-1234

  ☆ ☆ ☆ ☆ ☆
  Tap to rate

  Add a tip (optional)
  [৳20] [৳50] [৳100] [Custom]

  [Feedback text input]

  [ ] Block this driver

  [Submit Rating]
```

#### Component Breakdown

**A. Header**
- "How was your ride?" — 28px Bold, centered
- Driver photo: 64x64 circle
- Name + vehicle + plate

**B. Star Rating**
- 5 stars: `Ionicons "star-outline"` (unselected) / `Ionicons "star"` (selected)
- Unselected: `textDisabled`
- Selected: `amber` (#F59E0B)
- Size: 40px, touch target 48x48
- Label: "Tap to rate" → "Poor"/"Fair"/"Good"/"Very Good"/"Excellent"

**C. Tip Selector**
- Chips: ৳20, ৳50, ৳100, "Custom"
- Unselected: `surfaceBg` + border
- Selected: `primary` bg + white text
- Subtext: "Tip goes directly to your driver"

**D. Feedback Input**
- Multiline, 4 lines
- Placeholder: "Tell us about your ride (optional)"
- `surfaceBg`, `borderColor`, radius 12px

**E. Block Driver Toggle**
- Checkbox + "Block this driver"
- Subtext: "You won't be matched with this driver again"

**F. Submit Button**
- "Submit Rating" — primary, 56px height
- Disabled until rating >= 1
- On press: `router.replace('/(main)/(customer)/services-hub')`

---

## Navigation Flow

```
Services Hub (1)
  ↓ Tap category
Home/Booking (2)
  ↓ Tap "Book Now"
Finding Driver (3)
  ↓ Driver accepts
Ride Tracking (4)
  ↓ Ride completes
Rate Driver (5)
  ↓ Submit
→ Services Hub (1)
```

**Navigation Rules:**
> ⚠️ **ORCHESTRATOR CORRECTION:** keep the existing `service` param key (do **not** rename to `category`); `home` does not currently read any param. `2 → 3` (Book Now → finding-driver) is **not wired** to the real ride API in this pass — preserve the existing in-screen stub transition as a known follow-up.
- 1 → 2: `router.push('/(main)/(customer)/(tabs)/home?service=bike')` (existing key; not consumed yet)
- 2 → 3: `router.push('/(main)/(customer)/finding-driver')` (deferred wiring — see correction)
- 3 → 4: `router.replace('/(main)/(customer)/ride-tracking/${rideId}')`
- 4 → 5: `router.push('/(main)/(customer)/rate-driver?rideId=${rideId}')` (rate-driver reads this param)
- 5 → 1: `router.replace('/(main)/(customer)/services-hub')`

---

## ⚠️ ORCHESTRATOR TASKS (must-do, in addition to the 5 screens)

### TASK A — Unify theming: ONE `useIsDark()` hook across ALL screens/components
`'system'` must follow the device. There is currently **no single source of truth** — `SplashAnimation` (`|| "system"` → forces dark) and `AuthLayout` (`=== "dark"` → forces light) already disagree, causing a first-launch flash. Fix it everywhere with one hook.

**Step 0 — keep the default `'system'` (do NOT revert to `'light'`):** `useAppearance` default MUST stay `'system'` (verified in `lib/useAppearance.ts`). This supersedes plan 01's stale "default `'light'`" instruction (see plan 01's supersession banner). If an agent reverts it, `useIsDark()` resolves light on every device and the "follow device" policy silently fails while every checklist item still passes.

**Step 1 — add the hook to `lib/useAppearance.ts`:**
```ts
import { useColorScheme } from "react-native";
export function useIsDark(): boolean {
  const theme = useAppearance((s) => s.theme);
  const device = useColorScheme();            // 'light' | 'dark' | null
  return theme === "system" ? device === "dark" : theme === "dark";
}
```

**Step 2 — in EVERY file below, replace** any hand-written `isDark` derivation **with** `const isDark = useIsDark();` (import from `@/lib/useAppearance`). Two variants exist in the wild — `theme === "dark" || theme === "system"` AND plain `theme === "dark"` — **both must go**. Drop the now-unused `const { theme } = useAppearance()` where it existed only to compute `isDark` (keep `theme`/`setTheme` where a toggle needs them).
- **`components/`:** `SplashAnimation.tsx`, `AuthLayout.tsx`, `ThemeToggle.tsx`, `CustomButton.tsx`, `OtpInput.tsx`, `VehicleCategoryCard.tsx`, `SOSButton.tsx`, `SchedulePicker.tsx`, `RideOfferSheet.tsx`, `RideLayout.tsx`, `RideCard.tsx`, `PaymentWebView.tsx`, `LoadingRider.tsx`, `FloatingNavMenu.tsx`, `FareBreakdownSheet.tsx`, `BarikoiAutocomplete.tsx`, `DocumentUploadCard.tsx`, `ErrorFindDriver.tsx`, `CountdownRing.tsx`, `DriverStatusBadge.tsx`, `ChatScreen.tsx`, `DriverNavigation.tsx`, **`Map.tsx`** (already resolves `'system'` via `Appearance.getColorScheme()` — replace its inline ternary with `useIsDark()`), **`InputField.tsx`** (hacky `&& true` — replace with `useIsDark()`)
- **`app/(auth)/`:** `welcome.tsx`, `phone-entry.tsx`, `login.tsx`, `otp-verify.tsx`, `register.tsx`, `forgot-password.tsx`, `enable-location.tsx`, `notifications-permission.tsx`, `driver-enable-location.tsx`, `driver-walkthrough-1.tsx`, `driver-walkthrough-2.tsx`, `driver-walkthrough-3.tsx`, `driver-splash.tsx`, `driver-welcome.tsx`, `driver-notifications-permission.tsx`, `walkthrough-1.tsx`, `walkthrough-2.tsx`, `walkthrough-3.tsx`
- **`app/(main)/(customer)/`:** `services-hub.tsx`, `ride-tracking/[ride_id].tsx`, `(tabs)/home/index.tsx`, `(tabs)/rides/index.tsx`
- **`app/(main)/(rider)/` (DRIVER APP — see resolved policy below):** `index.tsx`, `packages.tsx`, `onboarding.tsx`, `select-active-vehicle.tsx`

> ✅ **RESOLVED — driver-app theme (owner):** `(rider)/` is the **driver** app. Drivers **follow the device** via `useIsDark()` (NOT force-light). For sunlight, **every driver screen exposes the same Moon/Sun toggle** as the login screen (top-right `Ionicons` `sunny-outline`/`moon-outline`, cycling `light ↔ dark`) so a driver can manually flip to light. (Full driver-screen toggle coverage is a separate workstream — this plan is the rider loop — but the policy is: follow-device + toggle, never force.)

**Theme-toggle policy (locked):** every screen gets a toggle **except `SplashAnimation`** (follows device, no toggle). Auth screens: `<AuthLayout showThemeToggle>` (top-right sun/moon; cycles `light ↔ dark`). The 5 rider screens (`services-hub`, `home`, `finding-driver`, `ride-tracking`, `rate-driver`): a local `Ionicons` toggle button, top-right. **Driver screens (`(rider)/…`):** the same Moon/Sun `Ionicons` toggle (see `login`/`AuthLayout` for the pattern) so drivers can switch to light in sunlight. `ThemeToggle.tsx` (settings) keeps its 3-option `light`/`dark`/`system` picker.

After the sweep: `grep -rn 'theme === "dark"' app/ components/` → **0 matches** (catches both variants + `Map.tsx`/`InputField.tsx` inline ternaries).

### TASK B — Create `app/api/ride/nearby-drivers+api.ts` (READ-ONLY)
Read-only count of dispatchable drivers near a pickup. Use `app/api/ride/request+api.ts` as the boilerplate template (auth/Zod/`parseJsonBody`/error shape).
```ts
import { db } from "@/src/db";
import { drivers } from "@/src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { getH3Ring } from "@/lib/h3";            // h3-js wrapper — never import h3-js directly
import { haversineDistance } from "@/utils/mapUtils";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";

const NEARBY_RING_K = 16; // MATCH dispatch.ts DISPATCH_RING_K (~5km at res 9) so the count matches what dispatch can actually reach — a smaller K would show "0 nearby" while a match still succeeds

const bodySchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, bodySchema);   // ⚠️ MUST await — parseJsonBody is async (lib/parseBody.ts); omitting await makes parsed a Promise → 500 on every request
  if (!parsed.ok) return parsed.response;
  const { pickup_lat, pickup_lng, vehicle_type } = parsed.data;
  try {
    await verifySupabaseToken(request);                // throws { status: 401 } on bad/no token
  } catch (e) {   // honor AGENTS.md "no any" — preferred over the boilerplate's `catch (err: any)`; TS infers `unknown` in strict mode
    return Response.json({ error: "unauthorized", message: "Invalid token" }, { status: (e as { status?: number })?.status ?? 500 });
  }
  try {
    const cells = getH3Ring(pickup_lat, pickup_lng, NEARBY_RING_K);
    const rows = await db.select({ id: drivers.id, lat: drivers.last_location_lat, lng: drivers.last_location_lng })
      .from(drivers)
      .where(and(
        eq(drivers.is_online, true),
        eq(drivers.status, "active"),                 // 'active', NOT 'approved'
        eq(drivers.vehicle_type, vehicle_type as any),
        inArray(drivers.h3_cell_res9, cells),
        sql`NOT EXISTS (SELECT 1 FROM rides WHERE rides.driver_id = drivers.id AND rides.status IN ('matched','driver_arrived','in_progress') AND rides.updated_at > now() - interval '3 hours')`,
        // NOTE: dispatch.ts does NOT filter on_break either — this mirrors dispatch (faithful parity).
      ));
    const count = rows.length;
    let estimated_wait_minutes: number | null = null;  // null when count==0 OR no finite coords → UI hides the row (never fabricate a "5")
    const dists = rows
      .map(r => (r.lat != null && r.lng != null ? haversineDistance(pickup_lat, pickup_lng, Number(r.lat), Number(r.lng)) : Infinity))
      .filter(d => Number.isFinite(d));                // never Math.min(...Infinity)
    if (dists.length > 0) {
      const nearestKm = Math.min(...dists);
      estimated_wait_minutes = Math.max(2, Math.round((nearestKm / 15) * 60)); // ~15 km/h Dhaka traffic
    }
    return Response.json({ count, estimated_wait_minutes });  // count=0 or no-coords → wait=null; UI shows "Searching…"
  } catch {
    return Response.json({ error: "nearby_failed", message: "Could not query nearby drivers" }, { status: 500 });
  }
}
```
snake_case fields; `{error,message}` error shape; no stack traces. The `drivers` filter mirrors `utils-server/dispatch.ts` candidate pool (lines ~160–171) — **mirror the SQL, do not import from the utils-server process** (it is a separate package with an in-memory index not reachable from Expo API routes).

## Files the Coding Agent MUST Read First

1. `app/(main)/(customer)/services-hub.tsx`
2. `app/(main)/(customer)/(tabs)/home/index.tsx`
3. `app/(main)/(customer)/finding-driver/index.tsx`
4. `app/(main)/(customer)/ride-tracking/[ride_id].tsx`
5. `app/(main)/(customer)/rate-driver/index.tsx`
6. `components/RideLayout.tsx`
7. `components/BarikoiAutocomplete.tsx`
8. `components/VehicleCategoryCard.tsx`
9. `components/FareBreakdownSheet.tsx`
10. `components/CustomButton.tsx`
11. `theme/goRide.ts`
12. `lib/useAppearance.ts`
13. `app/api/ride/request+api.ts` — **boilerplate template** for the new endpoint (auth/Zod/`parseJsonBody`/error shape)
14. `utils/mapUtils.ts` — `useBarikoiMapStyle(isDark)`, `haversineDistance`
15. `lib/h3.ts` — `getH3Ring()` (only allowed h3-js surface)
16. `lib/auth.ts` — `verifySupabaseToken`
17. `store/useRiderStore.ts` — `pickupLat`/`pickupLng` for the nearby-drivers call
18. `utils-server/dispatch.ts` — reference for the "available driver" filter (mirror the SQL only; do not import)

---

## Implementation robustness (edge cases — non-negotiable)
- **Home chip highlight — DERIVE, don't `useState`:** compute `const activeKey = service === "large_car" ? "xl" : service` straight from the `useLocalSearchParams()` value and use it for the chip style. Do NOT copy it into `useState(param ?? null)` — that goes stale if Home stays mounted while the user re-picks a service in Services Hub.
- **Finding-Driver null coords:** `useRiderStore.pickupLat/Lng` can be null (deep link / direct entry). Guard: if null, do NOT call `/api/ride/nearby-drivers` and do NOT center the map on `(0,0)` — keep the pulse + "Searching…" and fall back to device GPS or show an error. Never send `lat=0, lng=0`.
- **Finding-Driver polling lifecycle:** the ~5s poll must use an `AbortController` (cancel in-flight on unmount) and clear its interval in the `useEffect` cleanup — no `setState` after unmount, no background fetching.
- **rate-driver fetch states:** `GET /api/ride/${rideId}` (verified to return `{ ride, driver }`) can still fail or return no driver. Add a loading state, an error/retry banner, and an empty fallback. Read `driver.full_name`, `driver.vehicle_type`, `driver.vehicle_plate`, `driver.avatar_url` (note: `avatar_url` is currently `null` from the API — render an initial fallback).
- **Fare reference:** use **`ride.fare_bdt`** (on the ride payload, derived from `fare_breakdown.total_bdt`) — not a bare `fare_bdt`.
- **rate-driver custom tip:** the "Custom" chip opens a small numeric input (integer taka, min 0); convert to paisa (`* 100`) on submit like the preset chips.
- **StatusBar on map screens** (home, finding-driver, ride-tracking): use `translucent` + `backgroundColor` matching the sheet/surface and respect safe-area insets so the map doesn't render under the status bar (`SplashAnimation.tsx` is the in-repo reference for `translucent`).
- **Finding-Driver Cancel:** with Book Now unwired there is **no ride to cancel** — Cancel = abort the polling `AbortController` + `router.back()` (+ clear `useRiderStore` pickup). Do NOT invent a `/api/ride/.../cancel` call.
- **Finding-Driver prolonged empty:** after ~60s / ~12 polls of `count=0` (or no `selectedVehicleType`), show a soft state ("Drivers are busy — keep waiting or try another vehicle type") instead of an infinite blank pulse.
- **rate-driver submit robustness:** double-submit guard (disable the button while `POST /api/ride/{id}/rate` is in flight); on failure show error/retry and don't navigate away; cap the custom tip at a sane max (e.g. ≤ ৳2000), integer taka. Block (`/api/rider/block`) is **independent** of rating — surface its own success/error; one failing must not block the other.
- **AuthLayout toggle:** the `showThemeToggle` prop **already exists** on `AuthLayout` (verified) — for auth screens, TASK A just ensures each passes `<AuthLayout showThemeToggle>` (`welcome`, `phone-entry`, `login`, `otp-verify`, `register`, `forgot-password`, `enable-location`, `notifications-permission`).
- **TASK A sweep list = known offenders, not exhaustive:** the authoritative gate is the grep (`theme === "dark"` → 0). If any file outside the listed set contains the pattern, sweep it too.
- **`useBarikoiMapStyle` contract:** `useBarikoiMapStyle(isDark: boolean) → styleURL`. The hook does NOT resolve `'system'` itself — the caller resolves it (via `useIsDark()`) and passes the boolean. `Map.tsx`'s internal `Appearance.getColorScheme()` ternary is removed in the sweep (it's in the TASK A list) and replaced by `useIsDark()`.

## Deferred features (do NOT build in this pass — just don't break them)
| Feature | Status | Where |
|---------|--------|-------|
| Scheduled rides | Deferred | `schedule-ride/index.tsx` (exists) |
| Cancel ride + reason | Deferred | `cancel-reason/index.tsx` (exists) |
| Apply promos | Deferred | `apply-promos/index.tsx` (exists) |
| Emergency SOS (full screen) | Deferred | `emergency-sos/index.tsx` (exists); `SOSButton` is already inline in ride-tracking |
| Add tip (standalone) | Deferred | `add-tip/index.tsx` (exists); tip UI is now in `rate-driver` |
| Share trip | Inline only — no standalone screen | `ride-tracking` `handleShare` (verified: no `share-trip/` route exists) |
| Ride PIN entry | **Driver app, not this plan** | rider displays `ride.otp` to share; the **driver** enters it. See ride-tracking correction. |

## Verification Checklist

- [ ] All 5 screens follow the device theme by default (`'system'`); toggle overrides to explicit light/dark
- [ ] All 5 screens render correctly in both light and dark
- [ ] `grep -rn 'theme === "dark"' app/ components/` → **0 matches** (catches both `|| system` + `=== "dark"` variants and `Map.tsx`/`InputField.tsx` inline ternaries; all use `useIsDark()`) (TASK A)
- [ ] `useIsDark()` exists in `lib/useAppearance.ts` and resolves `'system'` via `useColorScheme()`
- [ ] `useAppearance` default is `'system'` (NOT reverted to `'light'`) — Step 0
- [ ] `SplashAnimation` and `AuthLayout` agree on first launch (no dark→light flash)
- [ ] Every screen except `SplashAnimation` has a theme toggle
- [ ] `POST /api/ride/nearby-drivers` returns `{ count, estimated_wait_minutes }`; 401 unauth; 400 bad body (TASK B)
- [ ] `ride-tracking` `complete` state shows fare card + "Rate Your Driver" → opens `rate-driver?rideId=`
- [ ] `rate-driver` reads `rideId` param, submits tip+rating → lands on `services-hub`
- [ ] Finding-Driver shows real count/ETA only on success with `count > 0`; otherwise pulse + "Searching…" (never fabricated)
- [ ] Home reads `service` param and pre-highlights the matching IDLE chip (`large_car`→`xl`)
- [ ] Driver-app theme: follows device via `useIsDark()` + Moon/Sun toggle on driver screens (NOT force-light) — see TASK A
- [ ] Book Now stays an unwired stub **by design** this pass (loop closure deferred) — confirm intentional
- [ ] `ride-completed` screen: deletion/rewire decided (orphaned by rate-driver → services-hub)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] No `console.log` — use `logger`
- [ ] Map style switches with theme (`useBarikoiMapStyle`)
- [ ] All touch targets >= 48x48dp
- [ ] StatusBar color matches screen background

---

**Please confirm if you want me to proceed with having the coding agent implement these 5 screens, or if you want to adjust the selection first.**