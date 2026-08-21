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

> **CORRECTION (verified 2026-08-16):** This P0 is STALE — scheduled rides ARE dispatched. `utils-server/scheduler.ts` job 1 promotes `scheduled` → `pending` for dispatch with an overlap guard. Do NOT let anyone "fix" this claim; it would add a second promotion path.

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

---

# FINAL — Orchestrator-Locked Implementation Plan (2026-08-16)

> **Authority:** This section supersedes everything above it. Where earlier sections conflict with this one, this one wins. All claims below were verified against the working tree on 2026-08-16.
> **Role split:** UI/UX specs come from Kimi (incorporated below with corrections). Backend, database, and wiring are orchestrator-owned and locked here.
>
> **⚠ Wave completion status (audit-verified 2026-08-16):** The tree is a *cherry-pick* of this plan, not "not started" — do NOT re-build shipped items. **Shipped:** `POST /api/sos/alert`, `POST /api/driver/vehicle-type-change`, `GET /api/driver/slider-config`, no-show, pass-purchase guard + per-pass quota, payment-result screens (`/payment/success|failure`, scheme `ride`), finding-driver WS wiring (`ride:status`/`ride:alternatives`/`ride:expired`), HTTP arrive/start atomic claims, tip/rate/wait-start guards, trial-package direct activation, Home "Book Now" → real pipeline, 48h dispute hide-gate, `lib/authCleanup.ts`, Pattern-A auth sweep, track auth exemption. **NOT shipped (Wave 0/1):** `ErrorBanner`/`OfflineIndicator`/`amberLight` + deps, `ScheduleRideSheet`, `ride-scheduled` rebuild, cancel-reason rebind. **NOT shipped (Zone gate Z-1…Z-8, §8):** `zones_one_active` constraint, `getZoneForLocation`, nil-UUID sentinel removal, heartbeat zone stamping, admin zone deactivate, **`demand_forecasts` has NO writer — the heatmap reads a permanently empty table until Z-6 lands**. **NOT shipped (Wave 4):** `daily_totals` earnings/breakdown, hotspot map. Execute §3 below as the live ticket list — it is accurate.

## 1. Kimi's Decisions (incorporated)

- **Q1(a)** Scheduling = "Schedule for later" toggle in `confirm-ride`; date+time picker appears when ON. **Q1(b)** Delete `scheduling-user-ride`, `schedule-ride-after-promo`, `no-drivers-available`; `ride-scheduled` becomes the real confirmation screen (rideId param + live data). The picker itself is implemented as `components/ScheduleRideSheet.tsx` (bottom sheet inside confirm-ride) — the orphaned `schedule-ride/index.tsx` route is deleted.
- **Q2** Hotspot map = MapLibre circles at zone centroids. Circle size = predicted demand; color = demand/supply ratio (green `primary` / yellow `amber` / red `danger`); zone name label (13px, white outline); manual refresh only; "Last updated" timestamp; legend bar; **mandatory EmptyState** (see §6 risks).
- **Q3** `instant-pay` and `payout-history` REMOVED from Plan 05 (no withdrawal backend exists — separate epic). Wallet keeps "No withdrawals are available yet."
- **Q5** Call Ledger "missed" tab is canonical; the dedicated `missed-requests` screen is **not built** (it never existed — the addendum's plan to "delete" it means don't create it).
- **Q9** Checklist item corrected to: "No raw `theme === 'dark'` comparisons — use `useIsDark()`. NativeWind `dark:` classes are allowed per AGENTS.md."
- **Q10** Cancel screen binds 100% to server: `fee_bdt` (paisa→taka at display) + `free_until` countdown. No hardcoded fees or windows.
- **Q11** Entries: hotspot pill in driver home stats bar (`(tabs)/index.tsx` ~line 896); Incentives row in earning tab; "Rider not here?" link in find-customer — **appears immediately on `driver_arrived`, hides when status changes** (NOT after 5 min — see §2 override).

## 2. Kimi Overrides (backend facts — final)

1. **Vehicle screen data:** rows = Registration date, `fitness_expires_at`, `tax_token_expires_at`. NO insurance column, NO vehicle photo (use vehicle-type icon). Badges: valid `successLight`, <30d `amberLight`, expired `dangerLight`.
2. **Vehicle type change:** `POST /api/driver/vehicle-type-change { new_vehicle_type }` (NOT `PATCH /api/driver/vehicle-type`). Radio list = the 8 enum values from `lib/vehicleTypes.ts` (bike_basic, bike_standard, bike_plus, cng, car_economy, car_comfort, car_premium, car_xl). Eligibility gated server-side (`eligibility_not_met` 422). If `is_online` → warning modal → auto-offline → selector.
3. **No-show window:** `max_free_wait_seconds` (system_config, default **60s**) auto-starts arrived rides (`scheduler.ts:644–678`). The "Rider not here?" link must be visible from the moment of arrival. Longer windows = ops config change, not code.
4. **Referral deep link CUT** (journey 3): register API/screen have no referral support. Kept journeys: push→ride-tracking (already works), promo link→apply-promos with code pre-filled. Web `/track/{id}` stays primary for share.
5. **SOS banner hex:** use `infoLight` token (`#EAECF6`), not `#EEF2FF`. "Contact Booker" = `tel:` call (booker's number; primary call button = secondary passenger).

## 3. Final Scope

| Item | Disposition |
|---|---|
| confirm-ride schedule toggle + `ScheduleRideSheet` | Build (client only — server branch exists; sends `scheduled_at` UTC ISO, validates 30min–7d, displays Asia/Dhaka) |
| `ride-scheduled` | Rebuild (rideId param, `GET /api/ride/[id]`) |
| `schedule-ride`, `scheduling-user-ride`, `schedule-ride-after-promo`, `no-drivers-available` routes | **DO NOT delete blindly (corrected 2026-08-16).** `no-drivers-available` and `schedule-ride` are LIVE routes: finding-driver navigates to `no-drivers-available` on `ride:expired`/alternatives-cancel; FloatingNavMenu links `schedule-ride`; no-drivers-available links back to `schedule-ride`. Re-home those links before any deletion. `scheduling-user-ride`/`schedule-ride-after-promo` remain the only orphan candidates (re-run the §5 grep gate first). |
| `cancel-reason` | Fix: bind to `free_until`+`fee_bdt` from extended cancel-preview; remove hardcoded 120s window |
| `canceled` | Light wire-up (server values) |
| `apply-promos` | Fix: staged-promo → confirm-ride discount-selector handoff; fix home's unauthorized redeem call; replace no-op `applyPromo` store action |
| `emergency-sos` | Rebuild: location acquisition → confirm modal → `POST /api/sos/alert`; offline/permission-failure fallbacks still dial 999 |
| `SOSButton` (rider) | **BUG FIX**: repoint from driver-only `/api/driver/sos-alert` (403s today) to `/api/sos/alert` |
| `lost-items` | Fix statuses to real enum (`reported→driver_confirmed→photo_provided→arranged_return→resolved\|unresolved`); ride picker filtered to rides completed ≤24h; no photo upload |
| `fare-dispute` | Verify only (complete, correct reasons/units) |
| `ride-pass`, share-trip, book-for-someone-else (rider side) | Verify only (complete) |
| find-customer | Add: "Booked for [Name/Phone]" banner from `ride:offer` payload (`secondary_rider_*` already on the wire); primary call→passenger, "Contact Booker"→booker; "Rider not here?" link on arrival |
| `rider-no-show` | Verify + entry wiring (existing endpoint correct: `cancelled` + `cancel_reason='rider_no_show'`, NO enum change) |
| `hotspot-map` | Build (see Q2; data from extended heatmap API) |
| `performance-stats` | Fix retry bug; add daily-earnings bars from new `daily_totals` (svg, ≤30 pts, memoized, tabular fallback) |
| `incentives` | Fix missing auth header (permanent 401); restyle; rewards = call credits |
| earning tab | Add Incentives row + Earnings Goal modal (AsyncStorage `@driver_earnings_goal`) |
| `vehicle-management` | Rebuild per §2.1/§2.2 (one vehicle; docs badges; type-change flow) |
| `select-active-vehicle` | **BUG FIX**: currently PATCHes `vehicle_type` to `/api/driver/me` which strips it (silent no-op) → use `vehicle-type-change`; fold into vehicle screen flow |
| `min-rate` | Build: `components/MinRateSlider` + `GET /api/driver/slider-config` + `PATCH /api/driver/me { min_per_km_bdt }` + `validateMinPerKm` |
| `payout-methods` | Build: bKash CRUD (`GET` added server-side; `POST` exists); entry = SettingsRow in driver settings |
| subscription screens | Content fix only: call packages (N calls + validity days, PortPos) |
| Terms/Privacy ×4 | Fill from `lib/legalContent.ts` placeholders — **BLOCKED on owner-supplied legal text** |
| `ErrorBanner`, `OfflineIndicator` | Build (Wave 0). `EmptyState` exists flat in `components/` — reuse. NetInfo dep already declared. |
| i18n | Plan-05 screens only: keys in `i18n/locales/{en,bn}/common.json`, react-i18next, language via `useAppearance` |
| `insurance/index.tsx` | Out of plan scope; leave as static info screen (linked from profile) |

## 4. Backend & Wiring Work (orchestrator-owned)

1. Extend `GET /api/ride/[id]/cancel-preview` → add `free_until` alongside `fee_bdt`/`reason`.
2. New `POST /api/sos/alert` — rider+driver; `parseJsonBody` `{lat, lng, ride_id?}`; insert `sos_alerts` (`ride_id` column EXISTS — schema:1066; earlier "migration needed" claims were wrong); push via `lib/notify`; SMS `user_emergency_contacts` via `lib/dprelay`; admin visibility = existing REST dashboard. NO WS broadcast (no admin WS channel exists).
3. Add `GET` to `app/api/driver/payout-method+api.ts` (POST already exists, `^01\d{9}$` validation).
4. Extend `GET /api/driver/heatmap`: join `zones`, compute centroid from `polygon` jsonb, return `{zone_id, name, lat, lng, predicted_demand, predicted_supply, confidence_score}`.
5. Add `daily_totals` to `GET /api/driver/earnings/breakdown` (server-side group-by).
6. Root `_layout.tsx`: exempt `track` segment from auth redirect (share links currently bounce logged-out recipients to login — live bug).
7. Push-handler deep links via expo-linking (root layout); scheme is `ride` (app.config.js — corrected 2026-08-16; was the `myapp` tutorial placeholder).
8. Store fixes: `scheduledRides` filter `'scheduled'` not `'pending'`; `ride-details-scheduled` missing rideId params; retry-button refetch bug (4 driver screens).
9. Dependencies: `expo install @react-native-community/datetimepicker @react-native-community/slider` — **requires a new dev build**. Add `amberLight` token to `theme/goRide.ts`.

## 5. Database Plan

**ZERO migrations.** Everything needed exists: `scheduled` + `cancelled` statuses, `secondary_rider_*`, wait columns, `sos_alerts.ride_id`, `lost_items`, `fare_disputes`, `rider_passes`/`rider_subscriptions`, `driver_payout_methods`, `demand_forecasts`+`zones`, `cancellation_policies`. Column-name canon for UI work: `cancel_reason`, `cancelled_by` (double-L), `arrived_at`, `valid_until`, `max_rides`, `min_per_km_bdt`.

## 6. Implementation Order

- **Wave 0 (foundation):** deps + dev build, `amberLight`, ErrorBanner, OfflineIndicator, i18n keys, track auth exemption.
- **Wave 1 (rider booking):** schedule toggle + sheet, ride-scheduled rebuild, route deletions, cancel-reason/canceled/apply-promos fixes (cancel-preview extension lands first).
- **Wave 2 (rider safety):** sos/alert endpoint, emergency-sos rebuild, SOSButton repoint, lost-items fixes, fare-dispute verify.
- **Wave 3 (verify-only):** ride-pass, share-trip, book-for-someone-else rider side.
- **Zone gate (Z-1…Z-8, §8):** backend-only; runs in parallel with Waves 1–3, MUST complete before Wave 4 (hotspot-map in Wave 4 consumes the Z-6 forecast data + §4.4 heatmap extension).
- **Wave 4 (driver):** find-customer banner + no-show link, vehicle rebuild + select-active-vehicle fix, heatmap extension + hotspot map, performance + incentives + earning-tab additions, min-rate, payout-methods, subscription content fixes.
- **Wave 5:** deep links, legal placeholders, i18n sweep, full verification (tsc, lint, checklist).

## 7. Risks / Expectations

- **Hotspot data is not populated by anything in this repo** (`demand_forecasts` has no writer). Screen ships with EmptyState; data comes later via admin/AI pipeline. Also `zones_one_active` index = at most one active zone today; map renders ≤1 circle until multi-zone goes live.
- Dev build required (two native modules). Legal text blocked on owner. Referral deep link cut (no backend). Instant-pay/payout-history deferred to withdrawal epic.

## 8. Zone Foundation: Multi-Zone Unlock (merged 2026-08-16)

> **Status:** APPROVED — Z-1…Z-8 run in parallel with Waves 1–3, MUST complete before Wave 4.
> **Owner:** Orchestrator (backend/DB/wiring). No Kimi/UI work in Phase 1.
> **Source:** An external "multi-zone architecture" proposal (ChatGPT) was audited line-by-line against the working tree. This section is the authoritative ruling — the external proposal is NOT a spec.

### 8.0 Ruling summary

The external proposal assumed a single-active-zone hardcoded app. Reality: **the data model is already multi-zone; the deployment is locked single-zone by one DB index and five code paths.** Phase 1 unlocks multi-zone with ~6 focused changes and **zero new tables**. The rest of the proposal (PostGIS, zone-pair pricing, zone hierarchy, client zone events) is deferred or rejected with reasons in §8.4–§8.5.

**The screen scope of this plan is unchanged by this section** — no screen in §3 depends on zone count, dispatch is already zone-agnostic, and the apps have zero zone awareness (which the proposal itself recommends keeping). The hotspot screen spec (Q2) stands; the heatmap API extension (§4 item 4) is compatible with and benefits from Z-6 below.

### 8.1 What already exists (do not rebuild — verified 2026-08-16)

| Capability | Where | Notes |
|---|---|---|
| Zones table w/ polygon | `zones` (jsonb polygon, `is_active`, `lifecycle_stage`) | schema.ts:891–909 |
| Zone lifecycle + graduation | `zone_lifecycle_stage` enum; Job 27 (`scheduler.ts:1010–1025`) → `lib/zoneLifecycle.ts` | Data-driven via `zone_graduation_rules`; promotes stage only, never `is_active` |
| Zone budgets | `zone_budgets`/`zone_budget_logs`, Job 26 daily reset, `lib/zoneBudget.ts` | Per-zone, already multi-zone |
| Per-zone pricing | `pricing (zone_id, vehicle_type) WHERE is_active` unique idx | Resolved by **pickup zone** in estimate/request/schedule |
| Per-zone surge | Job 19 (`scheduler.ts:755–835`) — **already loops ALL zones** | Broken only by bad zone stamps (§8.2.3) |
| Zone P&L | `lib/zoneEconomics.ts` over accounting entries | Admin `zone-pnl+api.ts` |
| Zone versions (audit) | `zone_versions` table (schema + migration 0032) | **Never written** — deferred (§8.4) |
| Admin zone CRUD | `app/api/admin/zones+api.ts` + `app/admin/zones.tsx` | Polygon edited as JSON textarea; no map |
| Intercity/destination pricing | `city_boundaries` + `lib/cityBoundary.ts` + `lib/routeSplit.ts` + `intercity_per_km_bdt` | Migration `0009_intercity_geo_fencing.sql` — exists, do not duplicate |
| H3 dispatch | `utils-server/h3Index.ts` res 9 | **Zone-agnostic.** Zone enters scoring ONLY as pricing lookup key (`dispatch.ts:115–124`). Multi-zone needs NO dispatch rewrite. |
| Historical ride geography | `rides.zone_id` stamped once at creation, never recomputed | Satisfies "don't re-derive history" — already correct |

### 8.2 The actual single-zone locks (the real defects)

1. **DB constraint:** partial unique index `zones_one_active` (`src/db/migrations/0000_…sql:388`, schema.ts:904–908) — at most one `is_active=true` row, ever.
2. **Resolution model:** `lib/zone.ts:56–123` — `getActiveZone()` fetches *the* active zone (+ 60s cache + Bangladesh fallback polygon); `validatePickupZone` answers "inside THE zone?", not "which zone?". No multi-zone lookup exists.
3. **Driver zone stamp is fake:** heartbeat backfill stamps `drivers.zone_id` with whichever zone is *globally active* (`utils-server/index.ts:609–625`) — not derived from driver coordinates. Under multi-zone this corrupts surge `supply_count` (Job 19) and graduation utilization.
4. **Sentinel writes:** ride routes write `zone_id = '00000000-0000-0000-0000-000000000000'` (or `'fallback'`) when resolution fails (`ride/request+api.ts:90–101`, `ride/schedule+api.ts:83–87`, `estimate+api.ts:55–59`). `rides.zone_id` has no FK, so garbage persists.
5. **Admin exclusive-activation sweep:** `admin/zones+api.ts:74–80, 134–139` deactivates all other zones on any activation.
6. **`demand_forecasts` has no writer** (repo-wide verified): the heatmap API and this plan's hotspot screen read a permanently empty table. Multi-zone does NOT fix hotspots — Z-6 does.

### 8.3 Phase 1 — build now (Z-1 … Z-8)

Backend-only; no UI work, no Kimi dependency. Runs parallel to Waves 1–3, gates Wave 4.

- **Z-1 Migration — unlock concurrency.** `DROP INDEX zones_one_active;` + plain `zones_active_idx ON (is_active)`. Schema.ts edit → `drizzle-kit generate` → push. **No new tables → no TD-31 GRANT exposure.**
- **Z-2 Multi-zone resolution.** `lib/zone.ts`: new `getZoneForLocation(lat, lng)` — load all active zones (60s cache), `normalizePolygon` once per zone, first-match point-in-polygon ordered by vertex count ASC (smaller polygon = more specific zone wins overlaps). `validatePickupZone` switches to it. Keep the Bangladesh fallback ONLY for the zero-active-zones boot state, and in that case reject with `503 zones_not_configured` instead of writing sentinel ids.
- **Z-3 Kill sentinel writes.** All three call sites (estimate/request/schedule): unresolvable pickup → `422 outside_zone` (or Z-2's 503). Never write nil-UUID/`'fallback'`.
- **Z-4 Truthful driver zones.** Heartbeat backfill resolves `drivers.zone_id` from the driver's own coordinates via the Z-2 lookup (cache active zones in utils-server memory, 60s TTL; re-resolve only on H3 cell change). Fixes surge supply + graduation utilization automatically — Job 19 needs no change.
- **Z-5 Admin API multi-activation.** Remove both deactivate-others sweeps; allow N active zones. UI (JSON textarea) unchanged this phase.
- **Z-6 `demand_forecasts` writer (unblocks hotspots).** New hourly scheduler job: per active zone — `predicted_demand` = mean of rides created in the same hour-of-day over the trailing 7 days (source: `rides.zone_id` + `created_at`); `predicted_supply` = current online drivers in zone (post-Z-4 stamps); `confidence_score = 0.5` (v1 constant); upsert row for next `forecast_hour`. Prune rows older than 14 days. This lights up the existing heatmap API and this plan's hotspot screen with real data.
- **Z-7 Data hygiene.** `UPDATE rides/drivers SET zone_id = NULL` where `zone_id` is the nil-UUID or otherwise invalid (one-off script in `scripts/`). FK constraints on `zone_id` columns: **deferred** (historic fallback rows make an FK risky; revisit after one clean quarter).
- **Z-8 Ops note.** `scripts/seed-pricing.js` seeds one `ACTIVE_ZONE_ID` per invocation — run per zone when onboarding a new city; document in script header.

**Deploy order (per AGENTS.md):** drizzle push → utils-server → EAS. Job Z-6 lives in utils-server; Z-2/Z-3 are API-route side.

### 8.4 Deferred (with trigger conditions — do not build speculatively)

| Item | Trigger |
|---|---|
| `zone_h3_cells` coverage table (H3→zone fast path) | >50 zones or polygon lookup measurably >10ms |
| PostGIS (`geometry(MultiPolygon,4326)` + DB-side containment) | Polygon complexity/counts demand DB-side spatial queries; Supabase supports the extension but drizzle push won't enable it — manual migration required |
| Admin map-based polygon drawing UI (Kimi design task) | Ops pain with JSON textarea becomes real |
| Client zone context (`currentZone`, `ZONE_ENTERED/EXITED` events) | First actual consumer (zone announcements, hotspot auto-switch on travel) |
| `zone.code` / `type` / `priority` / `parent_zone_id` columns | First actual consumer (deep links, division hierarchy, overlap priority beyond vertex-count rule) |
| `zone_versions` writes on boundary edit | Boundary-change audit requirement |
| FK on `rides.zone_id` / `drivers.zone_id` | After Z-7 + one clean quarter of data |

### 8.5 Rejected (with reasons)

| Proposal item | Verdict | Reason |
|---|---|---|
| Zone-pair directional pricing rules (`zone_pricing_rules`) | **REJECT** | Third geo-pricing system alongside per-zone pricing AND existing `city_boundaries` intercity fencing (migration 0009). No consumer. Revisit only if zone-based intercity economics diverge from city-based. |
| `pickup_zone_id` + `destination_zone_id` on rides | **REJECT (dest side)** | Pickup zone already stamped immutably at creation; destination context already captured via city-boundary route split for intercity rates. No consumer for a destination zone id. |
| Zone hierarchy / ZoneType enum (CITY/METRO/…) | **DEFER→likely reject** | `lifecycle_stage` already provides the operational vocabulary in use (graduation rules, P&L). No consumer. |
| Client `src/features/zones/*` restructure | **REJECT** | Codebase convention is flat `lib/`, `store/`, `components/` (AGENTS.md). A client zone module appears only with the deferred client-zone-context work. |
| "Don't rewrite the H3 dispatch engine" | **Confirmed non-issue** | Verified: dispatch is already zone-agnostic; zone only keys the pricing row in scoring. |
| Rider/driver apps download all zones | **Non-issue** | Apps have zero zone awareness today (verified — only `timeZone` matches). Keep it that way until a consumer exists. |

### 8.6 Expectation update

Once Z-6 ships, the §7 hotspot EmptyState note is superseded — the hotspot screen gets live per-zone demand/supply data (still subject to at least one active zone existing). Until then the §7 note stands.

### 8.7 Verification (Phase 1 exit)

- [ ] Two zones active simultaneously; pickup inside each resolves correctly; outside both → `422 outside_zone`
- [ ] Zero-active-zones boot state → `503 zones_not_configured` (no sentinel rows written)
- [ ] `rides.zone_id` / `drivers.zone_id` contain only real zone UUIDs after Z-7
- [ ] Driver heartbeat: `zone_id` changes only when crossing a boundary (cell-change throttle)
- [ ] Job 19 surge: per-zone `demand_count`/`supply_count` non-zero for zones with traffic
- [ ] Z-6 job: `demand_forecasts` rows exist for next hour; `GET /api/driver/heatmap` returns them
- [ ] Zone P&L + graduation unaffected for the incumbent zone (regression check)
- [ ] `npx tsc --noEmit`, `npm run lint`, utils-server tsc all pass

**End of FINAL locked plan.**


#### DeepSeek's Take: 

## Remaining areas of improvement in the FINAL locked Plan 05

The final orchestrator-locked plan resolves many earlier issues, but several real gaps and internal contradictions remain. These are grounded in the final plan text itself, not speculative.

---

### 🔴 P0 — Blocking contradictions / missing backend specifications

1. **Database Plan says “ZERO migrations,” but Zone Z-1 is a migration**  
   §5 states “**ZERO migrations.** Everything needed exists…”  
   §8.3 Z-1 requires:  
   `DROP INDEX zones_one_active;` + create `zones_active_idx ON (is_active)`.  
   That is a schema change requiring `drizzle-kit generate` + push.  
   **Fix:** Reconcile §5 and §8. Either state “one migration (Z-1 only)” or explicitly separate the Zone foundation from the Plan 05 database plan.

2. **Backend work list omits two endpoints required by final scope**  
   Final scope requires:
   - `POST /api/driver/vehicle-type-change` (§2 override 2)
   - `GET /api/driver/slider-config` (§3 min-rate build)

   But §4 Backend & Wiring Work does not include either. The plan says backend is orchestrator-owned and locked, yet these endpoints are not scheduled.  
   **Fix:** Add both to §4 with auth, Zod, and response specs. Also add `PATCH /api/driver/me` verification for min-rate if not already present.

3. **SOS endpoint lacks auth/rate-limiting spec**  
   §4 item 2 says:  
   `POST /api/sos/alert — rider+driver; parseJsonBody {lat, lng, ride_id?}; insert sos_alerts…`  
   It does not state:
   - `verifySupabaseToken` required for rider/driver auth
   - `requireRole` for driver vs rider
   - Rate limiting / duplicate alert prevention
   - What happens if `ride_id` is null or invalid

   **Fix:** Add explicit auth, validation, and abuse-prevention rules to the SOS endpoint spec.

4. **Vehicle-type-change eligibility is referenced but not specified**  
   §2 override 2 says:  
   `Eligibility gated server-side (eligibility_not_met 422)`.  
   But no criteria are defined. Which eligibility? Vehicle documents? Package type? Active ride status?  
   **Fix:** Define the exact eligibility checks and error shape for `vehicle-type-change`.

---

### 🟠 P1 — Navigation / entry-point gaps for new screens

5. **Several new driver secondary screens have no entry point**  
   Final scope builds:
   - `vehicle-management`
   - `payout-methods`
   - `min-rate`
   - `performance-stats`

   But the plan does not specify where these screens are linked from. Existing driver settings/home/earning tabs were built in Plan 04; adding new screens without wiring entries leaves them orphaned.  
   **Fix:** Add explicit navigation entries:
   - Vehicle Management → driver settings row
   - Payout Methods → driver settings or wallet row
   - Min Rate → driver settings row
   - Performance Stats → earning tab or driver home stats bar

6. **`find-customer` path is not verified**  
   The final plan repeatedly references `find-customer`, but earlier Plan 04 established the active navigation screen is `customer-navigation/[rideId].tsx` — not `find-customer`.  
   **Fix:** Confirm the actual file path and use it consistently. Do not let the coding agent guess.

7. **`store fixes` list is too vague**  
   §4 item 8:  
   `retry-button refetch bug (4 driver screens)`.  
   Which four screens? Without names, the coding agent cannot target the fix.  
   **Fix:** List the exact files/screens and the expected behavior for each retry fix.

---

### 🟡 P2 — Zone foundation ordering and logic gaps

8. **Z-6 depends on Z-7 but order is not specified**  
   Z-6 aggregates rides by `rides.zone_id`. If Z-7 (data hygiene) has not run first, Z-6 will include sentinel/invalid zone_ids in forecasts.  
   **Fix:** Specify execution order: Z-1 → Z-2 → Z-3 → Z-4 → Z-5 → Z-7 → Z-6. Or make Z-6 filter out NULL/invalid zone_ids explicitly.

9. **Z-4 driver zone stamp may miss boundary crossings**  
   Z-4 says:  
   `re-resolve only on H3 cell change`.  
   H3 res 9 cells are small, but zone boundaries do not necessarily align with H3 cells. A driver could cross a zone boundary while remaining in the same H3 cell, leaving `drivers.zone_id` stale.  
   **Fix:** Add a secondary re-resolution trigger (e.g., coordinate delta threshold or periodic re-check every N heartbeats) or document why H3 cell change alone is sufficient.

10. **`zones_one_active` drop may affect existing admin flows**  
    After Z-1, multiple zones can be active. But admin UI still edits zones via JSON textarea with no multi-zone awareness. The plan defers UI changes, but does not flag that admin operations may now be confusing or dangerous.  
    **Fix:** Add a short-term admin guardrail or warning until UI catches up.

---

### 🟡 P3 — Deep linking, doc hygiene, and verification

11. **Deep linking is still underspecified**  
    The final plan keeps only:
    - push→ride-tracking (already works)
    - promo link→apply-promos with code pre-filled
    - web `/track/{id}` primary for share

    It does not define:
    - Cold-start handling
    - Warm-start handling
    - Route mapping for `ride://track/{rideId}`, `ride://promo/{code}`
    - Auth redirect behavior for deep links

    **Fix:** Add a short deep-link contract in §4 or a dedicated subsection.

12. **Document contains superseded sections**  
    The file still contains the original Plan 05 draft, addendum, DeepSeek/Qwen/Kimi corrections, and then the FINAL locked plan. A coding agent reading top-to-bottom may follow outdated instructions.  
    **Fix:** Move all superseded content to a clearly marked appendix or delete it. Keep only the FINAL locked plan as the source of truth.

13. **Final plan has no explicit verification checklist**  
    Earlier sections had checklists, but the FINAL locked plan only mentions “Wave 5: full verification (tsc, lint, checklist)” without providing the checklist.  
    **Fix:** Include a final checklist matching the final scope: exact screen list, backend endpoints, migrations, `grep` checks, and money/paissa rules.

14. **`EmptyState` path inconsistency**  
    §3 says:  
    `EmptyState exists flat in components/ — reuse.`  
    Earlier Plan 03 created `components/plan03/EmptyState.tsx`. If the actual file is under `components/plan03/`, the coding agent may import the wrong path.  
    **Fix:** Verify and state the exact import path.

15. **Wave 0 i18n keys vs Wave 5 i18n sweep**  
    Wave 0 includes “i18n keys,” and Wave 5 includes “i18n sweep.” If Wave 0 creates only foundation keys and Wave 5 extracts all strings, the intermediate screens will hardcode English, then need rewriting.  
    **Fix:** Decide whether i18n extraction happens up front or is explicitly deferred to Wave 5 with screens using placeholder keys. Avoid double work.

---

## Summary of highest-priority fixes

| Priority | Action |
|----------|--------|
| P0 | Reconcile ZERO migrations vs Z-1 |
| P0 | Add `vehicle-type-change` and `slider-config` to backend work list |
| P0 | Specify SOS auth/rate limiting |
| P0 | Define vehicle-type-change eligibility |
| P1 | Add entry points for vehicle-management, payout-methods, min-rate, performance-stats |
| P1 | Verify `find-customer` actual path |
| P1 | Name the four driver screens in store fixes |
| P2 | Fix Z-6/Z-7 order and Z-4 boundary detection |
| P2 | Expand deep linking spec |
| P2 | Clean superseded sections and add final verification checklist |


Here are **59 additional areas of improvement** in the FINAL locked Plan 05 that were not covered in the previous 15-point response. They are grouped by category for clarity. Each is grounded in the plan text or the codebase constraints it references.

---

## A. Scope & Screen Inventory

1. **Final scope has no explicit total screen count** — §3 lists items, but no authoritative number. This repeats the earlier scope ambiguity.
2. **`select-active-vehicle` bug fix is listed in §3 but not in the Implementation Order** — Wave 4 says “vehicle rebuild + select-active-vehicle fix,” but not broken out with details.
3. **`SOSButton` rider-side bug fix is in §3 but missing from Wave 2 schedule** — Wave 2 says “sos/alert endpoint, emergency-sos rebuild, SOSButton repoint” but SOSButton repoint is not itemized with implementation notes.
4. **`find-customer` banner work is in Wave 4 but no file path is given** — it says “find-customer” but earlier Plan 04 may have a different active nav file. Ambiguous.
5. **`ride-completed` deletion from Plan 03 is not mentioned in final locked plan** — if still present, it may conflict with rate-driver flow.
6. **No decision on `book-ride`, `final-page`, `ride-details-completed`** — earlier consolidation decisions from Plan 03 are not carried into final locked plan; the agent may not know they are to be deleted or ignored.
7. **`schedule-ride/index.tsx` deletion is specified, but not its route references** — plan says delete route, but no `grep` gate for `schedule-ride` string before deletion.
8. **`no-drivers-available` deletion is mentioned in Q1(b), but not in final scope table** — should be in §3 scope with deletion disposition.
9. **`schedule-ride-after-promo` deletion is mentioned but not in Wave 1 order** — Wave 1 says route deletions but not enumerated exactly.
10. **`scheduling-user-ride` deletion not in final Implementation Order** — same as above; multiple deletion items not itemized.
11. **`ride-scheduled` rebuild is listed, but no entry point from `confirm-ride` schedule flow** — after scheduling, how does user reach ride-scheduled? Not specified.
12. **`apply-promos` fix says “staged-promo → confirm-ride discount-selector handoff” but confirm-ride path is ambiguous** — if confirm-ride is orphaned, handoff fails.
13. **`book-for-someone-else` is verify-only, but rider side no spec for edge cases** — what if secondary rider phone invalid, same as primary, etc.
14. **`share-trip` verify-only, but no confirmation that public tracking link expiry was actually implemented** — earlier issue not resolved in final plan.
15. **`insurance/index.tsx` static info screen is mentioned “linked from profile” but no link spec** — where is entry point? Profile row? Driver settings?
16. **`earning tab` additions (Incentives row + Earnings Goal modal) not in scope table** — listed in Wave 4 but not in §3 itemized list.
17. **`missed-requests` screen is not built, but earlier addendum proposed it; final plan must explicitly state not building** — already in §3 but might be missed by agent reading earlier sections.
18. **`payout-history` removed but earlier addendum proposed it; no note in final scope** — must ensure coding agent doesn’t build it from earlier sections.
19. **`instant-pay` removed from Plan 05; earlier addendum still in doc** — doc contains conflict; final says removed, but earlier sections still mention it. Cleanup needed.
20. **`subscription screens` content fix not broken down per screen** — says “subscription screens content fix only” but which files? `subscription-plans`, `checkout`, `confirmation`, etc.

---

## B. Backend & API Contracts

21. **`POST /api/sos/alert` response shape not defined** — what returns after insert? `{ alert_id }`? `{ success }`?
22. **SOS endpoint `ride_id` validation not specified** — does it check ride belongs to caller? Not stated.
23. **SOS endpoint SMS failure handling not specified** — if SMS to emergency contacts fails, is alert still successful? No.
24. **`POST /api/driver/vehicle-type-change` request body Zod schema not defined** — only `{ new_vehicle_type }`; no enum validation details.
25. **`GET /api/driver/slider-config` response shape missing** — what fields? min, max, step, current?
26. **`PATCH /api/driver/me` for min-rate not in backend list; response/error unspecified** — what error if invalid min? What if driver not eligible?
27. **`GET /api/ride/[id]/cancel-preview` extension: `free_until` format not specified** — ISO 8601? Unix? Must be explicit.
28. **`cancel-reason` screen uses `fee_bdt` from server, but final plan doesn’t state whether client converts paisa to taka at display** — earlier issue partially addressed but not in final.
29. **`POST /api/ride/[id]/cancel` endpoint not mentioned in backend work list** — final scope says cancel-reason fix, but backend cancel endpoint may already exist; need verify. Missing from §4.
30. **`GET /api/promo/list` not mentioned in final backend work** — apply-promos fix references it, but §4 doesn’t list it.
31. **`POST /api/promo/redeem` referenced but not in final backend work** — final scope says fix apply-promos, but no backend item for redeem.
32. **`POST /api/rider/lost-items` status enum fix not in backend work** — final scope says fix statuses, but backend may need update to accept new status values; not listed.
33. **`GET /api/rider/lost-items` response shape not specified** — what fields? Status enum values? No.
34. **`GET /api/rider/passes` (active pass) not in backend work** — ride-pass verify-only, but active pass endpoint not confirmed.
35. **`POST /api/ride/[id]/no-show` exists, but final scope says verify only; no contract** — what response? Compensation amount? Error cases?
36. **`GET /api/driver/heatmap` extension: response shape missing confidence_score usage** — where is confidence_score shown? Not specified.
37. **`GET /api/driver/earnings/breakdown` daily_totals shape not defined** — what keys? array of `{date, total_bdt}`?
38. **`GET /api/driver/payout-method` (new GET) response shape not specified** — list shape? masked number? etc.
39. **`POST /api/driver/payout-method` exists but no error contract** — duplicate bKash number? Invalid format? Not stated.
40. **`GET /api/driver/performance` bug fix scope not detailed** — “retry bug” not enough; which screens? What caused it? No.

---

## C. Theming, Tokens & Components

41. **`amberLight` token addition is in §4 dependencies but not in a dedicated theme task** — Wave 0 includes deps, but no explicit token addition task with hex value.
42. **`successLight` token still not confirmed** — earlier issue; final plan doesn’t mention it. Used in lost-items, status badges, etc.
43. **`ErrorBanner` component spec not final** — final scope says build, but no interface definition in final locked plan. Agent may use earlier spec which may be outdated.
44. **`OfflineIndicator` final spec missing** — same; netinfo dependency confirmed, but no exact visual/behavior spec in final.
45. **`EmptyState` reuse path not verified** — final says “exists flat in components/”, but earlier Plan 03 created `components/plan03/EmptyState.tsx`. Contradiction.
46. **`MinRateSlider` reuse spec incomplete** — final says use existing component + validate, but no mention of styling/theme for dark mode.
47. **`StatusBadge` reuse from Plan 03 not mentioned** — final lost-items, vehicle-management, etc. should reuse but not specified.
48. **`SettingsRow` reuse not mentioned** — payout-methods entry should use SettingsRow; not specified.
49. **`TransactionRow` not used** — payout-history removed, but maybe wallet still needs transaction row; not in final.
50. **`DriverStatsBar` or similar from Plan 04 not referenced for hotspot entry pill** — final says “hotspot pill in driver home stats bar” but no component name.

---

## D. State Management & Wiring

51. **`scheduledRides` store filter fix is listed but no exact store file** — `scheduledRides` may be in `useRiderStore` or `useRidesStore`; not specified.
52. **`ride-details-scheduled` missing rideId params bug not detailed** — which file? No.
53. **Retry-button refetch bug “4 driver screens” not enumerated** — which four? Need exact list.
54. **`useRideOfferStore`/`useWSStore` interactions for new screens not specified** — driver secondary screens may need store access; not defined.
55. **Earnings goal AsyncStorage key `@driver_earnings_goal` not specified elsewhere** — should be in constants.
56. **Deep linking store/handler wiring not specified** — final says push-handler deep links via expo-linking, but no root layout code snippet.

---

## E. Errors, Loading & Edge Cases

57. **SOS offline queue “if possible” is vague** — how to queue? Where store? Not defined.
58. **Vehicle switch while online warning modal behavior not fully specified** — auto-offline confirmation? Exact flow missing.
59. **`payment_events` transaction requirement for no-show/cancel not explicit in final backend work** — AGENTS.md rule referenced earlier but final backend list doesn’t enforce.

---

## How to use this list

This provides 59 concrete improvements, but many are continuations of existing gaps. The highest-priority ones are the **backend omissions** (#21–#40) and **scope contradictions** (#1–#20). I recommend adding an appendix to the final locked plan containing a detailed backend contract table and an authoritative file/path table with true status.


#### Qwen's Take: 

Below are **additional areas of improvement** for the final locked Plan 05. I intentionally avoided repeating the issues already listed in DeepSeek’s original take, the follow-up P0–P3 take, and the 59-item list.

These are mostly **product lifecycle, operational, reliability, privacy, QA, and implementation-completeness gaps** that the final plan still leaves open.

---

## A. Rider product lifecycle gaps

### 1. Scheduled rides have no post-booking management flow
The plan rebuilds `ride-scheduled`, but does not define what a rider can do afterward.

Missing:
- view scheduled ride in “My Rides”
- reschedule
- change pickup/destination
- cancel scheduled ride
- see assigned driver once dispatch begins

**Improvement:** add a scheduled-ride management state and screens/actions before implementation.

**Priority:** P0

---

### 2. Scheduled ride notification plan is missing
The plan does not specify notifications for scheduled rides.

Missing:
- booking confirmation
- reminder 60/30/15 minutes before pickup
- driver assigned
- driver arriving
- driver cancellation
- system failure/no driver available

**Improvement:** define a notification matrix for scheduled rides, including push/SMS fallback.

**Priority:** P0

---

### 3. Scheduled ride conflict rules are undefined
There is no rule for what happens if a rider tries to schedule overlapping rides.

Missing:
- max active scheduled rides per rider
- overlapping time window validation
- duplicate pickup/destination validation
- vehicle availability check at schedule time

**Improvement:** add server-side guards and user-facing error states.

**Priority:** P1

---

### 4. Scheduled dispatch timing is not product-defined
The plan assumes scheduled rides eventually become dispatchable, but does not define the operational behavior.

Missing:
- how early before pickup matching starts
- whether drivers can accept scheduled rides in advance
- whether a driver is locked to the ride
- what happens if no driver is found close to pickup time

**Improvement:** define the dispatch pre-window and fallback behavior.

**Priority:** P0

---

### 5. Cancellation race conditions are not handled
The cancel flow is server-bound, but the plan does not address state races.

Examples:
- rider cancels after driver already accepted
- rider cancels after driver already arrived
- two cancellation attempts from two devices
- scheduled ride canceled while dispatcher is assigning

**Improvement:** define transactional status checks and user-facing errors such as “Driver already accepted.”

**Priority:** P0

---

### 6. Fare dispute has no post-submission lifecycle
The plan only covers submitting a dispute.

Missing:
- dispute status tracking
- admin review outcome
- rider notification
- refund/credit mechanism
- SLA and escalation path

**Improvement:** define dispute lifecycle states and rider-facing status UI.

**Priority:** P1

---

### 7. Fare dispute lacks evidence and review tooling
The dispute screen collects reason and claimed fare, but not enough context for operations.

Missing:
- optional rider note
- route comparison summary
- estimate vs charged fare delta
- admin decision notes
- approve/reject action

**Improvement:** add support/admin review fields and a resolution flow.

**Priority:** P2

---

### 8. Lost items status enum conflicts with “no photo upload”
Final scope fixes lost-item statuses but also says no photo upload.

Potential conflict:
- status includes `photo_provided`
- but upload is not in scope

**Improvement:** either remove `photo_provided` from the visible status model or define how a photo is provided outside the app.

**Priority:** P1

---

### 9. Lost item contact and privacy flow is undefined
The plan does not define how rider and driver communicate after a lost-item report.

Missing:
- masked contact rules
- time-limited contact window
- driver response expectations
- support mediation if driver is unresponsive

**Improvement:** define lost-item communication policy and privacy rules.

**Priority:** P1

---

### 10. Promo business rules are incomplete
The plan covers redeeming promos, but not how they behave in real operations.

Missing:
- stacking with passes
- stacking with other promos
- maximum discount cap behavior
- “first ride” definition
- promo behavior after cancellation
- refund/credit restoration rules

**Improvement:** define promo policy centrally and wire it into fare estimation/discount engine.

**Priority:** P0

---

### 11. Ride pass usage rules are incomplete
Ride passes are verify-only, but the plan does not define edge behavior.

Missing:
- when pass activation starts
- whether canceled rides consume pass rides
- pass refund behavior
- pass expiry timezone
- pass + promo interaction
- usage race conditions for concurrent ride requests

**Improvement:** define pass lifecycle and accounting rules.

**Priority:** P1

---

### 12. Book-for-someone-else needs consent and anti-abuse rules
The feature is verify-only, but it creates SMS and privacy implications.

Missing:
- passenger consent copy
- booker responsibility copy
- SMS rate limiting
- abuse prevention for arbitrary phone numbers
- whether passenger can see trip details before ride

**Improvement:** add consent microcopy, rate limits, and phone validation policy.

**Priority:** P1

---

### 13. Public trip tracking page needs hardening
The plan keeps public tracking as the primary share mechanism.

Missing:
- noindex/no-cache headers
- rate limiting
- bot protection
- minimal PII exposure rules
- behavior when ride is completed/canceled
- map performance on low-end browsers

**Improvement:** add web tracking hardening requirements.

**Priority:** P1

---

## B. Safety, SOS, and emergency flows

### 14. SOS alert lifecycle after trigger is undefined
The plan defines triggering SOS, but not what happens afterward.

Missing:
- user sees “alert sent”
- alert acknowledged by support
- alert resolved
- false alarm handling
- whether location sharing stops automatically

**Improvement:** define SOS lifecycle states and rider-facing status UI.

**Priority:** P0

---

### 15. Emergency contact management is not specified
SOS depends on emergency contacts, but the plan does not define CRUD rules.

Missing:
- add/edit/delete contacts
- max contacts
- phone format validation
- contact verification
- user-facing empty state

**Improvement:** define emergency contact management rules and validation.

**Priority:** P1

---

### 16. Driver-side SOS parity is unclear
The endpoint is described as rider+driver, but the scope does not define the driver SOS experience.

Missing:
- driver SOS entry point
- driver confirmation flow
- driver location acquisition
- admin handling differences between rider and driver SOS

**Improvement:** clarify whether driver SOS is in scope and specify the flow.

**Priority:** P1

---

## C. Time, locale, and money handling

### 17. Countdown timers need server-time offset
Using server `free_until` is correct, but device clock drift can still break countdown display.

Missing:
- server time offset in API response
- client clock skew correction
- behavior when device time is wrong

**Improvement:** include `server_now` or `expires_in_seconds` in time-sensitive responses.

**Priority:** P1

---

### 18. Date/time pickers need timezone canonicalization
The plan does not define how local time is converted and stored.

Missing:
- display timezone should be Asia/Dhaka
- API payload should be UTC ISO
- invalid past time handling
- picker min/max enforcement
- locale-specific time formatting

**Improvement:** define a single date-time conversion utility for all schedule flows.

**Priority:** P0

---

### 19. Currency formatting needs locale-aware rules
The plan mentions paisa conversion, but not presentation.

Missing:
- BDT symbol placement
- Bengali digit support
- thousands separators
- no floating-point display
- large amount formatting

**Improvement:** create a shared `formatBDT()` helper backed by locale rules.

**Priority:** P1

---

### 20. i18n needs more than string keys
The plan adds i18n keys, but not formatting rules.

Missing:
- pluralization
- interpolation
- countdown formatting
- relative time strings
- currency/date formatting

**Improvement:** define i18n formatting utilities, not only translation dictionaries.

**Priority:** P1

---

## D. State machines, stores, and realtime wiring

### 21. Rider booking state machine is not updated for new features
The final plan adds schedule toggle, staged promos, and book-for-someone, but does not update the booking state machine.

Missing:
- `SCHEDULE_TOGGLE_ON`
- `SCHEDULE_TIME_SELECTED`
- `BOOK_FOR_OTHER_ON`
- `PROMO_STAGED`
- invalid combinations and guards

**Improvement:** extend the rider booking FSM explicitly.

**Priority:** P0

---

### 22. Realtime event contract is missing for new entities
The plan does not define WS/push events for new features.

Needed events may include:
- `ride:scheduled`
- `ride:schedule_updated`
- `ride:schedule_cancelled`
- `sos:acknowledged`
- `dispute:update`
- `lost_item:update`

**Improvement:** define event names, payload shapes, and consumers.

**Priority:** P1

---

### 23. Notification permission and channel strategy is missing
The plan uses push/SMS in several places but does not define permission handling.

Missing:
- iOS permission prompt timing
- Android notification channels
- high-priority SOS channel
- fallback when permission denied
- deep link behavior from notification

**Improvement:** add notification permission and channel spec.

**Priority:** P1

---

### 24. Stores need reset rules on logout/role switch
The plan does not define client state cleanup.

Risk:
- scheduled rides from previous user visible briefly
- driver earnings goal leaks across driver accounts
- staged promo persists incorrectly
- SOS state persists after logout

**Improvement:** define store reset policy for auth/logout/role-switch.

**Priority:** P1

---

## E. Driver feature completeness

### 25. Earnings goal needs validation and reset rules
The plan adds an AsyncStorage goal, but does not define behavior.

Missing:
- min/max goal
- invalid input handling
- reset at Asia/Dhaka midnight
- progress reset after logout
- goal migration if storage schema changes

**Improvement:** define earnings goal state rules.

**Priority:** P2

---

### 26. Incentive rewards as call credits need explanatory UX
Final plan says rewards are call credits, but does not define how drivers understand them.

Missing:
- current call credit balance
- how incentive converts to credits
- credit expiry
- ledger entry
- empty state when no incentives

**Improvement:** add incentive-to-call-ledger explanation and status copy.

**Priority:** P1

---

### 27. Hotspot map needs initial-state and failure handling
The hotspot spec assumes data and map rendering are available.

Missing:
- default camera when no location permission
- default center when no active zone
- map style load failure
- tile load failure
- loading state for first open

**Improvement:** define hotspot map boot states.

**Priority:** P1

---

### 28. Hotspot entry point needs degraded behavior
The hotspot pill in driver home may be visible even when no forecast data exists.

Missing:
- hide/disable pill when no active zone
- tooltip or helper state
- behavior when forecast job is down
- manual refresh failure state

**Improvement:** define entry-point disabled/degraded behavior.

**Priority:** P2

---

### 29. Vehicle document expiry needs an operational workflow
The vehicle screen shows badges for document expiry, but not the workflow.

Missing:
- renewal CTA
- reminder notifications
- grace period
- blocking rules when expired
- admin override

**Improvement:** define document expiry lifecycle and driver notifications.

**Priority:** P2

---

### 30. Minimum rate screen needs expectation management
The min-rate slider affects dispatch eligibility, but the plan does not explain consequences.

Missing:
- current per-km baseline by zone/vehicle
- warning if rate is likely to reduce offers
- recommended rate
- reset-to-default action

**Improvement:** add contextual helper copy and live baseline display.

**Priority:** P2

---

## F. Backend, zone, and data integrity gaps

### 31. Financial/state mutations need idempotency
Schedule and cancel are state-changing operations with money implications.

Missing:
- idempotency key or dedupe window
- duplicate request handling
- retry safety
- client double-tap protection beyond UI disable

**Improvement:** define idempotency rules for schedule/cancel and other paid mutations.

**Priority:** P0

---

### 32. Scheduled-ride promotion needs catch-up behavior
If the scheduler misses a promotion window, the plan does not define recovery.

Missing:
- backlog handling
- late promotion policy
- alert when scheduled rides are overdue
- retry/backoff strategy

**Improvement:** define scheduler catch-up and monitoring.

**Priority:** P0

---

### 33. Zone resolution cache needs invalidation rules
A 60-second cache is mentioned, but admin changes need immediate effect.

Missing:
- invalidate cache on zone activation/deactivation
- invalidate cache on polygon update
- behavior during cache refresh failure

**Improvement:** add cache busting hooks for admin zone mutations.

**Priority:** P1

---

### 34. Zone polygon input needs validation and limits
Zones are managed as polygon JSON, but the plan does not define data-quality rules.

Missing:
- closed ring validation
- self-intersection warning
- max vertex count
- max payload size
- polygon simplification strategy

**Improvement:** add polygon validation and size limits.

**Priority:** P1

---

### 35. Demand forecast needs cold-start behavior
Using 7-day historical averages will fail for new zones.

Missing:
- new zone fallback
- zero-ride fallback
- holiday/weekend adjustment policy
- confidence handling for sparse data

**Improvement:** define forecast fallback rules.

**Priority:** P1

---

### 36. Forecast job needs performance safeguards
Hourly aggregation over 7 days can become expensive.

Missing:
- indexes for `rides(zone_id, created_at)`
- aggregate table/materialized view
- job timeout
- failure retry
- max zones processed per run

**Improvement:** add forecast query performance plan.

**Priority:** P1

---

### 37. Fare estimates need zone/pricing stability
Multi-zone resolution can change pricing if a pickup point is near a boundary.

Missing:
- quote stability window
- pricing version snapshot
- behavior if zone changes between estimate and request
- user-facing fare change warning

**Improvement:** define fare quote stability rules.

**Priority:** P1

---

### 38. Admin actions need audit trails
The plan does not define auditing for sensitive operations.

Needed for:
- zone activation/deactivation
- polygon changes
- SOS acknowledgement/resolution
- dispute resolution
- lost-item status changes

**Improvement:** add immutable audit log requirements.

**Priority:** P1

---

## G. Reliability, observability, and release readiness

### 39. Feature flags/kill switches are missing
Several features are high-risk.

Candidates:
- scheduled rides
- SOS
- hotspot map
- multi-zone resolution
- promo stacking
- book-for-someone SMS

**Improvement:** add remote/config-based kill switches with safe fallbacks.

**Priority:** P0

---

### 40. Analytics and funnel events are undefined
The plan does not define product telemetry.

Needed events:
- schedule started/completed
- cancel reason selected
- promo applied
- SOS triggered
- hotspot opened
- payout method added
- min rate saved

**Improvement:** define analytics event schema and dashboards.

**Priority:** P1

---

### 41. Structured logging and tracing are not specified
Critical flows span client, API, scheduler, SMS, and push.

Missing:
- request IDs
- user-safe correlation IDs
- SOS failure logging
- scheduler run logs
- zone resolution latency logs

**Improvement:** define structured logging and trace requirements.

**Priority:** P1

---

### 42. Shared typed contracts and contract tests are missing
The plan relies on manual endpoint specifications.

Risk:
- client/server drift
- invalid enum usage
- stale response assumptions

**Improvement:** generate client types from server Zod schemas and add contract tests.

**Priority:** P1

---

### 43. QA seed data and test matrix are missing
There is no plan for how QA will test these features.

Needed seed data:
- active zones
- forecast rows
- promos
- passes
- scheduled rides
- lost items
- disputes
- SOS contacts

**Improvement:** create seed scripts and a manual/E2E test matrix.

**Priority:** P1

---

### 44. Rollback plan is missing
The plan defines build order, but not rollback.

Needed:
- rollback for zone unlock
- disable forecast job
- disable scheduled rides
- disable SOS
- restore single-zone behavior if needed
- native module rollback strategy

**Improvement:** add a rollback runbook.

**Priority:** P0

---

### 45. Monitoring alerts are not defined
The plan does not define what should page/on-call.

Suggested alerts:
- SOS insert failure
- SMS provider failure
- scheduler lag
- zone resolution latency spike
- sudden `outside_zone` error spike
- cancel-preview failure spike
- forecast job failure

**Improvement:** define alert thresholds and dashboards.

**Priority:** P1

---

### 46. Environment-specific links and schemes are not defined
The plan mentions deep links and public tracking, but not environment behavior.

Missing:
- staging vs prod track URLs
- app scheme per environment
- universal link domains
- debug vs release behavior

**Improvement:** define environment-specific link configuration.

**Priority:** P1

---

### 47. Native module release risk is not addressed
Adding datetimepicker/slider requires a dev build.

Missing:
- EAS build profile changes
- permission manifest review
- store review risk
- QA regression scope for native module addition

**Improvement:** add release-readiness checklist for native dependency changes.

**Priority:** P1

---

### 48. Resource cleanup is not specified
Many screens will use timers, polling, maps, and network listeners.

Missing:
- countdown timer cleanup
- map listener cleanup
- polling cleanup on unmount
- NetInfo unsubscribe
- location listener cleanup

**Improvement:** add lifecycle cleanup requirements.

**Priority:** P1

---

### 49. Support/admin tooling is not scoped
The rider screens submit support cases, but the plan does not define how support resolves them.

Missing:
- dispute resolution UI/API
- lost-item mediation UI/API
- SOS acknowledgement/resolution workflow
- notes/history
- role-based permissions

**Improvement:** define support tooling scope or explicitly defer it.

**Priority:** P1

---

### 50. Data retention and PII minimization are undefined
The plan creates sensitive records but does not define retention.

Applies to:
- SOS alerts and locations
- lost-item reports
- fare disputes
- book-for-someone passenger phone numbers
- shared tracking links

**Improvement:** define retention periods, access rules, and PII minimization policy.

**Priority:** P1

---

## Highest-leverage additions before implementation

If you want the smallest set with the highest impact, add these first:

1. **Scheduled ride lifecycle + notifications**
2. **Scheduled dispatch pre-window and catch-up behavior**
3. **Cancel race-condition handling**
4. **Promo/pass business rules**
5. **SOS lifecycle after trigger**
6. **Server-time offset and timezone canonicalization**
7. **Rider state machine extension**
8. **Idempotency for schedule/cancel**
9. **Feature flags/kill switches**
10. **Rollback + monitoring plan**

These are not duplicates of DeepSeek’s points and directly reduce the risk of building screens that look complete but fail in production operations.

You are absolutely right. My first response focused on **product lifecycle and UX gaps** based on the original draft, but I completely missed the **hard engineering, database, geospatial, and orchestrator-locked constraints** that Qwen, Kimi, and the 59-point list uncovered in the `FINAL Locked Plan`. 

Now that I have fully ingested the `FINAL Locked Plan`, the `Zone Foundation (Z-1 to Z-8)`, and the `AGENTS.md` rules, I see that even the "Final" plan contains **critical systemic traps** that will cause production crashes, data corruption, or billing leaks if not addressed.

Here are the deep-engineering blind spots that **all previous reviews (including the 59-point list) missed**, grounded strictly in the Final Locked Plan's backend and database specifications.

---

### 1. The Z-7 "Table Lock" Trap (Supabase/Postgres Reality)
* **The Flaw:** Z-7 specifies: `UPDATE rides/drivers SET zone_id = NULL where zone_id is the nil-UUID`. 
* **The Reality:** The `rides` table is the largest table in the system. Running a raw, unbatched `UPDATE` on millions of rows will acquire a massive lock, spike CPU, generate millions of dead tuples (bloating the DB), and likely crash the Supabase instance or timeout.
* **The Fix:** Z-7 cannot be a simple SQL script. It must be a **batched backfill script** (e.g., updating 5,000 rows at a time with a `pg_sleep(0.1)` delay) executed during a low-traffic window, followed by a manual `VACUUM ANALYZE`.

### 2. The Z-6 Timezone Aggregation Bug
* **The Flaw:** Z-6 states: `predicted_demand = mean of rides created in the same hour-of-day over the trailing 7 days`.
* **The Reality:** Postgres `EXTRACT(HOUR FROM created_at)` or `DATE_TRUNC('hour', created_at)` defaults to **UTC**. Bangladesh is UTC+6. If you aggregate by UTC hour, the "8 AM Dhaka Morning Rush" will be incorrectly averaged with "2 AM Dhaka" rides from previous days, completely destroying the hotspot prediction model.
* **The Fix:** The Z-6 SQL query **must** cast to local time before extraction: `EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Dhaka')`.

### 3. Z-4 GPS Drift & H3 Boundary Thrashing
* **The Flaw:** Z-4 states driver zones re-resolve `only on H3 cell change`
You are absolutely right. My first response focused on **product lifecycle and UX gaps** based on the original draft, but I completely missed the **hard engineering, database, geospatial, and orchestrator-locked constraints** that Qwen, Kimi, and the 59-point list uncovered in the `FINAL Locked Plan`. 

Now that I have fully ingested the `FINAL Locked Plan`, the `Zone Foundation (Z-1 to Z-8)`, and the `AGENTS.md` rules, I see that even the "Final" plan contains **critical systemic traps** that will cause production crashes, data corruption, or billing leaks if not addressed.

Here are the deep-engineering blind spots that **all previous reviews (including the 59-point list) missed**, grounded strictly in the Final Locked Plan's backend and database specifications.

---

### 1. The Z-7 "Table Lock" Trap (Supabase/Postgres Reality)
* **The Flaw:** Z-7 specifies: `UPDATE rides/drivers SET zone_id = NULL where zone_id is the nil-UUID`. 
* **The Reality:** The `rides` table is the largest table in the system. Running a raw, unbatched `UPDATE` on millions of rows will acquire a massive lock, spike CPU, generate millions of dead tuples (bloating the DB), and likely crash the Supabase instance or timeout.
* **The Fix:** Z-7 cannot be a simple SQL script. It must be a **batched backfill script** (e.g., updating 5,000 rows at a time with a `pg_sleep(0.1)` delay) executed during a low-traffic window, followed by a manual `VACUUM ANALYZE`.

### 2. The Z-6 Timezone Aggregation Bug
* **The Flaw:** Z-6 states: `predicted_demand = mean of rides created in the same hour-of-day over the trailing 7 days`.
* **The Reality:** Postgres `EXTRACT(HOUR FROM created_at)` or `DATE_TRUNC('hour', created_at)` defaults to **UTC**. Bangladesh is UTC+6. If you aggregate by UTC hour, the "8 AM Dhaka Morning Rush" will be incorrectly averaged with "2 AM Dhaka" rides from previous days, completely destroying the hotspot prediction model.
* **The Fix:** The Z-6 SQL query **must** cast to local time before extraction: `EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Dhaka')`.

### 3. Z-4 GPS Drift & H3 Boundary Thrashing
* **The Flaw:** Z-4 states driver zones re-resolve `only on H3 cell change` (Res 9).
* **The Reality:** H3 Res 9 cells are roughly ~0.1 km². When a driver is stationary at a zone boundary (e.g., waiting at a pickup spot), natural GPS drift (±10 meters) will cause their coordinates to flip between two H3 cells every few seconds. This will cause `drivers.zone_id` to thrash, spamming the Z-2 cache and corrupting Job 19 (Surge) supply counts.
* **The Fix:** Implement a **hysteresis/debounce mechanism** in the heartbeat handler. A driver must register in the new H3 cell for *at least 3 consecutive heartbeats* before `drivers.zone_id` is actually updated.

### 4. `cancel-preview` Scheduled vs. On-Demand Branching
* **The Flaw:** The Final Plan dictates that `cancel-reason` binds 100% to `free_until` from `cancel-preview`. It also notes that scheduled rides have a *different* policy ("free until X hours before pickup").
* **The Reality:** The `cancel-preview` endpoint is a single route. If it only calculates `free_until` based on `ride.created_at + 5 mins`, it will incorrectly charge fees for scheduled rides that are days away.
* **The Fix:** The `cancel-preview` backend logic must explicitly branch: 
  `if (ride.status === 'scheduled')` → calculate `free_until` from `scheduled_at - X hours`. 
  `if (ride.status === 'active')` → calculate from `created_at + platform_config.free_window`.

### 5. Route Deletion Crash Risk (Expo Router)
* **The Flaw:** The Final Plan orders the deletion of orphaned routes: `schedule-ride`, `scheduling-user-ride`, `no-drivers-available`.
* **The Reality:** In Expo Router, deleting the file removes the route. However, if **any** backend push notification template, deep link handler, or hardcoded `router.push()` in `lib/notify.ts` or `store/` still references the string `"/schedule-ride"`, the app will hard-crash with a "Route not found" error in production when that notification is tapped.
* **The Fix:** A mandatory `grep -rn "schedule-ride"` across the *entire repository* (including `app.config.js`, backend SMS templates, and `lib/`) must be executed and resolved **before** the files are deleted.

### 6. SOS SMS Billing Exhaustion (`lib/dprelay`)
* **The Flaw:** The Final Plan routes SOS SMS to emergency contacts via `lib/dprelay`. The 59-point list mentions "rate limiting" but doesn't specify the mechanism.
* **The Reality:** SMS in Bangladesh (via Twilio/dpRelay) costs money and has strict carrier rate limits. A panicked user, or a malicious actor testing the API, could trigger SOS repeatedly, draining the company's SMS budget or getting the Twilio account suspended for spam.
* **The Fix:** Implement a **hard Redis-backed cooldown** (e.g., `sos_cooldown:{user_id}` = 15 minutes) and a global circuit breaker on `lib/dprelay` to cap total outbound SOS SMS per hour.

### 7. Vehicle Type Change vs. Active Subscriptions
* **The Flaw:** The Final Plan allows `vehicle-type-change` (e.g., from `car_economy` to `bike_standard`) and auto-offlines the driver.
* **The Reality:** Driver subscriptions (`subscription-plans`) and insurance packages are often strictly scoped to vehicle classes. If a driver on a "Pro Car Package" switches to a Bike, their current subscription economics and document validity are instantly invalidated, but the database won't know.
* **The Fix:** The `POST /api/driver/vehicle-type-change` endpoint must trigger a **subscription proration check** and invalidate vehicle-specific documents (e.g., a car's tax token does not apply to a bike), forcing the driver to re-upload.

### 8. Promo + Rider Pass Precedence Collision
* **The Flaw:** The Final Plan verifies both `ride-pass` and `apply-promos` but treats them as isolated features.
* **The Reality:** What happens if a user has an active "Weekly Pass" (which covers the fare) AND applies a "20% off" promo code? If `lib/discountEngine.ts` doesn't have a strict precedence rule, the system might attempt to discount a zero-balance fare, or apply the promo to the pass purchase itself incorrectly.
* **The Fix:** `lib/discountEngine.ts` must explicitly define precedence (e.g., *Pass consumes the ride; Promo is rejected or applied only to out-of-pocket tolls/waiting fees*).

### 9. MapLibre Memory Leaks on Low-End Android
* **The Flaw:** The Hotspot Map uses MapLibre `CircleLayer` driven by Z-6 forecast data.
* **The Reality:** If the Z-6 forecast job updates data and the client polls/refreshes, mutating the GeoJSON source repeatedly without clearing the old source causes severe memory leaks on low-end Android devices (violating Master Plan §11/12 constraints).
* **The Fix:** The frontend map refresh logic must explicitly call `map.removeSource('hotspots')` before `map.addSource()` to prevent GL context bloat.

### 10. "Book for Someone Else" SOS Liability & SMS Context
* **The Flaw:** The Final Plan dictates that SOS SMS goes to `user_emergency_contacts` via `lib/dprelay`. 
* **The Reality:** If the *passenger* (secondary rider) is in the car and an emergency happens, they don't have the app open. If the *driver* hits SOS, the SMS goes to the *booker's* emergency contacts. The booker's family will receive a panic SMS, but they might not even know who the "passenger" is, causing massive confusion and liability.
* **The Fix:** The SOS SMS template must dynamically inject the secondary rider context: *"EMERGENCY: The ride booked by [Booker Name] for passenger [Passenger Name] has triggered an SOS. Current Location: [Link]"*.

---

### Summary of the True Critical Path
The previous AIs successfully cleaned up the **product scope** and **file paths**. However, if you hand the `FINAL Locked Plan` to a coding agent today without the 10 fixes above, you will face:
1. **A Supabase outage** on Day 1 (Z-7 Table Lock).
2. **Useless Hotspot maps** (Z-6 Timezone bug).
3. **Surge pricing corruption** (Z-4 GPS Thrashing).
4. **Hard crashes on push notification taps** (Expo Router Deletions).

**Recommendation:** Append these 10 engineering constraints directly to the `FINAL Locked Plan` under a new **"System & Database Safeguards"** section before authorizing Wave 0.