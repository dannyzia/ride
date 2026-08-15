Here are the **key changes** from the old master plan — the old file stays as-is, this is just the delta:

---

## Changes from Old Master Plan

| Area | Old | New |
|------|-----|-----|
| **Structure** | 11 sections (Architecture, Completed Files, Auth Flow, Plan 04, State Machines, Vehicle Categories, Pending Work, Wiring, Bugs, Decisions, File List) | 13 sections — fully restructured as a **canonical spec document** |
| **Lock Decisions** | Scattered in "Key Decisions" and Plan 04 | Consolidated into **L1–L17 locked table** with sources — never change without approval |
| **Design Philosophy** | Not explicitly defined | New **Section 2** — "Bangladesh Futuristic" with constraints, light/dark palettes, rider vs driver split |
| **Theme System** | Brief mention in "Theme System" | New **Section 3** — Pattern A mandatory code patterns, StatusBar rule, toggle pattern with exact code |
| **Typography** | Mentioned in theme | New **Section 4** — Full scale (Display/Heading/Body/Label/Caption/Metric/ETA) with rider vs driver sizes, spacing scale, radius scale, touch targets |
| **Screen Inventory** | Flat list in "Completed Files" + "Pending Work" | New **Section 5** — 7 tables: Auth (15), Rider Main (31), Rider Settings (26), Driver (49), Driver Settings (9), Admin (32), Public (1) — all mapped to file paths |
| **Screen Specs** | None — only state machines | New **Sections 6 & 7** — **Every screen has ASCII wireframe + detailed spec** (what API it calls, what components it uses, exact behavior) |
| **Component Library** | Listed in Plan 04 | New **Section 8** — Existing 22 components + 16 new components needed with interface specs |
| **State Machines** | 2 machines (rider + driver) | New **Section 9** — 3 machines (rider booking, driver work, auth) with full transition labels |
| **Wiring** | "Wiring Changes Log" (4 items) | New **Section 10** — API naming convention, **full WS protocol** (inbound/outbound/never-emitted), backend file placement rules |
| **Roadmap** | "Pending Work" (items 51–82) | New **Section 11** — 4 structured plans (05–08) with screen counts, backend needs, priorities |
| **Coding Instructions** | None | New **Section 12** — Step-by-step agent instructions (import order, theme tokens, StatusBar, toggle, no console.log, no any, post-code verification commands) |
| **Verification** | Checklist at end of Auth Flow section | New **Section 13** — 3 checklists: per-screen, per-API, global release |
| **AGENTS.md Rules** | Not referenced | New **Section 1.4** — 10 critical rules from AGENTS.md (money as paisa, transactions, write ownership, PortPos security, etc.) |

**Bottom line:** The old plan was a **progress log**. The new plan is a **complete specification** that a coding agent can follow screen-by-screen without asking questions.

---

Now, **Plan 05**:

---

# Plan 05 — Supporting Features: Schedule, Cancel, Promos, SOS, Lost Items, Fare Disputes, Passes, Share Trip, Book for Someone Else, Deep Linking + Driver Secondary Screens

> **Date:** 2026-08-15  
> **Status:** NOT STARTED  
> **Scope:** All deferred rider features from Plans 01–04 + driver secondary account screens. 17 screens + 6 backend endpoints + 3 shared components.  
> **Batch size:** 17 screens + 6 API routes + 3 components.

---

## 1. Rider Screens (10 screens)

### 1.1 Schedule Ride (`app/(main)/(customer)/schedule-ride/index.tsx`)

**Purpose:** Book a ride for a future date/time.

**Wireframe:**
```
[StatusBar]
|
|  <- Schedule a Ride            [sun/moon]
|
|  Pickup
|  [Mirpur 10, Dhaka]
|
|  Destination
|  [Search destination]
|
|  Date & Time
|  [Today] [3:00 PM]
|
|  [Schedule Ride]
```

**Spec:**
- Pattern A theming. StatusBar + toggle.
- Pickup: pre-filled from current location, editable via `BarikoiAutocomplete`
- Destination: `BarikoiAutocomplete` with `Ionicons "search"`
- Date picker: `@react-native-community/datetimepicker` or custom calendar
- Time picker: Wheel picker OR badge grid (Morning/Afternoon/Evening/Night)
- "Schedule Ride" button: `primary`, 56px, full width
- API: `POST /api/ride/schedule { pickup, destination, scheduled_at: ISOString, vehicle_type }`
- On success → `ride-scheduled` confirmation screen
- On error → `ErrorBanner` with retry

**Backend:** `POST /api/ride/schedule+api.ts`
- Zod: `scheduled_at` must be > now + 15 min, < now + 7 days
- Insert `rides` row with `status = 'scheduled'`
- Return `{ ride_id, scheduled_at, estimated_fare }`

---

### 1.2 Ride Scheduled Confirmation (`app/(main)/(customer)/ride-scheduled/index.tsx`)

**Purpose:** Confirm scheduled ride + show details.

**Wireframe:**
```
[StatusBar]
|
|  [checkmark circle]
|
|  Ride Scheduled!
|
|  Mirpur 10 -> Gulshan 1
|  Mar 20, 2026 at 3:00 PM
|  Estimated fare: taka 245
|
|  [View My Rides]  [Back to Home]
```

**Spec:**
- `rideId` param-driven. `GET /api/ride/{id}` for details.
- Large checkmark: 80x80, `primary` color
- "Ride Scheduled!" — 28px Bold
- Route + datetime + fare — 15px Medium
- Buttons: "View My Rides" → `rides` tab, "Back to Home" → `services-hub`

---

### 1.3 Cancel Reason (`app/(main)/(customer)/cancel-reason/index.tsx`)

**Purpose:** Cancel active or scheduled ride with reason.

**Wireframe:**
```
[StatusBar]
|
|  <- Cancel Ride               [sun/moon]
|
|  Why are you canceling?
|
|  o Driver is not moving
|  o Wrong address shown
|  o Changed my mind
|  o Driver asked to cancel
|  o Other
|
|  [TextInput for "Other"]
|
|  ! Cancellation fee: taka 25
|  (Free for 2:34 more)
|
|  [Confirm Cancel]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Radio list with `Ionicons` circles: `"ellipse-outline"` (empty) / `"checkmark-circle"` (filled)
- Preset reasons map to free-text strings:
  - `"Driver is not moving"` → `"driver_not_moving"`
  - `"Wrong address shown"` → `"wrong_address"`
  - `"Changed my mind"` → `"changed_mind"`
  - `"Driver asked to cancel"` → `"driver_requested"`
  - `"Other"` → free text from TextInput
- "Other" selection reveals TextInput below radio list
- Fee preview: `GET /api/ride/{id}/cancel-preview`
  - Returns `{ fee_bdt: number, free_until: ISOString | null }`
- Countdown timer anchored to `ride.created_at` + 5 minutes free window
- "Free for M:SS" in `primary` color. Fee in `danger` if applicable.
- "Confirm Cancel" button: `danger` bg when fee > 0, `primary` bg when free
- On confirm: `POST /api/ride/{id}/cancel { reason }` → `canceled` screen
- Disable button while loading

**Backend:** `GET /api/ride/[id]/cancel-preview+api.ts`
- Calculate fee based on `ride.created_at` vs now
- Free window: 5 minutes from creation
- Fee: taka 25 (configurable)

**Backend:** `POST /api/ride/[id]/cancel+api.ts`
- Zod: `reason: string`
- Update `rides.status = 'canceled'`, `cancellation_reason = reason`
- If driver assigned, WS broadcast `ride:cancelled` to driver
- If fee applies, create `payment_events` row (wallet debit)
- Return `{ success: true, fee_charged: number }`

---

### 1.4 Canceled (`app/(main)/(customer)/canceled/index.tsx`)

**Purpose:** Post-cancellation confirmation.

**Wireframe:**
```
[StatusBar]
|
|  [X circle]
|
|  Ride Canceled
|
|  Reason: Changed my mind
|  Fee charged: taka 0
|
|  [Book Another Ride]
```

**Spec:**
- `rideId` param-driven
- Large X: 80x80, `danger` color
- Show reason and fee
- "Book Another Ride" → `services-hub`

---

### 1.5 Apply Promos (`app/(main)/(customer)/apply-promos/index.tsx`)

**Purpose:** Browse and apply promo codes.

**Wireframe:**
```
[StatusBar]
|
|  <- Promos                    [sun/moon]
|
|  [Enter promo code] [Apply]
|
|  Available Promos
|  [WELCOME10]
|  10% off your first ride
|  Expires Mar 20
|  [Apply]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Promo code input: `surfaceBg`, 12px radius, `Ionicons "pricetag"`
- "Apply" button: `primary` bg, 40px height
- List from `GET /api/promo/list`
- Each promo card: `surfaceBg`, 16px radius, 1px border
  - Left: 48x48 circle, `primaryLight` bg, `Ionicons "gift"`
  - Title: code name, 16px Bold
  - Description: 14px Regular, `textSecondary`
  - Expiry: 12px Regular, `textDisabled`
  - "Apply" button OR "Applied" badge (`success` color)
- Applied promos: show green checkmark + "Applied" text
- API: `POST /api/promo/redeem { code }`
- On apply success: toast "Promo applied!" + update UI
- On error: `ErrorBanner` with "Invalid or expired promo code"

**Backend:** `GET /api/promo/list+api.ts`
- Return active promos for current user
- Filter: `valid_from <= now <= valid_until`, `usage_count < max_usage`

**Backend:** `POST /api/promo/redeem+api.ts`
- Zod: `code: string`
- Validate promo exists, active, not exceeded usage
- Create `user_promos` row linking user + promo
- Return `{ success: true, promo: { code, discount_percent, max_discount_bdt } }`

---

### 1.6 Emergency SOS (`app/(main)/(customer)/emergency-sos/index.tsx`)

**Purpose:** Emergency trigger + location share.

**Wireframe:**
```
[StatusBar]
|
|  Emergency SOS               [sun/moon]
|
|     [shield icon]
|
|  In case of emergency,
|  tap the button below.
|
|  [TRIGGER SOS]
|
|  Your location will be shared
|  with emergency contacts and our team.
|
|  Emergency Number: 999
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Large shield: `Ionicons "shield"`, 100x100, `dangerLight` circular bg
- Title: "Emergency SOS", 28px Bold, `danger` color
- Body: 15px Medium, `textSecondary`, centered
- "Trigger SOS" button: `danger` bg, white text, 64px height, full width, 16px radius
  - `Ionicons "warning"` left icon
- **Double-tap protection:** First tap shows confirmation modal
  - Modal: "Are you sure?" + "This will alert emergency contacts and our support team."
  - "Confirm" / "Cancel"
- On confirm:
  1. `POST /api/sos/alert { location: { lat, lng }, ride_id? }`
  2. `Linking.openURL('tel:999')` — dial emergency
  3. Share live location with emergency contacts (if any)
  4. WS broadcast to admin SOS dashboard
- "Emergency Number: 999" — 15px Medium, `textSecondary`, tappable → `tel:999`

**Backend:** `POST /api/sos/alert+api.ts`
- Zod: `location: { lat: number, lng: number }, ride_id?: string`
- Insert `sos_alerts` row
- Push notification to admin dashboard
- WS broadcast `sos:alert` to admin channel
- SMS to emergency contacts via dpRelay

---

### 1.7 Lost Items (`app/(main)/(customer)/settings/lost-items/index.tsx`)

**Purpose:** Report and track lost items.

**Wireframe:**
```
[StatusBar]
|
|  <- Lost Items                [sun/moon]
|
|  [Report Lost Item]
|
|  Your Reports
|  [Black backpack]
|  Ride: Mar 14 - CNG
|  Status: Driver Found
```

**Spec:**
- Pattern A. StatusBar + toggle.
- "Report Lost Item" button: `primary` bg, 56px, full width
- Tap → modal/screen with:
  - Recent rides dropdown (last 7 days)
  - Item description TextInput
  - Photo upload (optional, gallery only)
- Reports list from `GET /api/rider/lost-items`
- Each card: `surfaceBg`, 16px radius
  - Item name: 16px Bold
  - Ride info: 13px Regular, `textSecondary`
  - Status badge:
    - `pending` → `amberLight` bg, `amber` text
    - `driver_found` → `successLight` bg, `success` text
    - `not_found` → `dangerLight` bg, `danger` text
    - `returned` → `primaryLight` bg, `primary` text
- 24-hour reporting window from ride completion
- API: `POST /api/rider/lost-items`, `GET /api/rider/lost-items`

**Backend:** `POST /api/rider/lost-items+api.ts`
- Zod: `ride_id: string, item_description: string, photo_url?: string`
- Validate ride completed within 24h
- Insert `lost_items` row with `status = 'pending'`
- Notify driver via push

---

### 1.8 Fare Dispute (`app/(main)/(customer)/fare-dispute/index.tsx`)

**Purpose:** Dispute a completed ride fare.

**Wireframe:**
```
[StatusBar]
|
|  <- Fare Dispute              [sun/moon]
|
|  Ride: Mirpur 10 -> Gulshan 1
|  Fare charged: taka 245
|
|  What was the issue?
|  o Driver took longer route
|  o Fare higher than estimate
|  o Wrong fare calculation
|  o Other
|
|  What should the fare be?
|  [taka symbol] [____]
|
|  [Submit Dispute]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Ride summary at top: route + fare charged
- Radio reasons:
  - `"Driver took longer route"` → `"longer_route"`
  - `"Fare higher than estimate"` → `"higher_than_estimate"`
  - `"Wrong fare calculation"` → `"wrong_calculation"`
  - `"Other"` → free text
- Claimed fare input: `taka` prefix, numeric keyboard, integer paisa
- "Submit Dispute" button: `primary`, 56px
- 48-hour window from ride completion — check on client, reject if expired
- API: `POST /api/rider/fare-disputes { ride_id, reason, claimed_fare_bdt }`
- On success: toast "Dispute submitted. We'll review within 48 hours."
- On error: `ErrorBanner`

**Backend:** `POST /api/rider/fare-disputes+api.ts`
- Zod: `ride_id, reason, claimed_fare_bdt: integer`
- Validate ride completed within 48h
- Validate claimed_fare < charged_fare
- Insert `fare_disputes` row
- Notify admin dashboard

---

### 1.9 Rider Passes (`app/(main)/(customer)/settings/ride-pass/index.tsx`)

**Purpose:** Browse and purchase ride passes.

**Wireframe:**
```
[StatusBar]
|
|  Ride Passes                 [sun/moon]
|
|  Active Pass
|  [Weekly Pass]
|  3/10 rides used
|  [progress bar]
|  Expires Mar 21, 2026
|
|  Available Passes
|  [Weekly Pass]      500 taka
|  10 rides - 7 days
|  [Buy Now]
|
|  [Monthly Pass]    1500 taka
|  50 rides - 30 days
|  [Buy Now]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Active pass section (conditional — hide if no active pass):
  - Card: `surfaceBg`, 16px radius, 4px `primary` top border
  - Pass name: 18px Bold
  - Usage: "X/Y rides used", 15px Medium
  - Progress bar: `primary` fill on `borderColor` track
  - Expiry: 13px Regular, `textSecondary`
- Available passes from `GET /api/admin/rider-passes`
- Each pass card: `surfaceBg`, 16px radius, 1px border
  - Name: 18px Bold
  - Price: 22px Bold, `primary`
  - Details: 14px Regular, `textSecondary`
  - "Buy Now" button: `primary` bg
- "Buy Now" → `PaymentWebView` with `purpose='rider_pass'`
- After payment success: refresh active pass section

**Backend:** Already exists — `GET /api/admin/rider-passes` (admin-managed)
- Pass discount applied in fare estimate (already wired in Plan 02 backend)

---

### 1.10 Share Trip (inline in Ride Tracking)

**Purpose:** Share live tracking link with contacts.

**Spec:**
- Share button in `ride-tracking/[ride_id].tsx` header
- `Ionicons "share-outline"`, 24px
- On tap: `Share.share({ message: 'Track my ride: ${EXPO_PUBLIC_SERVER_URL}/track/${rideId}' })`
- Public tracking page already exists: `app/track/[rideId].tsx`
- No auth required, 10s auto-refresh

---

### 1.11 Book for Someone Else (inline in Confirm Ride)

**Purpose:** Book ride for another person.

**Spec:**
- Toggle in `confirm-ride/index.tsx`: "Book for someone else"
- When enabled: reveal name + phone inputs
- Phone validation: `+880` + 10 digits = 14 chars
- Name: TextInput, required if toggle on
- SMS notification sent to secondary rider via dpRelay
- Driver sees "Booked for: [Name]" banner in `find-customer`
- API: extend `POST /api/ride/request` with `booked_for_name?`, `booked_for_phone?`

---

## 2. Driver Screens (7 screens)

### 2.1 Hotspot Map (`app/(main)/(rider)/hotspot-map/index.tsx`)

**Purpose:** Show high-demand areas for drivers.

**Wireframe:**
```
[Map — full screen with heat overlay]
|
|  [<-]  Hotspot Map           [sun/moon]
|
|  [Legend: Low -> High demand]
|
|  [Refresh] [Last updated: 2 min ago]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Full-screen MapLibre with `useBarikoiMapStyle(isDark)`
- Heatmap overlay: circles with opacity based on demand
  - Green (low) → Yellow → Red (high)
- `GET /api/driver/hotspots`
- Refresh button: `surfaceBg` + border, `Ionicons "refresh"`
- "Last updated" timestamp
- Legend bar at bottom: gradient green→yellow→red

**Backend:** `GET /api/driver/hotspots+api.ts`
- Aggregate recent ride requests by geohash
- Return `[{ lat, lng, intensity: 0-1 }]`

---

### 2.2 Performance Stats (`app/(main)/(rider)/performance-stats/index.tsx`)

**Purpose:** Driver performance analytics.

**Wireframe:**
```
[StatusBar]
|
|  Performance                 [sun/moon]
|
|  This Week
|  [taka 8,450] Earnings
|  [45] Trips
|  [4.8] Rating
|  [92%] Acceptance Rate
|
|  [Earnings Chart]
|  [Trips Chart]
|  [Rating Trend]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Weekly/Monthly toggle: segmented control
- Stat cards: 2x2 grid, `surfaceBg`, 16px radius
  - Large number: 28px Bold, `primary`
  - Label: 13px Regular, `textSecondary`
- Charts: simple bar chart (earnings by day), line chart (rating trend)
- `GET /api/driver/performance?period=week|month`
- Compare to previous period: "+12%" badge

**Backend:** `GET /api/driver/performance+api.ts`
- Zod: `period: 'week' | 'month'`
- Aggregate from `rides` and `ratings`
- Return `{ earnings_by_day: [], trip_count: number, avg_rating: number, acceptance_rate: number, comparison: { earnings_change_percent } }`

---

### 2.3 Rider No-Show (`app/(main)/(rider)/rider-no-show/index.tsx`)

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
|
|  [Mark as No-Show]
|  [Cancel Ride]
|  [Call Rider]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Wait timer from `wait-start` / `wait-end` API
- "Mark as No-Show" button: `amber` bg, white text, 56px
  - Confirmation modal: "Mark rider as no-show? You'll receive partial compensation."
  - On confirm: `POST /api/ride/:id/no-show`
- "Cancel Ride" → `cancellation-reasons`
- "Call Rider" → `tel:` link
- Partial compensation: taka 15 (configurable)

**Backend:** `POST /api/ride/[id]/no-show+api.ts`
- Validate driver is assigned and status is `driver_arrived`
- Update `rides.status = 'rider_no_show'`
- Create `payment_events` for partial compensation to driver
- Return `{ compensation_bdt: number }`

---

### 2.4 Vehicle Management (`app/(main)/(rider)/vehicle-management/index.tsx`)

**Purpose:** Manage driver vehicles.

**Wireframe:**
```
[StatusBar]
|
|  <- Vehicle Management        [sun/moon]
|
|  Active Vehicle
|  [Toyota Corolla]
|  CNG - DHAKA-1234 - 2020
|  [Switch Vehicle]
|
|  All Vehicles
|  [Toyota Corolla] [Active]
|  [Honda Civic]    [Inactive]
|
|  [+ Add New Vehicle]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Active vehicle card: photo, brand, model, type, plate, year
  - Photo: 80x80, 12px radius
  - "Switch Vehicle" button: `surfaceBg` + border
- All vehicles list: each row has status badge
  - Active: `primaryLight` bg, `primary` text
  - Inactive: `surfaceBg`, `textDisabled`
- Tap vehicle → detail/edit screen
- "+ Add New Vehicle" → `add-vehicle/index.tsx`
- API: `GET /api/driver/vehicles`, `PATCH /api/driver/vehicles/{id}/activate`

---

### 2.5 Subscription Plans (`app/(main)/(rider)/subscription-plans/index.tsx`)

**Purpose:** Browse driver subscription packages.

**Wireframe:**
```
[StatusBar]
|
|  Subscription Plans          [sun/moon]
|
|  [Basic]        taka 500/mo
|  50 rides - No commission
|  [Subscribe]
|
|  [Pro]          taka 1000/mo
|  Unlimited rides - No commission
|  [Subscribe]
|
|  [Enterprise]   taka 2000/mo
|  Unlimited - Priority matching
|  [Subscribe]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Plans from `GET /api/driver/subscription-plans`
- Each plan card: `surfaceBg`, 16px radius, 1px border
  - Name: 20px Bold
  - Price: 28px Bold, `primary`
  - Features: bullet list, 14px Regular
  - "Subscribe" button: `primary` bg
- Recommended plan: 2px `primary` border + "Recommended" badge
- Tap Subscribe → `subscription-checkout/index.tsx` with `plan_id` param
- Payment via PortPos

---

### 2.6 Incentives (`app/(main)/(rider)/incentives.tsx`)

**Purpose:** Show active driver incentives.

**Wireframe:**
```
[StatusBar]
|
|  Incentives                  [sun/moon]
|
|  [Complete 10 trips today]
|  Bonus: taka 500
|  Progress: 7/10
|  [████████░░░░░░░░░░]
|  Expires: 11:59 PM
|
|  [Maintain 4.8+ rating]
|  Bonus: taka 200
|  Current: 4.9
```

**Spec:**
- Pattern A. StatusBar + toggle.
- `GET /api/driver/incentives`
- Each incentive card: `surfaceBg`, 16px radius
  - Title: 16px Bold
  - Bonus: 20px Bold, `primary`
  - Progress bar + count
  - Expiry countdown
- Completed incentives: `successLight` bg, checkmark

---

### 2.7 Insurance (`app/(main)/(rider)/insurance/index.tsx`)

**Purpose:** Driver insurance info.

**Wireframe:**
```
[StatusBar]
|
|  Insurance                   [sun/moon]
|
|  Active Policy
|  [Policy #12345]
|  Coverage: taka 100,000
|  Valid until: Dec 31, 2026
|
|  [View Coverage Details]
|  [File a Claim]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- `GET /api/driver/insurance`
- Policy card: `surfaceBg`, 16px radius
- Coverage amount: 28px Bold, `primary`
- "File a Claim" → form with incident details

---

## 3. Shared Components (3 new)

| Component | Purpose | Used By |
|-----------|---------|---------|
| `EmptyState` | Illustration + title + subtitle + optional action | All list screens when empty |
| `ErrorBanner` | Retryable error with type (error/warning/info) | All API-dependent screens |
| `OfflineIndicator` | Fixed top bar showing network status | All screens |

### 3.1 EmptyState Spec

```tsx
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}
```

- Centered, 2xl top padding
- Icon: 80x80, `textDisabled`
- Title: 18px SemiBold, `textPrimary`
- Subtitle: 15px Regular, `textSecondary`
- Action: `primary` button if provided

### 3.2 ErrorBanner Spec

```tsx
interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  type?: 'error' | 'warning' | 'info';
}
```

- Full width, 12px radius, 16px padding
- Error: `dangerLight` bg, `danger` text, `Ionicons "alert-circle"`
- Warning: `amberLight` bg, `amber` text
- Info: `infoLight` bg, `info` text
- Retry button: right-aligned, matching color

### 3.3 OfflineIndicator Spec

- Fixed top bar, full width, 40px height
- `amberLight` bg, `amber` text
- `Ionicons "wifi-outline"` + "No internet connection"
- Animated slide-in from top
- Auto-dismiss when connection restored
- Uses `@react-native-community/netinfo`

---

## 4. Backend Endpoints (6 new)

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 1 | `/api/ride/schedule` | POST | Schedule a future ride |
| 2 | `/api/ride/[id]/cancel-preview` | GET | Preview cancellation fee |
| 3 | `/api/promo/redeem` | POST | Apply promo code |
| 4 | `/api/sos/alert` | POST | Emergency alert |
| 5 | `/api/driver/hotspots` | GET | Demand heatmap data |
| 6 | `/api/driver/performance` | GET | Driver analytics |

---

## 5. Implementation Order

**Wave 1 — Rider Core (Days 1-2)**
1. `schedule-ride/index.tsx` + `ride-scheduled/index.tsx`
2. `cancel-reason/index.tsx` + `canceled/index.tsx`
3. `apply-promos/index.tsx`

**Wave 2 — Rider Safety & Support (Days 3-4)**
4. `emergency-sos/index.tsx`
5. `lost-items/index.tsx`
6. `fare-dispute/index.tsx`

**Wave 3 — Rider Passes & Share (Day 5)**
7. `ride-pass/index.tsx`
8. Share trip inline (ride-tracking)
9. Book for someone else inline (confirm-ride)

**Wave 4 — Driver Secondary (Days 6-8)**
10. `hotspot-map/index.tsx`
11. `performance-stats/index.tsx`
12. `rider-no-show/index.tsx`
13. `vehicle-management/index.tsx`
14. `subscription-plans/index.tsx`
15. `incentives.tsx`
16. `insurance/index.tsx`

**Wave 5 — Shared Components & Polish (Day 9)**
17. `EmptyState.tsx`
18. `ErrorBanner.tsx`
19. `OfflineIndicator.tsx`
20. Deep linking setup in `_layout.tsx`
21. Push notification handler wiring

---

## 6. Verification Checklist (Plan 05)

- [ ] All 17 screens use Pattern A theming
- [ ] All 17 screens have StatusBar + theme toggle
- [ ] Zero `console.log` — all use `logger`
- [ ] Zero `theme === "dark"` — all use `useIsDark()`
- [ ] All API calls have Zod validation
- [ ] All error states show `ErrorBanner` or `EmptyState`
- [ ] All loading states show `LoadingRider` or skeleton
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] All money: integer paisa, `/100` at display only

---

**End of Plan 05**

# Plan 05 Addendum — FEATURES.md Gap Analysis & Corrections

> **Date:** 2026-08-15
> **Purpose:** Delta document for documentation model to merge into Ride_App_UIUX_Rethink_3_Master_Plan.md
> **Source:** FEATURES.md v12 cross-reference against Plan 05 draft

---

## 1. Items REMOVED from Plan 05

| # | Item | Reason |
|---|------|--------|
| 1 | **Insurance screen** (`app/(main)/(rider)/insurance/index.tsx`) | Not mentioned anywhere in FEATURES.md. Schema has no insurance table. Remove from Plan 05 entirely. |

---

## 2. Items ADDED to Plan 05 (Missed from FEATURES.md)

### 2.1 Driver Earnings Goal + Set-Goal Modal

**FEATURES.md Reference:** Driver SL 15 — "Earnings goal progress bar" with "real data + AsyncStorage goal + set-goal modal"
**Frontend Status:** YES (exists but incomplete — no set-goal UI)
**Backend Status:** YES (`driver/earnings/breakdown`)

**Screen:** Inline in Earnings Tab (`app/(main)/(rider)/(tabs)/earning/index.tsx`) + new modal

**Wireframe:**
```
[StatusBar]
|
|  Earnings                    [sun/moon]
|
|  Today
|  [taka 1,240] / [taka 2,000] goal
|  [████████████████████░░░░░░░░░░]  62%
|
|  [Set Earnings Goal]
```

**Spec:**
- Progress bar: `primary` fill on `borderColor` track
- "Set Earnings Goal" button → modal
- Modal: TextInput for goal amount (taka), "Save" button
- Persisted in AsyncStorage: `@driver_earnings_goal`
- On mount: read AsyncStorage → if exists, show progress bar
- If no goal set: show "Set a daily earnings goal to track your progress" + button
- Theme: Pattern A

---

### 2.2 Driver Missed Ride Requests

**FEATURES.md Reference:** Driver SL 45 — "Missed ride requests" (Frontend: YES)
**Frontend Status:** YES (no screen exists)
**Backend Status:** YES

**Screen:** `app/(main)/(rider)/missed-requests/index.tsx`

**Wireframe:**
```
[StatusBar]
|
|  <- Missed Requests          [sun/moon]
|
|  [Mirpur 10 -> Gulshan 1]
|  taka 245 · 3 min ago · Expired
|
|  [Dhanmondi -> Uttara]
|  taka 350 · 10 min ago · Declined
```

**Spec:**
- Pattern A. StatusBar + toggle.
- `GET /api/driver/missed-requests` (or filter from existing endpoint)
- Each card: `surfaceBg`, 16px radius
  - Route: 15px Medium
  - Fare: `primary`, Bold
  - Time ago: 13px Regular, `textSecondary`
  - Status badge: "Expired" (`dangerLight`) or "Declined" (`textDisabled`)
- Empty state: `EmptyState` component with `Ionicons "time-outline"`
- Tap card → no action (read-only history)

---

### 2.3 Driver Payout Methods (CRUD)

**FEATURES.md Reference:** Driver SL 41 — "Payout methods (CRUD)" (Frontend: YES)
**Frontend Status:** YES (no screen exists — onboarding captures bKash but no post-onboarding management)
**Backend Status:** YES

**Screen:** `app/(main)/(rider)/payout-methods/index.tsx`

**Wireframe:**
```
[StatusBar]
|
|  <- Payout Methods           [sun/moon]
|
|  Active Method
|  [bKash] 01712345678
|  [Default]
|
|  [+ Add New Method]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- `GET /api/driver/payout-methods`
- Active method card: `surfaceBg`, 16px radius, 4px `primary` left border
  - Icon: `Ionicons "phone-portrait"` or bKash logo
  - Number: 18px Bold, masked (show last 4 digits)
  - "Default" badge: `primaryLight` bg
- "Add New Method" → modal/screen
  - bKash number input: `^01\d{9}$` validation
  - "Save" button: `primary`
- API: `POST /api/driver/payout-method` (already exists from onboarding)
- Only bKash supported (per L16 lock decision)

---

### 2.4 Driver Payout History

**FEATURES.md Reference:** Driver SL 42 — "Payout history" (Frontend: YES)
**Frontend Status:** YES (no screen exists)
**Backend Status:** YES

**Screen:** `app/(main)/(rider)/payout-history/index.tsx`

**Wireframe:**
```
[StatusBar]
|
|  <- Payout History           [sun/moon]
|
|  [taka 2,000]  Mar 15, 2026
|  bKash · 01712****78 · Completed
|
|  [taka 1,500]  Mar 10, 2026
|  bKash · 01712****78 · Completed
```

**Spec:**
- Pattern A. StatusBar + toggle.
- `GET /api/driver/payout-history`
- Each row: amount (Bold, `primary`), date, method, status badge
- Status: Completed (`success`), Pending (`amber`), Failed (`danger`)
- Empty state: `EmptyState` with `Ionicons "cash-outline"`

---

### 2.5 Driver Instant Pay (Withdraw)

**FEATURES.md Reference:** Driver SL 43 — "Instant pay (withdraw)" (Frontend: YES)
**Frontend Status:** YES (no screen exists)
**Backend Status:** YES

**Screen:** Inline modal in Wallet Tab OR `app/(main)/(rider)/instant-pay/index.tsx`

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
|
|  [Confirm Withdrawal]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Show available balance (36px Bold, `primary`)
- Amount input: numeric, max = available balance
- Payout method: pre-selected default, tappable to change
- "Confirm Withdrawal" button: `primary`, 56px
- Confirmation modal: "Withdraw taka X to bKash Y?"
- API: `POST /api/driver/instant-pay { amount_bdt }`
- On success: toast + refresh balance
- On error: `ErrorBanner`
- Min withdrawal: taka 200 (configurable)

---

### 2.6 Driver MinRateSlider

**FEATURES.md Reference:** Driver SL 62 — "MinRateSlider (min per-km rate)" (Frontend: YES)
**Frontend Status:** YES (no UI exists)
**Backend Status:** YES

**Screen:** Inline in Driver Settings (`app/(main)/(rider)/(tabs)/settings/index.tsx`) OR `app/(main)/(rider)/min-rate/index.tsx`

**Wireframe:**
```
[StatusBar]
|
|  <- Minimum Rate             [sun/moon]
|
|  Minimum per-km rate
|  [taka 15.00]
|
|  [====|==========]  ← slider
|  taka 10              taka 50
|
|  You will only receive ride offers
|  with per-km rate above this amount.
|
|  [Save]
```

**Spec:**
- Pattern A. StatusBar + toggle.
- Slider: `@react-native-community/slider` or custom
- Range: taka 10 to taka 50, step taka 1
- Display: `taka ${value}.00`
- Description: 14px Regular, `textSecondary`
- "Save" button: `primary`, 56px
- API: `PATCH /api/driver/me { min_rate_per_km_bdt: number }`
- Persisted to driver profile

---

### 2.7 Terms / Privacy Static Content

**FEATURES.md Reference:** Rider SL 58, Driver SL 58 — "Terms / Privacy" (Frontend: YES, Backend: Missing)
**Frontend Status:** YES (screens exist but empty)
**Backend Status:** Missing

**Screens:**
- `app/(main)/(customer)/settings/terms-of-service/index.tsx` (RS22)
- `app/(main)/(customer)/settings/privacy-policy/index.tsx` (RS18)
- `app/(main)/(rider)/settings/terms-of-service/index.tsx` (DS9)
- `app/(main)/(rider)/settings/privacy-policy/index.tsx` (DS8)

**Spec:**
- Pattern A. StatusBar + toggle.
- Static text content — no backend needed
- Content: ScrollView with formatted text sections
- Sections: Introduction, User Responsibilities, Payment Terms, Cancellation Policy, Liability, Contact
- Use `textPrimary` for headings, `textSecondary` for body
- Rider and driver versions can share 90% of content
- Store text in `lib/legalContent.ts` (shared between rider + driver screens)

**File to create:** `lib/legalContent.ts`
```ts
export const TERMS_OF_SERVICE = `...`;
export const PRIVACY_POLICY = `...`;
```

---

### 2.8 i18n / Bangla Translation Foundation

**FEATURES.md Reference:** Rider SL 60, Driver SL 60 — "App language (EN/BN)" (Frontend: Partial)
**Frontend Status:** Partial (choice persisted, no translations)
**Backend Status:** Missing (no i18n strings)

**Scope:** Foundation only — extract all hardcoded strings

**File to create:** `lib/i18n.ts`
```ts
export const translations = {
  en: {
    // Auth
    welcome_title: "Welcome to Ride",
    welcome_subtitle: "Your trusted ride-sharing partner",
    phone_placeholder: "Enter phone number",
    // ... all strings
  },
  bn: {
    welcome_title: "রাইডে স্বাগতম",
    welcome_subtitle: "আপনার বিশ্বস্ত রাইড-শেয়ারিং সঙ্গী",
    phone_placeholder: "ফোন নম্বর দিন",
    // ... all strings (can be empty placeholders for now)
  }
};

export function t(key: string, lang: 'en' | 'bn'): string {
  return translations[lang][key] || translations['en'][key] || key;
}
```

**Spec:**
- Create `lib/i18n.ts` with ALL hardcoded strings from every screen
- Bangla translations can be empty strings (`''`) as placeholders
- English always acts as fallback
- Language choice already persisted in AsyncStorage via `useAppearance` or settings store
- Screens import `t()` and use `const lang = useLanguageStore()`
- **This is a foundation task** — actual Bangla translations come later

---

## 3. Updated Plan 05 Screen Count

### Original Plan 05: 17 screens
### After corrections: **23 screens + 1 shared lib file**

| # | Screen / File | Type | Status |
|---|---------------|------|--------|
| 1 | `schedule-ride/index.tsx` | Rider | New |
| 2 | `ride-scheduled/index.tsx` | Rider | New |
| 3 | `cancel-reason/index.tsx` | Rider | New |
| 4 | `canceled/index.tsx` | Rider | New |
| 5 | `apply-promos/index.tsx` | Rider | New |
| 6 | `emergency-sos/index.tsx` | Rider | New |
| 7 | `lost-items/index.tsx` | Rider | Exists (needs verify) |
| 8 | `fare-dispute/index.tsx` | Rider | Exists (needs verify) |
| 9 | `ride-pass/index.tsx` | Rider | Exists (needs verify) |
| 10 | Share trip (inline) | Rider | Inline |
| 11 | Book for someone else (inline) | Rider | Inline |
| 12 | `hotspot-map/index.tsx` | Driver | New |
| 13 | `performance-stats/index.tsx` | Driver | New |
| 14 | `rider-no-show/index.tsx` | Driver | New |
| 15 | `vehicle-management/index.tsx` | Driver | Exists (needs verify) |
| 16 | `subscription-plans/index.tsx` | Driver | Exists (needs verify) |
| 17 | `incentives.tsx` | Driver | Exists (needs verify) |
| ~~18~~ | ~~`insurance/index.tsx`~~ | ~~Driver~~ | ~~REMOVED~~ |
| 18 | Earnings Goal (inline modal) | Driver | New |
| 19 | `missed-requests/index.tsx` | Driver | New |
| 20 | `payout-methods/index.tsx` | Driver | New |
| 21 | `payout-history/index.tsx` | Driver | New |
| 22 | `instant-pay/index.tsx` | Driver | New |
| 23 | `min-rate/index.tsx` | Driver | New |
| 24 | Terms/Privacy (4 screens) | Both | Content fill |
| 25 | `lib/i18n.ts` | Shared | New |
| 26 | `lib/legalContent.ts` | Shared | New |
| 27 | `EmptyState.tsx` | Component | New |
| 28 | `ErrorBanner.tsx` | Component | New |
| 29 | `OfflineIndicator.tsx` | Component | New |

---

## 4. Updated Implementation Order

**Wave 1 — Rider Core (Days 1-2)**
1. `schedule-ride/index.tsx` + `ride-scheduled/index.tsx`
2. `cancel-reason/index.tsx` + `canceled/index.tsx`
3. `apply-promos/index.tsx`

**Wave 2 — Rider Safety & Support (Days 3-4)**
4. `emergency-sos/index.tsx`
5. `lost-items/index.tsx` (verify existing)
6. `fare-dispute/index.tsx` (verify existing)

**Wave 3 — Rider Passes & Share (Day 5)**
7. `ride-pass/index.tsx` (verify existing)
8. Share trip inline (ride-tracking)
9. Book for someone else inline (confirm-ride)

**Wave 4 — Driver Secondary (Days 6-9)**
10. `hotspot-map/index.tsx`
11. `performance-stats/index.tsx`
12. `rider-no-show/index.tsx`
13. `vehicle-management/index.tsx` (verify existing)
14. `subscription-plans/index.tsx` (verify existing)
15. `incentives.tsx` (verify existing)
16. **Earnings Goal** (inline in Earnings Tab)
17. `missed-requests/index.tsx`
18. `payout-methods/index.tsx`
19. `payout-history/index.tsx`
20. `instant-pay/index.tsx`
21. `min-rate/index.tsx`

**Wave 5 — Shared Components & Foundation (Days 10-11)**
22. `EmptyState.tsx`
23. `ErrorBanner.tsx`
24. `OfflineIndicator.tsx`
25. `lib/i18n.ts` — extract ALL hardcoded strings
26. `lib/legalContent.ts` — terms + privacy text
27. Fill Terms/Privacy content in 4 screens
28. Deep linking setup in `_layout.tsx`
29. Push notification handler wiring

---

## 5. Backend Endpoints (6 new + 1 existing to verify)

| # | Endpoint | Method | Purpose | Status |
|---|----------|--------|---------|--------|
| 1 | `/api/ride/schedule` | POST | Schedule future ride | New |
| 2 | `/api/ride/[id]/cancel-preview` | GET | Preview cancellation fee | New |
| 3 | `/api/promo/redeem` | POST | Apply promo code | New |
| 4 | `/api/sos/alert` | POST | Emergency alert | New |
| 5 | `/api/driver/hotspots` | GET | Demand heatmap data | New |
| 6 | `/api/driver/performance` | GET | Driver analytics | New |
| 7 | `/api/driver/instant-pay` | POST | Withdraw to bKash | Verify exists |
| 8 | `/api/driver/payout-history` | GET | Payout transaction list | Verify exists |
| 9 | `/api/driver/missed-requests` | GET | Declined/expired offers | Verify exists |

---

## 6. Verification Checklist (Plan 05 Updated)

- [ ] All 23 screens use Pattern A theming
- [ ] All 23 screens have StatusBar + theme toggle
- [ ] Zero `console.log` — all use `logger`
- [ ] Zero `theme === "dark"` — all use `useIsDark()`
- [ ] All API calls have Zod validation
- [ ] All error states show `ErrorBanner` or `EmptyState`
- [ ] All loading states show `LoadingRider` or skeleton
- [ ] `lib/i18n.ts` contains ALL hardcoded strings from every screen
- [ ] `lib/legalContent.ts` contains terms + privacy text
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] All money: integer paisa, `/100` at display only

---

*End of Plan 05 Addendum*


DeepSeeks Take: 

## Areas of improvement in Plan 05 + Addendum

These are concrete gaps grounded in the plan itself, prior locked decisions, and known codebase constraints.

---

### 1. Screen count and scope are inconsistent

- Original Plan 05: **17 screens + 6 endpoints + 3 components**
- Addendum says: **23 screens + 1 shared lib file**
- Addendum table lists **29 items**, including 4 shared components/lib files, 2 inline features, and 4 terms/privacy screens.

The checklist says “All 23 screens,” but actual distinct screens are more than 23 depending on how inline features and terms/privacy screens are counted.

**Improvement:** Produce one authoritative scope table with exact screen count, inline tasks, components, and lib files. Do not mix screens and non-screen deliverables in the same count.

---

### 2. Backend endpoint list is incomplete and partly unverified

Plan 05 lists 6 new endpoints, then the addendum adds 3 “verify existing” endpoints. But many endpoints referenced in the screen specs are missing from the backend table:

- `POST /api/ride/[id]/cancel` — used by Cancel Reason, not listed
- `GET /api/ride/[id]/cancel-preview` — listed, but contract not defined
- `POST /api/rider/lost-items` — existing, but marked “verify” with no contract
- `POST /api/rider/fare-disputes` — same
- `GET /api/rider/passes` vs `GET /api/admin/rider-passes` — both used, but relationship unclear
- `POST /api/ride/[id]/no-show` — used by Rider No-Show, missing
- `PATCH /api/driver/me` — used by MinRateSlider, missing
- `POST /api/driver/payout-method` — used by Payout Methods, missing
- `GET /api/driver/payout-methods` — used by Payout Methods, missing
- `GET /api/promo/list` — used by Apply Promos, but only `/api/promo/redeem` is listed

**Improvement:** Create one complete backend table with every endpoint referenced by any screen, including method, request body, response shape, and whether it exists, needs creation, or needs verification. No screen should call an endpoint that is not in this table.

---

### 3. Color tokens may still not exist

Plan 05 heavily uses:

- `amberLight`
- `successLight`
- `infoLight`
- `primaryLight`
- `dangerLight`

From earlier Plan 03 verification:

- `primaryLight`, `dangerLight`, `infoLight` exist
- `amberLight` and `successLight` **do NOT exist** in `theme/goRide.ts`

Plan 05 uses `amberLight` and `successLight` in:

- SOS screen
- Lost Items
- Fare Dispute
- Rider Passes
- Hotspot legend
- Driver status badges
- `ErrorBanner` spec
- EmptyState/StatusBadge

**Improvement:** Add `amberLight` and `successLight` to `theme/goRide.ts` first, or replace all uses with explicit `rgba()` fallbacks. Do not assume these tokens exist.

---

### 4. Theming instructions are ambiguous

Plan 05 says:

> Pattern A theming. StatusBar + toggle.

But it does not define Pattern A explicitly. Earlier locked decisions require:

```tsx
const isDark = useIsDark();
const { setTheme } = useAppearance();
onPress={() => setTheme(isDark ? "light" : "dark")}
```

Some Plan 05 component specs still imply the old `EmptyState`, `ErrorBanner`, and `OfflineIndicator` may use `className` or unspecified token access.

**Improvement:** Include the exact Pattern A code block once in Plan 05 and require every screen/component to follow it. Also confirm that `useAppearance()` exposes `theme`, `language`, `setTheme`, `setLanguage` — not `toggleTheme`.

---

### 5. Duplicate/redundant component definitions

Plan 03 already defined:

- `EmptyState` in `components/plan03/EmptyState.tsx`
- Error state pattern, though not as a shared `ErrorBanner`

Plan 05 redefines:

- `EmptyState`
- `ErrorBanner`
- `OfflineIndicator`

**Improvement:** Reconcile with Plan 03. If `EmptyState` already exists, reuse it rather than creating a duplicate. If `ErrorBanner` was not fully specified before, this is the place to finish it. Avoid two different implementations.

---

### 6. API contracts are not defined for new endpoints

The plan gives Zod schema examples for a few endpoints, but most are only names. For a coding agent to implement safely, every endpoint needs:

- Request shape
- Response shape
- Error shape
- Auth requirements

Example gaps:

- `GET /api/driver/hotspots` — response format not defined
- `GET /api/driver/performance` — response keys partially defined, but chart data shape missing
- `POST /api/ride/schedule` — return `estimated_fare` but no fare-breakdown logic
- `GET /api/ride/[id]/cancel-preview` — response shape partially defined, but error cases missing
- `POST /api/sos/alert` — what happens if no location/ride?
- `POST /api/driver/instant-pay` — minimum withdrawal, bKash validation, response shape all missing

**Improvement:** Add a contract section for every new or existing endpoint referenced by this plan. Follow the same rigorous contract style used in earlier plan verification.

---

### 7. `confirm-ride/index.tsx` may not exist or may have been renamed

Plan 05 says:

> Book for Someone Else (inline in `confirm-ride/index.tsx`)

But earlier consolidation decisions from Plan 03 flagged:

- `final-page` should be deleted
- `home` is the canonical booking screen
- `confirm-ride/index.tsx` existed and referenced `final-page`

It is not clear whether `confirm-ride/index.tsx` is the correct current file for inline booking extensions.

**Improvement:** Verify the actual booking/confirm screen path before editing. If the current flow is a home state machine, the inline toggle belongs in the Home/Booking screen, not a possibly orphaned `confirm-ride`.

---

### 8. Cancel Reason countdown is not server-driven

Plan 05 says:

> Countdown timer anchored to `ride.created_at` + 5 minutes free window

But the cancel-preview API returns `free_until`:

> `GET /api/ride/{id}/cancel-preview` → `{ fee_bdt, free_until }`

The client should display the server-provided `free_until`, not compute it from `created_at` on the device. Server time differs from device time, and fee configuration may change.

**Improvement:** Use `free_until` from the API response as the source of truth. If `free_until` is null, show fee immediately. Do not hardcode taka 25 on the client.

---

### 9. Ride Passes active-pass source is unclear

Plan 05 uses:

- `GET /api/admin/rider-passes` — available pass catalog
- Active pass section shown from some other source

But there is no endpoint specified for the rider’s active pass usage (`rides_used/rides_total`, expiry).

Earlier verification noted `/api/rider/passes` exists. Plan 05 should use that for active pass state, and `/api/admin/rider-passes` only for catalog.

**Improvement:** Separate the two endpoints clearly:

- Catalog: `GET /api/admin/rider-passes`
- Active pass: `GET /api/rider/passes`

Do not derive active pass usage from the catalog endpoint.

---

### 10. Lost Items reporting window is self-contradictory

Plan 05 says:

> Recent rides dropdown (last 7 days)

Then:

> 24-hour reporting window from ride completion

A ride from 7 days ago cannot be valid for a 24-hour reporting window.

**Improvement:** Make the dropdown show only rides completed within the last 24 hours, or clarify that the list may include older rides but submission is blocked for them.

---

### 11. Fare Dispute amount units are ambiguous

Plan 05 says:

> Claimed fare input: `taka` prefix, numeric keyboard, integer paisa

But users enter taka, not paisa. If the input is taka, the client must convert to paisa before submitting. The backend expects `claimed_fare_bdt` as integer paisa.

**Improvement:** Specify conversion: `claimed_fare_bdt = Math.round(enteredTaka * 100)`. Display uses `bdt / 100`.

---

### 12. Emergency SOS lacks offline behavior and location acquisition

Plan 05 says on confirm:

1. `POST /api/sos/alert { location: { lat, lng }, ride_id? }`
2. `Linking.openURL('tel:999')`

But it does not specify:

- How to get current location at the moment of SOS
- What to do if the network is unavailable
- What to do if location permission is denied at that moment

**Improvement:** Use `Location.getCurrentPositionAsync()` immediately before the API call. If it fails, still dial 999 but show a warning that location was not shared. If network fails, still dial 999 and queue the alert locally if possible.

---

### 13. Hotspot Map heat overlay may require a library or custom implementation

Plan 05 says:

> Heatmap overlay: circles with opacity based on demand

But no chart/map overlay library is specified. MapLibre React Native may require custom `ShapeSource`/`CircleLayer` or a separate heatmap library.

**Improvement:** Confirm whether the MapLibre setup supports circle layers/heatmaps. If not, specify the exact implementation approach.

---

### 14. Performance charts are unspecified

Plan 05 says:

> Charts: simple bar chart (earnings by day), line chart (rating trend)

But no chart library is named. If none is installed, this is a large hidden dependency.

**Improvement:** Either:

- Use `react-native-svg` + Reanimated for custom charts, or
- Add a specific chart library, or
- Defer charts and show tabular data for now.

Do not assume a charting library is available.

---

### 15. i18n foundation conflicts with existing language state

Plan 05 says:

> Language choice already persisted in AsyncStorage via `useAppearance` or settings store

Then:

> Screens import `t()` and use `const lang = useLanguageStore()`

But `useLanguageStore()` may not exist. Earlier verification confirmed `useAppearance()` returns `{ theme, language, setTheme, setLanguage }`.

**Improvement:** Use `useAppearance()` for language, not a new `useLanguageStore`. Update the i18n foundation spec accordingly.

---

### 16. Legal content is not provided

Plan 05 says:

> Create `lib/legalContent.ts` with terms + privacy text

But the actual text is not included. A coding agent cannot invent legal terms.

**Improvement:** Provide the actual English legal content, or mark the screens as placeholders and explicitly require owner-supplied text before release.

---

### 17. `OfflineIndicator` dependency is not verified

Plan 05 uses `@react-native-community/netinfo`.

**Improvement:** Confirm this package is installed. If not, add it or implement a simpler app-state based indicator.

---

### 18. Verification checklist references “All 23 screens” but the actual number is unclear

This ties to issue #1.

**Improvement:** Replace “23 screens” with an explicit itemized checklist based on the final authoritative scope table.

---

## Highest-priority fixes before implementation

| Priority | Action |
|----------|--------|
| P0 | Fix scope count and define one authoritative screen/component list |
| P0 | Add missing endpoint contracts and include every API used |
| P0 | Add `amberLight` and `successLight` to theme tokens |
| P0 | Resolve `confirm-ride` path and booking flow |
| P0 | Use server `free_until` in Cancel Reason |
| P1 | Separate active rider pass from pass catalog |
| P1 | Fix Lost Items reporting window contradiction |
| P1 | Define Fare Dispute currency conversion |
| P1 | Reconcile duplicate `EmptyState` / `ErrorBanner` with Plan 03 |
| P2 | Confirm chart/map library availability before committing |
| P2 | Provide legal content or explicit placeholders |
| P2 | Use existing `useAppearance` language state, not new store |

Qwen3.8 Max's Take: 

# Review of Plan 05 + Addendum — what DeepSeek missed

DeepSeek's 18 points are solid, but they mostly reason *inside* the plan. They don't cross-check against `list.txt` (what actually exists), `AGENTS.md` (hard codebase rules), the locked Plan 01–04 decisions, or the master Bangladesh audit. That's where the bigger problems are. Here's what they didn't catch, in priority order.

---

## 🔴 P0 — Existence status is wrong across the board

### 1. Nine screens marked "New" already exist in the tree (FACT)
DeepSeek never verified paths against `list.txt`. The Addendum's status column mislabels these as `New` when they're present and only need restyle/verify:

| Marked "New" in plan | Actually in `list.txt` |
|---|---|
| `schedule-ride/index.tsx` | ✅ exists |
| `ride-scheduled/index.tsx` | ✅ exists |
| `cancel-reason/index.tsx` | ✅ exists |
| `canceled/index.tsx` | ✅ exists |
| `apply-promos/index.tsx` | ✅ exists |
| `emergency-sos/index.tsx` | ✅ exists |
| `hotspot-map/index.tsx` | ✅ exists |
| `performance-stats/index.tsx` | ✅ exists |
| `rider-no-show/index.tsx` | ✅ exists |

This inflates the "new build" count badly and turns restyle work into greenfield rewrites (with real risk of breaking already-wired logic). The true scope is roughly: **~9 restyles + ~5 genuine creates** (`missed-requests`, `payout-methods`, `payout-history`, `instant-pay`, `min-rate`) + 3 shared components + content fills. Re-baseline the batch size.

### 2. Several "New" endpoints already exist; one is a near-duplicate (FACT)
The backend table marks these `New`, but they're in the tree:
- `POST /api/ride/schedule` → **exists** (`ride/schedule+api.ts`)
- `GET /api/ride/[id]/cancel-preview` → **exists**
- `POST /api/promo/redeem` → **exists** (and `promo/list` exists too)
- `GET /api/driver/performance` → **exists**
- `POST /api/ride/[id]/no-show` → **exists** (used by Rider No-Show, never listed)

And the real trap: the plan proposes creating `GET /api/driver/hotspots`, but **`app/api/driver/heatmap+api.ts` already exists**. Verify it doesn't already return demand/intensity data before building a parallel endpoint. `POST /api/sos/alert` genuinely doesn't exist — but there's existing SOS scaffolding to build on (`sos_alerts` admin endpoint, `admin/sos-alerts/[id]/ack`, `driver/sos-alert`, `sos/contacts`), so it's not greenfield either.

### 3. Settings paths are missing the `(tabs)` segment (FACT)
The plan writes `(customer)/settings/…` but these live under `(customer)/(tabs)/settings/…`:
- `settings/lost-items` → real: `(tabs)/settings/lost-items`
- `settings/ride-pass` → real: `(tabs)/settings/ride-pass`
- `settings/terms-of-service` + `privacy-policy` (Addendum 2.7) → real: `(tabs)/settings/…`

An agent following these paths will create duplicate routes in the wrong place. (`fare-dispute` is correctly at `(customer)/fare-dispute`, no `settings`.)

### 4. Scheduled rides are never dispatched (functional gap)
The spec inserts a `rides` row with `status='scheduled'` and stops. **Nothing ever turns it into an active, dispatchable ride.** `utils-server/scheduler.ts` exists for exactly this. The plan must specify the scheduler hook that promotes `scheduled → finding` at the right time and triggers dispatch — otherwise "Schedule a Ride" books a ride that never arrives. This is a P0 hole, not a polish item. (Related: `scheduling-user-ride`, `schedule-ride-after-promo`, `ride-details-scheduled` screens already exist — reconcile, don't rebuild.)

### 5. Shared components are built last but used first (ordering bug)
Wave 5 creates `EmptyState`, `ErrorBanner`, `OfflineIndicator` — but Waves 1–4 screens consume them. Plan 04 correctly put components in "Phase A: Foundation (do first)." Plan 05 reverses it, so every screen gets built without the components it's specced to use. Move component creation to Wave 0/1. Same problem with i18n: Waves 1–4 hardcode strings, then Wave 5 "extracts ALL hardcoded strings" — that's write-then-rewrite, and "extract ALL strings from every screen" is app-wide scope dumped into the final wave.

---

## 🟠 P1 — `AGENTS.md` hard-rule violations

These are the rules the codebase treats as critical; the plan's backend specs ignore them.

6. **Write ownership for `payment_events`.** Cancel-with-fee ("create `payment_events` row, wallet debit") and Rider No-Show ("create `payment_events` for partial compensation") write `payment_events` directly in the API route. `AGENTS.md` is explicit: `payment_events` creation happens **only** in `lib/paymentEvents.ts`, and status transitions only in `lib/activateSubscription.ts` / the PortPos callback. Both writes also touch money tables → **must run in a transaction**. As specced, both are write-ownership violations.

7. **`geohash` vs H3.** Hotspot spec says "Aggregate recent ride requests by **geohash**." The stack uses **H3 hexagonal indexing, res 9, only via `lib/h3.ts`** (`h3-js` is banned elsewhere). Geohash is a different system entirely. Rewrite around `getH3Ring`/`getH3Cell`.

8. **Expo API-route conventions.** All the new `[id]` routes (`cancel-preview`, `cancel`, `no-show`) must use Expo's **flat param signature** `GET(request, { id }: { id: string })` — not Next.js `{ params }` (this exact mistake caused BUG-1/BUG-2 in admin). And every POST body (`schedule`, `redeem`, `sos/alert`, `no-show`, `instant-pay`) must go through `parseJsonBody(request, schema)` from `lib/parseBody.ts` — never `await request.json()`. Neither is mentioned. Also every new protected route needs `verifySupabaseToken`/`requireRole`.

9. **Money handling beyond fare-dispute.** DeepSeek caught the fare-dispute conversion, but the same paisa rule applies to: cancel fee ("taka 25"), no-show compensation ("taka 15"), min withdrawal ("taka 200"), subscription prices, incentive bonuses. All must be integer paisa in the backend, `/100` only at display, using the existing **`lib/money.ts`** and **`lib/format.ts`** (both already in the tree — Plan 03 created `format.ts`). The plan never references either.

10. **`rider_no_show` is an unverified enum value.** "Update `rides.status='rider_no_show'`" — `rideStatusEnum` has fixed values; confirm this is one or add a migration. `AGENTS.md` also says rides use status transitions, not deletes — fine here, but the enum must be validated.

11. **i18n: don't build `lib/i18n.ts` from scratch.** The repo already has `i18n/i18n.ts` + `i18n/locales/bn/common.json` + `en/common.json`. The Addendum proposes a brand-new `lib/i18n.ts` with its own `t()` — that duplicates/conflicts with the existing system. Extend the existing `i18n/` setup instead. (This is the deeper version of DeepSeek's point 15.)

12. **`MinRateSlider` already exists.** `components/MinRateSlider.tsx` is in the tree, and `AGENTS.md` mandates `validateDriverMinKm()` from `lib/validateMinPerKm.ts` for min-per-km validation. The Addendum rebuilds a slider "from scratch" and omits the mandated validator. Reuse both.

13. **Configurable fees must come from `platform_config`.** Cancel fee (25) and no-show comp (15) are "configurable" — per `AGENTS.md`, `platform_config` is read fresh from DB every request, never cached/hardcoded. The client-side "taka 25" literal also needs to be fetched, not baked in (this reinforces DeepSeek's point 8).

---

## 🟡 P2 — Master-plan (Bangladesh) + locked-decision gaps

14. **Deep Linking is in the title but has zero spec.** "Deep linking setup in `_layout.tsx`" and "Push notification handler wiring" are one-line items (28–29) with no contract: which schemes/paths, which screens they resolve to, cold-start vs warm, how `ride_id`/`track` links route. A headline feature with no specification.

15. **Driver secondary screens ignore driver UX rules.** Master plan §8/9 requires driver screens to be light-first, high-contrast, large-target, glanceable, minimal-animation (sunlight, cheap Androids, moving vehicles). Plan 05 just says "Pattern A" for hotspot-map, performance-stats, rider-no-show, etc. These are used outdoors by working drivers — they need the driver-specific treatment Plan 04 spelled out, not generic theming.

16. **No accessibility section.** Plan 04 had one (a11y labels, live regions, "color alone never indicates status"); Plan 05 has none. The lost-items / vehicle-management / no-show status badges are color-only — must pair color+icon+text per master §18. No reduced-motion or screen-reader spec for the radio lists, SOS button, or charts.

17. **Charts & heatmap on low-end Android.** Master §11/12: every effect must justify its cost on cheap devices. Performance-stats charts + hotspot heat overlay are the two most expensive renders in the plan. Beyond DeepSeek's "which library" question, specify data-point caps, memoization, and a low-end fallback (e.g., tabular data when charts are too heavy).

18. **Schedule-ride timezone + minimum-time enforcement.** Picker says "Today / 3:00 PM" but never states the timezone (must be Asia/Dhaka, stored UTC) or how the client prevents picking `< now+15min`. Also: the 5-minute free-cancel window "from `created_at`" is **nonsensical for scheduled rides** (created days ahead → always past the window). Scheduled cancellation needs its own policy (free until X hours before pickup). Reference the existing `lib/cancellation.ts` / `cancellationCompensation.ts`.

19. **Book-for-Someone-Else unresolved edges.** The driver banner is specced "in `find-customer`," but the active navigation screen is `customer-navigation/[rideId].tsx` (Plan 04 already established `reach-customer.tsx` doesn't exist). Also unspecified: who gets notifications/tracking (booker vs passenger), who can cancel, and that the passenger has no app — the SMS gives info but no live tracking.

20. **Share-trip link privacy.** `app/track/[rideId].tsx` is public, no auth, 10s refresh — but there's no expiry. A leaked URL exposes live location indefinitely. Spec an access window (e.g., link dies on ride completion).

21. **Two emergency-contact sources.** SOS says "share with emergency contacts" but the codebase has both `/api/user/emergency-contacts` (Plan 03's screen) and `/api/sos/contacts`. Pick one source of truth or SOS will read the wrong list.

22. **Promos don't connect to fares.** `apply-promos` redeems into `user_promos`, but the plan never says how a redeemed promo discounts an actual booking. `lib/discountEngine.ts` and `lib/promoCache.ts` exist for exactly this — reference them, and define the hand-off into the CONFIRM state (Plan 02 home has "Apply promo code").

23. **Switching vehicle while online.** Vehicle Management "Switch Vehicle / activate" doesn't address that dispatch filters by `vehicle_type` and packages can be `vehicle_type`-scoped (`AGENTS.md`). Changing active vehicle mid-session affects dispatch eligibility and package validity — needs a guard or a warning.

24. **Subscription infrastructure already exists.** `subscription-checkout/confirmation/details/plans/renewal` screens + `lib/activateSubscription.ts` are all present. Don't treat `subscription-plans` as thin — verify and reuse the existing PortPos flow (which, per `AGENTS.md`, must route through `lib/paymentEvents.ts`).

25. **Reuse `components/plan03/StatusBadge`.** Plan 03 built `StatusBadge` (+ `SettingsRow`, `TransactionRow`). Plan 05's lost-items, vehicle-management, rider-no-show, payout-history, and missed-requests all need badges/rows — reuse the plan03 components instead of inlining new colored pills. (Extends DeepSeek's point 5 beyond `EmptyState`.)

---

## Verdict

DeepSeek found the internal-consistency problems; the deeper issue is that **Plan 05 was written without looking at the tree or the rules.** Before implementation: (1) re-baseline screen/endpoint existence against `list.txt` — ~9 "new" screens and ~5 "new" endpoints already exist; (2) fix the settings `(tabs)` paths; (3) wire scheduled rides into the dispatcher; (4) move shared components + i18n to the front of the wave order; (5) bring the backend specs into `AGENTS.md` compliance (paymentEvents ownership, H3, flat params, `parseJsonBody`, paisa, `platform_config`); and (6) actually spec Deep Linking and the driver-screen daylight/accessibility requirements.

Want me to produce a corrected, tree-verified scope table (every screen + endpoint with its true `exists/create/restyle` status and real path), or the dispatcher wiring spec for scheduled rides?


Kimi's Correction: 

Here are the **concrete changes** to make to your file. Copy-paste this into the document as a new section at the end.

---

## Changes to Apply to This Document

### P0 — Fix before any coding starts

**1. Screen existence status is wrong — re-baseline the scope**

Nine screens marked "New" already exist in the tree. Change their status from `New` to `Restyle/Verify`:

| Screen | Current Status | Correct Status |
|--------|---------------|----------------|
| `schedule-ride/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `ride-scheduled/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `cancel-reason/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `canceled/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `apply-promos/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `emergency-sos/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `hotspot-map/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `performance-stats/index.tsx` | New | **Restyle/Verify** — exists in tree |
| `rider-no-show/index.tsx` | New | **Restyle/Verify** — exists in tree |

**True new screens to build:** `missed-requests`, `payout-methods`, `payout-history`, `instant-pay`, `min-rate` — **5 screens only**.

**2. Backend endpoints marked "New" already exist**

Change these from `New` to `Verify/Extend`:

| Endpoint | Current Status | Correct Status |
|----------|---------------|----------------|
| `POST /api/ride/schedule` | New | **Exists** — verify contract matches spec |
| `GET /api/ride/[id]/cancel-preview` | New | **Exists** — verify |
| `POST /api/promo/redeem` | New | **Exists** — verify |
| `GET /api/driver/performance` | New | **Exists** — verify |
| `POST /api/ride/[id]/no-show` | Missing from table | **Exists** — add to table |

**Actually new:** `POST /api/sos/alert` only. `GET /api/driver/hotspots` — check if `app/api/driver/heatmap+api.ts` already serves this; if yes, rename/reuse, don't duplicate.

**3. Fix settings screen paths — missing `(tabs)` segment**

Change these paths everywhere they appear:

| Wrong path in document | Correct path |
|------------------------|--------------|
| `app/(main)/(customer)/settings/lost-items/index.tsx` | `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx` |
| `app/(main)/(customer)/settings/ride-pass/index.tsx` | `app/(main)/(customer)/(tabs)/settings/ride-pass/index.tsx` |
| `app/(main)/(customer)/settings/terms-of-service/index.tsx` | `app/(main)/(customer)/(tabs)/settings/terms-of-service/index.tsx` |
| `app/(main)/(customer)/settings/privacy-policy/index.tsx` | `app/(main)/(customer)/(tabs)/settings/privacy-policy/index.tsx` |
| `app/(main)/(rider)/settings/terms-of-service/index.tsx` | `app/(main)/(rider)/(tabs)/settings/terms-of-service/index.tsx` |
| `app/(main)/(rider)/settings/privacy-policy/index.tsx` | `app/(main)/(rider)/(tabs)/settings/privacy-policy/index.tsx` |

**4. Remove Insurance screen from Wave 4**

The Addendum says remove it, but Wave 4 item 16 still lists `insurance/index.tsx`. **Delete item 16 from Wave 4.**

**5. Move shared components to Wave 0**

`EmptyState`, `ErrorBanner`, `OfflineIndicator` are consumed by Waves 1–4 but built in Wave 5. Move them to **Wave 0** (before Wave 1). Same for `lib/i18n.ts` foundation — if strings are extracted at the end, Waves 1–4 hardcode English and never use the i18n system.

**Revised wave order:**
- **Wave 0:** `EmptyState`, `ErrorBanner`, `OfflineIndicator`, `lib/i18n.ts` foundation
- **Wave 1–4:** as before
- **Wave 5:** Deep linking, push handlers, legal content fill

**6. Scheduled rides need dispatcher wiring**

The `POST /api/ride/schedule` spec inserts a `rides` row with `status='scheduled'` and stops. **Add this requirement:**

> At `scheduled_at` time, `utils-server/scheduler.ts` must promote the ride to `status='finding'` and trigger the normal dispatch flow. The scheduler already exists — wire the `scheduled → finding` transition into it. Without this, scheduled rides never get drivers.

Also note: `scheduling-user-ride`, `schedule-ride-after-promo`, and `ride-details-scheduled` screens already exist — verify them before rebuilding.

**7. Cancel fee must come from `platform_config`, not hardcoded**

Change the Cancel Reason spec:

> ~~"Free window: 5 minutes from creation. Fee: taka 25 (configurable)"~~

**Replace with:**

> Free window and fee amount are read from `platform_config` table (fresh read every request, per AGENTS.md). Client displays `free_until` from `GET /api/ride/[id]/cancel-preview` response — never computes it locally. For **scheduled rides**, cancellation policy is different (free until X hours before pickup) — reference `lib/cancellation.ts` / `cancellationCompensation.ts`.

**8. `payment_events` write ownership violation**

The `POST /api/ride/[id]/cancel` spec says "create `payment_events` row (wallet debit)". The `POST /api/ride/[id]/no-show` spec says "create `payment_events` for partial compensation".

**Change both to:**

> If fee/compensation applies, call `lib/paymentEvents.ts` to create the `payment_events` row. **Never** create `payment_events` directly in the API route. This is an AGENTS.md hard rule.

Also: both endpoints touch money + ride status → **must run in a database transaction**.

**9. Hotspot Map — use H3, not geohash**

Change the backend spec:

> ~~"Aggregate recent ride requests by geohash"~~

**Replace with:**

> Aggregate recent ride requests using H3 hexagonal indexing (res 9) via `lib/h3.ts`. The stack uses H3 exclusively; `h3-js` is banned outside `lib/h3.ts`. Return `[{ lat, lng, intensity: 0-1 }]` for MapLibre `CircleLayer` rendering.

**10. Expo API route conventions**

Add this rule to every new backend endpoint spec:

> - Use **flat param signature**: `GET(request, { id }: { id: string })` — NOT `{ params: { id } }`
> - All POST bodies go through `parseJsonBody(request, schema)` from `lib/parseBody.ts` — never `await request.json()`
> - All protected routes use `verifySupabaseToken` + `requireRole`
> - All money fields are `integer` paisa; divide by 100 only at display using `lib/money.ts` / `lib/format.ts`

**11. i18n — don't build `lib/i18n.ts` from scratch**

The repo already has `i18n/i18n.ts` + `i18n/locales/bn/common.json` + `en/common.json`.

**Change the i18n spec:**

> ~~"Create `lib/i18n.ts` with ALL hardcoded strings"~~

**Replace with:**

> Extend the existing `i18n/` setup. Add new keys to `i18n/locales/en/common.json` and `bn/common.json` (Bangla can be empty placeholders). Use the existing `useTranslation()` hook, not a new store. Language state comes from `useAppearance()` (`language`, `setLanguage`), already persisted in AsyncStorage.

**12. `EmptyState` already exists**

`components/plan03/EmptyState.tsx` is already in the tree. **Change spec:**

> Reuse `components/plan03/EmptyState.tsx` — restyle it to Pattern A if needed, don't create a duplicate.

**13. `MinRateSlider` already exists**

`components/MinRateSlider.tsx` is in the tree, and `lib/validateMinPerKm.ts` has `validateDriverMinKm()`.

**Change the MinRate spec:**

> Reuse `components/MinRateSlider.tsx`. Validate with `validateDriverMinKm()` from `lib/validateMinPerKm.ts`. API: `PATCH /api/driver/me { min_rate_per_km_bdt }`.

**14. `confirm-ride/index.tsx` may be the wrong file for "Book for Someone Else"**

The booking flow state machine lives in `home/index.tsx` (Plan 02). `confirm-ride/index.tsx` may be orphaned.

**Change the spec:**

> Verify `confirm-ride/index.tsx` is the active confirmation screen before adding the toggle. If the home state machine handles confirmation inline, add the toggle there instead.

---

### P1 — Fix before backend coding

**15. Add missing endpoints to the backend table**

These endpoints are called by screens but missing from the table:

| Endpoint | Method | Called By |
|----------|--------|-----------|
| `POST /api/ride/[id]/cancel` | POST | Cancel Reason |
| `GET /api/promo/list` | GET | Apply Promos |
| `POST /api/rider/lost-items` | POST | Lost Items |
| `GET /api/rider/lost-items` | GET | Lost Items |
| `POST /api/rider/fare-disputes` | POST | Fare Dispute |
| `GET /api/rider/passes` | GET | Ride Passes (active pass) |
| `POST /api/ride/[id]/no-show` | POST | Rider No-Show |
| `PATCH /api/driver/me` | PATCH | MinRateSlider |
| `GET /api/driver/payout-methods` | GET | Payout Methods |
| `POST /api/driver/payout-method` | POST | Payout Methods |
| `GET /api/driver/payout-history` | GET | Payout History |
| `POST /api/driver/instant-pay` | POST | Instant Pay |

**16. `rider_no_show` enum value**

The `POST /api/ride/[id]/no-show` spec says `rides.status = 'rider_no_show'`. **Add:**

> Verify `rider_no_show` is a valid value in `rideStatusEnum`. If not, add it via migration before implementing.

**17. Fare Dispute — clarify currency conversion**

The spec says "integer paisa" for the input but users enter taka. **Add:**

> Client: user enters taka → `claimed_fare_bdt = Math.round(enteredTaka * 100)` (paisa). Display: `bdt / 100`. Backend receives integer paisa.

**18. Lost Items — fix the 7-day vs 24-hour contradiction**

The spec says "Recent rides dropdown (last 7 days)" AND "24-hour reporting window". **Change to:**

> Dropdown shows rides completed within the **last 24 hours** only. Submission is blocked for older rides. The 24-hour window is enforced on both client and server.

**19. SOS — add offline/location-failure behavior**

**Add to SOS spec:**

> 1. Acquire location via `Location.getCurrentPositionAsync()` immediately before API call.
> 2. If location fails: still dial `tel:999`, show warning "Location not shared — emergency services called."
> 3. If network fails: still dial `tel:999`. Queue alert locally if possible; retry when online.

**20. Share Trip — add link expiry**

**Add to Share Trip spec:**

> Public tracking link expires when ride status reaches `completed` or `canceled`. Before expiry: 10s auto-refresh. After expiry: redirect to "Ride has ended" message.

**21. Book for Someone Else — clarify driver screen**

The spec says driver sees banner "in `find-customer`". **Change to:**

> Driver sees "Booked for: [Name]" banner in `customer-navigation/[rideId].tsx` (the active navigation screen per Plan 04). Also specify: SMS goes to secondary rider via dpRelay; primary booker retains cancellation rights.

**22. Promo discount wiring**

The Apply Promos spec redeems promos but never says how they discount a fare. **Add:**

> Redeemed promos are applied during fare estimation in the CONFIRM state (Plan 02 home screen). Reference `lib/discountEngine.ts` and `lib/promoCache.ts` for the discount calculation. The "Apply promo code" toggle in the home confirmation sheet must read from `user_promos` and apply the best available discount.

**23. Performance Stats — specify chart fallback**

The spec says "bar chart + line chart" but no library is named. **Add:**

> Use `react-native-svg` for custom charts (already in dependencies). If charts are too heavy on low-end devices, fallback to tabular data (earnings list by day). Cap data points at 30 days. Memoize chart components.

**24. Deep Linking — actually specify it**

"Deep linking setup in `_layout.tsx`" is a headline with no content. **Add:**

> **Schemes:** `rideapp://` + universal links `https://ride.app`
> **Routes:**
> - `rideapp://track/{rideId}` → `app/track/[rideId].tsx`
> - `rideapp://ride/{rideId}` → rider `ride-tracking/[ride_id].tsx` (if authenticated)
> - `rideapp://promo/{code}` → `apply-promos` with code pre-filled
> - Cold start: parse initial URL in root `_layout.tsx`, route via `router.push()`
> - Warm start: `useURL()` hook in `_layout.tsx` handles incoming links

**25. Vehicle Management — add switching guard**

**Add to Vehicle Management spec:**

> Changing active vehicle while `online=true` affects dispatch eligibility (driver may receive offers for wrong vehicle type). Show warning: "Going offline to switch vehicles?" → auto-offline → switch → prompt to go back online.

**26. Terms/Privacy — mark as placeholder**

The spec says "Create `lib/legalContent.ts`" but provides no actual legal text. **Add:**

> **BLOCKED:** Actual legal text required from owner/legal team before release. For now, create `lib/legalContent.ts` with lorem ipsum placeholders and a `// TODO: Replace with final legal copy` comment. Do not ship placeholder text.

**27. `@react-native-community/netinfo` dependency**

The `OfflineIndicator` spec uses it. **Add:**

> Verify `@react-native-community/netinfo` is installed. If not, add it via `npx expo install @react-native-community/netinfo`.

---

### P2 — Polish items

**28. Verification checklist count is wrong**

The checklist says "All 17 screens" but the true count is ~23 screens + components. **Replace with:**

> - [ ] All screens (rider + driver) use Pattern A theming
> - [ ] All screens have StatusBar + theme toggle
> - [ ] Zero `console.log` — all use `logger`
> - [ ] Zero `theme === "dark"` — all use `useIsDark()`
> - [ ] Zero NativeWind `dark:` classes in new/modified files
> - [ ] All API calls have Zod validation via `parseJsonBody`
> - [ ] All error states show `ErrorBanner` or `EmptyState`
> - [ ] All loading states show `LoadingRider` or skeleton
> - [ ] All money: integer paisa, `/100` at display only via `lib/money.ts`
> - [ ] `payment_events` created only via `lib/paymentEvents.ts`
> - [ ] `npx tsc --noEmit` passes
> - [ ] `npm run lint` passes

**29. Add `amberLight` and `successLight` to theme tokens**

The spec uses these colors extensively but they may not exist in `theme/goRide.ts`. **Add as a pre-implementation task:**

> **Pre-req:** Verify `amberLight` (`#FEF3C7`) and `successLight` (`#E6F7EE`) exist in `theme/goRide.ts`. If missing, add them before any Plan 05 screen work.

**30. Driver screens need daylight/accessibility treatment**

The driver screens (hotspot-map, performance-stats, rider-no-show, etc.) are used outdoors by working drivers. **Add to each driver screen spec:**

> Driver UX requirements: light-first (even in dark mode, map stays readable), high contrast, touch targets ≥ 56dp, minimal animation, glanceable layout. No glass/blur effects. Status badges must pair color + icon + text (never color alone).

---

**End of changes list.**