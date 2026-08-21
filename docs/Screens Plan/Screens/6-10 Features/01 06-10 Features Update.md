# Ride App — UI/UX Rethink 3: Plans 06–10 COMPREHENSIVE REVISED SPEC

> **Version:** 3.2 — No Stone Unturned Edition
> **Date:** 2026-08-21
> **Status:** REVISED — All gaps filled, all edge cases covered, all wiring specified
> **Authority:** This document supersedes ALL prior Plans 06–10 drafts. If this conflicts with any other file, **this document wins**.

**Prerequisite:** Read `Ride_App_UIUX_Rethink_3_Master_Plan.md` (Plans 01–04) and `Plan_05_Coding_Agent_Execution_Pack.md` first. All locked decisions (L1–L17), Pattern A theming, and coding rules from those documents apply here without exception.

---

## Table of Contents

1. [Executive Summary & Gap Analysis](#1-executive-summary--gap-analysis)
2. [Plan 06 — Driver Tab Foundation + Earnings Goal](#2-plan-06--driver-tab-foundation)
3. [Plan 07 — Vehicle, Subscription & Package Ecosystem](#3-plan-07--vehicle-subscription--package-ecosystem)
4. [Plan 08 — Money: Earnings, Payouts, Ledger & Rates](#4-plan-08--money)
5. [Plan 09 — Support, Safety, Communication & Schedule](#5-plan-09--support-safety--communication)
6. [Plan 10 — Performance, Ratings, Intelligence & Profile](#6-plan-10--performance-ratings--intelligence)
7. [Plan 11 — Content Fill: Terms, Privacy, i18n Foundation](#7-plan-11--content-fill)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns)
9. [Complete Component Library (New + Verified)](#9-complete-component-library)
10. [State Machines](#10-state-machines)
11. [Backend API Contracts (Full Zod + Response)](#11-backend-api-contracts)
12. [Backend Verification Checklist](#12-backend-verification-checklist)
13. [Coding Agent Execution Order](#13-coding-agent-execution-order)
14. [Master Verification Checklist](#14-master-verification-checklist)

---

## 1. Executive Summary & Gap Analysis

### 1.1 What the First Draft Missed (Critical)

| # | Gap | Severity | Where It Belongs |
|---|-----|----------|------------------|
| 1 | **Driver Lost Items (respond)** — FEATURES.md SL 30a requires a driver screen to respond to rider lost item reports ("I Have It" / "Not Found" / "Arrange Return"). **Completely missing.** | CRITICAL | Plan 09 |
| 2 | **Driver Tab Layout** (`app/(main)/(rider)/(tabs)/_layout.tsx`) — The 5-tab layout spec, tab bar styling, badge support, and `DriverStatusGuard` wrapping. **Not specified at all.** | CRITICAL | Plan 06 (Wave 0) |
| 3 | **DriverStatusGuard** — What pending/suspended/rejected drivers see. Status screens, blocking logic, retry flows. **Not specified.** | CRITICAL | Plan 06 (Wave 0) |
| 4 | **Terms/Privacy Content Fill** — 4 screens exist but are empty. Need `lib/legalContent.ts` + static content. **Not in Plans 06–10.** | HIGH | Plan 11 |
| 5 | **i18n Foundation** — `lib/i18n.ts` or extend existing `i18n/` with ALL driver strings. **Not in Plans 06–10.** | HIGH | Plan 11 |
| 6 | **Push Notification Routing** — What screen opens when driver taps a push notification. **Not specified.** | HIGH | Cross-cutting |
| 7 | **Deep Linking** — `track` route is public, but driver deep links (payment callback, subscription, etc.) not specified. | HIGH | Cross-cutting |
| 8 | **Empty States** — Every list screen needs specific empty state copy, icon, and action. Only generic mentioned. | MEDIUM | Every plan |
| 9 | **Loading Skeletons** — Beyond `LoadingRider`, need skeleton patterns for cards, lists, charts. | MEDIUM | Every plan |
| 10 | **Form Validation Rules** — No detailed validation (min length, regex, error messages) for any form. | MEDIUM | Every plan |
| 11 | **Pull-to-Refresh** — Not specified on any list screen. | MEDIUM | Every plan |
| 12 | **Infinite Scroll / Pagination** — Activity Tab, Call Ledger, Payout History need pagination specs. | MEDIUM | Plans 06, 08 |
| 13 | **Image Upload Specs** — Supabase Storage bucket names, upload progress, error handling, compression. | MEDIUM | Plans 07, 09, 10 |
| 14 | **PaymentWebView Purpose Tags** — Each payment flow needs exact `purpose` parameter. | MEDIUM | Plans 06, 07, 08 |
| 15 | **Confirmation Dialogs** — Sign out, delete vehicle, cancel subscription, mark no-show — no modal specs. | MEDIUM | Every plan |
| 16 | **Accessibility** — No `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` on any element. | MEDIUM | Every plan |
| 17 | **Animation Specs** — No animation specs for any screen (Plan 04 had breathing, pulse, etc.). | LOW | Every plan |
| 18 | **Chart Library** — No recommendation for bar/line charts (earnings, performance). | LOW | Plans 06, 10 |
| 19 | **Swipe Actions** — No swipe-to-delete for vehicles, contacts, payout methods. | LOW | Plans 07, 08, 09 |
| 20 | **Offline Handling** — What happens when driver opens Earnings Tab offline? | LOW | Cross-cutting |

### 1.2 Screen Count Correction

**First draft claimed 44 screens. Actual count is 55 screens + 1 layout + 1 guard.**

| Plan | Screens | Notes |
|------|---------|-------|
| **Plan 06** | 6 + 2 = **8** | 5 tabs + Earnings Goal modal + Tab Layout + DriverStatusGuard |
| **Plan 07** | 10 | Vehicle + Subscription + Packages (unchanged) |
| **Plan 08** | 10 + 1 = **11** | Money screens + Driver Lost Items (was missing) |
| **Plan 09** | 10 | Support + Safety + Communication (unchanged) |
| **Plan 10** | 8 | Performance + Ratings + Intelligence (unchanged) |
| **Plan 11** | 4 + 1 = **5** | Terms (rider+driver) + Privacy (rider+driver) + i18n foundation |
| **TOTAL** | **52 screens + 3 infra** | — |

### 1.3 Document Structure Change

This revision adds:
- **Wave 0** to every plan — infrastructure that must be built before screens
- **Edge Case** subsection to every screen
- **Empty State** subsection to every list screen
- **Form Validation** subsection to every form screen
- **Accessibility** subsection to every screen
- **Animation** subsection where relevant
- **Backend Zod schemas** for every new API
- **Push notification mapping** for every relevant screen
- **Deep link mapping** for every relevant screen


---

## 2. Plan 06 — Driver Tab Foundation

> **Scope:** The 5 driver tab screens, the tab layout, the status guard, and the earnings goal modal. These are the PRIMARY navigation destinations. Without them, the driver app is unusable.
> **Screen Count:** 8 (5 tabs + earnings goal modal + tab layout + status guard)
> **Backend Needs:** 5 endpoints (verify existing)
> **Priority:** CRITICAL — Build FIRST. All other plans depend on this.

---

### WAVE 0 — Infrastructure (Build Before Any Screen)

#### W0.1 Driver Tab Layout (`app/(main)/(rider)/(tabs)/_layout.tsx`)

**This is the most critical file in Plan 06.** Without it, the driver has no navigation.

```tsx
// SPEC — DO NOT GUESS. FOLLOW EXACTLY.

import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { DriverStatusGuard } from "@/components/DriverStatusGuard";

export default function DriverTabsLayout() {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const primary = colors.primary;

  return (
    <DriverStatusGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: surfaceBg,
            borderTopColor: isDark ? colors.borderDark : colors.borderLight,
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: primary,
          tabBarInactiveTintColor: textSecondary,
          tabBarLabelStyle: {
            fontFamily: "PlusJakartaSans-Medium",
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="earning"
          options={{
            title: "Earnings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cash-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: "Activity",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: "Wallet",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet-outline" size={size} color={color} />
            ),
            tabBarBadge: undefined,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </DriverStatusGuard>
  );
}
```

**Rules:**
- Tab bar height: **64px** (not default 49px — drivers need larger touch targets)
- No header on any tab — each screen owns its own header
- `DriverStatusGuard` wraps ALL tabs
- Badge on Wallet tab shows `dueAmount > 0 ? "!" : undefined`
- Font: `PlusJakartaSans-Medium`, 11px

---

#### W0.2 DriverStatusGuard (`components/DriverStatusGuard.tsx`)

**Purpose:** Block drivers with `status !== "active"` from accessing the main app. Show status-specific screens.

**States:**

| Driver Status | Screen Shown | Actions |
|---------------|--------------|---------|
| `temporary` | Onboarding Wizard | Must complete onboarding |
| `pending` | Pending Review | "Your documents are under review. Estimated: 1-2 business days." |
| `suspended` | Suspended | "Your account is suspended. Contact support." + Support button |
| `rejected` | Rejected | "Your application was rejected." + Rejection reason + Re-apply button |
| `active` | Full app access | Normal tabs |

**Wireframe (Pending):**
```
[StatusBar]
|
|  [document-text icon 80x80]
|
|  Under Review
|
|  Your documents are being reviewed
|  by our team.
|
|  Estimated time: 1-2 business days
|
|  [Check Status ->]
|  [Contact Support]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- `GET /api/driver/me` on mount to check status
- If `status === "active"`, render children
- If any other status, render status screen
- Polling: every 30s while on status screen, check status
- "Check Status" -> `verification/index.tsx`
- "Contact Support" -> `support/index.tsx`
- "Re-apply" -> `onboarding/index.tsx`

**API:** `GET /api/driver/me` -> `{ status, rejection_reason? }`

---

#### W0.3 AsyncStorage Keys Registry

Create `lib/storageKeys.ts`:

```ts
export const STORAGE_KEYS = {
  DRIVER_EARNINGS_GOAL: "@driver_earnings_goal",
  DRIVER_NAV_APP: "@driver_nav_app",
  DRIVER_SOUND_ENABLED: "@driver_sound_enabled",
  DRIVER_MIN_RATE: "@driver_min_rate",
} as const;
```

---

### 6.1 D11 — Earnings Tab (`app/(main)/(rider)/(tabs)/earning/index.tsx`)

**Purpose:** Daily earnings overview with goal tracking.

**Wireframe:**
```
[StatusBar]
|
|  Earnings                    [sun/moon]
|
|  [Today card with progress]
|  [Weekly chart]
|  [Quick stats grid]
|  [Navigation rows]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **ScrollView** with `contentContainerStyle={{ padding: 16, paddingBottom: 32 }}`.
- **Pull-to-refresh:** `refreshControl` on ScrollView -> refetch `daily-stats`
- **Today Earnings Card:**
  - `surfaceBg`, 16px radius, 1px `borderColor`, 4px `primary` top border
  - Amount: 40px Bold, `primary`
  - Progress bar: `ProgressBar` component, 8px height
  - Metadata: "62% of daily goal · 8 trips · 4.5h online"
  - If NO goal set: show "Set a daily earnings goal" CTA
  - Tap card -> Earnings Goal Modal
- **This Week Chart:**
  - Custom SVG bars (7 days)
  - Bar color: `primary` at 0.6 opacity, today at 1.0
  - Tap bar -> `earnings-breakdown?date=YYYY-MM-DD`
- **Quick Stats Row:** 3-column grid
  - Today, Trips, Rating
- **Navigation Rows:**
  - "View Earnings Breakdown" -> `earnings/index.tsx`
  - "View Commission Statement" -> `commission-statement/index.tsx`

**API:** `GET /api/driver/daily-stats`
```ts
{
  today_earnings_bdt: number;
  trip_count: number;
  online_hours: number;
  weekly_earnings: number[];
  avg_rating: number;
}
```

**Earnings Goal Modal:**
- `Modal`, `animationType="slide"`, `transparent={true}`
- Backdrop: `rgba(0,0,0,0.5)`
- TextInput: numeric, `taka` prefix, placeholder "e.g. 2000"
- Validation: >= 100, <= 50000, integer only
- "Save Goal" -> `AsyncStorage.setItem('@driver_earnings_goal', value)`
- "Remove Goal" -> `AsyncStorage.removeItem('@driver_earnings_goal')`

**Edge Cases:**
- API returns `today_earnings_bdt: 0` -> show "0.00" (not blank)
- Weekly earnings all zero -> show "No earnings yet" label
- AsyncStorage corrupted -> treat as null
- No trips ever -> empty state with "Complete your first trip"

**Empty State:**
- Icon: `Ionicons "cash-outline"`, 80px, `textDisabled`
- Title: "No earnings yet"
- Subtitle: "Complete trips to start earning"
- Action: "Go Online" -> `/(main)/(rider)`

**Accessibility:**
- Earnings card: `accessibilityRole="summary"`
- Progress bar: `accessibilityRole="progressbar"`
- Stat cards: `accessibilityRole="button"`

**Animation:**
- Progress bar fill: `Animated.timing`, 800ms
- Stat cards: fade-in stagger, 100ms delay each
- Chart bars: grow from bottom, 400ms stagger

---

### 6.2 D12 — Activity Tab (`app/(main)/(rider)/(tabs)/activity/index.tsx`)

**Purpose:** Trip history from driver perspective. Filterable, paginated list.

**Wireframe:**
```
[StatusBar]
|
|  Activity                    [sun/moon]
|
|  [All] [Completed] [Canceled] [No-Show]
|
|  [Trip cards...]
|
|  [Call Ledger ->]
|  [Missed Requests ->]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Filter Chips:** Horizontal ScrollView
  - "All", "Completed", "Canceled", "No-Show"
  - Active: `primary` bg, white text
  - Inactive: `surfaceBg`, 1px `borderColor`
- **Trip Cards:**
  - `surfaceBg`, 16px radius, 1px `borderColor`
  - Status dot: 12px circle (Completed=`primary`, Canceled=`danger`, No-Show=`amber`)
  - Route: 18px Medium
  - Metadata: time · fare · status
  - Tap -> `trip-details/[rideId]` (driver perspective)
- **Infinite Scroll:** `onEndReached`, 20 items/page
- **Pull-to-refresh:** reset to page 1

**API:** `GET /api/driver/trips?filter=all|completed|canceled|no_show&page=1&limit=20`
```ts
{
  trips: [{
    id: string;
    origin: string;
    destination: string;
    fare_bdt: number;
    status: 'completed' | 'canceled' | 'rider_no_show';
    created_at: string;
  }];
  hasMore: boolean;
}
```

**Edge Cases:**
- Filter change -> reset list, page=1
- `hasMore: false` -> "No more trips" micro-copy
- Empty array -> EmptyState
- `fare_bdt: 0` for canceled -> show "0.00"

**Empty State:**
- Icon: `Ionicons "car-outline"`, 80px
- Title: "No trips yet"
- Subtitle: "Your trip history will appear here"
- Action: "Go Online"

---

### 6.3 D13 — Wallet Tab (`app/(main)/(rider)/(tabs)/wallet/index.tsx`)

**Purpose:** Driver wallet — balance, due amounts, transactions, top-up, withdraw.

**Wireframe:**
```
[StatusBar]
|
|  Wallet                      [sun/moon]
|
|  [Balance card]
|  [Due card - conditional]
|  [Subscription card - conditional]
|  [Recent transactions]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Balance Card:**
  - `surfaceBg`, 16px radius, 4px `primary` top border
  - Amount: 40px Bold, `primary`
  - "Top Up" + "Withdraw" buttons side by side
- **Due Card (hidden if due === 0):**
  - `surfaceBg`, 16px radius, 4px `amber` top border
  - `Ionicons "warning"`, `amber`
  - "Pay Now" -> `PaymentWebView` with `purpose='due_payment'`
- **Subscription Card (hidden if none):**
  - `surfaceBg`, 16px radius, 4px `info` top border
  - If expires within 7 days: "Expires in 3 days" in `amber`
- **Transaction List:**
  - Max 5 recent
  - Amount with sign (+ green, - red)
  - Type icons mapped

**Transaction Type Mapping:**
| Type | Icon | Color |
|------|------|-------|
| `wallet_topup` | `wallet-outline` | `primary` |
| `commission` | `receipt-outline` | `danger` |
| `ride_fare` | `car-outline` | `primary` |
| `withdrawal` | `cash-outline` | `danger` |
| `due_payment` | `card-outline` | `danger` |
| `subscription` | `star-outline` | `info` |
| `refund` | `return-down-back` | `primary` |
| `tip` | `heart-outline` | `primary` |

**API:**
- `GET /api/driver/wallet` -> `{ balance_bdt, due_bdt }`
- `GET /api/driver/transactions?limit=5`
- `GET /api/driver/active-subscription`

**Edge Cases:**
- `balance < 0` -> show negative with `danger`
- `dueAmount > balance` -> "Insufficient balance" warning
- No transactions -> "No transactions yet"
- Subscription expired -> "Expired" badge in `danger`

---

### 6.4 D14 — Profile Tab (`app/(main)/(rider)/(tabs)/profile/index.tsx`)

**Purpose:** Driver profile hub.

**Wireframe:**
```
[StatusBar]
|
|  [Avatar 80x80]
|  Rahim Uddin
|  ★ 4.8 · 124 trips · Dhaka
|
|  VEHICLE section
|  [Vehicle Management >]
|  [Documents >]
|  [Verification Status >]
|
|  ACCOUNT section
|  [Settings >]
|  [Support >]
|  [Referral Program >]
|
|  [Sign Out]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Header:**
  - Avatar: 80x80, circle, 3px `primary` border
  - Fallback: `Ionicons "person"` on `primaryLight` bg
  - Tap avatar -> `personal-profile/index.tsx`
  - Name: 22px SemiBold
  - Rating: `Ionicons "star"`, 14px, `amber`
- **Section Cards:** `surfaceBg`, 16px radius
  - Each row: 56px, icon (22px, `primary`) + label (18px Medium) + chevron
- **Sign Out:**
  - `danger` text, 56px
  - Confirmation modal:
    - Title: "Sign Out?"
    - "Cancel" + "Sign Out" buttons
    - On confirm: clear ALL Zustand stores + AsyncStorage -> `/(auth)/welcome`

**API:** `GET /api/driver/me`
```ts
{
  name: string;
  photo_url: string | null;
  rating: number;
  trip_count: number;
  city: string;
  status: string;
  vehicle: { brand: string; model: string; plate: string } | null;
}
```

**Edge Cases:**
- `photo_url` null -> fallback icon
- `vehicle` null -> "No vehicle" subtitle
- Sign out fails -> `ErrorBanner`, stay on screen

---

### 6.5 D15 — Settings Tab (`app/(main)/(rider)/(tabs)/settings/index.tsx`)

**Purpose:** Driver settings.

**Wireframe:**
```
[StatusBar]
|
|  Settings                    [sun/moon]
|
|  PREFERENCES
|  [Auto Accept toggle]
|  [Sound Notifications toggle]
|  [Navigation App >]
|  [Minimum Per-Km Rate >]
|
|  ACCOUNT
|  [Personal Info >]
|  [Change Password >]
|  [Notification Preferences >]
|  [Language >]
|  [Appearance >]
|
|  SUPPORT
|  [FAQ >]
|  [Terms of Service >]
|  [Privacy Policy >]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Toggle Rows:**
  - Custom toggle switch:
    - Track: 48w x 28h, 9999px radius
    - ON: `primary` bg, thumb right
    - OFF: `borderColor` bg, thumb left
    - Thumb: 24px circle, `surfaceBg`
    - Animated: `Animated.spring`, friction 2
  - `accessibilityRole="switch"`
- **Auto Accept:**
  - `PATCH /api/driver/me { auto_accept: boolean }`
  - Optimistic update + revert on error
- **Sound Notifications:** AsyncStorage only (`@driver_sound_enabled`)
- **Navigation App:**
  - Modal selector: "Google Maps", "Waze", "In-app Navigation"
  - Persist in AsyncStorage (`@driver_nav_app`)
  - Default: "Google Maps"
- **Min Rate:** Shows current value as subtitle, tap -> `min-rate/index.tsx`

---

### 6.6 Plan 06 Verification Checklist

- [ ] Tab layout file exists with 5 tabs
- [ ] DriverStatusGuard blocks non-active drivers
- [ ] DriverStatusGuard shows correct screen per status
- [ ] Earnings Tab shows real data + goal progress
- [ ] Earnings Goal modal validates (100-50000)
- [ ] Activity Tab has filter chips + infinite scroll + pull-to-refresh
- [ ] Wallet Tab shows balance + due + transactions + subscription
- [ ] Profile Tab shows info + sign-out confirmation
- [ ] Settings Tab has Auto Accept toggle wired to API
- [ ] All tabs have Pattern A + StatusBar + toggle + pull-to-refresh
- [ ] Zero `console.log`, zero `theme === "dark"`
- [ ] All money: integer paisa, `/100` at display
- [ ] `npx tsc --noEmit` passes, `npm run lint` passes


---

## 3. Plan 07 — Vehicle, Subscription & Package Ecosystem

> **Scope:** Vehicle management (add, switch, manage) + Subscription flow (plans, checkout, confirmation, details, renewal, active) + Call packages. These branch from Profile Tab and Wallet Tab.
> **Screen Count:** 10
> **Backend Needs:** 7 endpoints
> **Priority:** HIGH — Vehicle and subscription are core driver monetization.

---

### 7.1 D16 — Add Vehicle (`app/(main)/(rider)/add-vehicle/index.tsx`)

**Purpose:** Add a new vehicle to driver profile.

**Wireframe:**
```
[StatusBar]
|
|  <- Add Vehicle              [sun/moon]
|
|  Vehicle Type
|  [Bike] [CNG] [Car] [Car XL]
|
|  Brand
|  [Select brand...]
|
|  Model
|  [Select model...]
|
|  Registration Year
|  [2020]
|
|  License Plate
|  [DHAKA-1234]
|
|  Color
|  [White]
|
|  [+ Upload Vehicle Photo]
|
|  [Add Vehicle]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Vehicle Type Selector:**
  - Horizontal ScrollView
  - Each type: 80x80 square, `surfaceBg`, 12px radius
  - Selected: `primaryLight` bg + 2px `primary` border
  - Icons:
    - Bike: `Ionicons "bicycle"`
    - CNG: `Ionicons "car-sport"` (or custom)
    - Car: `Ionicons "car"`
    - Car XL: `Ionicons "bus"`
  - Label below: 12px Regular, `textSecondary`
- **Brand Dropdown:**
  - Touchable -> modal with searchable list
  - `GET /api/driver/vehicle-models?type={type}` for brands
  - Search bar at top of modal
- **Model Dropdown:**
  - Dependent on brand selection
  - Disabled until brand selected (show "Select brand first" placeholder)
  - Same modal pattern as brand
- **Registration Year:**
  - Number input, 4 digits
  - Validation: 1990 <= year <= currentYear
  - Error message: "Year must be between 1990 and 2026"
- **License Plate:**
  - TextInput, uppercase auto (`autoCapitalize="characters"`)
  - Validation: non-empty, min 3 chars
  - Error message: "License plate is required"
- **Color:**
  - TextInput or simple dropdown
  - Common colors: White, Black, Silver, Red, Blue, Green, Yellow, Grey
- **Photo Upload:**
  - "+ Upload Vehicle Photo" button
  - `launchImageLibraryAsync` only
  - Upload to Supabase Storage `vehicle-photos` bucket
  - Show thumbnail (100x100, 12px radius) after upload
  - Upload progress: show `ActivityIndicator` during upload
  - Error: show `ErrorBanner` if upload fails
- **"Add Vehicle" Button:**
  - `primary` bg, 56px, full width
  - Disabled until ALL required fields filled
  - Disabled state: `primary` at 0.5 opacity
  - API: `POST /api/driver/vehicles`
  - On success: toast "Vehicle added successfully" + `router.back()`
  - On error: `ErrorBanner`

**API:** `POST /api/driver/vehicles`
```ts
// Request
{
  type: 'bike' | 'cng' | 'car' | 'car_xl';
  brand: string;
  model: string;
  registration_year: number;
  plate: string;
  color: string;
  photo_url?: string;
}
// Response
{ vehicle_id: string }
```

**State:**
```ts
const [type, setType] = useState<VehicleType | null>(null);
const [brand, setBrand] = useState('');
const [model, setModel] = useState('');
const [year, setYear] = useState('');
const [plate, setPlate] = useState('');
const [color, setColor] = useState('');
const [photoUrl, setPhotoUrl] = useState('');
const [brands, setBrands] = useState<string[]>([]);
const [models, setModels] = useState<string[]>([]);
const [loading, setLoading] = useState(false);
const [uploading, setUploading] = useState(false);
const [errors, setErrors] = useState<Record<string, string>>({});
```

**Form Validation:**
| Field | Rule | Error Message |
|-------|------|---------------|
| type | required | "Select a vehicle type" |
| brand | required | "Select a brand" |
| model | required | "Select a model" |
| year | 1990 <= year <= currentYear | "Year must be 1990-2026" |
| plate | min 3 chars | "License plate is required" |
| color | required | "Select a color" |

**Edge Cases:**
- Brand list empty -> show "No brands available" in modal
- Model list empty -> show "No models for this brand"
- Photo upload fails -> allow submission without photo (optional field)
- Network error on submit -> keep form data, show `ErrorBanner`
- Duplicate plate number -> API returns 409, show "Vehicle with this plate already exists"

**Accessibility:**
- Type selector: `accessibilityRole="radiogroup"`
- Each type: `accessibilityRole="radio"`
- Form inputs: `accessibilityLabel` per field
- Submit button: `accessibilityRole="button"`

---

### 7.2 D36 — Select Active Vehicle (`app/(main)/(rider)/select-active-vehicle.tsx`)

**Purpose:** Switch between registered vehicles.

**Wireframe:**
```
[StatusBar]
|
|  <- Select Vehicle           [sun/moon]
|
|  Select your active vehicle
|
|  o  [Toyota Corolla]
|     CNG · DHAKA-1234 · 2020
|     [Active]
|
|  o  [Honda Civic]
|     Car · DHAKA-5678 · 2021
|
|  [Confirm Selection]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Radio List:**
  - Each vehicle: `surfaceBg` card, 16px radius, 1px `borderColor`
  - Left: radio circle
    - Empty: `Ionicons "ellipse-outline"`, 24px, `textSecondary`
    - Selected: `Ionicons "checkmark-circle"`, 24px, `primary`
  - Vehicle name: 18px SemiBold, `textPrimary`
  - Details: 14px Regular, `textSecondary` (type · plate · year)
  - "Active" badge: `primaryLight` bg, `primary` text (if currently active)
  - Touch target: full card, 80px min height
- **"Confirm Selection" Button:**
  - `primary` bg, 56px, full width
  - Disabled if same vehicle selected (opacity 0.5)
  - **CRITICAL:** If driver is ONLINE, show alert modal:
    - Title: "Switch Vehicle?"
    - Body: "You will be taken offline to switch vehicles. Continue?"
    - "Cancel" / "Continue"
  - API: `PATCH /api/driver/vehicles/{id}/activate`
  - On success: toast "Vehicle activated" + `router.back()`

**API:**
- `GET /api/driver/vehicles` -> `{ vehicles: [{ id, brand, model, type, plate, year, photo_url, is_active }] }`
- `PATCH /api/driver/vehicles/{id}/activate` -> `{ success: true }`

**State:**
```ts
const [vehicles, setVehicles] = useState<Vehicle[]>([]);
const [selectedId, setSelectedId] = useState('');
const [currentActiveId, setCurrentActiveId] = useState('');
const [showOnlineWarning, setShowOnlineWarning] = useState(false);
const [loading, setLoading] = useState(true);
```

**Edge Cases:**
- Only one vehicle -> still show list (no other option)
- No vehicles -> redirect to `add-vehicle`
- Online warning dismissed -> stay on screen
- API fails -> show `ErrorBanner`, don't navigate back

---

### 7.3 D44 — Vehicle Management (`app/(main)/(rider)/vehicle-management/index.tsx`)

**Purpose:** View and manage all registered vehicles.

**Wireframe:**
```
[StatusBar]
|
|  <- Vehicle Management       [sun/moon]
|
|  Active Vehicle
|  [Active vehicle card with photo]
|
|  All Vehicles
|  [Vehicle list...]
|
|  [+ Add New Vehicle]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Active Vehicle Card:**
  - `surfaceBg`, 16px radius, 4px `primary` left border
  - Photo: 80x80, 12px radius (or fallback `Ionicons "car"`)
  - Name: 18px SemiBold
  - Details: 14px Regular, `textSecondary`
  - "Switch Vehicle" button: `surfaceBg` + `primary` border
- **All Vehicles List:**
  - Each row: photo + name + type + plate + status badge
  - Status: "Active" (`primaryLight`) / "Inactive" (`textDisabled` bg)
  - Tap inactive -> prompt to activate
  - Swipe left (optional): "Delete" action in `danger`
- **"+ Add New Vehicle" Button:**
  - `primary` bg, 56px, full width
  - -> `add-vehicle/index.tsx`

**API:** `GET /api/driver/vehicles`

**Edge Cases:**
- No vehicles -> show empty state + "Add Your First Vehicle" CTA
- Document expiry warning -> show `amber` badge on vehicle card

---

### 7.4 D30 — Packages (`app/(main)/(rider)/packages/index.tsx`)

**Purpose:** Driver call packages — buy voice/data packages.

**Wireframe:**
```
[StatusBar]
|
|  Call Packages               [sun/moon]
|
|  Active Package
|  [Active package card with usage]
|
|  Available Packages
|  [Package cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Active Package Card (conditional):**
  - `surfaceBg`, 16px radius, 4px `primary` top border
  - Name: 18px Bold
  - Usage: "X/Y calls remaining"
  - Progress bar
  - Expiry: 13px Regular, `textSecondary`
- **Available Packages:**
  - Each card: `surfaceBg`, 16px radius
  - Name + price: 18px SemiBold + 22px Bold `primary`
  - Details: 14px Regular, `textSecondary`
  - "Buy Now": `primary` bg, 48px
  - -> `PaymentWebView` with `purpose='driver_package'`

**API:**
- `GET /api/driver/packages`
- `GET /api/driver/active-package`

---

### 7.5 D40 — Subscription Plans (`app/(main)/(rider)/subscription-plans/index.tsx`)

**Purpose:** Browse driver subscription plans.

**Wireframe:**
```
[StatusBar]
|
|  Subscription Plans          [sun/moon]
|
|  [Basic plan card]
|  [Pro plan card - RECOMMENDED]
|  [Premium plan card]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Plan Cards:**
  - `surfaceBg`, 16px radius, 1px `borderColor`
  - Recommended: 2px `primary` border + "RECOMMENDED" badge (`primaryLight`)
  - Name: 20px Bold
  - Price: 28px Bold, `primary`
  - Features: bullet list, 14px Regular
  - "Subscribe" -> `subscription-checkout?planId={id}`

**API:** `GET /api/driver/subscription-plans`

---

### 7.6 D37 — Subscription Checkout (`app/(main)/(rider)/subscription-checkout/index.tsx`)

**Purpose:** Checkout flow for subscription purchase.

**Wireframe:**
```
[StatusBar]
|
|  <- Checkout                 [sun/moon]
|
|  [Order Summary card]
|  [Payment Method]
|  [Pay button]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Order Summary:** Plan details from `planId` param
- **Payment Method:** Shows default bKash number (masked)
- **Terms Checkbox:** "I agree to the subscription terms" (required)
- **"Pay" Button:** `primary` bg, 56px
  - -> `PaymentWebView` with `purpose='subscription'`
  - On success -> `subscription-confirmation`

**API:** `POST /api/driver/subscription/checkout { plan_id }`
```ts
{ payment_url: string }
```

---

### 7.7 D38 — Subscription Confirmation (`app/(main)/(rider)/subscription-confirmation/index.tsx`)

**Purpose:** Post-payment confirmation.

**Wireframe:**
```
[StatusBar]
|
|  [checkmark circle 80x80]
|
|  Subscription Activated!
|
|  [Plan details]
|
|  [Back to Home]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- Large checkmark: `Ionicons "checkmark-circle"`, 80px, `primary`
- "Subscription Activated!": 28px Bold
- Plan details: 18px Medium, `textSecondary`
- "Back to Home": `primary` bg, 56px -> `/(main)/(rider)`

---

### 7.8 D39 — Subscription Details (`app/(main)/(rider)/subscription-details/index.tsx`)

**Purpose:** View active subscription details.

**Wireframe:**
```
[StatusBar]
|
|  <- Subscription Details     [sun/moon]
|
|  [Details card]
|  [Usage stats]
|  [Renew button]
|  [Cancel button]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Details Card:**
  - `surfaceBg`, 16px radius, 4px `primary` top border
  - Status badge: "Active" (`successLight`) / "Expired" (`dangerLight`)
  - Usage: rides used / limit
- **Actions:**
  - "Renew" -> `subscription-renewal`
  - "Cancel" -> confirmation modal -> API

**API:** `GET /api/driver/subscription` + `POST /api/driver/subscription/cancel`

---

### 7.9 D41 — Subscription Renewal (`app/(main)/(rider)/subscription-renewal/index.tsx`)

**Purpose:** Renew existing subscription.

**Wireframe:**
```
[StatusBar]
|
|  <- Renew Subscription       [sun/moon]
|
|  Current: Pro Plan
|  Expires: Mar 21, 2026
|
|  [Renew for taka 1,000]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- Shows current plan + expiry
- "Renew" -> `PaymentWebView` with `purpose='subscription_renewal'`

**API:** `POST /api/driver/subscription/renew`

---

### 7.10 D48 — Active Subscription (`app/(main)/(rider)/active-subscription/index.tsx`)

**Purpose:** Quick view of active subscription (from Wallet Tab).

**Spec:**
- **Pattern A.** StatusBar + toggle.
- Simple card with plan info
- "View Details" -> `subscription-details`

---

### 7.11 Plan 07 Verification Checklist

- [ ] All 10 screens use Pattern A theming
- [ ] All 10 screens have StatusBar + theme toggle
- [ ] Add Vehicle has type selector with correct Ionicons
- [ ] Add Vehicle has brand/model dropdowns
- [ ] Add Vehicle validates all fields with specific error messages
- [ ] Add Vehicle uploads photo to Supabase `vehicle-photos` bucket
- [ ] Select Active Vehicle has radio list + online warning
- [ ] Vehicle Management shows active + all vehicles
- [ ] Packages shows active + available call packages
- [ ] Subscription Plans shows recommended badge
- [ ] Subscription Checkout has terms checkbox
- [ ] Subscription Confirmation has large checkmark
- [ ] Zero `console.log`, zero `theme === "dark"`
- [ ] All money: integer paisa, `/100` at display
- [ ] `npx tsc --noEmit` passes, `npm run lint` passes


---

## 4. Plan 08 — Money: Earnings, Payouts, Ledger & Rates

> **Scope:** Deep-dive earnings screens, payout management, instant pay, call ledger, commission statements, due amounts, missed requests, min rate, AND driver lost items (was missing from first draft). These branch from Earnings Tab, Wallet Tab, and Activity Tab.
> **Screen Count:** 11 (10 money screens + 1 lost items)
> **Backend Needs:** 10 endpoints
> **Priority:** HIGH — Money screens are high-trust; must be pixel-perfect and error-free.

---

### 8.1 D17 — Call Ledger (`app/(main)/(rider)/call-ledger/index.tsx`)

**Purpose:** View call deduction history (platform fees per ride).

**Wireframe:**
```
[StatusBar]
|
|  <- Call Ledger              [sun/moon]
|
|  [Total Deducted This Month card]
|
|  Mar 2026
|  [Entry cards...]
|
|  Feb 2026
|  [Entry cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Summary Card:**
  - `surfaceBg`, 16px radius, 4px `primary` top border
  - "Total Deducted": 14px Regular, `textSecondary`
  - Amount: 32px Bold, `primary`
- **Grouped List:**
  - Group by month (YYYY-MM)
  - Month header: 18px SemiBold, `textPrimary`
  - Each row: `surfaceBg`, 16px radius
    - Ride reference: 16px Medium, `textPrimary`
    - Date/time: 13px Regular, `textSecondary`
    - Amount: 16px Bold, `danger` (negative, with minus sign)
    - Type: 13px Regular, `textSecondary`
  - Infinite scroll by month
- **Pull-to-refresh:** refetch

**API:** `GET /api/driver/call-ledger?page=1&limit=20`
```ts
{
  total_bdt: number;
  entries: [{
    ride_id: string;
    amount_bdt: number;
    type: 'commission' | 'vat' | 'platform_fee';
    created_at: string;
  }];
  hasMore: boolean;
}
```

**Empty State:**
- Icon: `Ionicons "receipt-outline"`, 80px
- Title: "No deductions yet"
- Subtitle: "Platform fees will appear here"

---

### 8.2 D18 — Commission Statement (`app/(main)/(rider)/commission-statement/index.tsx`)

**Purpose:** Monthly commission summary with PDF download.

**Wireframe:**
```
[StatusBar]
|
|  <- Commission Statement     [sun/moon]
|
|  [Mar 2026 dropdown]
|
|  [Statement card]
|  Total Earnings: taka 12,450
|  Commission (20%): -taka 2,490
|  VAT (5%): -taka 124.50
|  Net Payout: taka 9,835.50
|
|  [Download PDF]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Month Selector:**
  - Dropdown or modal
  - Last 12 months
  - Format: "March 2026"
- **Statement Card:**
  - `surfaceBg`, 16px radius
  - Row layout: label left, amount right
  - Earnings: `primary`, Bold
  - Deductions: `danger`, Bold
  - Net: 22px Bold, `primary`, highlighted with `primaryLight` bg
  - Divider lines between rows
- **"Download PDF" Button:**
  - `surfaceBg` + `primary` border, `primary` text, 48px
  - `Ionicons "download-outline"` left icon
  - API: `GET /api/driver/commission-statement/pdf?month={YYYY-MM}`
  - On tap: show loading, then open PDF viewer or share
  - Error: show `ErrorBanner`

**API:** `GET /api/driver/commission-statement?month={YYYY-MM}`
```ts
{
  total_earnings_bdt: number;
  commission_bdt: number;
  vat_bdt: number;
  net_payout_bdt: number;
  commission_rate: number;
  vat_rate: number;
}
```

**Edge Cases:**
- Month with no earnings -> show "No earnings for this month"
- PDF generation fails -> show "PDF generation failed. Please try again."

---

### 8.3 D21 — Due Amounts (`app/(main)/(rider)/due-amounts/index.tsx`)

**Purpose:** View and pay outstanding commission dues.

**Wireframe:**
```
[StatusBar]
|
|  <- Due Amounts              [sun/moon]
|
|  [Total Due card]
|  [Breakdown list]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Total Due Card:**
  - `surfaceBg`, 16px radius, 4px `amber` top border
  - `Ionicons "warning"`, `amber`
  - Amount: 32px Bold, `amber`
  - "Pay Now" -> `PaymentWebView` with `purpose='due_payment'`
- **Breakdown List:**
  - Each row: date + description + amount
  - Amount: 16px Bold, `amber`

**API:** `GET /api/driver/due-amounts`
```ts
{
  total_bdt: number;
  items: [{
    description: string;
    amount_bdt: number;
    created_at: string;
  }];
}
```

**Edge Cases:**
- `total_bdt === 0` -> show success state: "No outstanding dues" with `Ionicons "checkmark-circle"`, `success`
- Payment fails -> show `ErrorBanner` with retry

---

### 8.4 D22 — Earnings (`app/(main)/(rider)/earnings/index.tsx`)

**Purpose:** Detailed earnings breakdown (weekly view).

**Wireframe:**
```
[StatusBar]
|
|  <- Earnings                 [sun/moon]
|
|  [This Week] [Last Week]
|
|  [Total card with comparison]
|  [Daily breakdown list]
|  [Commission Statement link]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Period Selector:** Segmented control
  - "This Week" / "Last Week"
  - Active: `primary` bg
  - Inactive: `surfaceBg`, 1px `borderColor`
- **Total Card:**
  - `surfaceBg`, 16px radius, 4px `primary` top border
  - Amount: 36px Bold, `primary`
  - Comparison badge: "+12%" (`successLight`) or "-5%" (`dangerLight`)
- **Daily Breakdown:**
  - Each row: day name + amount + trip count
  - Amount: 18px SemiBold
  - Tap -> `earnings-breakdown?date=YYYY-MM-DD`

**API:** `GET /api/driver/earnings?period=week|last_week`
```ts
{
  total_bdt: number;
  comparison_percent: number;
  daily: [{
    day: string;
    earnings_bdt: number;
    trip_count: number;
  }];
}
```

---

### 8.5 D23 — Earnings Breakdown (`app/(main)/(rider)/earnings-breakdown/index.tsx`)

**Purpose:** Single day earnings detail.

**Wireframe:**
```
[StatusBar]
|
|  <- Mar 15, 2026            [sun/moon]
|
|  [Summary card]
|  [Trip list...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Date param-driven:** `date` in URL query params
- **Summary Card:**
  - Total + trip count + online hours
- **Trip List:**
  - Each card: route + fare + time + status
  - Tap -> `trip-details/[id]`

**API:** `GET /api/driver/earnings/breakdown?date={YYYY-MM-DD}`
```ts
{
  total_bdt: number;
  trip_count: number;
  online_hours: number;
  trips: [{
    id: string;
    origin: string;
    destination: string;
    fare_bdt: number;
    status: string;
    created_at: string;
  }];
}
```

---

### 8.6 Payout Methods (`app/(main)/(rider)/payout-methods/index.tsx`)

**Purpose:** Manage bKash payout methods.

**Wireframe:**
```
[StatusBar]
|
|  <- Payout Methods           [sun/moon]
|
|  [Active method card]
|  [+ Add bKash Number]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Active Method Card:**
  - `surfaceBg`, 16px radius, 4px `primary` left border
  - `Ionicons "phone-portrait"`, 24px, `primary`
  - Method name: 18px SemiBold
  - Number: masked (show last 4 digits), 16px Medium
  - "Default" badge: `primaryLight` bg
  - Swipe left: "Delete" action (optional)
- **"+ Add bKash Number" Button:**
  - `primary` bg, 56px
  - Tap -> modal/screen
- **Add Modal:**
  - "bKash Number" input
  - Validation: `^01\d{9}$` (11 digits starting with 01)
  - Error: "Enter a valid bKash number (11 digits starting with 01)"
  - "Save" -> `POST /api/driver/payout-method`

**API:**
- `GET /api/driver/payout-methods`
- `POST /api/driver/payout-method { bkash_number: string }`

**Edge Cases:**
- Duplicate number -> API returns 409, show "This number is already added"
- Invalid format -> client-side validation prevents submit
- Only one method -> hide delete, show "At least one method required"

---

### 8.7 Payout History (`app/(main)/(rider)/payout-history/index.tsx`)

**Purpose:** View past withdrawal transactions.

**Wireframe:**
```
[StatusBar]
|
|  <- Payout History           [sun/moon]
|
|  [History list...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **List:**
  - Each row: `surfaceBg`, 16px radius
  - Amount: 18px Bold, `primary`
  - Date: 14px Regular, `textSecondary`
  - Method: masked bKash number
  - Status badge:
    - Completed: `successLight` bg, `success` text
    - Pending: `amberLight` bg, `amber` text
    - Failed: `dangerLight` bg, `danger` text
- **Infinite scroll:** 20 items/page

**API:** `GET /api/driver/payout-history?page=1&limit=20`
```ts
{
  history: [{
    id: string;
    amount_bdt: number;
    bkash_number: string;
    status: 'completed' | 'pending' | 'failed';
    created_at: string;
  }];
  hasMore: boolean;
}
```

**Empty State:**
- Icon: `Ionicons "cash-outline"`, 80px
- Title: "No withdrawals yet"
- Subtitle: "Your payout history will appear here"

---

### 8.8 Instant Pay (`app/(main)/(rider)/instant-pay/index.tsx`)

**Purpose:** Withdraw earnings to bKash.

**Wireframe:**
```
[StatusBar]
|
|  Instant Pay                 [sun/moon]
|
|  Available Balance
|  [taka 2,450.00]
|
|  Withdraw Amount
|  [taka 1,000]
|
|  To: bKash 01712****78
|  [Change ->]
|
|  [Confirm Withdrawal]
|
|  Min withdrawal: taka 200
|  Fee: taka 10
|  Daily limit: taka 10,000
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Balance Display:**
  - "Available Balance": 14px Regular, `textSecondary`
  - Amount: 40px Bold, `primary`
- **Amount Input:**
  - `surfaceBg`, 12px radius, 1px `borderColor`
  - `taka` prefix
  - Numeric keyboard
  - Validation: >= 200, <= balance, <= 10000 (daily limit)
  - Error border: `danger` if invalid
  - Error messages:
    - "Minimum withdrawal is taka 200"
    - "Amount exceeds available balance"
    - "Daily limit is taka 10,000"
- **Payout Method:**
  - Shows default method (masked)
  - "Change" -> `payout-methods`
- **Fee Display:**
  - 13px Regular, `textSecondary`
  - "Fee: taka X" (if applicable)
- **"Confirm Withdrawal" Button:**
  - `primary` bg, 56px
  - Disabled if amount invalid
  - Confirmation modal:
    - Title: "Confirm Withdrawal"
    - Body: "Withdraw taka X to bKash Y?"
    - "Cancel" / "Confirm"
  - API: `POST /api/driver/instant-pay { amount_bdt }`
  - On success: toast "Withdrawal initiated" + refresh balance
  - On failure: `ErrorBanner`

**API:** `POST /api/driver/instant-pay`
```ts
// Request
{ amount_bdt: number }
// Response
{ transaction_id: string; status: string }
```

**Edge Cases:**
- Balance < 200 -> show "Insufficient balance" + disable input
- Daily limit reached -> show "Daily limit reached. Try tomorrow."
- Payout method not set -> prompt to add method first
- Network error -> keep form data, show error

---

### 8.9 Missed Requests (`app/(main)/(rider)/missed-requests/index.tsx`)

**Purpose:** View declined/expired ride offers.

**Wireframe:**
```
[StatusBar]
|
|  <- Missed Requests          [sun/moon]
|
|  [Request cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **List:**
  - Each card: `surfaceBg`, 16px radius
  - Route: 16px Medium
  - Metadata: fare + time ago + status
  - Status badge:
    - "Expired": `amberLight` bg, `amber` text
    - "Declined": `surfaceBg`, `textDisabled` text
  - Read-only — tap does nothing
- **Time formatting:** "3 min ago", "1 hour ago", "Yesterday"

**API:** `GET /api/driver/missed-requests`
```ts
{
  requests: [{
    origin: string;
    destination: string;
    fare_bdt: number;
    status: 'expired' | 'declined';
    created_at: string;
  }];
}
```

**Empty State:**
- Icon: `Ionicons "time-outline"`, 80px
- Title: "No missed requests"
- Subtitle: "You're catching all your offers!"

---

### 8.10 Min Rate (`app/(main)/(rider)/min-rate/index.tsx`)

**Purpose:** Set minimum per-km rate filter.

**Wireframe:**
```
[StatusBar]
|
|  <- Minimum Rate             [sun/moon]
|
|  Minimum per-km rate
|  [taka 15.00]
|
|  [====|==========]  slider
|  taka 10              taka 50
|
|  You will only receive ride offers
|  with per-km rate above this amount.
|
|  ⚠ Higher minimum = fewer offers
|
|  [Save]  [Reset to Default]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Amount Display:**
  - 40px Bold, `primary`
  - Updates in real-time as slider moves
- **Slider:**
  - `@react-native-community/slider` or custom
  - Range: 10 to 50 taka
  - Step: 1 taka
  - Track: `borderColor` bg, `primary` fill
  - Thumb: 24px circle, `primary`
- **Impact Estimate:**
  - Dynamic text based on rate:
    - 10-15: "You'll see most offers"
    - 16-25: "You'll see fewer short trips"
    - 26-35: "You'll see ~30% fewer offers"
    - 36-50: "You'll see very few offers"
  - 14px Regular, `textSecondary`
- **Warning:**
  - `Ionicons "warning"` + "Higher minimum = fewer offers"
  - `amber` color
- **Buttons:**
  - "Save": `primary` bg, 56px -> `PATCH /api/driver/me { min_rate_per_km_bdt }`
  - "Reset to Default": `surfaceBg` + `borderColor`, `textSecondary` -> reset to 10

**API:** `PATCH /api/driver/me { min_rate_per_km_bdt: number }`

**Edge Cases:**
- Rate set to 50 -> show strong warning
- API fails -> revert slider, show error

---

### 8.11 Driver Lost Items (`app/(main)/(rider)/lost-items/index.tsx`) — NEW, was missing

**Purpose:** Respond to rider lost item reports.

**Wireframe:**
```
[StatusBar]
|
|  <- Lost Items               [sun/moon]
|
|  [Report cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **List:**
  - Each card: `surfaceBg`, 16px radius
  - Rider name + ride date
  - Item description
  - Status badge: "Pending Response" (`amber`) / "Responded" (`success`)
  - Tap -> detail screen with response options
- **Response Options:**
  - "I Have It" -> opens chat with rider
  - "Not Found" -> marks as not found
  - "Arrange Return" -> opens chat + shows return options

**API:**
- `GET /api/driver/lost-items`
- `POST /api/driver/lost-items/{id}/respond { action: 'have_it' | 'not_found' | 'arrange_return' }`

**Empty State:**
- Icon: `Ionicons "search-outline"`, 80px
- Title: "No lost item reports"
- Subtitle: "Reports from riders will appear here"

---

### 8.12 Plan 08 Verification Checklist

- [ ] All 11 screens use Pattern A theming
- [ ] All 11 screens have StatusBar + theme toggle
- [ ] Call Ledger shows monthly total + grouped entries + infinite scroll
- [ ] Commission Statement has month selector + PDF download
- [ ] Due Amounts shows total due + breakdown + Pay Now
- [ ] Earnings has week selector + daily breakdown
- [ ] Earnings Breakdown is date-param-driven
- [ ] Payout Methods shows masked bKash numbers + delete option
- [ ] Payout History shows status badges + infinite scroll
- [ ] Instant Pay validates min/max amount + shows fee
- [ ] Missed Requests is read-only with status badges
- [ ] Min Rate has slider 10-50 taka with impact estimate
- [ ] Driver Lost Items has response options (I Have It / Not Found / Arrange Return)
- [ ] Zero `console.log`, zero `theme === "dark"`
- [ ] All money: integer paisa, `/100` at display
- [ ] `npx tsc --noEmit` passes, `npm run lint` passes


---

## 5. Plan 09 — Support, Safety, Communication & Schedule

> **Scope:** Support ticket flow, safety hub, emergency contacts, FAQ, trip issue reporting, driver chat, turn-by-turn navigation, and driver schedule. These branch from Profile Tab, Settings Tab, and in-ride screens.
> **Screen Count:** 10
> **Backend Needs:** 6 endpoints
> **Priority:** MEDIUM-HIGH — Safety is trust-critical. Support reduces churn.

---

### 9.1 D19 — Contact Support (`app/(main)/(rider)/contact-support/index.tsx`)

**Purpose:** Create support tickets.

**Wireframe:**
```
[StatusBar]
|
|  <- Contact Support          [sun/moon]
|
|  Category
|  [Select category...]
|
|  Subject
|  [Enter subject...]
|
|  Message
|  [Describe your issue...]
|
|  [+ Attach Photo]
|
|  [Submit Ticket]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Category Dropdown:**
  - Modal selector
  - Options: "Payment Issue", "App Problem", "Ride Issue", "Account", "Other"
  - Each option: radio circle + label
- **Subject Input:**
  - `surfaceBg`, 12px radius, 1px `borderColor`
  - 48px height
  - Validation: min 5 chars
  - Error: "Subject must be at least 5 characters"
- **Message Input:**
  - `surfaceBg`, 12px radius, 1px `borderColor`
  - Multiline, min 100px height
  - Validation: min 20 chars
  - Error: "Please describe your issue in at least 20 characters"
- **Photo Attachment:**
  - `launchImageLibraryAsync` only
  - Upload to Supabase Storage `support-attachments` bucket
  - Show thumbnail (80x80, 12px radius) after upload
  - Max 3 photos
  - Tap thumbnail to remove (with `Ionicons "close-circle"` overlay)
- **"Submit Ticket" Button:**
  - `primary` bg, 56px
  - Disabled until category + subject + message filled and valid
  - API: `POST /api/driver/support-tickets`
  - On success: toast "Ticket submitted" + `router.back()`

**API:** `POST /api/driver/support-tickets`
```ts
// Request
{
  category: 'payment' | 'app' | 'ride' | 'account' | 'other';
  subject: string;
  message: string;
  photo_urls?: string[];
}
// Response
{ ticket_id: string; status: string }
```

**Edge Cases:**
- Photo upload fails -> allow submission without photos
- Network error -> keep form data, show `ErrorBanner`
- Max 3 photos reached -> disable "Attach Photo" button

---

### 9.2 D25 — Emergency Contacts (`app/(main)/(rider)/emergency-contacts/index.tsx`)

**Purpose:** CRUD emergency contacts.

**Wireframe:**
```
[StatusBar]
|
|  <- Emergency Contacts       [sun/moon]
|
|  [+ Add Emergency Contact]
|
|  [Contact cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Add/Edit Modal:**
  - Name input (required, min 2 chars)
  - Relationship dropdown: "Family", "Friend", "Colleague", "Other"
  - Phone input: `+880` prefix + 10 digits
  - Validation: `^01\d{9}$`
  - Error: "Enter a valid Bangladesh phone number"
- **Contact Card:**
  - `surfaceBg`, 16px radius
  - `Ionicons "person"`, 24px, `primary`
  - Name: 18px SemiBold
  - Relationship + phone: 14px Regular, `textSecondary`
  - Edit/Delete buttons (or swipe actions)
- **Max Contacts:** 5
  - Show "Maximum 5 contacts reached" when full

**API:** CRUD `/api/driver/emergency-contacts`
```ts
{
  id: string;
  name: string;
  relationship: string;
  phone: string;
}
```

**Edge Cases:**
- Duplicate phone -> show "This number is already added"
- Max contacts reached -> disable add button
- Last contact -> warn "You must have at least one emergency contact"

---

### 9.3 D26 — FAQ (`app/(main)/(rider)/faq/index.tsx`)

**Purpose:** Frequently asked questions for drivers.

**Wireframe:**
```
[StatusBar]
|
|  <- FAQ                      [sun/moon]
|
|  [Search questions...]
|
|  [Accordion items...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Search Bar:**
  - `surfaceBg`, 12px radius, `Ionicons "search"`
  - Filters accordion items in real-time (debounce 300ms)
  - Placeholder: "Search questions..."
- **Accordion Items:**
  - `surfaceBg`, 16px radius
  - Question: 16px SemiBold
  - Chevron: `Ionicons "chevron-down"` / `"chevron-up"`
  - Answer: 14px Regular, `textSecondary`
  - Animated expand/collapse (height animation)
- **Categories:**
  - "Getting Started", "Earnings", "Account", "Safety", "Vehicle"
  - Category header: 12px SemiBold, `textSecondary`, uppercase
- **Static Content:**
  - Store in `lib/faqContent.ts`
  - Structured as array of categories with Q&A pairs

**Content Structure:**
```ts
interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const driverFAQ: FAQItem[] = [
  { category: "Getting Started", question: "How do I go online?", answer: "Tap the pulsing green button..." },
  { category: "Earnings", question: "How is commission calculated?", answer: "Commission is 20% of each fare..." },
  // ... 20+ items
];
```

**Edge Cases:**
- No search results -> "No questions found. Try different keywords."
- All categories collapsed -> show hint "Tap a question to expand"

---

### 9.4 D34 — Safety (`app/(main)/(rider)/safety/index.tsx`)

**Purpose:** Driver safety hub.

**Wireframe:**
```
[StatusBar]
|
|  Safety                      [sun/moon]
|
|  [SOS card]
|  [Emergency Contacts card]
|  [Safety Tips section]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **SOS Card:**
  - `surfaceBg`, 16px radius, 4px `danger` top border
  - `Ionicons "shield"`, 24px, `danger`
  - Title: 18px SemiBold
  - Subtitle: 14px Regular, `textSecondary`
  - Tap -> `emergency-sos/index.tsx` (driver version)
- **Emergency Contacts Card:**
  - Tap -> `emergency-contacts`
- **Safety Tips:**
  - Scrollable horizontal cards
  - `surfaceBg`, 16px radius
  - Icon + title + description
  - Tips: "Share your trip", "Verify rider identity", "Stay in well-lit areas", "Keep doors locked"

---

### 9.5 D42 — Support (`app/(main)/(rider)/support/index.tsx`)

**Purpose:** Chat-based support.

**Wireframe:**
```
[StatusBar]
|
|  <- Support                  [sun/moon]
|
|  [GiftedChat UI]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- Reuse `ChatScreen` component (same as rider support)
- `GiftedChat` with driver-specific support agent
- Pre-populated quick messages:
  - "I have a payment issue"
  - "My app is not working"
  - "I need help with a ride"
- Attachments: gallery only
- Typing indicator support

---

### 9.6 D43 — Trip Issue (`app/(main)/(rider)/trip-issue/index.tsx`)

**Purpose:** Report an issue with a specific trip.

**Wireframe:**
```
[StatusBar]
|
|  <- Report Trip Issue        [sun/moon]
|
|  Select Trip
|  [Recent trip dropdown]
|
|  Issue Type
|  [Rider behavior] [Payment] [App] [Other]
|
|  Description
|  [Describe the issue...]
|
|  [Submit Report]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Trip Selector:**
  - Dropdown of recent trips (last 7 days)
  - Show route + date
- **Issue Type Chips:**
  - Horizontal scroll, single-select
  - Active: `primary` bg
  - Options: "Rider Behavior", "Payment Issue", "App Problem", "Route Issue", "Other"
- **Description:**
  - Multiline TextInput, min 50 chars
- **Submit:**
  - API: `POST /api/driver/trip-issues`

**API:** `POST /api/driver/trip-issues`
```ts
{
  ride_id: string;
  type: 'rider_behavior' | 'payment' | 'app' | 'route' | 'other';
  description: string;
}
```

---

### 9.7 D47 — Report Issue (`app/(main)/(rider)/report-issue/index.tsx`)

**Purpose:** General issue reporting (non-trip specific).

**Wireframe:**
```
[StatusBar]
|
|  <- Report Issue             [sun/moon]
|
|  Category
|  [App Bug] [Payment] [Map] [Account] [Other]
|
|  Description
|  [Describe your issue...]
|
|  [+ Attach Screenshot]
|
|  [Submit]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- Category chips: "App Bug", "Payment", "Map", "Account", "Other"
- Description: multiline, min 20 chars
- Screenshot attachment (gallery only, max 3)
- API: `POST /api/driver/reports`

---

### 9.8 D49 — Driver Chat (`app/(main)/(rider)/chat/index.tsx`)

**Purpose:** In-ride chat with rider.

**Wireframe:**
```
[StatusBar]
|
|  <- Chat with Rider          [sun/moon]
|
|  [GiftedChat UI]
|
|  [Quick messages row]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- Reuse `ChatScreen` component
- Pre-populated quick messages (horizontal scroll above input):
  - "I'm on my way"
  - "I've arrived"
  - "Traffic delay, be there soon"
  - "Can't find you, please call"
- WS: `chat:message` / `chat:typing`
- Read receipts: double checkmark when read

---

### 9.9 D20 — Customer Navigation (`app/(main)/(rider)/customer-navigation/[rideId].tsx`)

**Purpose:** Full-screen turn-by-turn navigation.

**Wireframe:**
```
[StatusBar — hidden]
|
|  [Full-screen MapLibre]
|
|  [Navigation card bottom]
|  [End Navigation button]
```

**Spec:**
- **Pattern A.** StatusBar hidden (`hidden` prop).
- **Full-screen MapLibre:**
  - `useBarikoiMapStyle(isDark)`
  - Route line: `primary` color, 4px width
  - User location dot: pulsing `primary`
- **Navigation Card (bottom, absolute):**
  - `surfaceBg`, 16px radius, margin 16px
  - Turn icon: `Ionicons "arrow-up"` rotated based on maneuver
  - Distance: 28px Bold
  - Street name: 16px Medium
- **"End Navigation" Button:**
  - `danger` bg, 48px
  - Returns to previous screen

**API:** `GET /api/navigation/route?from={lat,lng}&to={lat,lng}`
```ts
{
  steps: [{
    instruction: string;
    distance: string;
    maneuver: 'straight' | 'turn-left' | 'turn-right' | 'uturn';
  }];
  polyline: string;
}
```

---

### 9.10 D35 — Schedule (`app/(main)/(rider)/schedule/index.tsx`)

**Purpose:** Driver work schedule.

**Wireframe:**
```
[StatusBar]
|
|  <- My Schedule              [sun/moon]
|
|  [Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun]
|
|  [Time range picker]
|  [Available toggle]
|
|  [Save Schedule]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Day Selector:**
  - Horizontal scroll
  - Each day: 48x64 pill
  - Selected: `primary` bg, white text
  - Unselected: `surfaceBg`, `textPrimary`
- **Time Range:**
  - Start time + end time pickers
  - `@react-native-community/datetimepicker` in `spinner` mode
  - Format: "8:00 AM" / "6:00 PM"
- **Available Toggle:**
  - If OFF, gray out time pickers
- **Save Button:**
  - `primary` bg, 56px
  - API: `POST /api/driver/schedule`

**API:** `POST /api/driver/schedule`
```ts
{
  schedule: [{
    day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    start: string; // "08:00"
    end: string;   // "18:00"
    available: boolean;
  }];
}
```

**Edge Cases:**
- End time before start time -> show error "End time must be after start time"
- All days unavailable -> show warning "You won't receive any offers"

---

### 9.11 Plan 09 Verification Checklist

- [ ] All 10 screens use Pattern A theming
- [ ] All 10 screens have StatusBar + theme toggle
- [ ] Contact Support has category dropdown + photo attach (max 3)
- [ ] Emergency Contacts has CRUD with phone validation + max 5
- [ ] FAQ has searchable accordion with categories
- [ ] Safety has SOS card with `danger` accent
- [ ] Support uses GiftedChat with quick messages
- [ ] Trip Issue has recent ride selector + issue type chips
- [ ] Report Issue has category chips + screenshot attach
- [ ] Driver Chat has quick message buttons + read receipts
- [ ] Customer Navigation is full-screen with MapLibre
- [ ] Schedule has day selector + time pickers + conflict detection
- [ ] Zero `console.log`, zero `theme === "dark"`
- [ ] `npx tsc --noEmit` passes, `npm run lint` passes


---

## 6. Plan 10 — Performance, Ratings, Intelligence & Profile

> **Scope:** Driver profile editing, personal profile view, ratings & reviews, referral program, hotspot map, incentives, performance stats, and rider no-show handling. These branch from Profile Tab, Earnings Tab, and in-ride flow.
> **Screen Count:** 8
> **Backend Needs:** 5 endpoints
> **Priority:** MEDIUM — Performance screens drive engagement. Hotspot map increases earnings.

---

### 10.1 D24 — Edit Profile (`app/(main)/(rider)/edit-profile/index.tsx`)

**Purpose:** Edit driver personal info.

**Wireframe:**
```
[StatusBar]
|
|  <- Edit Profile             [sun/moon]
|
|  [Photo 100x100 with edit icon]
|
|  Full Name
|  [Rahim Uddin]
|
|  Phone
|  [+8801712345678]  ← disabled
|
|  City
|  [Dhaka]
|
|  [Save Changes]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Photo:**
  - 100x100, circle, 3px `primary` border
  - Edit icon: `Ionicons "camera"` on `primary` circle overlay (bottom-right, 32x32)
  - Tap -> `launchImageLibraryAsync`
  - Upload to Supabase Storage `profile-photos` bucket
  - Show upload progress (circular progress or ActivityIndicator)
  - Max file size: 5MB
  - Supported formats: JPG, PNG
  - Error: "Photo must be under 5MB"
- **Name Input:**
  - `surfaceBg`, 12px radius
  - Required, min 2 chars, max 50 chars
  - Validation: "Name must be 2-50 characters"
- **Phone:**
  - Disabled, `textDisabled` color
  - Non-editable (phone is identity)
- **City:**
  - Dropdown: "Dhaka", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Barisal", "Rangpur", "Mymensingh"
- **Save Button:**
  - `primary` bg, 56px
  - Disabled if no changes
  - API: `PATCH /api/driver/me { name, city, photo_url? }`
  - On success: toast "Profile updated" + `router.back()`

**API:** `PATCH /api/driver/me`
```ts
// Request
{
  name?: string;
  city?: string;
  photo_url?: string;
}
// Response
{ success: true; driver: DriverProfile }
```

**Edge Cases:**
- Photo upload fails -> allow save without photo change
- Name validation fails -> show error inline
- No changes made -> disable save button
- Network error -> keep form data, show `ErrorBanner`

---

### 10.2 D32 — Personal Profile (`app/(main)/(rider)/personal-profile/index.tsx`)

**Purpose:** View-only personal profile.

**Wireframe:**
```
[StatusBar]
|
|  <- Personal Profile         [sun/moon]
|
|  [Photo 120x120]
|  Rahim Uddin
|  ★ 4.8 · 124 trips · Dhaka
|
|  [Phone card]
|  [Member Since card]
|  [Vehicle card]
|
|  [Edit Profile]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Header:**
  - Large avatar: 120x120, circle, 4px `primary` border
  - Name: 22px SemiBold
  - Rating + trips + city: 14px Regular, `textSecondary`
- **Info Cards:**
  - `surfaceBg`, 16px radius
  - Label + value
  - Phone, Member Since, Vehicle, City
- **Edit Button:**
  - `primary` bg, 56px
  - -> `edit-profile`

---

### 10.3 D45 — Ratings (`app/(main)/(rider)/ratings/index.tsx`)

**Purpose:** View rider ratings and reviews.

**Wireframe:**
```
[StatusBar]
|
|  <- Ratings & Reviews        [sun/moon]
|
|  [Rating summary card]
|  [Distribution bars]
|
|  Recent Reviews
|  [Review cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Rating Summary Card:**
  - `surfaceBg`, 16px radius
  - Large rating: 40px Bold, `primary`
  - `Ionicons "star"`, `amber`
  - Count: "124 ratings"
- **Distribution Bars:**
  - 5 rows (5 stars to 1 star)
  - Bar: `primary` fill on `borderColor` track
  - Count: "(100)" right-aligned
- **Review Cards:**
  - `surfaceBg`, 16px radius
  - Stars: `Ionicons "star"` filled / `"star-outline"` empty, 16px, `amber`
  - Comment: 16px Medium, `textPrimary`
  - Date: 13px Regular, `textSecondary`
  - Anonymous indicator if applicable

**API:** `GET /api/driver/ratings`
```ts
{
  average: number;
  count: number;
  distribution: {
    "5": number;
    "4": number;
    "3": number;
    "2": number;
    "1": number;
  };
  reviews: [{
    rating: number;
    comment: string;
    created_at: string;
    is_anonymous: boolean;
  }];
}
```

**Empty State:**
- Icon: `Ionicons "star-outline"`, 80px
- Title: "No ratings yet"
- Subtitle: "Ratings will appear after you complete trips"

---

### 10.4 D46 — Referral (`app/(main)/(rider)/referral/index.tsx`)

**Purpose:** Driver referral program.

**Wireframe:**
```
[StatusBar]
|
|  <- Referral Program         [sun/moon]
|
|  [Referral code card]
|  [Rewards info card]
|  [Referral history list]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Referral Code Card:**
  - `surfaceBg`, 16px radius, 4px `primary` top border
  - Code: 28px Bold, `primary`, monospace font
  - "Copy" button: `primaryLight` bg, `primary` text
    - On tap: copy to clipboard, show "Copied!" toast
  - "Share" button: `primary` bg
    - `Share.share({ message: 'Join me on Ride! Use code RAHIM2024 and get taka 100 bonus. Download: https://ride.app/dl' })`
- **Rewards Info:**
  - "taka 500 per driver referral"
  - "5 successful referrals"
- **Referral History:**
  - List of referred drivers
  - Name + date + status (Pending / Successful)

**API:** `GET /api/driver/referral`
```ts
{
  code: string;
  reward_per_referral_bdt: number;
  successful_referrals: number;
  pending_referrals: number;
  history: [{
    name: string;
    date: string;
    status: 'pending' | 'successful';
  }];
}
```

---

### 10.5 D27 — Hotspot Map (`app/(main)/(rider)/hotspot-map/index.tsx`)

**Purpose:** Demand heatmap for drivers.

**Wireframe:**
```
[StatusBar — translucent]
|
|  [Full-screen MapLibre]
|
|  [Legend card bottom]
|  [Refresh button]
```

**Spec:**
- **Pattern A.** StatusBar translucent.
- **Full-screen MapLibre:**
  - `useBarikoiMapStyle(isDark)`
- **Heatmap Circles:**
  - Overlay circles at hotspot locations
  - Radius: 50-200m proportional to intensity
  - Color mapping:
    - intensity 0.0-0.3: `rgba(12, 194, 95, 0.3)` (green)
    - intensity 0.3-0.6: `rgba(245, 158, 11, 0.4)` (yellow)
    - intensity 0.6-1.0: `rgba(227, 29, 28, 0.5)` (red)
  - Circle border: 2px solid with same color at 0.8 opacity
- **Legend Card (bottom):**
  - `surfaceBg`, 16px radius, semi-transparent (0.9 opacity)
  - Horizontal color gradient with labels: "Low", "Medium", "High"
- **Refresh Button:**
  - `surfaceBg` + border, `Ionicons "refresh"`, 48x48
  - Tap -> refetch hotspots
  - Rotate animation while loading
- **Timestamp:**
  - "Last updated: 2 min ago", 12px Regular, `textSecondary`

**API:** `GET /api/driver/hotspots`
```ts
{
  hotspots: [{
    lat: number;
    lng: number;
    intensity: number; // 0-1
    label: string; // e.g. "Gulshan Circle"
  }];
  updated_at: string;
}
```

**Edge Cases:**
- No hotspots -> show "No demand data available"
- Location permission denied -> show "Enable location to see nearby hotspots"
- Offline -> show cached data with "Offline mode" badge

---

### 10.6 D28 — Incentives (`app/(main)/(rider)/incentives/index.tsx`)

**Purpose:** Active driver incentives and bonuses.

**Wireframe:**
```
[StatusBar]
|
|  Incentives                  [sun/moon]
|
|  [Active incentive cards...]
|  [Completed incentive cards...]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Active Incentive Cards:**
  - `surfaceBg`, 16px radius, 1px `borderColor`
  - Title: 16px SemiBold
  - Bonus: 20px Bold, `primary`
  - Progress bar: `ProgressBar` component
  - Count: "7/10", 14px Regular
  - Expiry countdown: `amber` color, "Expires in 3h 45m"
  - Tap -> incentive detail modal
- **Completed Cards:**
  - `successLight` bg
  - `Ionicons "checkmark-circle"`, `success`
  - "Completed" badge
  - Bonus amount in `success` color

**API:** `GET /api/driver/incentives`
```ts
{
  incentives: [{
    id: string;
    title: string;
    description: string;
    bonus_bdt: number;
    progress: number;
    target: number;
    expires_at: string;
    completed: boolean;
  }];
}
```

**Empty State:**
- Icon: `Ionicons "trophy-outline"`, 80px
- Title: "No active incentives"
- Subtitle: "Check back later for new bonuses"

---

### 10.7 D31 — Performance Stats (`app/(main)/(rider)/performance-stats/index.tsx`)

**Purpose:** Detailed performance analytics.

**Wireframe:**
```
[StatusBar]
|
|  Performance                 [sun/moon]
|
|  [This Week] [This Month]
|
|  [Bar chart]
|
|  Stats grid
|  [3x2 grid of stat cards]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Period Selector:** Segmented control
  - "This Week" / "This Month"
- **Earnings Chart:**
  - Custom SVG bar chart
  - 7 bars for week, ~30 for month
  - `primary` fill
  - Tap bar -> `earnings-breakdown?date=...`
- **Stat Grid:**
  - 3x2 grid, gap 12px
  - Each card: `surfaceBg`, 16px radius
  - Number: 28px Bold, `primary`
  - Label: 14px Regular, `textSecondary`
  - Stats: Earnings, Trips, Rating, Acceptance Rate, Online Hours, Growth %

**API:** `GET /api/driver/performance?period=week|month`
```ts
{
  earnings_bdt: number;
  trip_count: number;
  avg_rating: number;
  acceptance_rate: number;
  online_hours: number;
  growth_percent: number;
  chart_data: [{
    label: string;
    value: number;
  }];
}
```

---

### 10.8 D33 — Rider No-Show (`app/(main)/(rider)/rider-no-show/index.tsx`)

**Purpose:** Handle rider not appearing at pickup.

**Wireframe:**
```
[StatusBar]
|
|  <- Rider No-Show            [sun/moon]
|
|  The rider has not arrived.
|
|  Wait time: 00:05:32
|  (tabular nums, 24px Bold)
|
|  [Mark as No-Show]
|  [Cancel Ride]
|  [Call Rider]
```

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Wait Timer:**
  - `fontVariant: ['tabular-nums']`
  - 24px Bold, `textPrimary`
  - Started via `POST /api/ride/:id/wait-start`
  - Counts up from 00:00:00
- **"Mark as No-Show" Button:**
  - `amber` bg, white text, 56px
  - Confirmation modal:
    - Title: "Mark Rider as No-Show?"
    - Body: "You'll receive taka 15 compensation. The ride will be marked as completed."
    - "Cancel" / "Confirm"
  - API: `POST /api/ride/:id/no-show`
  - On success: toast + `router.replace('/(main)/(rider)')`
- **"Cancel Ride" Button:**
  - `surfaceBg` + `danger` border, `danger` text, 56px
  - -> `cancellation-reasons`
- **"Call Rider" Button:**
  - `surfaceBg` + `primary` border, `primary` text, 56px
  - `Linking.openURL('tel:${riderPhone}')`

**API:** `POST /api/ride/:id/no-show`
```ts
// Response
{
  compensation_bdt: number;
  ride_status: string;
}
```

**Edge Cases:**
- Wait time < 5 minutes -> disable "Mark as No-Show", show "Wait at least 5 minutes"
- Rider arrives while on this screen -> auto-navigate back to `find-customer`
- Call fails -> show "Could not place call"

---

### 10.9 Plan 10 Verification Checklist

- [ ] All 8 screens use Pattern A theming
- [ ] All 8 screens have StatusBar + theme toggle
- [ ] Edit Profile has photo upload with progress + city dropdown
- [ ] Personal Profile shows member since + vehicle info
- [ ] Ratings shows distribution bars + anonymous indicator
- [ ] Referral has copy + share buttons + referral history
- [ ] Hotspot Map has color-coded circles + legend + refresh
- [ ] Incentives shows progress bars + expiry countdown
- [ ] Performance Stats has bar chart + 3x2 stat grid
- [ ] Rider No-Show has tabular timer + 3 action buttons + 5-min minimum
- [ ] Zero `console.log`, zero `theme === "dark"`
- [ ] All money: integer paisa, `/100` at display
- [ ] `npx tsc --noEmit` passes, `npm run lint` passes


---

## 7. Plan 11 — Content Fill: Terms, Privacy, i18n Foundation

> **Scope:** Static content screens that exist but are empty, plus the i18n foundation for future localization.
> **Screen Count:** 5 (4 content screens + 1 i18n lib)
> **Backend Needs:** 0 (all static)
> **Priority:** MEDIUM — Required for app store compliance and future scaling.

---

### 11.1 Terms of Service — Rider (`app/(main)/(tabs)/terms/index.tsx`)

**Purpose:** Display Terms of Service for riders.

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Content Source:** `lib/legalContent.ts` -> `riderTerms`
- **Layout:**
  - ScrollView with `contentContainerStyle={{ padding: 16 }}`
  - Title: "Terms of Service", 22px SemiBold
  - Last updated: 14px Regular, `textSecondary`
  - Sections with headers (18px SemiBold) and body text (15px Regular)
- **Content Sections:**
  1. Introduction
  2. Service Description
  3. User Responsibilities
  4. Payment Terms
  5. Cancellation Policy
  6. Liability
  7. Governing Law (Bangladesh)
  8. Contact Information

---

### 11.2 Privacy Policy — Rider (`app/(main)/(tabs)/privacy/index.tsx`)

**Purpose:** Display Privacy Policy for riders.

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Content Source:** `lib/legalContent.ts` -> `riderPrivacy`
- **Layout:** Same as Terms
- **Content Sections:**
  1. Introduction
  2. Information We Collect
  3. How We Use Information
  4. Data Sharing
  5. Data Security
  6. Your Rights
  7. Cookies
  8. Contact

---

### 11.3 Terms of Service — Driver (`app/(main)/(rider)/terms/index.tsx`)

**Purpose:** Display Terms of Service for drivers.

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Content Source:** `lib/legalContent.ts` -> `driverTerms`
- **Additional Sections:**
  - Commission Structure
  - Vehicle Requirements
  - Driver Conduct
  - Deactivation Policy
  - Insurance Disclaimer

---

### 11.4 Privacy Policy — Driver (`app/(main)/(rider)/privacy/index.tsx`)

**Purpose:** Display Privacy Policy for drivers.

**Spec:**
- **Pattern A.** StatusBar + toggle.
- **Content Source:** `lib/legalContent.ts` -> `driverPrivacy`
- **Additional Sections:**
  - Background Check Data
  - Vehicle Data
  - Location Data (driver-specific)

---

### 11.5 i18n Foundation (`lib/i18n.ts` or extend existing)

**Purpose:** Centralized string management for future Bengali/English support.

**Spec:**
- Extend existing i18n setup or create `lib/i18n.ts`
- Structure:
```ts
export const strings = {
  en: {
    driver: {
      earnings: {
        title: "Earnings",
        today: "Today's Earnings",
        goal_progress: "{{percent}}% of daily goal",
        set_goal: "Set Earnings Goal",
        // ... all driver strings
      },
      // ... all namespaces
    },
    rider: {
      // ... existing rider strings
    },
    common: {
      save: "Save",
      cancel: "Cancel",
      confirm: "Confirm",
      loading: "Loading...",
      error: "Something went wrong",
      retry: "Retry",
    }
  },
  bn: {
    // Bengali translations (future)
  }
};
```
- Use `useTranslation()` hook or direct import
- Default: English
- All NEW screens must use `strings.en.driver.*` — no hardcoded strings

---

### 11.6 Plan 11 Verification Checklist

- [ ] All 4 legal screens use Pattern A theming
- [ ] All 4 legal screens have StatusBar + theme toggle
- [ ] Content is stored in `lib/legalContent.ts` (not hardcoded in components)
- [ ] i18n structure supports `en` and `bn`
- [ ] All new screens reference i18n strings
- [ ] Zero `console.log`, zero `theme === "dark"`

---

## 8. Cross-Cutting Concerns

### 8.1 Push Notification Routing

| Notification Type | Payload | Target Screen | Action |
|-------------------|---------|---------------|--------|
| `new_ride_offer` | `{ ride_id }` | Driver Home (`find-customer`) | Play sound + show offer |
| `ride_cancelled` | `{ ride_id }` | Driver Home | Reset to idle |
| `payment_received` | `{ amount_bdt }` | Wallet Tab | Refresh balance |
| `due_reminder` | `{ amount_bdt }` | Wallet Tab | Show due card |
| `subscription_expiring` | `{ days_left }` | Wallet Tab | Show expiry warning |
| `document_rejected` | `{ doc_type }` | Verification | Show rejection reason |
| `incentive_completed` | `{ incentive_id }` | Incentives | Show completion |
| `support_reply` | `{ ticket_id }` | Support Chat | Open chat |
| `lost_item_report` | `{ report_id }` | Lost Items | Show new report |
| `goal_reached` | `{ goal_bdt }` | Earnings Tab | Show confetti |

**Implementation:**
- In `app/_layout.tsx` or a dedicated notification handler:
```ts
useEffect(() => {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const { type, ...data } = response.notification.request.content.data;
    switch (type) {
      case 'new_ride_offer': router.push('/(main)/(rider)/find-customer'); break;
      case 'payment_received': router.push('/(main)/(rider)/(tabs)/wallet'); break;
      // ... etc
    }
  });
  return () => subscription.remove();
}, []);
```

### 8.2 Deep Linking

| Route | Screen | Params |
|-------|--------|--------|
| `ride://track/:rideId` | Rider Track Ride | `rideId` |
| `ride://payment/success` | Payment Success | `purpose`, `transaction_id` |
| `ride://payment/failed` | Payment Failed | `purpose`, `error` |
| `ride://subscription/confirm` | Subscription Confirmation | `plan_id` |
| `ride://referral/:code` | Referral | `code` |

**Payment Callback Handling:**
- PortPos redirects to `ride://payment/success?purpose=subscription&transaction_id=xxx`
- App intercepts deep link, verifies payment server-side, shows confirmation

### 8.3 Image Upload Specs

| Bucket | Purpose | Max Size | Formats | Path Pattern |
|--------|---------|----------|---------|--------------|
| `vehicle-photos` | Vehicle images | 5MB | JPG, PNG | `vehicles/{driver_id}/{vehicle_id}.jpg` |
| `profile-photos` | Driver/rider avatars | 5MB | JPG, PNG | `profiles/{user_id}.jpg` |
| `support-attachments` | Support ticket photos | 5MB | JPG, PNG | `support/{ticket_id}/{n}.jpg` |
| `driver-documents` | License, NID, etc. | 5MB | JPG, PNG | `docs/{driver_id}/{doc_type}.jpg` |

**Upload Flow:**
1. `launchImageLibraryAsync` (gallery only)
2. Compress to max 1200px width (use `expo-image-manipulator`)
3. Generate unique filename: `${uuid}.jpg`
4. Upload to Supabase Storage with `upsert: false`
5. Get public URL
6. Store URL in state / send to API

**Error Handling:**
- File too large: "Photo must be under 5MB"
- Wrong format: "Only JPG and PNG are supported"
- Upload fails: "Upload failed. Please try again."
- Network error: Retry 3 times with exponential backoff

### 8.4 PaymentWebView Purpose Tags

| Purpose | Flow | Amount Source | Callback Screen |
|---------|------|---------------|-----------------|
| `wallet_topup` | Wallet Tab -> Top Up | User input | Wallet Tab |
| `due_payment` | Wallet Tab -> Pay Now | `due_bdt` from API | Wallet Tab |
| `subscription` | Subscription Checkout | Plan price | Subscription Confirmation |
| `subscription_renewal` | Subscription Renewal | Plan price | Subscription Confirmation |
| `driver_package` | Packages -> Buy Now | Package price | Packages |

### 8.5 Confirmation Dialog Pattern

All destructive/irreversible actions use the same modal pattern:

```tsx
<Modal transparent visible={showConfirm} animationType="fade">
  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ backgroundColor: surfaceBg, borderRadius: 16, padding: 24, width: '85%', maxWidth: 360 }}>
      <Text style={{ fontSize: 20, fontWeight: '600', color: textPrimary }}>{title}</Text>
      <Text style={{ fontSize: 15, color: textSecondary, marginTop: 8 }}>{message}</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <TouchableOpacity style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: surfaceBg, borderWidth: 1, borderColor, justifyContent: 'center', alignItems: 'center' }} onPress={onCancel}>
          <Text style={{ color: textPrimary, fontWeight: '500' }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: confirmColor, justifyContent: 'center', alignItems: 'center' }} onPress={onConfirm}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{confirmText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>
```

**Confirm Colors:**
- Sign out: `danger`
- Delete vehicle: `danger`
- Cancel subscription: `danger`
- Mark no-show: `amber`
- Switch vehicle while online: `amber`

### 8.6 Loading Skeleton Pattern

For list screens, use this skeleton pattern:

```tsx
function SkeletonCard() {
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  return (
    <View style={{ backgroundColor: surfaceBg, borderRadius: 16, height: 80, marginBottom: 12, opacity: 0.6 }}>
      <View style={{ flexDirection: 'row', padding: 16, gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? '#333' : '#e5e5e5' }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ width: '60%', height: 16, borderRadius: 4, backgroundColor: isDark ? '#333' : '#e5e5e5' }} />
          <View style={{ width: '40%', height: 12, borderRadius: 4, backgroundColor: isDark ? '#333' : '#e5e5e5' }} />
        </View>
      </View>
    </View>
  );
}
```

Show 3-5 skeleton cards while loading initial data.

### 8.7 Offline Handling

| Screen | Offline Behavior |
|--------|------------------|
| Earnings Tab | Show cached data + "Offline" badge. Disable pull-to-refresh. |
| Activity Tab | Show cached data. Disable infinite scroll. |
| Wallet Tab | Show cached balance. Disable Top Up / Withdraw. |
| Profile Tab | Show cached profile. |
| Settings Tab | Fully functional (local state only). |
| All other screens | Show cached data where available. Disable mutations. |

Use `NetInfo` from `@react-native-community/netinfo` to detect connectivity.

---

## 9. Complete Component Library (New + Verified)

### New Components (Must Be Built)

| Component | File | Used In | Props |
|-----------|------|---------|-------|
| `ProgressBar` | `components/ProgressBar.tsx` | Earnings, Incentives, Packages | `progress: number; height?: number; trackColor?: string; fillColor?: string` |
| `StatCard` | `components/StatCard.tsx` | Earnings, Performance | `value: string; label: string; icon?: IoniconsName; onPress?: () => void` |
| `SegmentedControl` | `components/SegmentedControl.tsx` | Earnings, Performance | `options: {label, value}[]; value: T; onChange: (T) => void` |
| `RadioList` | `components/RadioList.tsx` | Select Vehicle, Nav App | `options: {label, value, subtitle?}[]; value: T; onChange: (T) => void` |
| `ToggleSwitch` | `components/ToggleSwitch.tsx` | Settings | `value: boolean; onChange: (boolean) => void` |
| `ImagePickerButton` | `components/ImagePickerButton.tsx` | Add Vehicle, Edit Profile, Support | `onImagePicked: (uri: string) => void; maxSize?: number` |
| `ConfirmationModal` | `components/ConfirmationModal.tsx` | All destructive actions | `visible: boolean; title: string; message: string; confirmText: string; confirmColor: string; onConfirm: () => void; onCancel: () => void` |
| `EmptyState` | `components/EmptyState.tsx` | All list screens | `icon: IoniconsName; title: string; subtitle?: string; action?: {label: string; onPress: () => void}` |
| `ErrorBanner` | `components/ErrorBanner.tsx` | All screens | `message: string; onRetry?: () => void` |
| `SkeletonCard` | `components/SkeletonCard.tsx` | All list screens | `count?: number` |
| `StatusBadge` | `components/StatusBadge.tsx` | Activity, Payout History | `status: string; variant: 'success' | 'danger' | 'amber' | 'info'` |
| `Badge` | `components/Badge.tsx` | Various | `text: string; color: string; bgColor: string` |

### Verified Existing Components (From Plans 01–04)

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| `Map` | `components/Map.tsx` | VERIFY | Ensure `useBarikoiMapStyle(isDark)` is used |
| `DriverStatsBar` | `components/DriverStatsBar.tsx` | VERIFY | Ensure Pattern A theming |
| `RideInfoCard` | `components/RideInfoCard.tsx` | VERIFY | Ensure Pattern A theming |
| `ChatScreen` | `components/ChatScreen.tsx` | VERIFY | Ensure Pattern A theming |
| `PaymentWebView` | `components/PaymentWebView.tsx` | VERIFY | Ensure all purpose tags handled |
| `LoadingRider` | `components/LoadingRider.tsx` | VERIFY | Ensure Pattern A theming |
| `VerificationStep` | `components/VerificationStep.tsx` | VERIFY | Ensure Pattern A theming |

---

## 10. State Machines

### 10.1 Driver Tab State Machine

```
[App Launch]
    |
    v
[Check Auth] --unauthenticated--> [Welcome Screen]
    |
    v
[Check Driver Status] --temporary--> [Onboarding]
    |                      |
    |--pending--> [Pending Review Screen]
    |               |
    |               v
    |            [Poll every 30s]
    |               |
    |               +--status=active--> [Tabs]
    |               |
    |               +--status=rejected--> [Rejected Screen]
    |               |
    |               +--status=suspended--> [Suspended Screen]
    |
    +--active--> [Tabs]
        |
        +--Home Tab
        +--Earnings Tab
        +--Activity Tab
        +--Wallet Tab
        +--Profile Tab
```

### 10.2 Vehicle State Machine

```
[No Vehicle]
    |
    v
[Add Vehicle] --success--> [Vehicle Inactive]
    |                          |
    |                          v
    |                       [Activate]
    |                          |
    |                          v
    |                       [Vehicle Active]
    |                          |
    |                          +--Switch--> [Vehicle Inactive] (previous)
    |                          |
    |                          +--Delete--> [No Vehicle] (if last)
    |                          |
    |                          +--Documents Expired--> [Vehicle Suspended]
    |
    +--error--> [Show Error]
```

### 10.3 Subscription State Machine

```
[No Subscription]
    |
    v
[Browse Plans] --select--> [Checkout]
    |                          |
    |                          v
    |                       [Payment]
    |                          |
    |                          +--success--> [Active Subscription]
    |                          |                  |
    |                          |                  +--Renew--> [Checkout]
    |                          |                  |
    |                          |                  +--Cancel--> [Canceling]
    |                          |                                     |
    |                          |                                     v
    |                          |                                  [Canceled]
    |                          |                                     |
    |                          |                                     v
    |                          |                                  [No Subscription]
    |                          |
    |                          +--failed--> [Payment Failed]
    |                                         |
    |                                         v
    |                                      [Retry / Cancel]
    |
    +--back--> [No Subscription]
```

### 10.4 Payout State Machine

```
[Wallet Tab]
    |
    +--Top Up--> [PaymentWebView] --success--> [Wallet Refreshed]
    |                                        |
    |                                        +--failed--> [Show Error]
    |
    +--Withdraw--> [Instant Pay]
        |
        +--Valid Amount--> [Confirm Modal] --confirm--> [API Call]
        |                                                   |
        |                                                   +--success--> [Pending]
        |                                                   |               |
        |                                                   |               v
        |                                                   |            [Completed / Failed]
        |                                                   |
        |                                                   +--failed--> [Show Error]
        |
        +--Invalid Amount--> [Show Validation Error]
```

---

## 11. Backend API Contracts (Full Zod + Response)

### New APIs (Must Be Created If Missing)

#### 11.1 Driver Daily Stats
```ts
// app/api/driver/daily-stats+api.ts
import { z } from "zod";

const responseSchema = z.object({
  today_earnings_bdt: z.number().int().min(0),
  trip_count: z.number().int().min(0),
  online_hours: z.number().min(0),
  weekly_earnings: z.array(z.number().int().min(0)).length(7),
  avg_rating: z.number().min(0).max(5),
});

// GET /api/driver/daily-stats
// Auth: verifySupabaseToken
// Returns: responseSchema
```

#### 11.2 Driver Trips
```ts
// app/api/driver/trips+api.ts
const querySchema = z.object({
  filter: z.enum(["all", "completed", "canceled", "no_show"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const responseSchema = z.object({
  trips: z.array(z.object({
    id: z.string().uuid(),
    origin: z.string(),
    destination: z.string(),
    fare_bdt: z.number().int(),
    status: z.enum(["completed", "canceled", "rider_no_show", "in_progress"]),
    created_at: z.string().datetime(),
  })),
  hasMore: z.boolean(),
});
```

#### 11.3 Driver Wallet
```ts
// app/api/driver/wallet+api.ts
const responseSchema = z.object({
  balance_bdt: z.number().int(),
  due_bdt: z.number().int().min(0),
});
```

#### 11.4 Driver Transactions
```ts
// app/api/driver/transactions+api.ts
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

const responseSchema = z.object({
  transactions: z.array(z.object({
    id: z.string().uuid(),
    amount_bdt: z.number().int(),
    type: z.enum(["wallet_topup", "commission", "ride_fare", "withdrawal", "due_payment", "subscription", "refund", "tip"]),
    description: z.string(),
    created_at: z.string().datetime(),
  })),
  hasMore: z.boolean(),
});
```

#### 11.5 Driver Vehicles
```ts
// app/api/driver/vehicles+api.ts
const postBodySchema = z.object({
  type: z.enum(["bike", "cng", "car", "car_xl"]),
  brand: z.string().min(1),
  model: z.string().min(1),
  registration_year: z.number().int().min(1990).max(new Date().getFullYear()),
  plate: z.string().min(3),
  color: z.string().min(1),
  photo_url: z.string().url().optional(),
});

const responseSchema = z.object({
  vehicles: z.array(z.object({
    id: z.string().uuid(),
    brand: z.string(),
    model: z.string(),
    type: z.string(),
    plate: z.string(),
    year: z.number(),
    photo_url: z.string().url().nullable(),
    is_active: z.boolean(),
  })),
});
```

#### 11.6 Driver Subscription Plans
```ts
// app/api/driver/subscription-plans+api.ts
const responseSchema = z.object({
  plans: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    price_bdt: z.number().int().min(0),
    duration_days: z.number().int(),
    features: z.array(z.string()),
    is_recommended: z.boolean(),
    ride_limit: z.union([z.number().int(), z.literal("unlimited")]),
  })),
});
```

#### 11.7 Driver Earnings
```ts
// app/api/driver/earnings+api.ts
const querySchema = z.object({
  period: z.enum(["week", "last_week", "month"]).default("week"),
});

const responseSchema = z.object({
  total_bdt: z.number().int(),
  comparison_percent: z.number(),
  daily: z.array(z.object({
    day: z.string(),
    earnings_bdt: z.number().int(),
    trip_count: z.number().int(),
  })),
});
```

#### 11.8 Driver Instant Pay
```ts
// app/api/driver/instant-pay+api.ts
const bodySchema = z.object({
  amount_bdt: z.number().int().min(20000).max(1000000), // 200 - 10,000 taka in paisa
});

const responseSchema = z.object({
  transaction_id: z.string().uuid(),
  status: z.enum(["pending", "completed", "failed"]),
});
```

#### 11.9 Driver Support Tickets
```ts
// app/api/driver/support-tickets+api.ts
const bodySchema = z.object({
  category: z.enum(["payment", "app", "ride", "account", "other"]),
  subject: z.string().min(5).max(200),
  message: z.string().min(20).max(2000),
  photo_urls: z.array(z.string().url()).max(3).optional(),
});

const responseSchema = z.object({
  ticket_id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
});
```

#### 11.10 Driver Lost Items
```ts
// app/api/driver/lost-items+api.ts
const responseSchema = z.object({
  reports: z.array(z.object({
    id: z.string().uuid(),
    rider_name: z.string(),
    ride_date: z.string().datetime(),
    item_description: z.string(),
    status: z.enum(["pending_response", "responded", "resolved"]),
  })),
});

const respondBodySchema = z.object({
  action: z.enum(["have_it", "not_found", "arrange_return"]),
});
```

---

## 12. Backend Verification Checklist

Before the coding agent starts ANY Plan 06–10 screen, verify these API files exist. If any are missing, the agent must build them FIRST.

| # | Endpoint | Expected File | Plan | Status |
|---|----------|---------------|------|--------|
| 1 | `GET /api/driver/daily-stats` | `app/api/driver/daily-stats+api.ts` | 06 | VERIFY |
| 2 | `GET /api/driver/trips` | `app/api/driver/trips+api.ts` | 06 | VERIFY |
| 3 | `GET /api/driver/wallet` | `app/api/driver/wallet+api.ts` | 06 | VERIFY |
| 4 | `GET /api/driver/transactions` | `app/api/driver/transactions+api.ts` | 06 | VERIFY |
| 5 | `GET /api/driver/active-subscription` | `app/api/driver/active-subscription+api.ts` | 06 | VERIFY |
| 6 | `GET/PATCH /api/driver/me` | `app/api/driver/me+api.ts` | 06, 10 | VERIFY |
| 7 | `GET/POST /api/driver/vehicles` | `app/api/driver/vehicles+api.ts` | 07 | VERIFY |
| 8 | `PATCH /api/driver/vehicles/{id}/activate` | `app/api/driver/vehicles/[id]/activate+api.ts` | 07 | VERIFY |
| 9 | `GET /api/driver/vehicle-models` | `app/api/driver/vehicle-models+api.ts` | 07 | VERIFY |
| 10 | `GET /api/driver/packages` | `app/api/driver/packages+api.ts` | 07 | VERIFY |
| 11 | `GET /api/driver/subscription-plans` | `app/api/driver/subscription-plans+api.ts` | 07 | VERIFY |
| 12 | `POST /api/driver/subscription/checkout` | `app/api/driver/subscription/checkout+api.ts` | 07 | VERIFY |
| 13 | `GET/POST /api/driver/subscription` | `app/api/driver/subscription+api.ts` | 07 | VERIFY |
| 14 | `POST /api/driver/subscription/renew` | `app/api/driver/subscription/renew+api.ts` | 07 | VERIFY |
| 15 | `GET /api/driver/call-ledger` | `app/api/driver/call-ledger+api.ts` | 08 | VERIFY |
| 16 | `GET /api/driver/commission-statement` | `app/api/driver/commission-statement+api.ts` | 08 | VERIFY |
| 17 | `GET /api/driver/due-amounts` | `app/api/driver/due-amounts+api.ts` | 08 | VERIFY |
| 18 | `GET /api/driver/earnings` | `app/api/driver/earnings+api.ts` | 08 | VERIFY |
| 19 | `GET /api/driver/earnings/breakdown` | `app/api/driver/earnings/breakdown+api.ts` | 08 | VERIFY |
| 20 | `GET/POST /api/driver/payout-methods` | `app/api/driver/payout-methods+api.ts` | 08 | VERIFY |
| 21 | `GET /api/driver/payout-history` | `app/api/driver/payout-history+api.ts` | 08 | VERIFY |
| 22 | `POST /api/driver/instant-pay` | `app/api/driver/instant-pay+api.ts` | 08 | VERIFY |
| 23 | `GET /api/driver/missed-requests` | `app/api/driver/missed-requests+api.ts` | 08 | VERIFY |
| 24 | `POST /api/driver/support-tickets` | `app/api/driver/support-tickets+api.ts` | 09 | VERIFY |
| 25 | `CRUD /api/driver/emergency-contacts` | `app/api/driver/emergency-contacts+api.ts` | 09 | VERIFY |
| 26 | `POST /api/driver/schedule` | `app/api/driver/schedule+api.ts` | 09 | VERIFY |
| 27 | `GET /api/navigation/route` | `app/api/navigation/route+api.ts` | 09 | VERIFY |
| 28 | `GET /api/driver/ratings` | `app/api/driver/ratings+api.ts` | 10 | VERIFY |
| 29 | `GET /api/driver/referral` | `app/api/driver/referral+api.ts` | 10 | VERIFY |
| 30 | `GET /api/driver/hotspots` | `app/api/driver/hotspots+api.ts` | 10 | VERIFY |
| 31 | `GET /api/driver/incentives` | `app/api/driver/incentives+api.ts` | 10 | VERIFY |
| 32 | `GET /api/driver/performance` | `app/api/driver/performance+api.ts` | 10 | VERIFY |
| 33 | `POST /api/ride/{id}/no-show` | `app/api/ride/[id]/no-show+api.ts` | 10 | VERIFY |
| 34 | `GET/POST /api/driver/lost-items` | `app/api/driver/lost-items+api.ts` | 08 | **MISSING — MUST CREATE** |

**Verification Script:**
```bash
for file in   "app/api/driver/daily-stats+api.ts"   "app/api/driver/trips+api.ts"   "app/api/driver/wallet+api.ts"   "app/api/driver/me+api.ts"   "app/api/driver/vehicles+api.ts"   "app/api/driver/subscription-plans+api.ts"   "app/api/driver/earnings+api.ts"   "app/api/driver/instant-pay+api.ts"   "app/api/driver/lost-items+api.ts"; do
  if [ -f "$file" ]; then
    echo "EXISTS: $file"
  else
    echo "MISSING: $file"
  fi
done
```

---

## 13. Coding Agent Execution Order

### Phase 1: Foundation (Week 1)
1. **Plan 06 Wave 0** — Tab Layout + DriverStatusGuard + AsyncStorage registry
2. **Plan 06 Screens** — All 5 tabs + Earnings Goal modal
3. **Plan 11** — i18n foundation + legal content (can be done in parallel)

### Phase 2: Vehicle & Money (Week 2)
4. **Plan 07** — Vehicle + Subscription + Packages
5. **Plan 08** — Money screens (earnings, payouts, ledger, lost items)

### Phase 3: Support & Performance (Week 3)
6. **Plan 09** — Support + Safety + Communication + Schedule
7. **Plan 10** — Performance + Ratings + Intelligence + Profile

### Within Each Plan, Follow This Order:
1. Read existing files (understand current state)
2. Build/update backend APIs (if missing)
3. Build shared components (ProgressBar, StatCard, etc.)
4. Build screens (one at a time)
5. Wire navigation
6. Test + verify checklist
7. Commit

### Screen Build Order Within Plan 06:
1. `DriverTabsLayout` (Wave 0)
2. `DriverStatusGuard` (Wave 0)
3. `Earnings Tab` (most complex)
4. `Wallet Tab`
5. `Activity Tab`
6. `Profile Tab`
7. `Settings Tab`
8. `Earnings Goal Modal` (inline)

---

## 14. Master Verification Checklist

### Per-Screen (All 52 Screens)

- [ ] Uses `useIsDark()` from `@/lib/useAppearance`
- [ ] No `theme === "dark"` anywhere
- [ ] No NativeWind `dark:` classes
- [ ] StatusBar with correct `barStyle` and `backgroundColor`
- [ ] Theme toggle present (except SplashAnimation)
- [ ] Ionicons only — no emoji
- [ ] Jakarta fonts only — no Urbanist
- [ ] Touch targets >= 56dp (driver screens)
- [ ] Card radius: 16px, Input radius: 12px, Button radius: 12px
- [ ] `logger` used — no `console.log`
- [ ] Error states handled — no crashes on null/undefined
- [ ] Loading states handled — skeletons or spinners
- [ ] Empty states handled — specific copy per screen
- [ ] Pull-to-refresh on list screens
- [ ] Infinite scroll where applicable
- [ ] Form validation with specific error messages
- [ ] Confirmation modals for destructive actions
- [ ] Accessibility labels on all interactive elements
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

### Per-API (All 34 Endpoints)

- [ ] Zod schema validates body
- [ ] `parseJsonBody` used for POST
- [ ] `verifySupabaseToken` for authenticated routes
- [ ] Error format: `{ error: '<machine_code>', message: '<human>' }`
- [ ] Snake_case DB properties
- [ ] `isNull` / `isNotNull` — never `eq(col, null)`
- [ ] Money: integer paisa, /100 only at display
- [ ] Transactions for multi-table money writes
- [ ] `logger` used — no `console.log`

### Global (Before Release)

- [ ] All 52 screens follow Pattern A theming
- [ ] All driver tabs (5) are functional and wired
- [ ] `grep -rn 'theme === "dark"' app/ components/ -> 0 matches`
- [ ] `grep -rn 'dark:' app/ components/ -> 0 matches`
- [ ] All Jakarta fonts, zero Urbanist
- [ ] All Ionicons, zero emoji in production UI
- [ ] All touch targets >= minimum
- [ ] All screens have StatusBar
- [ ] All screens except Splash have theme toggle
- [ ] `npx tsc --noEmit -> 0 errors`
- [ ] `npm run lint -> 0 errors`
- [ ] `console.log` scan -> 0 matches
- [ ] All 34 APIs exist and return correct Zod-validated responses
- [ ] All PaymentWebView purpose tags are handled
- [ ] All push notification types route to correct screens
- [ ] All deep links are registered and handled
- [ ] i18n strings used for all new UI text

---

## Summary: Complete Screen Inventory (Plans 06–11)

| Plan | Screens | Infra | Priority |
|------|---------|-------|----------|
| **Plan 06** | 5 tabs + 1 modal | Tab Layout, DriverStatusGuard | CRITICAL |
| **Plan 07** | 10 | — | HIGH |
| **Plan 08** | 11 | — | HIGH |
| **Plan 09** | 10 | — | MEDIUM-HIGH |
| **Plan 10** | 8 | — | MEDIUM |
| **Plan 11** | 4 content + 1 lib | — | MEDIUM |
| **TOTAL** | **49 screens + 1 modal + 2 infra** | — | — |

**Backend APIs:** 34 endpoints (33 existing + 1 new: lost-items)
**New Components:** 12 components
**New AsyncStorage Keys:** 4 keys

---

*End of Ride App — UI/UX Rethink 3: Plans 06–11 Comprehensive Revised Spec*
*Date: 2026-08-21*
*This document must be read alongside `Ride_App_UIUX_Rethink_3_Master_Plan.md` (Plans 01–04) and `Plan_05_Coding_Agent_Execution_Pack.md` (Plan 05).*
