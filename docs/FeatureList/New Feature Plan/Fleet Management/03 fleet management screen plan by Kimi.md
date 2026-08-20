I can no longer write files due to tool budget exhaustion. I will deliver the complete Fleet Management UI/UX Implementation Master Plan directly in this response. Copy this into `/mnt/agents/output/Fleet_Management_UIUX_Master_Plan.md` (or have the coding agent read this response).

---

Fleet Management — UI/UX Implementation Master Plan v1.0 (MVP1 Screens Only, External Deferred to MVP3)

Date: 2026-08-16

Scope: MVP1 — Native Fleet Management (12–16 screens). External/API fleet (MVP3) is architecture-ready but NOT implemented yet.

Target Agent: Dumb coding agent — needs exact paths, exact layouts, exact colors, exact API contracts.

Source Documents: `FLEET-MANAGEMENT-V3.xml`, `AGENTS.md`, `Ride_App_UIUX_Rethink_3_Master_Plan.md`

---

Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Architecture & Navigation](#2-architecture--navigation)
3. [Design System Rules (MUST FOLLOW)](#3-design-system-rules-must-follow)
4. [Screen-by-Screen Specifications (F01–F16 + Onboarding)](#4-screen-by-screen-specifications)
5. [Shared Components Inventory](#5-shared-components-inventory)
6. [State Management (Zustand Store)](#6-state-management)
7. [API Endpoint Map](#7-api-endpoint-map)
8. [File Inventory (Exact Paths)](#8-file-inventory)
9. [Implementation Order & Dependencies](#9-implementation-order)
10. [Appendix: Data Model Quick Reference](#10-appendix-data-model)

---

1. Executive Summary

Fleet Management is a new capability layer on top of the existing ride-hailing platform. A user with the `FLEET_OWNER` capability sees a fourth app mode (alongside Rider, Driver, Admin). The mobile UX stays shallow: Dashboard | Operations | Finance | More. All complexity lives in backend/admin.

Key Principles:
- One auth system — no separate fleet login.
- Fleet extends existing `users`, `drivers`, `vehicles`, `trips` via join tables — never duplicates them.
- Reporting/ledger only in MVP1 — no fleet escrow, fare splitting, or commission engine.
- Native trips are the existing `trips` table. Fleet revenue is a read query (join via `fleet_vehicle_assignments`), not a new write path.
- All money is integer paisa (BDT). Divide by 100 only at display.

---

2. Architecture & Navigation

2.1 Route Group

```
app/(main)/(fleet)/           ← New fleet owner route group
├── (tabs)/                   ← Bottom tab navigator (4 tabs)
│   ├── _layout.tsx           ← Tab layout: Dashboard | Operations | Finance | More
│   ├── dashboard/            ← Tab 1: Fleet Dashboard (F01)
│   │   └── index.tsx
│   ├── operations/           ← Tab 2: Operations hub (F09 Trips, F06 Drivers, F03 Vehicles)
│   │   └── index.tsx
│   ├── finance/              ← Tab 3: Fleet Finance (F12)
│   │   └── index.tsx
│   └── more/                 ← Tab 4: More menu (F13, F14, F15, F16, Settings)
│       └── index.tsx
├── _layout.tsx               ← Fleet layout with FleetStatusGuard + FloatingNavMenu
├── onboarding/               ← Fleet owner onboarding flow
│   └── index.tsx
├── vehicles/                 ← Stack screens under tabs
│   ├── index.tsx             ← F03 Vehicle List
│   ├── [id].tsx              ← F04 Vehicle Detail
│   └── add.tsx               ← F05 Add Vehicle
├── drivers/
│   ├── index.tsx             ← F06 Driver List
│   ├── [id].tsx              ← F07 Driver Detail
│   └── assign.tsx            ← F08 Driver↔Vehicle Assignment
├── trips/
│   ├── index.tsx             ← F09 Fleet Trips
│   └── [id].tsx              ← F10 Trip Detail
├── finance/
│   └── detail.tsx            ← F12 Finance Detail / Breakdown
├── alerts/
│   └── index.tsx             ← F16 Alerts
└── profile/
    └── index.tsx             ← Fleet Profile (F02) + Role Switcher
```

2.2 Bottom Tab Bar (4 Tabs)

Tab	Icon (Ionicons)	Label	Screen	
1	`grid-outline` / `grid`	Dashboard	`dashboard/index.tsx`	
2	`car-outline` / `car`	Operations	`operations/index.tsx`	
3	`wallet-outline` / `wallet`	Finance	`finance/index.tsx`	
4	`menu-outline` / `menu`	More	`more/index.tsx`	

Tab bar styling: Follow the existing `(rider)/(tabs)/_layout.tsx` pattern. Use `tabBarActiveTintColor: colors.primary`, `tabBarInactiveTintColor: colors.textSecondary`.

2.3 Floating Nav Menu (Hamburger FAB)
Reuse `components/FloatingNavMenu.tsx`. Fleet menu items:
- Dashboard
- Vehicles
- Drivers
- Trips
- Finance
- Alerts
- Fleet Profile
- Switch Mode (if multi-capability)

2.4 Role Switching
From Fleet Profile screen (`app/(main)/(fleet)/profile/index.tsx`), show:

```
Current Mode: Fleet Owner
[Switch to Rider]  ← if user has RIDER capability
[Switch to Driver] ← if user has DRIVER capability
```

Use `router.replace()` — no logout. Store current mode in `useFleetStore.activeMode`.

---

3. Design System Rules (MUST FOLLOW)

3.1 Theming — Pattern A ONLY

```tsx
const { isDark } = useIsDark(); // from lib/useAppearance.ts
const bg = isDark ? colors.bgDark : colors.bgLight;
const surface = isDark ? colors.surfaceDark : colors.surfaceLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
const border = isDark ? colors.borderDark : colors.borderLight;
```

NO NativeWind `dark:` classes in fleet screens. Pattern A only.

3.2 Colors (from `theme/goRide.ts`)

Token	Light	Dark	
`bg`	`#F8FAFC`	`#181A20`	
`surface`	`#FFFFFF`	`#181A20`	
`surfaceElevated`	—	`#1C1E23`	
`border`	`#E5E7EB`	`#35383F`	
`textPrimary`	`#1C1E23`	`#FFFFFF`	
`textSecondary`	`#6B7280`	`#9CA3AF`	
`textDisabled`	`#D1D5DB`	`#555555`	
`primary`	`#0CC25F`	`#0CC25F`	
`primaryLight`	`#E6F7EE`	`#E6F7EE`	
`danger`	`#E31D1C`	`#E31D1C`	
`dangerLight`	`#FDE8E8`	`#FDE8E8`	
`info`	`#2E42A5`	`#2E42A5`	
`amber`	`#F59E0B`	`#F59E0B`	

3.3 Typography (Driver/Fleet sizing — one step larger than rider)

Element	Size	Weight	Font	
Screen title	22px	Bold	Jakarta-Bold	
Section header	18px	SemiBold	Jakarta-SemiBold	
Card title	16px	SemiBold	Jakarta-SemiBold	
Body text	16px	Regular	Jakarta-Regular	
Label / caption	14px	Medium	Jakarta-Medium	
Small caption	12px	Regular	Jakarta-Regular	
Metric number	28px	Bold	Jakarta-Bold	
Metric label	14px	Medium	Jakarta-Medium	

3.4 Icons
Ionicons ONLY. No emoji. No custom PNG icons unless absolutely necessary.

3.5 Spacing & Radii
- Screen padding: `px-4` (16px horizontal)
- Card padding: `p-4` (16px)
- Card border radius: `rounded-2xl` (16px)
- Card gap: `gap-3` (12px)
- Section gap: `gap-4` (16px)
- Input height: 52px

3.6 Status Colors

Status	Background	Text	
Active / Online	`primaryLight`	`primary`	
On Trip	`info` bg (rgba)	`info`	
Available	`primaryLight`	`primary`	
Maintenance	`amber` bg (rgba)	`amber`	
Suspended	`dangerLight`	`danger`	
Offline	gray-100	gray-500	
Pending	blue-50	blue-600	

3.7 Money Display

```tsx
// ALWAYS use lib/money.ts
import { formatBdt } from '@/lib/money';
// formatBdt(42500) → "৳425.00"
```

3.8 Theme Toggle
Every fleet screen MUST have a sun/moon toggle in the header (top-right). Use `Ionicons` `sunny-outline` / `moon-outline`. Toggle cycles `light ↔ dark` via `useAppearance()`.

---

4. Screen-by-Screen Specifications

F01 — Fleet Dashboard (`app/(main)/(fleet)/(tabs)/dashboard/index.tsx`)
Tab: Dashboard (Tab 1)

Purpose: At-a-glance fleet health. Primary entry point.

Layout (top to bottom):

```
┌─────────────────────────────────────┐
│ 🌙  Fleet Name          [notif-bell]│  ← Header row, theme toggle, alerts badge
├─────────────────────────────────────┤
│ [Fleet Status Badge: ACTIVE]        │
├─────────────────────────────────────┤
│  METRICS GRID (2 columns, 3 rows)   │
│  ┌────────────┐  ┌────────────┐    │
│  │ 24         │  │ 28         │    │
│  │ Vehicles   │  │ Drivers    │    │
│  └────────────┘  └────────────┘    │
│  ┌────────────┐  ┌────────────┐    │
│  │ 9          │  │ 11         │    │
│  │ On Trip    │  │ Available  │    │
│  └────────────┘  └────────────┘    │
│  ┌────────────┐  ┌────────────┐    │
│  │ 2          │  │ 84         │    │
│  │ Maintenance│  │ Today Trips│    │
│  └────────────┘  └────────────┘    │
├─────────────────────────────────────┤
│  TODAY'S REVENUE CARD               │
│  ┌────────────────────────────────┐ │
│  │ ৳42,500        [trend icon]   │ │
│  │ Today's Revenue                │ │
│  └────────────────────────────────┘ │
├─────────────────────────────────────┤
│  QUICK ACTIONS (3 buttons horizontal) │
│  [Vehicles]  [Drivers]  [Trips]     │
├─────────────────────────────────────┤
│  ALERTS PREVIEW (max 3 items)       │
│  ⚠ 3 documents expiring             │
│  🔧 2 vehicles need maintenance     │
│  [View All Alerts →]                │
└─────────────────────────────────────┘
```

Components used:
- `FleetMetricCard` (new) — 2-col grid, big number + label
- `FleetRevenueCard` (new) — full width, large amount
- `QuickActionButton` (new) — icon + label, horizontal row
- `AlertPreviewRow` (new) — icon + text + chevron

Data needed (from API):

```ts
interface FleetDashboardData {
  fleet: { id: string; name: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' };
  metrics: {
    totalVehicles: number;
    totalDrivers: number;
    onTrip: number;
    available: number;
    maintenance: number;
    todayTrips: number;
    todayRevenueBdt: number; // paisa
  };
  alertsPreview: Array<{
    id: string;
    type: 'document' | 'maintenance' | 'driver' | 'trip' | 'subscription';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
  }>;
}
```

API: `GET /api/fleet/dashboard`

---

F02 — Fleet Profile (`app/(main)/(fleet)/profile/index.tsx`)
Purpose: View/edit fleet info. Role switching.

Layout:

```
┌─────────────────────────────────────┐
│ ← Fleet Profile        [Edit] 🌙   │
├─────────────────────────────────────┤
│ [Fleet Avatar: building icon]       │
│ Fleet Name                          │
│ [ACTIVE badge]                      │
├─────────────────────────────────────┤
│ FLEET INFORMATION                   │
│ ┌─────────────────────────────────┐ │
│ │ Fleet Type        Native        │ │
│ │ Owner             John Doe      │ │
│ │ Phone             +8801XXXX     │ │
│ │ Email             a@b.com       │ │
│ │ Address           Dhaka         │ │
│ │ Business Name     ABC Motors    │ │
│ │ Trade License     TRD-1234      │ │
│ │ Tax ID            9876543210    │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ SUBSCRIPTION                        │
│ ┌─────────────────────────────────┐ │
│ │ Plan: Fleet Pro                 │ │
│ │ Vehicles: 24 / 50               │ │
│ │ Drivers: 28 / 75                │ │
│ │ Renews: 16 Sep 2026             │ │
│ │ [Manage Subscription →]         │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ROLE SWITCHING (if multi-capability)│
│ ┌─────────────────────────────────┐ │
│ │ Current: Fleet Owner            │ │
│ │ [Switch to Rider]             │ │
│ │ [Switch to Driver]            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

API: `GET /api/fleet/profile`, `PATCH /api/fleet/profile`

---

F03 — Vehicle List (`app/(main)/(fleet)/vehicles/index.tsx`)
Purpose: All fleet vehicles with filters and search.

Layout:

```
┌─────────────────────────────────────┐
│ ← Vehicles (24)        [+] 🌙       │  ← Add button top-right
├─────────────────────────────────────┤
│ [🔍 Search reg, vehicle ID, driver] │
├─────────────────────────────────────┤
│ [All] [Active] [On Trip] [Maint.]   │  ← Horizontal filter chips
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🚗 DHA-12345        [ACTIVE]  │ │
│ │ Toyota Corolla | White          │ │
│ │ Driver: Rahim | 124 trips       │ │
│ │ Documents: ✅ Valid             │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🚗 DHA-67890        [ON TRIP] │ │
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Filter chips: All, Active, Available, On Trip, Maintenance, Suspended, Expired Documents

Search: Debounced 300ms. Searches `registration_number`, `vehicle_id`, `driver_name`.

Vehicle Card Component (`FleetVehicleCard`):
- Left: Vehicle icon (Ionicons `car-outline` or `bicycle-outline` based on category)
- Middle: Reg number (bold), Make/Model/Color (secondary), Driver name, Trip count
- Right: Status badge

API: `GET /api/fleet/vehicles?status=&search=&page=&limit=`

---

F04 — Vehicle Detail (`app/(main)/(fleet)/vehicles/[id].tsx`)
Purpose: Full vehicle info, driver history, documents, trips.

Layout:

```
┌─────────────────────────────────────┐
│ ← DHA-12345          [Edit] 🌙    │
├─────────────────────────────────────┤
│ [Large vehicle icon]                │
│ DHA-12345                           │
│ Toyota Corolla 2020 | White         │
│ [ACTIVE badge]                      │
├─────────────────────────────────────┤
│ [Overview] [Driver] [Docs] [Trips]  │  ← Horizontal tab switcher
├─────────────────────────────────────┤
│ OVERVIEW TAB:                       │
│ ┌─────────────────────────────────┐ │
│ │ Registration    DHA-12345     │ │
│ │ Make            Toyota        │ │
│ │ Model           Corolla       │ │
│ │ Year            2020          │ │
│ │ Color           White         │ │
│ │ Engine          1500cc        │ │
│ │ Chassis         CHA-987654    │ │
│ │ Fuel            Petrol        │ │
│ │ Seats           4             │ │
│ │ Category        car_economy   │ │
│ │ BRTA Class      Sedan         │ │
│ │ Status          ACTIVE        │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ CURRENT DRIVER                      │
│ ┌─────────────────────────────────┐ │
│ │ [Avatar] Rahim Ahmed            │ │
│ │ Assigned: 15 Jan 2026           │ │
│ │ [Change Driver] [Remove]        │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ASSIGNMENT HISTORY                  │
│ ┌─────────────────────────────────┐ │
│ │ DHA-9876 | Jan 10 → Feb 20      │ │
│ │ DHA-5555 | Dec 1 → Jan 9        │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Tab switcher: Overview | Driver | Documents | Trips

Documents tab: Reuse existing document system — list document type, status, expiry.

Trips tab: Last 10 trips for this vehicle, paginated.

API: `GET /api/fleet/vehicles/[id]`

---

F05 — Add Vehicle (`app/(main)/(fleet)/vehicles/add.tsx`)
Purpose: Add existing platform vehicle to fleet.

Layout — Step by Step (2 steps):

```
Step 1: Search Vehicle
┌─────────────────────────────────────┐
│ ← Add Vehicle          🌙         │
├─────────────────────────────────────┤
│ Enter Registration Number           │
│ [________________] [Search]       │
├─────────────────────────────────────┤
│ Results:                            │
│ ┌─────────────────────────────────┐ │
│ │ ○ DHA-12345 | Toyota Corolla  │ │
│ │   Status: Active | Eligible    │ │
│ └─────────────────────────────────┘ │
│ [Next →]                            │
└─────────────────────────────────────┘

Step 2: Confirm & Add
┌─────────────────────────────────────┐
│ ← Confirm Vehicle        🌙         │
├─────────────────────────────────────┤
│ Vehicle: DHA-12345                  │
│ Make/Model: Toyota Corolla 2020     │
│ Category: car_economy             │
│ Eligibility: ✅ Eligible          │
│ Current Status: Active              │
├─────────────────────────────────────┤
│ [Confirm & Add to Fleet]          │
└─────────────────────────────────────┘
```

Validation: Vehicle must be eligible, not already in another fleet (or handle transfer), documents valid.

API: `GET /api/fleet/vehicles/search?reg=`, `POST /api/fleet/vehicles`

---

F06 — Driver List (`app/(main)/(fleet)/drivers/index.tsx`)
Purpose: All fleet drivers with filters and search.

Layout: Same structure as F03 Vehicle List.

Driver Card (`FleetDriverCard`):
- Left: Avatar circle with `Ionicons person` (themed placeholder)
- Middle: Driver name (bold), Phone, Current vehicle reg, Trip count, Rating stars
- Right: Status badge

Filters: All, Online, Offline, On Trip, Suspended, Documents Expired

API: `GET /api/fleet/drivers?status=&search=&page=&limit=`

---

F07 — Driver Detail (`app/(main)/(fleet)/drivers/[id].tsx`)
Purpose: Full driver info, current vehicle, trip history, performance.

Layout: Same tab pattern as F04.

```
Tabs: Profile | Documents | Current Vehicle | Trip History | Performance | Earnings | Compliance
```

Profile tab:
- Name, Phone, Email, NID, License number, Rating, Total trips, Joined date
- Status badge

Current Vehicle tab:
- Shows assigned vehicle card (or "No vehicle assigned")
- [Assign Vehicle] button

Performance tab (MVP1 basic):
- Trips this week / month
- Revenue this week / month (reporting only)
- Rating trend

API: `GET /api/fleet/drivers/[id]`

---

F08 — Driver↔Vehicle Assignment (`app/(main)/(fleet)/drivers/assign.tsx`)
Purpose: Assign, change, or remove driver-vehicle pairing. Historical record.

Layout:

```
┌─────────────────────────────────────┐
│ ← Assign Driver        🌙           │
├─────────────────────────────────────┤
│ DRIVER                              │
│ ┌─────────────────────────────────┐ │
│ │ [Avatar] Rahim Ahmed          │ │
│ │ +8801XXXXXXXXX                │ │
│ │ Status: ACTIVE                │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ SELECT VEHICLE                      │
│ ┌─────────────────────────────────┐ │
│ │ ○ DHA-12345 | Toyota Corolla  │ │  ← Radio selection
│ │   Currently: Unassigned        │ │
│ ├─────────────────────────────────┤ │
│ │ ○ DHA-67890 | Honda Civic     │ │
│ │   Currently: Assigned to Karim │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ REASON (optional)                   │
│ [________________]                  │
├─────────────────────────────────────┤
│ [Confirm Assignment]                │
└─────────────────────────────────────┘
```

Validation (server-side, show errors):
- Driver belongs to fleet
- Vehicle belongs to fleet
- Driver active, vehicle active
- No conflicting active assignment
- Required documents valid

API: `POST /api/fleet/assignments`

```ts
body: {
  driver_id: string;
  vehicle_id: string;
  reason?: string;
}
```

Remove assignment: `PATCH /api/fleet/assignments/[id]/unassign` with reason.

---

F09 — Fleet Trips (`app/(main)/(fleet)/trips/index.tsx`)
Purpose: All trips by fleet vehicles/drivers.

Layout:

```
┌─────────────────────────────────────┐
│ ← Fleet Trips          [filter] 🌙│
├─────────────────────────────────────┤
│ [Today] [Week] [Month] [Custom]     │  ← Date range chips
├─────────────────────────────────────┤
│ [All Vehicles ▼] [All Drivers ▼]    │  ← Filter dropdowns
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🚗 DHA-12345 | Rahim           │ │
│ │ 16 Aug, 10:30 AM               │ │
│ │ Gulshan → Banani | ৳250        │ │
│ │ [COMPLETED] [NATIVE]           │ │
│ └─────────────────────────────────┘ │
│ ...                                 │
└─────────────────────────────────────┘
```

Trip Card (`FleetTripCard`):
- Top row: Vehicle reg | Driver name
- Middle: Date/time, Route (pickup → destination), Fare
- Bottom: Status badge + Source badge (NATIVE / EXTERNAL_API / MANUAL)

Filters: Date range, Vehicle dropdown, Driver dropdown, Status, Source

Pagination: Infinite scroll, 20 per page.

API: `GET /api/fleet/trips?from=&to=&vehicle_id=&driver_id=&status=&source=&page=&limit=`

---

F10 — Trip Detail (`app/(main)/(fleet)/trips/[id].tsx`)
Purpose: Full trip info for fleet context.

Layout:

```
┌─────────────────────────────────────┐
│ ← Trip #TRP-12345      🌙           │
├─────────────────────────────────────┤
│ [NATIVE] [COMPLETED]                │
├─────────────────────────────────────┤
│ TRIP INFO                           │
│ ┌─────────────────────────────────┐ │
│ │ Vehicle:    DHA-12345           │ │
│ │ Driver:     Rahim Ahmed         │ │
│ │ Date:       16 Aug, 10:30 AM    │ │
│ │ Pickup:     Gulshan 1           │ │
│ │ Dropoff:    Banani 11           │ │
│ │ Distance:   4.2 km              │ │
│ │ Duration:   18 min              │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ FARE BREAKDOWN                      │
│ ┌─────────────────────────────────┐ │
│ │ Gross Fare      ৳250.00        │ │
│ │ Platform Fee    -৳37.50         │ │
│ │ Driver Share    ৳212.50         │ │
│ │ ─────────────────────────────   │ │
│ │ Fleet Revenue   ৳212.50         │ │  ← What the driver earned
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [View on Map] [Download Receipt]    │
└─────────────────────────────────────┘
```

Note: For MVP1, "Fleet Revenue" = Driver Share (what the fleet's driver earned). No commission split. This is reporting only.

API: `GET /api/fleet/trips/[id]`

---

F12 — Fleet Finance (`app/(main)/(fleet)/(tabs)/finance/index.tsx`)
Tab: Finance (Tab 3)

Layout:

```
┌─────────────────────────────────────┐
│ Fleet Finance          🌙           │
├─────────────────────────────────────┤
│ PERIOD: [Today] [Week] [Month]      │
├─────────────────────────────────────┤
│ REVENUE SUMMARY                     │
│ ┌─────────────────────────────────┐ │
│ │ ৳42,500                        │ │
│ │ Total Revenue (Today)          │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ BREAKDOWN                           │
│ ┌─────────────────────────────────┐ │
│ │ Gross Fare       ৳50,000      │ │
│ │ Platform Fee     -৳7,500      │ │
│ │ Adjustments      +৳0          │ │
│ │ ────────────────────────────   │ │
│ │ Net Fleet Revenue ৳42,500     │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ BY VEHICLE (top 5)                  │
│ ┌─────────────────────────────────┐ │
│ │ DHA-12345    ৳12,500  ███████  │ │
│ │ DHA-67890    ৳8,200   █████    │ │
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ BY DRIVER (top 5)                   │
│ ┌─────────────────────────────────┐ │
│ │ Rahim        ৳15,000  ████████ │ │
│ │ Karim        ৳9,500   █████    │ │
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

API: `GET /api/fleet/finance?period=today|week|month`

---

F13 — Fleet Subscription (`app/(main)/(fleet)/more/subscription.tsx`)
Purpose: View/manage fleet subscription plan.

Layout:

```
┌─────────────────────────────────────┐
│ ← Subscription         🌙           │
├─────────────────────────────────────┤
│ CURRENT PLAN                        │
│ ┌─────────────────────────────────┐ │
│ │ Fleet Pro                       │ │
│ │ ৳2,999/month                   │ │
│ │                                 │ │
│ │ Vehicles:  24 / 50   ████░░   │ │
│ │ Drivers:   28 / 75   ███░░░   │ │
│ │ API Integrations: 0 / 2        │ │
│ │                                 │ │
│ │ Renews: 16 September 2026      │ │
│ │ Status: ACTIVE                │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ AVAILABLE PLANS                     │
│ ┌─────────────────────────────────┐ │
│ │ Fleet Basic    ৳999/mo         │ │
│ │ 10 vehicles | 15 drivers        │ │
│ │ [Upgrade]                       │ │
│ ├─────────────────────────────────┤ │
│ │ Fleet Pro      ৳2,999/mo       │ │
│ │ 50 vehicles | 75 drivers        │ │
│ │ [Current Plan]                  │ │
│ ├─────────────────────────────────┤ │
│ │ Fleet Enterprise ৳7,999/mo     │ │
│ │ Unlimited                       │ │
│ │ [Upgrade]                       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

API: `GET /api/fleet/subscription`, `POST /api/fleet/subscription/change`

---

F14 — Maintenance (MVP2 — placeholder screen only in MVP1)
`app/(main)/(fleet)/more/maintenance.tsx`

Show: "Maintenance tracking coming soon" with a simple list of vehicles with `next_service_date` if available from vehicle record.

F15 — Documents / Compliance (MVP2 — reuse existing document viewer)
`app/(main)/(fleet)/more/documents.tsx`

Show aggregated document status across all fleet vehicles/drivers:
- Expired (red)
- Expiring Soon < 30 days (amber)
- Valid (green)

F16 — Alerts (`app/(main)/(fleet)/alerts/index.tsx`)
Purpose: Centralized alert feed.

Layout:

```
┌─────────────────────────────────────┐
│ Alerts (5)             [✓ Mark All]🌙│
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🔴 CRITICAL                     │ │
│ │ Vehicle fitness expires today   │ │
│ │ DHA-12345 | 2 hours ago         │ │
│ │ [View →]                        │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🟡 WARNING                      │ │
│ │ Driver license expiring soon    │ │
│ │ Rahim | 1 day ago               │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🔵 INFO                         │ │
│ │ Fleet subscription renews in 3d │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Alert Card (`FleetAlertCard`):
- Left border color matches severity (red/amber/blue)
- Title + message + entity reference + timestamp
- Tap to navigate to relevant screen
- Swipe to dismiss / mark read

API: `GET /api/fleet/alerts`, `PATCH /api/fleet/alerts/[id]/read`, `PATCH /api/fleet/alerts/read-all`

---

Onboarding — Become a Fleet Owner (`app/(main)/(fleet)/onboarding/index.tsx`)
Purpose: Multi-step wizard to activate FLEET_OWNER capability.

Flow:

```
Step 1: Fleet Information
  - Fleet Name (text input)
  - Business Name (text input)
  - Trade License Number (text input)
  - Tax ID (text input, optional)
  - Address (text input)
  - Phone (pre-filled from user profile, editable)
  - Email (pre-filled, editable)

Step 2: Select Plan
  - Show plan cards (Basic / Pro / Enterprise)
  - Highlight limits and price
  - [Select & Continue]

Step 3: Payment
  - Reuse existing PortPos payment flow
  - `lib/portpos.ts` + `PaymentWebView` component
  - Amount = plan price in paisa

Step 4: Success
  - Success checkmark animation
  - "Your fleet has been created!"
  - [Go to Dashboard] [Add Vehicles] [Add Drivers]
```

API: `POST /api/fleet/create` → returns fleet object

Then: `POST /api/fleet/subscription` to activate plan

---

Operations Hub (`app/(main)/(fleet)/(tabs)/operations/index.tsx`)
Tab: Operations (Tab 2)

Layout:

```
┌─────────────────────────────────────┐
│ Operations             🌙           │
├─────────────────────────────────────┤
│ QUICK STATS                         │
│ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │ 9      │ │ 11     │ │ 2      │   │
│ │ On Trip│ │Availabl│ │Maint.  │   │
│ └────────┘ └────────┘ └────────┘   │
├─────────────────────────────────────┤
│ LIVE VEHICLES                       │
│ ┌─────────────────────────────────┐ │
│ │ [Map thumbnail or list]         │ │
│ │ 9 vehicles currently on trip   │ │
│ │ [View Live Map →]               │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ RECENT TRIPS                        │
│ ┌─────────────────────────────────┐ │
│ │ [Trip card]                     │ │
│ │ [Trip card]                     │ │
│ │ [View All Trips →]              │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ DRIVER STATUS                       │
│ ┌─────────────────────────────────┐ │
│ │ Online: 18 | Offline: 10       │ │
│ │ [View All Drivers →]          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

More Menu (`app/(main)/(fleet)/(tabs)/more/index.tsx`)
Tab: More (Tab 4)

Layout: Settings-style list (reuse `components/plan03/SettingsRow.tsx`)

```
┌─────────────────────────────────────┐
│ More                   🌙           │
├─────────────────────────────────────┤
│ FLEET                               │
│ ┌─────────────────────────────────┐ │
│ │ [🚗] Vehicles              →   │ │
│ │ [👤] Drivers               →   │ │
│ │ [📋] Trips                 →   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ MANAGEMENT                          │
│ ┌─────────────────────────────────┐ │
│ │ [📄] Documents             →   │ │
│ │ [🔧] Maintenance         →   │ │
│ │ [💳] Subscription        →   │ │
│ │ [🔔] Alerts (3)          →   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ SETTINGS                            │
│ ┌─────────────────────────────────┐ │
│ │ [⚙️] Fleet Profile         →   │ │
│ │ [🌐] Language              →   │ │
│ │ [🎨] Appearance            →   │ │
│ │ [❓] Help & Support        →   │ │
│ │ [🚪] Logout                →   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

5. Shared Components Inventory

New Components to Create

Component	Path	Purpose	Props	
`FleetMetricCard`	`components/fleet/FleetMetricCard.tsx`	Dashboard metric tile	`label: string, value: number, icon: string, trend?: number`	
`FleetRevenueCard`	`components/fleet/FleetRevenueCard.tsx`	Revenue display card	`amountBdt: number, period: string, comparison?: number`	
`FleetVehicleCard`	`components/fleet/FleetVehicleCard.tsx`	Vehicle list item	`vehicle: FleetVehicle, onPress: () => void`	
`FleetDriverCard`	`components/fleet/FleetDriverCard.tsx`	Driver list item	`driver: FleetDriver, onPress: () => void`	
`FleetTripCard`	`components/fleet/FleetTripCard.tsx`	Trip list item	`trip: FleetTrip, onPress: () => void`	
`FleetAlertCard`	`components/fleet/FleetAlertCard.tsx`	Alert list item	`alert: FleetAlert, onPress: () => void, onDismiss: () => void`	
`FleetStatusBadge`	`components/fleet/FleetStatusBadge.tsx`	Status badge	`status: string, size?: 'sm' \| 'md'`	
`QuickActionButton`	`components/fleet/QuickActionButton.tsx`	Dashboard action	`icon: string, label: string, onPress: () => void`	
`FilterChipRow`	`components/fleet/FilterChipRow.tsx`	Horizontal filter chips	`options: string[], selected: string, onSelect: (s) => void`	
`FleetSectionHeader`	`components/fleet/FleetSectionHeader.tsx`	Section title + optional action	`title: string, action?: { label, onPress }`	
`FleetEmptyState`	`components/fleet/FleetEmptyState.tsx`	Empty list placeholder	`icon: string, title: string, subtitle?: string`	
`FleetOnboardingStep`	`components/fleet/FleetOnboardingStep.tsx`	Step indicator for onboarding	`currentStep: number, totalSteps: number, labels: string[]`	

Existing Components to Reuse

Component	Path	Usage	
`AuthLayout`	`components/AuthLayout.tsx`	Onboarding screens	
`CustomButton`	`components/CustomButton.tsx`	All primary/secondary actions	
`InputField`	`components/InputField.tsx`	All text inputs	
`FloatingNavMenu`	`components/FloatingNavMenu.tsx`	Fleet hamburger menu	
`SettingsRow`	`components/plan03/SettingsRow.tsx`	More menu rows	
`StatusBadge`	`components/plan03/StatusBadge.tsx`	Status indicators (adapt colors)	
`PaymentWebView`	`components/PaymentWebView.tsx`	Subscription payment	
`SuccessCheckmark`	`components/SuccessCheckmark.tsx`	Onboarding success	
`Toast`	`components/Toast.tsx`	Success/error feedback	
`Skeleton`	`components/Skeleton.tsx`	Loading states	

---

6. State Management

New Zustand Store: `store/useFleetStore.ts`

```ts
interface FleetState {
  // Current fleet context
  fleetId: string | null;
  fleet: Fleet | null;
  
  // Dashboard data (cached)
  dashboard: FleetDashboardData | null;
  dashboardLastFetched: number;
  
  // Lists (paginated)
  vehicles: FleetVehicle[];
  vehiclesPage: number;
  vehiclesHasMore: boolean;
  drivers: FleetDriver[];
  driversPage: number;
  driversHasMore: boolean;
  trips: FleetTrip[];
  tripsPage: number;
  tripsHasMore: boolean;
  alerts: FleetAlert[];
  
  // Filters
  vehicleFilter: string;
  driverFilter: string;
  tripFilters: { dateFrom?: string; dateTo?: string; vehicleId?: string; driverId?: string; status?: string };
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  
  // Actions
  setFleetId: (id: string) => void;
  fetchDashboard: () => Promise<void>;
  fetchVehicles: (refresh?: boolean) => Promise<void>;
  fetchDrivers: (refresh?: boolean) => Promise<void>;
  fetchTrips: (refresh?: boolean) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  markAlertRead: (id: string) => Promise<void>;
  setVehicleFilter: (filter: string) => void;
  setDriverFilter: (filter: string) => void;
  setTripFilters: (filters: Partial<FleetState['tripFilters']>) => void;
  reset: () => void;
}
```

Existing Stores (no changes needed)
- `useDriverStore` — for driver data that fleet references
- `useRiderStore` — for role switching context
- `useAppearance` — for theme

---

7. API Endpoint Map

All fleet API routes use kebab-case `+api.ts` convention.

Endpoint	Method	Purpose	Auth	
`/api/fleet/dashboard`	GET	Dashboard metrics + alerts preview	Fleet-scoped	
`/api/fleet/profile`	GET	Fleet profile	Fleet-scoped	
`/api/fleet/profile`	PATCH	Update fleet profile	Fleet-scoped	
`/api/fleet/vehicles`	GET	List fleet vehicles	Fleet-scoped	
`/api/fleet/vehicles/search`	GET	Search vehicles by reg	Fleet-scoped	
`/api/fleet/vehicles`	POST	Add vehicle to fleet	Fleet-scoped	
`/api/fleet/vehicles/[id]`	GET	Vehicle detail	Fleet-scoped	
`/api/fleet/vehicles/[id]`	DELETE	Remove vehicle from fleet	Fleet-scoped	
`/api/fleet/drivers`	GET	List fleet drivers	Fleet-scoped	
`/api/fleet/drivers/[id]`	GET	Driver detail	Fleet-scoped	
`/api/fleet/assignments`	POST	Create assignment	Fleet-scoped	
`/api/fleet/assignments/[id]/unassign`	PATCH	End assignment	Fleet-scoped	
`/api/fleet/trips`	GET	List fleet trips	Fleet-scoped	
`/api/fleet/trips/[id]`	GET	Trip detail	Fleet-scoped	
`/api/fleet/finance`	GET	Finance summary	Fleet-scoped	
`/api/fleet/subscription`	GET	Current subscription	Fleet-scoped	
`/api/fleet/subscription`	POST	Subscribe/change plan	Fleet-scoped	
`/api/fleet/alerts`	GET	List alerts	Fleet-scoped	
`/api/fleet/alerts/[id]/read`	PATCH	Mark alert read	Fleet-scoped	
`/api/fleet/alerts/read-all`	PATCH	Mark all read	Fleet-scoped	
`/api/fleet/create`	POST	Create fleet (onboarding)	Authenticated	
`/api/fleet/plans`	GET	Available subscription plans	Authenticated	

Fleet-scoped authorization: Every endpoint MUST verify the user has a `fleet_members` record for the requested fleet_id, OR is the `owner_user_id` in `fleets`. Return `403 forbidden` if cross-fleet access attempted.

---

8. File Inventory

New Files to Create (in order)

Phase A — Layout & Navigation
1. `app/(main)/(fleet)/_layout.tsx`
2. `app/(main)/(fleet)/(tabs)/_layout.tsx`
3. `app/(main)/(fleet)/(tabs)/dashboard/index.tsx`
4. `app/(main)/(fleet)/(tabs)/operations/index.tsx`
5. `app/(main)/(fleet)/(tabs)/finance/index.tsx`
6. `app/(main)/(fleet)/(tabs)/more/index.tsx`

Phase B — Core Screens
7. `app/(main)/(fleet)/profile/index.tsx`
8. `app/(main)/(fleet)/vehicles/index.tsx`
9. `app/(main)/(fleet)/vehicles/[id].tsx`
10. `app/(main)/(fleet)/vehicles/add.tsx`
11. `app/(main)/(fleet)/drivers/index.tsx`
12. `app/(main)/(fleet)/drivers/[id].tsx`
13. `app/(main)/(fleet)/drivers/assign.tsx`
14. `app/(main)/(fleet)/trips/index.tsx`
15. `app/(main)/(fleet)/trips/[id].tsx`
16. `app/(main)/(fleet)/alerts/index.tsx`
17. `app/(main)/(fleet)/onboarding/index.tsx`

Phase C — More Screens
18. `app/(main)/(fleet)/more/subscription.tsx`
19. `app/(main)/(fleet)/more/maintenance.tsx`
20. `app/(main)/(fleet)/more/documents.tsx`

Phase D — Components
21. `components/fleet/FleetMetricCard.tsx`
22. `components/fleet/FleetRevenueCard.tsx`
23. `components/fleet/FleetVehicleCard.tsx`
24. `components/fleet/FleetDriverCard.tsx`
25. `components/fleet/FleetTripCard.tsx`
26. `components/fleet/FleetAlertCard.tsx`
27. `components/fleet/FleetStatusBadge.tsx`
28. `components/fleet/QuickActionButton.tsx`
29. `components/fleet/FilterChipRow.tsx`
30. `components/fleet/FleetSectionHeader.tsx`
31. `components/fleet/FleetEmptyState.tsx`
32. `components/fleet/FleetOnboardingStep.tsx`

Phase E — Store & Types
33. `store/useFleetStore.ts`
34. `types/fleet.ts` — Fleet-specific TypeScript interfaces

Phase F — API Routes
35. `app/api/fleet/dashboard+api.ts`
36. `app/api/fleet/profile+api.ts`
37. `app/api/fleet/vehicles+api.ts`
38. `app/api/fleet/vehicles/search+api.ts`
39. `app/api/fleet/vehicles/[id]+api.ts`
40. `app/api/fleet/drivers+api.ts`
41. `app/api/fleet/drivers/[id]+api.ts`
42. `app/api/fleet/assignments+api.ts`
43. `app/api/fleet/assignments/[id]/unassign+api.ts`
44. `app/api/fleet/trips+api.ts`
45. `app/api/fleet/trips/[id]+api.ts`
46. `app/api/fleet/finance+api.ts`
47. `app/api/fleet/subscription+api.ts`
48. `app/api/fleet/alerts+api.ts`
49. `app/api/fleet/alerts/[id]/read+api.ts`
50. `app/api/fleet/alerts/read-all+api.ts`
51. `app/api/fleet/create+api.ts`
52. `app/api/fleet/plans+api.ts`

Modified Files (existing)
- `app/_layout.tsx` — Add fleet route to role-based redirect logic
- `app/(main)/(rider)/(tabs)/profile/index.tsx` — Add "Become a Fleet Owner" entry point + role switcher
- `app/(main)/(customer)/(tabs)/profile/index.tsx` — Add role switcher if user has fleet capability
- `lib/auth.ts` — Add `FLEET_OWNER` to role checks
- `store/index.ts` — Export `useFleetStore`

---

9. Implementation Order & Dependencies

Wave 1 — Foundation (No API needed, UI only with mock data)
1. Create `types/fleet.ts`
2. Create `store/useFleetStore.ts` (stub with mock data)
3. Create fleet shared components (Phase D)
4. Create `(fleet)/(tabs)/_layout.tsx`
5. Create Dashboard screen (F01) with mock data
6. Create More screen with navigation links

Wave 2 — List Screens
7. Create Vehicle List (F03) + Vehicle Card
8. Create Driver List (F06) + Driver Card
9. Create Trips List (F09) + Trip Card
10. Create Alerts screen (F16) + Alert Card

Wave 3 — Detail & Action Screens
11. Create Vehicle Detail (F04)
12. Create Driver Detail (F07)
13. Create Assignment screen (F08)
14. Create Trip Detail (F10)
15. Create Fleet Profile (F02)

Wave 4 — Onboarding & Finance
16. Create Onboarding wizard
17. Create Finance screen (F12)
18. Create Subscription screen (F13)

Wave 5 — API Backend
19. Implement all `app/api/fleet/*+api.ts` endpoints
20. Connect screens to real APIs
21. Remove mock data from store

Wave 6 — Integration & Polish
22. Add role switching to rider/driver profile screens
23. Add "Become a Fleet Owner" entry point
24. Wire up FloatingNavMenu for fleet
25. Test cross-fleet authorization
26. Run lint → typecheck → test

---

10. Appendix: Data Model

MVP1 Tables (Drizzle schema additions)

```ts
// fleets
export const fleets = pgTable('fleets', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_user_id: uuid('owner_user_id').references(() => users.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  fleet_type: varchar('fleet_type', { length: 20 }).notNull().default('NATIVE'), // NATIVE, EXTERNAL, HYBRID
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING, ACTIVE, SUSPENDED, BLOCKED, CLOSED
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  business_name: varchar('business_name', { length: 255 }),
  trade_license_number: varchar('trade_license_number', { length: 100 }),
  tax_identifier: varchar('tax_identifier', { length: 100 }),
  subscription_plan_id: uuid('subscription_plan_id'),
  subscription_status: varchar('subscription_status', { length: 20 }).default('PENDING'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// fleet_members
export const fleetMembers = pgTable('fleet_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleet_id: uuid('fleet_id').references(() => fleets.id).notNull(),
  user_id: uuid('user_id').references(() => users.id).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // OWNER, MANAGER, DISPATCHER, ACCOUNTANT, VIEWER
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  removed_at: timestamp('removed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// fleet_vehicles (join table)
export const fleetVehicles = pgTable('fleet_vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleet_id: uuid('fleet_id').references(() => fleets.id).notNull(),
  vehicle_id: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  left_at: timestamp('left_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// fleet_drivers (join table)
export const fleetDrivers = pgTable('fleet_drivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleet_id: uuid('fleet_id').references(() => fleets.id).notNull(),
  driver_id: uuid('driver_id').references(() => drivers.id).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  left_at: timestamp('left_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// fleet_vehicle_assignments
export const fleetVehicleAssignments = pgTable('fleet_vehicle_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleet_id: uuid('fleet_id').references(() => fleets.id).notNull(),
  vehicle_id: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  driver_id: uuid('driver_id').references(() => drivers.id).notNull(),
  assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
  unassigned_at: timestamp('unassigned_at', { withTimezone: true }),
  assigned_by: uuid('assigned_by').references(() => users.id),
  reason: text('reason'),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// fleet_management_plans
export const fleetManagementPlans = pgTable('fleet_management_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  billing_period: varchar('billing_period', { length: 20 }).notNull(), // WEEKLY, MONTHLY, YEARLY
  price_bdt: integer('price_bdt').notNull(), // paisa
  vehicle_limit: integer('vehicle_limit').notNull(),
  driver_limit: integer('driver_limit').notNull(),
  api_limit: integer('api_limit').default(0),
  features: jsonb('features'),
  active: boolean('active').default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// fleet_management_subscriptions
export const fleetManagementSubscriptions = pgTable('fleet_management_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleet_id: uuid('fleet_id').references(() => fleets.id).notNull(),
  plan_id: uuid('plan_id').references(() => fleetManagementPlans.id).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING, ACTIVE, PAST_DUE, CANCELLED, EXPIRED
  started_at: timestamp('started_at', { withTimezone: true }),
  current_period_start: timestamp('current_period_start', { withTimezone: true }),
  current_period_end: timestamp('current_period_end', { withTimezone: true }),
  cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// fleet_alerts
export const fleetAlerts = pgTable('fleet_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleet_id: uuid('fleet_id').references(() => fleets.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(), // INFO, WARNING, CRITICAL
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  entity_type: varchar('entity_type', { length: 50 }),
  entity_id: uuid('entity_id'),
  is_read: boolean('is_read').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
});
```

Unique Constraints

```sql
UNIQUE(fleet_id, vehicle_id) ON fleet_vehicles
UNIQUE(fleet_id, driver_id) ON fleet_drivers
-- Prevent multiple active assignments for same vehicle/driver:
-- Partial unique index on fleet_vehicle_assignments where status='ACTIVE'
```

---

11. Critical Rules for the Coding Agent

1. NEVER duplicate existing entities. Fleet extends `users`, `drivers`, `vehicles`, `trips` via join tables.
2. NEVER create a separate auth system. Use existing Supabase phone OTP.
3. NEVER create a separate trip engine. Native fleet trips are existing `trips` rows.
4. NEVER add hot-path writes to trip completion. Fleet revenue is a read query, not a trigger.
5. ALWAYS use integer paisa for money. Divide by 100 only at display via `lib/money.ts`.
6. ALWAYS use Pattern A theming. `useIsDark()` + inline `colors.*` ternaries. No `dark:` classes.
7. ALWAYS use Ionicons only. No emoji.
8. ALWAYS server-side authorize fleet scope. Cross-fleet URL tampering must return 403.
9. ALWAYS run lint → typecheck → test after each wave.
10. NEVER use `console.log`. Use `lib/logger.ts`.

---

End of Fleet Management UI/UX Implementation Master Plan v1.0