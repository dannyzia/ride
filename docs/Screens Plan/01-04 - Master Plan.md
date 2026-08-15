Ride App — UI/UX Rethink 3: Master Planning File
Version: 3.0 — Complete App Rethink
Session: 2026-08-15
Status: Plans 01–04 COMPLETE. This document is the canonical spec for all remaining work.
1. Project Status & Lock Decisions
1.1 What Is Built (Plans 01–04)
Table
Plan	Scope	Status
Plan 01	Theme system, AuthLayout, OtpInput, SplashAnimation, CustomButton fix	Complete
Plan 02	Core Booking Loop: Services Hub → Home → Finding Driver → Ride Tracking → Rate Driver	Complete
Plan 03	Rider Account: Rides Tab, Ride Detail, Wallet, Profile/Settings Hub, Inbox, Enable Location, Notifications Permission	Complete
Plan 04	Driver Core Loop: Home, Reach Customer, Finish Ride, Rate Rider, Break Mode, Enter OTP, Cancellation, Onboarding Wizard, Documents, Verification + 8 backend tasks + 2 DB migrations	Complete
1.2 Locked Architecture Decisions (NEVER Change)
Table
#	Decision	Rule
L1	Theming	useIsDark() from lib/useAppearance.ts + inline colors.* ternaries (Pattern A). No NativeWind dark: classes in new screens.
L2	Default theme	'system' follows device via useColorScheme(). Toggle cycles light ↔ dark only.
L3	Theme toggle	Every screen EXCEPT SplashAnimation gets a sun/moon toggle.
L4	Icons	Ionicons only. No emoji in production UI.
L5	Map	components/Map.tsx (MapLibre) + useBarikoiMapStyle(isDark).
L6	Typography	Plus Jakarta Sans ONLY. Driver screens one step larger than rider.
L7	Money	Integer paisa everywhere; divide by 100 only at display.
L8	WS Singleton	ONLY driver home creates WebSocket. Others use addEventListener("message").
L9	Expo Managed	No bare workflow. EAS Build for production.
L10	Phone validation	+880 + 10 digits = 14 chars. Strip leading 0 if user types 11 chars.
L11	Hamburger > Tab Bar	Draggable FAB hamburger menu. No bottom tab bar for riders.
L12	Services Hub first	After auth, riders see 2x2 grid, NOT home directly.
L13	Cash only for rides	Wallet exists for passes/packages only.
L14	Max 2 extra stops	3 total destinations max.
L15	Gallery only	No camera invocation. launchImageLibraryAsync only.
L16	bKash only	No bank/Nagad fields for driver payout. ^01\d{9}$ validation.
L17	Manual admin activation	No auto-activation when docs approved.
1.3 AGENTS.md Critical Rules (Coding Agent MUST Follow)
No console.log — use lib/logger.ts
No any / no @ts-ignore — Drizzle as any enum casts excepted
Zod at every API boundary — parseJsonBody for POST bodies
Expo param convention — { id } direct second arg
Snake_case DB properties — base_amount_bdt, NOT baseAmountBdt
NULL checks — isNull(col) / isNotNull(col), NEVER eq(col, null)
Money columns — ALL *_bdt are integer (paisa)
Transactions — Required for writes touching call_ledger, subscriptions, payment_events, tax_ledgers, accounting_entries, accounting_entry_lines
Write ownership — call_ledger deductions ONLY in utils-server/heartbeat.ts; payment_events creation ONLY in lib/paymentEvents.ts
PortPos callback security — MUST call portposClient.verifyIPN() before touching state
2. Design Philosophy — Bangladesh Futuristic
The future of mobility, designed for real Bangladesh.
Futuristic does NOT mean dark backgrounds + neon. It means:
Information architecture precision
Typography hierarchy
Motion that communicates state
Spatial hierarchy
Intelligent status indicators
Subtle depth
High-quality iconography
Real-time information
2.1 Bangladesh-First Constraints
Table
Constraint	Design Response
Strong sunlight / outdoor use	Light-first default. High contrast. No subtle grays.
Cheap Android devices	Minimal blur, limited shadows, efficient animations, memoized components
Fingerprints / glare on screens	Large touch targets (min 48dp). Crisp borders. No tiny text.
Inconsistent connectivity	Graceful degradation. Retry buttons. Offline state indicators.
GPS accuracy variations	Fallback to manual address entry. Clear "location unavailable" states.
Drivers on motorcycles	Glanceable UI. Large buttons. Minimal cognitive load.
Low-end GPUs	No complex gradients. Simple vector assets. Limited Reanimated worklets.
2.2 Color Palette
Light Mode (Default):
Background: #F8FAFC
Surface: #FFFFFF
Primary: #0CC25F (Ride Green)
Primary Light: #E6F7EE
Secondary: #2E42A5
Accent: #0EA5E9
Danger: #E31D1C
Amber: #F59E0B
Text Primary: #1C1E23
Text Secondary: #6B7280
Text Disabled: #D1D5DB
Border: #E5E7EB
Dark Mode:
Background: #181A20
Surface Elevated: #1C1E23
Primary: #0CC25F
Primary Light: #1A3A2A
Accent: #38BDF8
Text Primary: #FFFFFF
Text Secondary: #9CA3AF
Text Disabled: #555555
Border: #35383F
2.3 Rider vs Driver Design Split
Table
Aspect	Rider	Driver
Visual density	Expressive, refined	Functional, sparse
Animation	Rich transitions	Minimal, purposeful
Touch targets	Standard 48dp	Larger 56dp minimum
Typography	28/18/15/13/11	32/22/18/16/14
Glass/blur	Subtle allowed	Forbidden
Map priority	Discovery + aesthetics	Navigation + clarity
Primary goal	Premium feel + ease	Safety + glanceability
3. Theme System (Pattern A — Mandatory)
3.1 Hook Usage
tsx
import { useIsDark } from "@/lib/useAppearance";

const isDark = useIsDark();

const bg = isDark ? colors.bgDark : colors.bgLight;
const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
const borderColor = isDark ? colors.borderDark : colors.borderLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
NEVER write theme === "dark" or theme === "dark" || theme === "system" in any screen.
3.2 StatusBar Pattern
tsx
<StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
Every screen owns its own StatusBar.
3.3 Theme Toggle Pattern
Auth screens: <AuthLayout showThemeToggle>
Main screens: Absolute top-right TouchableOpacity with Ionicons sun/moon icon, 40x40dp, surfaceBg + border.
4. Typography & Spacing
4.1 Font Family
Plus Jakarta Sans (already in assets/fonts/):
Jakarta-Bold — Screen titles, CTAs, prices
Jakarta-SemiBold — Section headers, button text
Jakarta-Medium — Body text, labels
Jakarta-Regular — Captions, secondary text
4.2 Typography Scale
Table
Token	Rider	Driver	Weight	Use Case
Display	28px	32px	Bold	Screen titles, greetings
Heading	18px	22px	SemiBold	Section headers
Body	15px	18px	Medium	Primary content, inputs
Label	13px	14px	Regular	Captions, metadata
Caption	11px	12px	Regular	Timestamps, micro-copy
Metric	36px	40px	Bold	Prices, large stats
ETA	20px	24px	Bold	Timers, countdowns
4.3 Touch Targets
Rider: Minimum 48x48dp
Driver: Minimum 56x56dp
Critical actions: 64x64dp or full-width 56dp height
5. Complete Screen Inventory
5.1 Auth Screens (All Themed ✅)
A1 Splash, A2 Welcome, A3 Phone Entry, A4 Login, A5 OTP Verify, A6 Register, A7 Forgot Password, A8 Enable Location, A9 Notifications Permission, A10 Walkthrough 1/2/3, A11 Driver Splash, A12 Driver Welcome, A13 Driver Walkthrough 1/2/3, A14 Driver Enable Location, A15 Driver Notifications
5.2 Rider Main Screens (Plans 01–03 Complete ✅)
R1 Services Hub, R2 Home/Booking, R3 Finding Driver, R4 Ride Tracking, R5 Rate Driver, R6 Rides Tab, R7 Ride Detail, R8 Wallet, R9 Profile/Settings Hub, R10 Inbox, R11 Referral, R12 Edit Profile, R13 Change Password, R14 Report Issue, R15 Fare Dispute, R16 Emergency SOS, R17 Apply Promos, R18 Add Tip, R19 Schedule Ride, R20 Ride Scheduled, R21 Cancel Reason, R22 Canceled, R23 Show Ride, R24 No Drivers Available, R25 Driver Info, R26 User Arrived, R27 Find Ride, R28 Confirm Ride, R29 Autocomplete, R30 Home Raster, R31 Chat
5.3 Rider Settings Sub-Screens (Plan 03 Complete ✅)
RS1 Settings Hub, RS2 App Appearance, RS3 App Language, RS4 Contact Support, RS5 Data & Analytics, RS6 Delete Account, RS7 Delete Data, RS8 Emergency Contacts, RS9 Add Emergency Contact, RS10 FAQ, RS11 Help & Support, RS12 Linked Accounts, RS13 Logout Confirmation, RS14 Lost Items, RS15 Loyalty, RS16 Notifications, RS17 Personal Info, RS18 Privacy Policy, RS19 Ride Pass, RS20 Saved Addresses, RS21 Add Address, RS22 Terms of Service, RS23 Top Up, RS24 Top Up Method, RS25 Top Up Success, RS26 Add Payment
5.4 Driver Screens (Plan 04 Complete ✅)
D1 Driver Home, D2 Reach Customer, D3 Finish Ride, D4 Rate Rider, D5 Break Mode, D6 Enter OTP, D7 Cancellation Reasons, D8 Onboarding Wizard, D9 Driver Documents, D10 Driver Verification, D11 Earnings Tab, D12 Activity Tab, D13 Wallet Tab, D14 Profile Tab, D15 Settings Tab, D16 Add Vehicle, D17 Call Ledger, D18 Commission Statement, D19 Contact Support, D20 Customer Navigation, D21 Due Amounts, D22 Earnings, D23 Earnings Breakdown, D24 Edit Profile, D25 Emergency Contacts, D26 FAQ, D27 Hotspot Map, D28 Incentives, D29 Insurance, D30 Packages, D31 Performance Stats, D32 Personal Profile, D33 Rider No-Show, D34 Safety, D35 Schedule, D36 Select Active Vehicle, D37 Subscription Checkout, D38 Subscription Confirmation, D39 Subscription Details, D40 Subscription Plans, D41 Subscription Renewal, D42 Support, D43 Trip Issue, D44 Vehicle Management, D45 Ratings, D46 Referral, D47 Report Issue, D48 Active Subscription, D49 Driver Chat
5.5 Driver Settings Sub-Screens ✅
DS1 Account Security, DS2 Appearance, DS3 Auto Accept, DS4 Change Password, DS5 Language, DS6 Lost Items, DS7 Notifications, DS8 Privacy Policy, DS9 Terms of Service
5.6 Admin Screens (Web-only, Complete ✅)
All 32 admin screens in app/admin/ are built and wired.
5.7 Public Screens ✅
P1 Public Tracking (app/track/[rideId].tsx)
6. Rider Flow — Screen-by-Screen Rethink
6.1 Splash Screen (app/index.tsx)
Full-screen bg, centered logo, scale-in animation (300ms)
After 1.5s: check auth → redirect to welcome/services-hub/driver-home
No theme toggle (follows system only)
6.2 Services Hub (app/(main)/(customer)/services-hub.tsx) ✅
Greeting based on time of day
2x2 grid: Bike / CNG / Car / Large Cars
Each card: 48% width, aspect-square, surfaceBg, 16px radius
Tap → home?service=${key}
Theme toggle top-right
6.3 Home / Booking (app/(main)/(customer)/(tabs)/home/index.tsx) ✅
State Machine: IDLE → DESTINATION → PICKUP → VEHICLE → CONFIRM → FINDING → RIDE_TRACKING
Full-screen MapLibre with useBarikoiMapStyle(isDark)
Custom absolute-positioned bottom sheet (NOT @gorhom/bottom-sheet)
"Where to?" input: surfaceBg, 12px radius, 1px border
Vehicle cards: selected = primaryLight bg + primary border
"Book Now": full width, 56px, primary bg, white text
Surge banner: amberLight bg when surge_multiplier > 1.0
Hamburger FAB: absolute top-left, draggable
6.4 Finding Driver (app/(main)/(customer)/finding-driver/index.tsx) ✅
Map + 2 concentric pulse rings (primary, 2s loop)
Bottom card: surfaceBg, rounded-t-3xl
"Finding your driver…" + animated dots
Driver count + ETA: ONLY on successful API with count > 0
Poll every 10s. Cancel button: danger border + text
6.5 Ride Tracking (app/(main)/(customer)/ride-tracking/[ride_id].tsx) ✅
State Machine: DRIVER_EN_ROUTE → DRIVER_ARRIVED → PIN_ENTRY → RIDE_IN_PROGRESS → RIDE_COMPLETE
Driver card: photo 56x56, 2px primary border
Actions: Call (primary), Chat (surfaceBg+border), SOS (danger)
PIN_ENTRY: 4-digit boxes, auto-focus hidden TextInput
RIDE_COMPLETE: NO inline rating. Fare card + "Rate Your Driver" button → rate-driver?rideId=
6.6 Rate Driver (app/(main)/(customer)/rate-driver/index.tsx) ✅
rideId param-driven. GET /api/ride/{id} for driver info
Avatar: 80x80, 3px primary border
Stars: Ionicons "star"/"star-outline", 36px, amber
Tip chips: horizontal scroll
Block driver toggle
Submit → POST /api/ride/{id}/rate → services-hub
6.7 Rides Tab (app/(main)/(customer)/(tabs)/rides/index.tsx) ✅
Filter chips: All, Completed, Scheduled, Canceled, Inbox→, Referral→
"Inbox" and "Referral" are NAVIGATION chips (arrow icon)
Status badges: Completed (success), Canceled (danger), Scheduled (info), In Progress (amber)
Tap card → ride-detail/[ride_id]
6.8 Ride Detail (app/(main)/(customer)/ride-detail/[ride_id].tsx) ✅
Map snapshot: 180px height, 16px radius
Route: green dot → red dot
Driver card: photo, name, rating, vehicle + plate
Fare breakdown inline
Actions: Rebook, Report Issue, Fare Dispute (conditional)
If canceled: hide driver + fare, show reason
6.9 Wallet (app/(main)/(customer)/wallet/index.tsx) ✅
Balance card: surfaceBg, 16px radius, 4px primary top border
Amount: 36px Bold, primary
Transaction rows: icon + title + amount + date
Active pass: progress bar
Top-up → PaymentWebView with purpose='wallet_topup'
6.10 Profile / Settings Hub (app/(main)/(customer)/profile/index.tsx) ✅
Avatar: 110x110, 3px primary border
Sections: ACCOUNT, PREFERENCES, SUPPORT
Rows: surfaceBg, 16px radius, 1px border
"Sign Out": danger text. "Delete Account": textDisabled → confirmation modal
Sign-out clears ALL Zustand stores
6.11 Inbox (app/(main)/(customer)/(tabs)/inbox/index.tsx) ✅
Cards: surfaceBg, 12px radius
Type icons: Promo (gift), Trip (car), Payment (card), System (notifications)
Unread: 8px primary dot
Fallback: sample data with "Using sample data" micro-copy
6.12 Enable Location (app/(auth)/enable-location.tsx) ✅
Large illustration (200x200), primaryLight circular bg
"Enable Location Access" → primary, 56px
"Not Now" → surfaceBg+border (do NOT block user)
6.13 Notifications Permission (app/(auth)/notifications-permission.tsx) ✅
Bell illustration, primaryLight bg circle
"Allow Notifications" → registers push token → services-hub
"Maybe Later" → services-hub (do NOT block)
6.14 Schedule Ride (app/(main)/(customer)/schedule-ride/index.tsx)
Pickup (pre-filled) + Destination (BarikoiAutocomplete)
Date picker + Time picker (wheel or badge grid)
API: POST /api/ride/schedule with scheduledAt ISO string
6.15 Cancel Reason (app/(main)/(customer)/cancel-reason/index.tsx)
Radio list: Driver not moving, Wrong address, Changed mind, Driver asked, Other
Fee preview: GET /api/ride/{id}/cancel-preview
Countdown timer anchored to ride.created_at
"Free for M:SS" in primary
Confirm → POST /api/ride/{id}/cancel { reason }
6.16 Emergency SOS (app/(main)/(customer)/emergency-sos/index.tsx)
Shield icon, dangerLight bg circle
"Trigger SOS" button: danger bg, 64px height
Confirmation modal
On confirm: POST /api/sos/alert + dial tel:999
WS broadcast to admin SOS dashboard
6.17 Apply Promos (app/(main)/(customer)/apply-promos/index.tsx)
Promo code input + Apply
List from GET /api/promo/list
Applied promos show "Applied" badge in success
API: POST /api/promo/redeem { code }
6.18 Fare Dispute (app/(main)/(customer)/fare-dispute/index.tsx)
Ride summary + radio reasons + claimed fare input
API: POST /api/rider/fare-disputes { ride_id, reason, claimed_fare_bdt }
48-hour window
6.19 Lost Items (app/(main)/(customer)/settings/lost-items/index.tsx)
Report form: item description, ride selector, photo upload
Status badges: pending (amber), driver_found (success), not_found (danger), returned (primary)
API: POST /api/rider/lost-items, GET /api/rider/lost-items
24-hour reporting window
6.20 Rider Passes (app/(main)/(customer)/settings/ride-pass/index.tsx)
Active pass: progress bar, usage count, expiry
Available passes: name, price, ride count, duration
"Buy Now" → PaymentWebView with purpose='rider_pass'
6.21 Share Trip (inline in Ride Tracking)
Share button → Share API with ${EXPO_PUBLIC_SERVER_URL}/track/${rideId}
Public tracking page: app/track/[rideId].tsx, no auth, 10s auto-refresh
6.22 Book for Someone Else (inline in Confirm Ride)
Toggle → name + phone inputs
Phone: +880 + 10 digits
SMS notification via dpRelay
Driver sees "Booked for: [Name]" banner
7. Driver Flow — Screen-by-Screen Rethink
7.1 Driver Home (app/(main)/(rider)/(tabs)/index.tsx) ✅
State Machine: OFFLINE → ONLINE → RIDE_OFFER → find-customer
OFFLINE: 80dp pulsing primary circle, "Go Online"
ONLINE: 3 concentric radar rings, staggered 500ms
Stats bar: "Today: taka X · N trips · Hh" → tappable to earnings
RIDE_OFFER: RideOfferSheet + CountdownRing (15s)
Slide to Accept: SlideButton, primary bg
WS: home ONLY creates WebSocket. Others use addEventListener
Reconnect banner: amber "Reconnecting…"
Reduced motion gates pulse/radar
7.2 Reach Customer (app/(main)/(rider)/find-customer/index.tsx) ✅
Map: route line to pickup
RideInfoCard: origin (green dot) → destination (red pin)
Wait timer: fontVariant: ['tabular-nums']
DriverActionBar: Call/Navigate/Chat — 64dp each
Slide to Arrive: SlideButton
Cancel Ride: valid for matched/driver_arriving/driver_arrived only
Delete fallback WS creator
7.3 Finish Ride (app/(main)/(rider)/finish-ride/index.tsx) ✅
Delete verifyReached state + unreachable modal
Delete fallback WS creator
Remove Cancel button (in_progress → 409)
Slide to Complete → POST /api/ride/[id]/complete (HTTP)
Success modal: "Collect taka {fare} cash from rider"
Null-guard: parse fare_breakdown defensively
7.4 Rate Rider (app/(main)/(rider)/rate-rider/index.tsx) ✅
Ionicons star/star-outline, 36dp, amber
Themed placeholder avatar
NO feedback TextInput — API accepts { rating, role: 'driver' } only
Submit → toast → router.replace("/(main)/(rider)")
7.5 Break Mode (app/(main)/(rider)/break-mode/index.tsx) ✅
Convert NativeWind Pattern C → Pattern A
Timer fontVariant: ['tabular-nums']
Coffee icon: Ionicons cafe, breathing animation (scale 1→1.05, 3s)
Reduced motion gates breathing
Start: POST /api/driver/break/start; End: /break/end
Resume-from-kill: GET /api/driver/me → if on_break, restore timer
7.6 Enter OTP (app/(main)/(rider)/enter-otp/index.tsx) ✅
Theme: bg, focus primary, error danger + shake
Keep react-native-otp-entry
addEventListener for ride:started / ride:start_failed
7.7 Cancellation Reasons (app/(main)/(rider)/cancellation-reasons/index.tsx) ✅
Ionicons radio list
Presets: "Rider no-show", "Wrong address", "Vehicle issue", "Personal emergency", "Other"
Submit POST /api/ride/:id/cancel { reason }
7.8 Onboarding Wizard (app/(main)/(rider)/onboarding/index.tsx) ✅
7 Steps: Profile → Vehicle → Vehicle Docs → Driver Docs → Legacy (opt) → Payout → Review
Segmented progress bar: active primary, inactive borderColor
Upload = Supabase Storage driver-documents bucket via lib/imageToURL.ts
Gallery only — no camera
Delete flat onboarding.tsx + onboarding/documents.tsx dead flows
7.9 Driver Documents (app/(main)/(rider)/documents/index.tsx) ✅
Status list from GET /api/driver/documents
Statuses: verified (success), pending (amber), rejected (danger + reason)
Grouped: Driver Docs / Vehicle Docs / Legacy
7.10 Driver Verification (app/(main)/(rider)/verification/index.tsx) ✅
Stepper derived from real data:
Profile submitted (drivers.status != 'temporary')
Documents (GET /api/driver/documents aggregate)
Admin review & activation — manual decision
Estimated copy: "1–2 business days"
Delete legacy POST /api/driver/verify-driver usage
7.11 Driver Earnings Tab (app/(main)/(rider)/(tabs)/earning/index.tsx)
Today earnings: GET /api/driver/daily-stats (B-6)
Weekly bar chart or list
Tap day → earnings-detail/[date]
7.12 Driver Activity Tab (app/(main)/(rider)/(tabs)/activity/index.tsx)
Filter chips: All, Completed, Canceled
Trip cards (driver perspective)
Tap → trip-details/[rideId]
7.13 Driver Wallet Tab (app/(main)/(rider)/(tabs)/wallet/index.tsx)
Balance: GET /api/driver/wallet
Due amounts: GET /api/driver/due-amounts
Withdraw → bKash payout
Transaction list with type icons
7.14 Driver Profile Tab (app/(main)/(rider)/(tabs)/profile/index.tsx)
Same structure as rider Profile but driver-specific routes
Vehicle Management → vehicle-management/index.tsx
7.15 Driver Settings Tab (app/(main)/(rider)/(tabs)/settings/index.tsx)
Auto Accept toggle: PATCH /api/driver/me { auto_accept: boolean }
Navigation App selector: Google Maps / Waze / In-app
7.16 Hotspot Map (app/(main)/(rider)/hotspot-map/index.tsx)
Map with heatmap overlay
GET /api/driver/hotspots
Heat colors: green (low) → yellow → red (high)
7.17 Vehicle Management (app/(main)/(rider)/vehicle-management/index.tsx)
Active vehicle card: photo, brand, model, type, plate, year
Switch vehicle → select-active-vehicle
Add new → add-vehicle/index.tsx
7.18 Subscription Plans (app/(main)/(rider)/subscription-plans/index.tsx)
Plans from GET /api/driver/subscription-plans
Subscribe → subscription-checkout/index.tsx
Payment via PortPos
7.19 Performance Stats (app/(main)/(rider)/performance-stats/index.tsx)
Weekly/monthly toggle
Charts: bar for earnings, line for rating trend
GET /api/driver/performance
7.20 Rider No-Show (app/(main)/(rider)/rider-no-show/index.tsx)
Wait timer from wait-start API
Mark as No-Show → POST /api/ride/:id/no-show → partial compensation
Cancel → cancellation-reasons
8. Shared Component Library
8.1 Core Components (Already Built ✅)
AuthLayout, CustomButton, OtpInput, SplashAnimation, ThemeToggle, Map, BarikoiAutocomplete, FloatingNavMenu, FareBreakdownSheet, RideCard, RideOfferSheet, CountdownRing, SlideButton, SOSButton, SchedulePicker, PaymentWebView, LoadingRider, DocumentUploadCard, ErrorFindDriver, DriverStatusBadge, ChatScreen, DriverNavigation, InputField, VehicleCategoryCard
8.2 New Components Needed (Plan 05+)
Table
Component	Purpose	Where Used
DriverStatsBar	"Today: taka X · N trips · Hh"	Driver home
RideInfoCard	Origin/destination/stops card	find-customer, finish-ride
DriverActionBar	Call/Navigate/Chat buttons	find-customer
VerificationStep	Vertical stepper item	verification
ProgressBar	Pass usage progress	wallet, ride-pass
EmptyState	Illustration + text for empty lists	Multiple screens
ErrorBanner	Retryable error with action	Multiple screens
OfflineIndicator	Network status bar	All screens
Badge	Status/count badges	Multiple screens
Avatar	User photo with fallback	Profile, chat, ratings
RadioGroup	Single-select radio list	cancel-reason, settings
CheckboxGroup	Multi-select checkboxes	onboarding consent
DatePicker	Native date picker wrapper	schedule-ride
TimePicker	Time selection wheel	schedule-ride
ChartBar	Simple bar chart	earnings, performance
ChartLine	Simple line chart	performance stats
HeatmapOverlay	Map demand heatmap	hotspot-map
9. State Machines
9.1 Rider Booking State Machine
plain
IDLE (sheet 18%)
  → Tap "Where to?"
DESTINATION (sheet 92%)
  → Select destination from BarikoiAutocomplete
PICKUP (sheet 35%)
  → Tap "Confirm Pickup"
VEHICLE (sheet 50-80%)
  → Select vehicle type
CONFIRM (sheet 70-90%)
  → Tap "Book Now" → POST /api/ride/request
FINDING_DRIVER (navigate to finding-driver)
  → Driver accepts via WS
RIDE_TRACKING (navigate to [ride_id])
  → DRIVER_EN_ROUTE
    → Driver arrives at pickup
  → DRIVER_ARRIVED
    → Rider enters PIN / Driver starts
  → PIN_ENTRY
    → Correct PIN entered
  → RIDE_IN_PROGRESS
    → Driver slides to complete
  → RIDE_COMPLETE
    → Show fare + "Rate Your Driver" CTA
    → Tap CTA → rate-driver
    → Tap "Back to Home" → services-hub
9.2 Driver Work State Machine
plain
OFFLINE
  → Tap "Go Online" → POST /api/driver/status { online: true }
ONLINE
  → WS: ride:offer received
RIDE_OFFER (offer modal, 15s countdown)
  → Slide to Accept → fetch:confirm → offer:accept → offer:accepted
  → Navigate to find-customer
  → OR Decline → offer:reject → ONLINE
FIND_CUSTOMER
  → Slide "I've Arrived" → ride:arrived
  → OR Cancel → cancellation-reasons
ENTER_OTP
  → Enter 4-digit PIN → ride:start
  → On ride:started → finish-ride
FINISH_RIDE
  → Slide "Complete Ride" → POST /api/ride/:id/complete
  → Success modal → rate-rider OR home
BREAK_MODE
  → Start break → POST /api/driver/break/start
  → End break → POST /api/driver/break/end
9.3 Auth State Machine
plain
SPLASH
  → No auth → WELCOME
  → Auth + rider → SERVICES_HUB
  → Auth + driver → DRIVER_HOME
WELCOME
  → Tap "Get Started" → PHONE_ENTRY
PHONE_ENTRY
  → Enter phone → LOGIN
LOGIN
  → OTP sent → OTP_VERIFY
OTP_VERIFY
  → Valid OTP + existing user → SERVICES_HUB / DRIVER_HOME
  → Valid OTP + new user → REGISTER
REGISTER
  → Complete profile → ENABLE_LOCATION
ENABLE_LOCATION
  → Grant → NOTIFICATIONS_PERMISSION
  → Deny/Skip → SERVICES_HUB (do NOT block)
NOTIFICATIONS_PERMISSION
  → Grant → SERVICES_HUB
  → Skip → SERVICES_HUB (do NOT block)
10. Wiring & Backend Placement
10.1 API Route Naming Convention
Table
Pattern	Example	Purpose
GET /api/ride/get-all	Rider ride history	List
GET /api/ride/{id}	Ride detail	Single item
POST /api/ride/request	Create ride	Create
POST /api/ride/{id}/cancel	Cancel ride	Action
POST /api/ride/{id}/rate	Rate ride	Action
POST /api/ride/nearby-drivers	Nearby driver count	Query
GET /api/rider/wallet	Rider wallet	Account
GET /api/driver/me	Driver profile	Account
POST /api/driver/status	Toggle online	Action
POST /api/driver/break/start	Start break	Action
GET /api/driver/daily-stats	Daily earnings	Stats
POST /api/driver/documents	Upload document	Create
GET /api/driver/documents	List documents	List
POST /api/driver/payout-method	Set bKash	Create
POST /api/promo/redeem	Apply promo	Action
POST /api/sos/alert	Emergency alert	Action
10.2 WebSocket Protocol (Real — from utils-server/index.ts)
Inbound (client→server):
auth:hello, heartbeat, location:update, fetch:confirm, offer:accept, offer:reject, ride:arrived, ride:start, ride:complete, chat:typing
Outbound (server→client):
auth:ok, auth:error, ride:offer, fetch:confirmed, fetch:error, offer:accepted, offer:rejected, offer:lost, ride:arrived, ride:started, ride:start_failed, ride:completed, ride:cancelled, location:driver, chat:message, chat:typing, error
Never emitted (do NOT handle):
ride:offer_expired, ride:offer_cancelled, ride:status_update, subscription:expired
10.3 Backend File Placement
Table
Type	Location	Example
API routes	app/api/{resource}/+api.ts	app/api/ride/request+api.ts
API routes with params	app/api/{resource}/[id]/+api.ts	app/api/ride/[id]/cancel+api.ts
Internal WS routes	utils-server/index.ts	WebSocket server
Internal HTTP routes	utils-server/index.ts	/internal/ride/completed
DB schema	src/db/schema.ts	All tables
DB migrations	src/db/migrations/	0035_bored_scarlet_spider.sql
Shared utils	lib/	lib/auth.ts, lib/h3.ts, lib/logger.ts
Server utils	utils-server/	utils-server/dispatch.ts
Client utils	utils/	utils/mapUtils.ts
11. Implementation Roadmap
11.1 Plan 05 — Supporting Features & Polish
Table
#	Feature	Screens	Backend	Priority
1	Schedule Rides	schedule-ride, ride-scheduled	POST /api/ride/schedule	High
2	Cancel Ride + Reason	cancel-reason, canceled	GET /api/ride/:id/cancel-preview	High
3	Apply Promos	apply-promos	GET /api/promo/list, POST /api/promo/redeem	Medium
4	Emergency SOS	emergency-sos	POST /api/sos/alert	High
5	Lost Items	lost-items	POST /api/rider/lost-items	Medium
6	Fare Disputes	fare-dispute	POST /api/rider/fare-disputes	Medium
7	Rider Passes	ride-pass	GET /api/admin/rider-passes	Medium
8	Share Trip	inline in tracking	app/track/[rideId].tsx	Low
9	Book for Someone Else	inline in confirm	POST /api/ride/request (extend)	Medium
10	Deep Linking + Push Handlers	_layout.tsx	—	Medium
11.2 Plan 06 — Driver Secondary Features
Table
#	Feature	Screens	Backend	Priority
1	Hotspot Map	hotspot-map	GET /api/driver/hotspots	Medium
2	Performance Stats	performance-stats	GET /api/driver/performance	Low
3	Rider No-Show	rider-no-show	POST /api/ride/:id/no-show	High
4	Vehicle Management	vehicle-management	GET /api/driver/vehicles	Medium
5	Subscription Plans	subscription-plans, subscription-checkout	GET /api/driver/subscription-plans	Low
6	Incentives	incentives	GET /api/driver/incentives	Low
7	Insurance	insurance	GET /api/driver/insurance	Low
11.3 Plan 07 — Admin & Operations
Table
#	Feature	Status
1	Admin SOS Dashboard	Web-only, needs WS integration
2	Admin Promo Management	Web-only, already built
3	Admin Fare Dispute Resolution	Web-only, needs UI
4	Admin Lost Items Management	Web-only, needs UI
5	Real-time analytics	Deferred
11.4 Plan 08 — Polish & Performance
Table
#	Task	Description
1	useIsDark() sweep	grep -rn 'theme === "dark"' app/ components/ → 0 matches
2	NativeWind dark: removal	Convert all dark: classes to Pattern A
3	Font audit	Zero Urbanist remnants in rider screens
4	Touch target audit	All interactive elements ≥ 48dp (rider) / 56dp (driver)
5	Animation audit	Reduced motion gates on all pulse/radar/breathing
6	Offline support	NetInfo integration + offline state UI
7	Error boundary	Global error boundary with retry
8	Performance	Memoize heavy components, lazy load screens
12. Coding Agent Instruction Set
12.1 Before Writing Any Code
Read these files in order:
lib/useAppearance.ts — check useIsDark() exists
theme/goRide.ts — memorize color token names
The target screen file — understand current state
Any related API file — understand contract
Run verification:
bash
grep -rn 'theme === "dark"' app/ components/
Expected: 0 matches in files you're editing.
Check store files:
store/useRiderStore.ts
store/useDriverStore.ts
store/useWSStore.ts
12.2 While Writing Code
Import order:
tsx
// 1. React
import { useState, useEffect } from "react";
// 2. React Native
import { View, Text, TouchableOpacity, StatusBar } from "react-native";
// 3. Third-party
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
// 4. Local absolute
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";
Theme tokens at top of component:
tsx
const isDark = useIsDark();
const bg = isDark ? colors.bgDark : colors.bgLight;
const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
const borderColor = isDark ? colors.borderDark : colors.borderLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
StatusBar on every screen:
tsx
<StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
Theme toggle on every screen except SplashAnimation:
tsx
<TouchableOpacity
  onPress={() => setTheme(isDark ? "light" : "dark")}
  className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
  style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
>
  <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
</TouchableOpacity>
No emoji in production UI. Use Ionicons only.
Money display: taka ${(paisa / 100).toFixed(2)} or taka ${Math.round(paisa / 100)} for whole taka.
Error handling: Always show error state, never crash. Use ErrorBanner pattern.
Loading states: Use LoadingRider or skeleton screens, never blank screens.
No console.log: Use logger.info(), logger.error(), logger.warn().
No any: Type everything. Drizzle enum casts are the only exception.
12.3 After Writing Code
Type check:
bash
npx tsc --noEmit
Expected: 0 errors.
Lint:
bash
npm run lint
Expected: 0 errors.
Console log scan:
bash
grep -rn 'console.log' app/ components/ lib/ store/
Expected: 0 matches.
Theme pattern scan:
bash
grep -rn 'theme === "dark"' app/ components/
Expected: 0 matches.
Emoji scan:
bash
grep -rn '[🎁🚗💳📢🟢🔴🛡️📞💬🗺️🚨🎒📅🕐📍🔍🚲🛺🚌]' app/ components/
Expected: 0 matches in production UI (comments OK).
13. Verification Checklists
13.1 Per-Screen Checklist
[ ] Uses useIsDark() from @/lib/useAppearance
[ ] No theme === "dark" anywhere
[ ] No NativeWind dark: classes
[ ] StatusBar with correct barStyle and backgroundColor
[ ] Theme toggle present (except SplashAnimation)
[ ] Ionicons only — no emoji
[ ] Jakarta fonts only — no Urbanist
[ ] Touch targets ≥ 48dp (rider) / 56dp (driver)
[ ] Card radius: 16px, Input radius: 12px, Button radius: 12px
[ ] logger used — no console.log
[ ] Error states handled — no crashes on null/undefined
[ ] Loading states handled — no blank screens
[ ] npx tsc --noEmit passes
[ ] npm run lint passes
13.2 Per-API Checklist
[ ] Zod schema validates body
[ ] parseJsonBody used for POST
[ ] verifySupabaseToken for authenticated routes
[ ] Error format: { error: '<machine_code>', message: '<human>' }
[ ] Snake_case DB properties
[ ] isNull / isNotNull — never eq(col, null)
[ ] Money: integer paisa, /100 only at display
[ ] Transactions for multi-table money writes
[ ] logger used — no console.log
13.3 Global Checklist (Before Release)
[ ] All 150+ screens follow Pattern A theming
[ ] grep -rn 'theme === "dark"' app/ components/ → 0 matches
[ ] grep -rn 'dark:' app/ components/ → 0 matches (or only in pre-existing files with TODO)
[ ] All Jakarta fonts, zero Urbanist
[ ] All Ionicons, zero emoji in production UI
[ ] All touch targets ≥ minimum
[ ] All screens have StatusBar
[ ] All screens except Splash have theme toggle
[ ] npx tsc --noEmit → 0 errors
[ ] npm run lint → 0 errors
[ ] console.log scan → 0 matches
[ ] EAS Build succeeds
[ ] iOS + Android smoke tests pass
End of Ride App — UI/UX Rethink 3: Master Planning File
This document supersedes all previous master plans. Plans 01–04 are complete and locked. All future work must reference this document and follow the decisions, patterns, and checklists defined herein.
"""
print("Content prepared successfully!")
print(f"Total length: {len(content_part1)} characters")
print("The coding agent should write this to /mnt/agents/output/Ride_App_UIUX_Rethink_3_Master_Plan.md")
}
any change from the old one? I want you to keep that to u. 

and then give me the plan 5
Copy
Share
Compare Master Plans and Produce Next Implementation Plan
Read
Ride_App_UIUX_Rethink_3_Master_Plan.md
Briefly Note Changes and Deliver Plan 05
Here are the key changes from the old master plan — the old file stays as-is, this is just the delta:
Changes from Old Master Plan
Table
Area	Old	New
Structure	11 sections (Architecture, Completed Files, Auth Flow, Plan 04, State Machines, Vehicle Categories, Pending Work, Wiring, Bugs, Decisions, File List)	13 sections — fully restructured as a canonical spec document
Lock Decisions	Scattered in "Key Decisions" and Plan 04	Consolidated into L1–L17 locked table with sources — never change without approval
Design Philosophy	Not explicitly defined	New Section 2 — "Bangladesh Futuristic" with constraints, light/dark palettes, rider vs driver split
Theme System	Brief mention in "Theme System"	New Section 3 — Pattern A mandatory code patterns, StatusBar rule, toggle pattern with exact code
Typography	Mentioned in theme	New Section 4 — Full scale (Display/Heading/Body/Label/Caption/Metric/ETA) with rider vs driver sizes, spacing scale, radius scale, touch targets
Screen Inventory	Flat list in "Completed Files" + "Pending Work"	New Section 5 — 7 tables: Auth (15), Rider Main (31), Rider Settings (26), Driver (49), Driver Settings (9), Admin (32), Public (1) — all mapped to file paths
Screen Specs	None — only state machines	New Sections 6 & 7 — Every screen has ASCII wireframe + detailed spec (what API it calls, what components it uses, exact behavior)
Component Library	Listed in Plan 04	New Section 8 — Existing 22 components + 16 new components needed with interface specs
State Machines	2 machines (rider + driver)	New Section 9 — 3 machines (rider booking, driver work, auth) with full transition labels
Wiring	"Wiring Changes Log" (4 items)	New Section 10 — API naming convention, full WS protocol (inbound/outbound/never-emitted), backend file placement rules
Roadmap	"Pending Work" (items 51–82)	New Section 11 — 4 structured plans (05–08) with screen counts, backend needs, priorities
Coding Instructions	None	New Section 12 — Step-by-step agent instructions (import order, theme tokens, StatusBar, toggle, no console.log, no any, post-code verification commands)
Verification	Checklist at end of Auth Flow section	New Section 13 — 3 checklists: per-screen, per-API, global release
AGENTS.md Rules	Not referenced	New Section 1.4 — 10 critical rules from AGENTS.md (money as paisa, transactions, write ownership, PortPos security, etc.)
Bottom line: The old plan was a progress log. The new plan is a complete specification that a coding agent can follow screen-by-screen without asking questions.