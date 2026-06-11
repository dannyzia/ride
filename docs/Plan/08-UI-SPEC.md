<!--
AI INSTRUCTIONS
===============
Base: GlideX app/(main)/(rider)/ and app/(main)/(customer)/ screens — those cover map, find-customer, finish-ride, ride history.
This file documents ONLY screens that are NEW or SIGNIFICANTLY CHANGED from GlideX.
GlideX screens that are kept as-is (e.g. map home, driver-finding animation, ride tracking): inherit and do not rebuild.
Read: 09-UX-SPEC.md (global UX rules apply to all screens here).
Read: 07-USER-FLOWS.md (how screens connect — each screen maps to a flow step).
Read: 01-PRD.md (acceptance criteria that screens must satisfy).
Every screen defined here MUST implement ALL states: loading, empty/idle, error, success.
Mobile-first: all screens are React Native (Expo Router). Admin screens are web-only.
-->

# UI Spec: Ride
> Delta from GlideX. Only new or significantly changed screens are documented here.

## GoRide Design System Canonical Override (applies to ALL screens below)

This section replaces the previous generic visual descriptions. Keep all existing business logic, API contracts, and state transitions exactly as documented; only visual presentation changes.

### Source of truth
- UI kit CSS: D:/My Projects/Current Project/Ride/App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide.css
- UI kit screens: D:/My Projects/Current Project/Ride/App Design/GoRide - Ride-Hailing App UI Kit (Preview)
- Marker set: D:/My Projects/Current Project/Ride/App Design/GoRide - Ride-Hailing App UI Kit (Preview)/Elements
- Primary brand mark (largest, simplest logo variant): D:/My Projects/Current Project/Ride/App Design/Logo/image-2026-05-04T15-36-03-285Z.png

### Mandatory token mapping (React Native theme keys)
- Primary accent: #0CC25F
- Primary accent pressed/strong: #0A9B4C
- Positive tint background: #ECFAF2
- Surface light: #FFFFFF
- Surface soft: #FAFAFA
- App light background: #F7FCFF
- Border light: #DADADA
- Border mid: #E0E0E0
- Text primary (light mode): #212121
- Text secondary (light mode): #616161
- Text muted: #BDBDBD
- App dark background: #181A20
- Surface dark: #1F222A
- Surface elevated dark: #212121
- Border dark: #35383F
- Text primary (dark mode): #FFFFFF
- Text secondary (dark mode): #EEEEEE
- Error/danger: #E31D1C
- Info/brand auxiliary: #2E42A5

Typography and density tokens (from GoRide.css):
- Heading font family: Urbanist
- Body/caption fallback font family: Inter
- Display sizes: 32, 24, 20
- Body sizes: 18, 16
- Caption size: 12
- Corner radius scale: 4, 6, 10, 16, 20, 24, 32, pill(1000)
- Elevation shadow: -32px 32px 48px rgba(24, 26, 32, 0.1)
- Common spacing scale: 8, 10, 12, 16, 20, 24, 32

### Status bar and navigation bar style
- Light screens: light app background #F7FCFF, dark text/icons #212121, white/nav surfaces #FFFFFF.
- Dark screens: dark app background #181A20, white text/icons #FFFFFF, dark nav surfaces #212121.
- Bottom navigation style follows GoRide dual-theme pattern: rounded top container, clear active pill indicator in #0CC25F, inactive labels in #616161 (light) and #EEEEEE (dark).

### Component-level visual rules (all screens)
- Primary button: filled #0CC25F, text #FFFFFF, radius 1000, pressed #0A9B4C.
- Secondary button: dark surface #1F222A with #FFFFFF text in dark theme, or white surface with #212121 text and #DADADA border in light theme.
- Input fields: surface #FFFFFF (light) / #1F222A (dark), border #DADADA (light) / #35383F (dark), radius 10-16.
- Cards and sheets: high-radius GoRide cards (16-24), shadow token for floating cards, soft separators.
- Map markers: use Marker Navigation assets from Elements folder for pickup/dropoff and vehicle context states.
- CountdownRing visual token: progress stroke must use #0CC25F (not inherited legacy color).

### Screen family replacement map (visual layer)
- Auth screens (Phone Entry, OTP, Register): centered hero lockup with primary logo, white or dark elevated cards, Urbanist headings (24/32), body 16/18, primary CTA in #0CC25F.
- Onboarding screens (multi-step driver onboarding): map-free form cards, clear step progress accents in #0CC25F, grouped upload cards with 16-20 radius and light/dark adaptive surfaces.
- Driver Home: map-centric canvas with GoRide floating wallet card and GoRide online pill toggle above map controls; all cards use elevated surfaces and Urbanist hierarchy.
- Rider Home: map-first layout with GoRide pull-up bottom sheet style, rounded top corners (24-32), vehicle selector chips (pill radius, active in #0CC25F), and fare breakdown in layered sheet sections.
- Ride Offer card: floating action sheet with strong CTA hierarchy, swipe affordance, countdown ring in #0CC25F, and dark-mode-first contrast.
- Fare Breakdown and completion sheets: segmented rows with subtle dividers, bold total line in Urbanist 24, status-safe color semantics.
- Admin web screens: unified dark sidebar (#181A20/#1F222A), elevated content panel (#212121 on dark theme variants), table borders #35383F, badges in #0CC25F and #E31D1C.

### Explicit screen updates required by this release
- Driver Home must include the GoRide-style floating Call Wallet card and online toggle treatment.
- Rider Home must use GoRide bottom sheet style, GoRide vehicle selector chips, and GoRide fare breakdown sheet hierarchy.
- Admin queue/packages/zones must apply the dark sidebar + table style listed above.
- driver_arrived controls (Arrived CTA, Start Ride CTA, wait timer banner) must use GoRide tokens; wait timer starts in #0CC25F and switches to amber warning after free wait threshold.

### Second-pass (PNG-validated) interaction and feature layout requirements
- Active ride and pre-match map screens use a two-layer overlay hierarchy:
  1) compact route header card near top,
  2) large rounded bottom action sheet with a visible drag handle.
- Searching and finding-driver states include center pulse/radar animation + explanatory copy + visible cancel action without hiding map context.
- Vehicle options list uses card-per-option format (icon, ETA range, seat count, fare) with selected card highlighted by accent border and soft green tint.
- In `driver_arriving` state, expanded details panel must include:
  - driver identity card (avatar, rating, contact controls),
  - ride/payment summary card,
  - fare summary card (fare, discount, total paid),
  - cancel CTA at bottom.
- Cancel ride screen is reason-first and form-like: single-select radio list + explicit confirm button. Confirm remains disabled until a reason is selected.
- Post-arrival completion panel includes trip metrics summary and mood/feedback selector before final CTA. This panel is non-blocking for backend completion logic but required in UI flow.
- Bottom tab bar is visible for home/search contexts and hidden on focused in-ride state screens (`driver_arriving`, `driver_arrived`, `in_progress`, post-arrival summary).

### Zero-hardcoding note
All component colors, font sizes/families, spacing, radii, and shadows must reference theme/goRide.ts tokens generated from GoRide.css; no inline constants in component files.

---

## Screen 1: Phone Entry (Auth)
Route: `app/(auth)/phone-entry` | Auth required: no
Replaces: GlideX Clerk sign-in screen entirely.

### Layout
```
[SafeAreaView — full screen, centered vertically]

  [Logo — Ride wordmark, centered, top 20% of screen]

  [Heading]: "Enter your phone number"
  [Subheading]: "We'll send a verification code via SMS"

  [Phone input field]
    Prefix: "+880" (fixed, non-editable)
    Placeholder: "1XXXXXXXXX"
    Keyboard: numeric
    Max length: 10 digits after prefix

  [Role selector — segmented control, 2 options]
    "I'm a Rider"  |  "I'm a Driver"
    Default: Rider

  [Primary button]: "Send Code"
    Width: full
    Margin top: 24px

  [Footer text]: "By continuing you agree to our Terms and Privacy Policy"
    Links: Terms (opens webview), Privacy Policy (opens webview)
```

### Components

#### Phone input field
| Property | Value |
|----------|-------|
| ID | `phone-input` |
| On change | Validate: only digits, max 10 chars after +880 |
| Error shown | Below field: "Enter a valid Bangladeshi mobile number" |
| Disabled when | Request in flight |

#### Send Code button
| Property | Value |
|----------|-------|
| ID | `send-code-btn` |
| On tap | Call Firebase CF `startVerification`, navigate to OTP Polling screen |
| Disabled when | Phone < 10 digits OR request in flight |
| Loading state | Replace label with spinner |

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Idle | Screen open | Input focused, button enabled when valid |
| Loading | Button tapped | Button shows spinner, input disabled |
| Error — invalid signature | CF returns 401 | Toast: "Verification failed. Please update the app." |
| Error — expired timestamp | CF returns 400 | Toast: "Request timed out. Please try again." |
| Error — rate limited | CF returns 429 | Toast: "Too many attempts. Please wait 5 minutes." |
| Success | CF returns sessionCode | Navigate to `/otp-polling` with sessionCode param |

### Responsive behavior
| Breakpoint | Behavior |
|------------|----------|
| Mobile (default) | Single column, full-width inputs |

---

## Screen 2: OTP Polling / Verification
Route: `app/(auth)/otp-polling` | Auth required: no
Params: `sessionCode`, `phone`, `expiresAt`

### Layout
```
[SafeAreaView — full screen]

  [Back button — top left]

  [Heading]: "Verifying your number"
  [Subheading]: "Waiting for SMS to +880{phone}..."

  [Animated status indicator]
    — Pulsing ring animation while polling
    — Green checkmark on success
    — Red X on failure

  [Countdown]: "Code expires in 0:47"
    Updates every second. Red when < 10s.

  [--- if SMS not auto-detected after 20s ---]
  [Manual entry section appears]
    Label: "Didn't receive it? Enter the code manually:"
    Input: 6-digit numeric, large font (24px), spaced
    Button: "Submit Code" (secondary)

  [Resend link]: "Resend code" — disabled until 60s cooldown expires
    Shows countdown: "Resend in 0:42"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Polling | Screen load | Animated ring, polling every 3s |
| Auto-detected | SMS receiver writes to RTDB, `checkAuth` returns "received" | Ring → green check, navigate to next screen |
| Manual entry shown | 20s elapsed, no auto-detect | Manual input field fades in |
| Mismatch | `checkAuth` returns "mismatch" | Red X, toast: "Phone number mismatch detected. Please try again." Navigate back. |
| Expired | `checkAuth` returns "expired" | Red X, show retry button. "We couldn't verify your number. Check your SMS and try again." |
| Success | "received" status | Navigate to `/register` (new user) or role home (returning user) |

---

## Screen 3: Driver Registration (Name + Role confirm)
Route: `app/(auth)/register` | Auth required: no (has `challenge_jwt` from checkAuth)
Shown only for new users after OTP success.

### Layout
```
[SafeAreaView]

  [Heading]: "Almost there!"
  [Subheading]: "Tell us your name"

  [Name input]
    Placeholder: "Full name"
    Max: 100 chars

  [Role display — read-only pill]
    "Registering as: Driver" or "Registering as: Rider"
    (set from phone-entry screen; not changeable here)

  [Primary button]: "Create Account"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Button tapped | Spinner, call `POST /api/register` |
| Error 409 | Phone already exists | Toast: "This number is already registered. Please log in." Navigate to phone-entry. |
| Error 401 | `challenge_jwt` expired | Toast: "Session expired. Please start over." Navigate to phone-entry. |
| Success | 201 returned | `signInWithCustomToken`, navigate to role home |

---

## Screen 4: Driver Onboarding — Multi-step
Route: `app/(main)/(rider)/onboarding` | Auth required: yes (driver, status=pending)
Shown immediately after driver registration. Gated until complete.

### Layout (step container — shared across all steps)
```
[SafeAreaView]

  [Progress bar — top, full width]
    Step 1 of 3 filled segments

  [Step title]: e.g. "Vehicle Registration"
  [Step subtitle]: e.g. "Step 1 of 3"

  [Step content — scrollable]
    (varies per step — see below)

  [Bottom bar — fixed]
    [Back button] (left, hidden on step 1)   [Next / Submit button] (right)
```

### Step 1 — Vehicle Registration
Fields:

**Vehicle identification (brand/model/year — autocomplete):**

```
  [Brand input]
    Autocomplete text input (debounced 300ms, sourced from GET /api/reference/vehicle-models?search=)
    Fallback: free text if not in list.
    Validation: required, max 100 chars.

  [Model input] — shown after brand selected
    Autocomplete filtered by selected brand.
    Fallback: free text.
    Validation: required, max 100 chars.

  [Manufacturing Year] — shown after model entered
    4-digit number input.
    Validation: 1990–current_year+1.

  [Auto-suggestion banner] — shown when vehicle_models lookup returns a match
    Banner: "Based on your [Brand] [Model], we suggest: [Vehicle Type] ([AC status])"
    [Confirm suggestion — primary button]  [Choose manually — text link]
    If confirmed: vehicle type, AC status, and seats are pre-filled.

  [Vehicle Type dropdown] — always visible, pre-filled if auto-suggestion confirmed
    8 options from GET /api/reference/vehicle-types:
    - **Bike Basic** (≤100 cc)
    - **Bike Standard** (>100–150 cc)
    - **Bike Plus** (>150 cc)
    - **CNG Auto Rickshaw**
    - **Car Economy** (Non-AC)
    - **Car Comfort** (AC)
    - **Car Premium** (AC)
    - **Car XL** (AC, 6–7 seats)

  [AC selector — shown only for car_economy and car_comfort]
    Two radio buttons: ○ AC  ○ Non-AC
    Default: AC (from vehicle_models suggestion if available)
    On Non-AC selection:
      [Red warning text]: "Vehicles without AC receive fewer ride requests. Consider upgrading your vehicle to increase earnings."
      Driver can still proceed.

  [AC status — shown only for car_premium and car_xl]
    Pre-selected: AC (mandatory)
    Non-changeable. Greyed out radio with lock icon.
    If for any reason Non-AC state is detected:
      [Red text]: "Car [Premium/XL] requires air conditioning. Your vehicle cannot be listed in this category."
```

**Registration details:**
- Registration Area: dropdown — sourced from `GET /api/reference/registration-areas` (DHAKA_METRO, CHITTAGONG_METRO, etc.)
- Vehicle Class Letter: dropdown — sourced from `GET /api/reference/vehicle-class-letters` (DAW, THAW, HA, KA, etc.) — shows both Bengali and English labels
- Registration Number (numeric): text input — system composes full registration: `{area}-{class}-{number}`
- Vehicle Registration Date: date picker — date the vehicle was first registered with BRTA (used for 1-year age check; threshold from `lib/vehicleTypes.ts` `min_age_years`; configurable)

Document uploads for vehicle:
```
For each document (BRTA Certificate, Registration Scan front+back, Fitness Scan, Tax Token Scan):
[Document card]
  [Camera icon] "Tap to upload [doc name]"
  → opens expo-image-picker → uploads to Firebase Storage
  → on success: card shows thumbnail + green check
  → on fail: card shows retry button + error message
```

**BRTA Certificate upload (mandatory for all vehicle types):**
```
[Document card — BRTA Certificate]
  doc_type: 'brta_certificate'
  Required: yes
  Label: "BRTA Certificate"
```

Additional fields:
- Vehicle Fitness Expiry Date: date picker
- Vehicle Tax Token Expiry Date: date picker

Vehicle photos & video (6 photos + 1 walkaround video — see Screen 4c):
```
[Photo grid — 2x3]
  Row 1: Front (vehicle_photo_front) | Left Side (vehicle_photo_left)
  Row 2: Right Side (vehicle_photo_right) | Rear (vehicle_photo_rear)
  Row 3: Dashboard (vehicle_photo_dashboard) | Front Seats (vehicle_photo_seats)
  Each cell: sample thumbnail + capture button + captured checkmark
  Full spec: see Screen 4c below.
```

**Conditional uploads based on vehicle type:**
```
If vehicle type is bike_basic, bike_standard, or bike_plus:
  [Helmet photo 1]
    doc_type: 'helmet_photo'
    Label: "Helmet photo (front view)"
  [Helmet photo 2]
    doc_type: 'helmet_photo'
    Label: "Helmet photo (side view)"

If vehicle type is car_economy, car_comfort, or car_premium:
  (Dashboard photo is already in the 2x3 photo grid above — no additional conditional photo needed)

If vehicle type is car_xl (in addition to dashboard photo in grid):
  [Third-row seat photo]
    doc_type: 'third_row_photo'
    Label: "Third-row seat photo (to verify 6–7 seat capacity)"
```

**API call on Next:** `POST /api/vehicle/register` with all vehicle fields.

### Step 2 — Driver Registration
Fields:
- Driver Name: text input — pre-filled from registration
- Address: text input — free text
- Mobile Number: text input — pre-filled from authenticated phone (read-only, greyed out)
- Driving License Number: text input

Document uploads:
```
[Document card — License Scan front]
  → doc_type: license_front
[Document card — License Scan back]
  → doc_type: license_back
```

**Driver photo** (see Screen 4b for full capture spec):
```
[Driver Photo capture — mandatory]
  → doc_type: driver_photo
  Live selfie or passport-style photo. Face-match comparison is performed asynchronously after upload.
  Navigate to Screen 4b for camera-based capture.
```

Note: Mobile Phone Authentication already completed during registration (Supabase phone OTP flow).

**API call on Next:** `POST /api/driver/profile` with address, license fields, and driver_photo_document_id.

---

## Screen 4b: Driver Photo Capture
Route: `app/(main)/(rider)/onboarding/driver-photo` | Auth required: yes (driver, onboarding)

### Layout
```
[Header]: "Take Your Photo"
[Instruction text]: "Take a clear photo of your face. This will be compared with your driving licence photo."

[Live camera preview — full width, square aspect ratio, face outline guide overlay]
  Uses expo-camera with front-facing camera.
  Real-time feedback: face detection circle overlay (green when face detected, grey when not).

[OR divider]: "— or —"

[Upload button]: "Upload Passport Photo"
  Opens device gallery picker. Same validation applied.

[Capture button — circular, bottom center]
  Tap to capture. Flash animation on capture.

[Retake / Use Photo buttons — shown after capture]
  [Retake — secondary]  [Use Photo — primary]

[Validation feedback — inline]
  Resolution < 720p: "Photo is too low resolution. Please retake in good lighting."
  File size < 50KB: "Photo is too small. Please retake."
  File size > 20MB: "Photo is too large."
  Blur detected: "Photo appears blurry. Please hold steady and retake."
  Not JPEG/PNG: "Please use JPEG or PNG format."
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading camera | Screen opens | Request camera permission. If denied: show upload-only flow. |
| Face detected | Camera feed | Green overlay circle. Capture button enabled. |
| No face detected | Camera feed | Grey overlay. Capture button disabled with tooltip: "Position your face in the frame." |
| Photo captured | Tap capture | Show preview with Retake/Use buttons. |
| Validation failed | Auto-check on capture | Show inline error. Stay on preview. |
| Photo accepted | Tap "Use Photo" | Upload to Supabase Storage, call POST /api/driver/document/upload-confirm with doc_type='driver_photo'. Navigate to next step. |
| Face match processing | After upload | Background: call face-match API. Show loading spinner briefly. Result stored in documents.face_match_score. Non-blocking for driver. |

---

## Screen 4c: Vehicle Photos & Video Capture
Route: `app/(main)/(rider)/onboarding/vehicle-photos` | Auth required: yes (driver, onboarding)

### Layout
```
[Header]: "Vehicle Photos & Video"
[Instruction text]: "Take clear photos and a walkaround video of your vehicle. Tap the sample image to see what's expected."

[Photo capture grid — 2 columns, 3 rows]
  Each cell:
    [Sample thumbnail — tappable, from system_config URLs]
      On tap: opens full-screen sample image viewer with description.
    [Capture button with label]
    [Captured state: checkmark + small thumbnail of captured photo]

  Row 1: Front (sample_vehicle_photo_front) | Left Side (sample_vehicle_photo_left)
  Row 2: Right Side (sample_vehicle_photo_right) | Rear (sample_vehicle_photo_rear)
  Row 3: Dashboard (sample_vehicle_photo_dashboard) | Front Seats (sample_vehicle_photo_seats)

  Required: all 6 photos must be captured before proceeding.
  Client validation per photo: ≥ 720p, 50KB–20MB, JPEG/PNG, blur detection.

[Divider]

[Video capture section]
  [Sample video thumbnail — tappable, from system_config.vehicle_video]
    On tap: opens video player showing the sample walkaround video.
  [Record Video button — primary, full width]
    Opens device camera in video mode (expo-camera, rear-facing).
    Max 30 seconds recording. Live duration counter shown.
    [Stop Recording] button appears during recording.
  [Recorded state]: Play preview + Retake button.
  Validation: 15–30s duration, ≥ 720p, ≤ 50MB. Inline errors if outside bounds.

[Continue button — full width, primary]
  Disabled until all 6 photos + 1 video are captured and validated.
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Load sample URLs from system_config. Show shimmer placeholders for sample thumbnails. |
| Sample not configured | system_config URL empty | Skip sample thumbnail for that slot. Show capture button only. Log warning. |
| Photo captured | Tap capture on a cell | Camera opens, photo taken, validation runs. Success: cell shows checkmark. Fail: inline error. |
| Video too short | Recording < 15s | Inline error: "Video must be at least 15 seconds." Block continue. |
| Video too long | Recording > 30s | Auto-stop at 30s. |
| Video too large | File > 50MB | Inline error: "Video file is too large." |
| All complete | 6 photos + 1 video validated | Continue button enables. Tap → uploads all docs via POST /api/driver/document/upload-confirm. |

### Step 3 — Owner Consent
```
[Toggle]: "I own this vehicle" / "Someone else owns it"

If "I own this vehicle" (Path A):
  [Optional] [ ] "Legacy Operator?" tick mark
    If checked: [Upload Uber/Pathao registration screenshot]
      → doc_type: legacy_screenshot
  [Submit button]

If "Someone else owns it" (Path B):
  [Owner Name]: text input
  [Owner Address]: text input
  [Owner Mobile Number]: text input (E.164 format)
  [Optional] [ ] "Legacy Operator?" tick mark
    If checked: [Upload Uber/Pathao registration screenshot]
      → doc_type: legacy_screenshot
  [Owner Consent Scan Copy upload]:
    → doc_type: owner_consent_scan
    → validated: document must be dated within 30 days (configurable business rule; default 30 days)
  [Submit button]
```

**API calls on Submit:**
- `POST /api/driver/owner-consent/submit` with owner details and document IDs.
- Application goes to Admin Approval.

Post-submit screen:
```
[Illustration: hourglass or review icon]
[Heading]: "Application submitted!"
[Body]: "We'll review your documents within 24 hours (configurable review SLA; default 24 hours) and notify you."
[Button]: "Go to home" (disabled — driver home shows waiting state until approved)
```

### Step 4 — Ride Preferences (post-approval, first launch)
After admin approval, on the driver's first launch with `status='active'` or `status='temporary'`, a one-time preference opt-in screen is shown before the home screen.

```
[Header]: "What can you accommodate?"
[Subtitle]: "Select preferences riders may request. You can change these later in Settings."

[Vertical toggle list]
  Fetch from GET /api/reference/preferences
  Each row: [Toggle] Icon + label
  Example:
    [Toggle] 🧳 Large Luggage
    [Toggle] 🤫 Quiet Ride
    [Toggle] ♀ Female-Friendly Driver
    [Toggle] ❄ AC Required

[Skip — text link]: "Set up later"
[Continue button — primary]: "Continue"
```

**API call on Continue:** `POST /api/driver/preferences` with selected preference IDs.
**Skip:** No API call — preferences remain unset. Driver can set them later via Screen 19.
**Show once:** Track with a local flag (AsyncStorage `onboarding_preferences_completed`). If already set, skip straight to home.

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Upload in progress | File selected | Progress bar per file. Next button disabled. |
| Upload failed | Firebase error | Inline retry button per file. |
| Fitness/tax token expired | Date in the past | Warning: "Your [fitness/tax token] is expired. You can still submit but must renew before driving." Allow continue. |
| Consent scan copy > 30 days old | Document date check | Error: "Consent document must be dated within the last 30 days (configurable; default 30 days)." Block submit. |
| Step validation error | Next tapped with incomplete fields | Inline errors below each field. |
| Submit loading | Submit tapped | Full-screen spinner overlay |
| Submit success | API returns 201 | Navigate to post-submit screen (status='pending') |

---

## Screen 5: Package Selection (Driver)
Route: `app/(main)/(rider)/packages` | Auth required: yes (driver, status=active or temporary)

### Layout
```
[Header]: "Buy Calls"

[Balance card — top]
  "Current balance: 0 calls"
  "No active subscription"
  (or shows remaining calls + expiry if subscription exists)

[Package list — scrollable]
  For each package:
  ┌─────────────────────────────────┐
  │ [Package name]        [Price]   │
  │ [X calls] · [Y days]           │
  │ [TRIAL badge if is_trial]       │
  │ [Select button]                 │
  └─────────────────────────────────┘

[Payment method selector]
  PortPos unified gateway — user picks method (bKash/Nagad/Rocket/card) on PortPos checkout page.
  (shown after package selected)

[Proceed to Payment button — primary, full width]
  Disabled until package + method selected
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen open | Skeleton cards (3 placeholders) |
| Empty | No active packages | "No packages available. Contact support." |
| Error | API failure | "Couldn't load packages. Tap to retry." + retry button |
| Package selected | Tap on card | Card border highlights, payment method appears |
| Purchasing | Proceed tapped | Spinner, call `POST /api/package/purchase` |
| WebView open | payment_url returned | `react-native-webview` opens PortPos checkout page |
| Polling | WebView closed | "Confirming payment…" spinner. Poll `GET /api/package/active` every 3s. |
| Success | subscription status=active | Full-screen success: "Package activated! You have X calls." Navigate to driver home. |
| Payment failed | PortPos returns failure | Toast: "Payment not confirmed. If charged, contact support." |
| Compensation pending | DB write failed after payment | "Payment received. Activating your package..." — persistent, auto-resolves when `compensationWorker` processes the `compensation_queue` entry. |

---

## Screen 6: Driver Home (Call Wallet visible)
Route: `app/(main)/(rider)/home` | Auth required: yes (driver)
Replaces/extends GlideX driver home screen. GlideX map and toggle-online components KEPT.

### Changes from GlideX (delta only)
ADD at top of screen, above the map:

```
[Call Wallet card — collapsible]
  ┌──────────────────────────────────────┐
  │  Calls remaining: 42                 │
  │  Expires: May 18, 2026              │
  │  Today used: 3 calls                │
  │  [Buy More Calls] button (right)    │
  └──────────────────────────────────────┘
```

ADD below the Call Wallet card: **Minimum Rate Card**

```
[Minimum Rate card — tappable, navigates to Screen 17]
  ┌──────────────────────────────────────┐
  │  Min per-km: ৳X.XX/km              │
  │  System rate: ৳X.XX/km             │
  │  ~X rides filtered this week        │
  │  [Set minimum] →                    │
  └──────────────────────────────────────┘
```

- If `min_per_km_bdt IS NULL`: shows “Min per-km: System rate” and hides the filtered rides count.
- If `min_per_km_bdt < system_per_km_bdt`: impossible (validation prevents it). If somehow equal: shows “Min per-km: ৳X.XX/km (system rate)”.
- Tapping the card navigates to Screen 17 (Minimum Rate slider).

If `calls_remaining = 0`:
```
  ┌──────────────────────────────────────┐
  │  ⚠ No calls remaining               │
  │  You won't receive ride offers.      │
  │  [Buy Calls Now] — prominent CTA    │
  └──────────────────────────────────────┘
```

If `status = 'pending'` (not yet approved):
```
  ┌──────────────────────────────────────┐
  │  ⏳ Account under review            │
  │  We'll notify you within 24 hours (configurable review SLA; default 24 hours).  │
  └──────────────────────────────────────┘
```

If `status = 'temporary':
```
  ┌──────────────────────────────────────┐
  │  ⚠ Temporary Activation             │
  │  Submit owner consent scan copy     │
  │  within {days} days to keep         │
  │  your account active.               │
  │  [Submit Consent] → consent upload  │
  └──────────────────────────────────────┘
```

### Screen: Driver Home — SOS Button
- A shield icon appears in the driver home header or as a floating action button above the map controls.
- Tapping the icon opens a bottom sheet listing configured emergency contacts by name and phone.
- Each contact row shows the contact name, phone number, and a chevron/action affordance.
- Selecting a contact calls `POST /api/sos/alert` with the user's current location, then opens the native dialer using `Linking.openURL('tel:…')`.
- The bottom sheet uses GoRide card styling with a strong primary accent header and clear action rows.

### Screen: Rider Home — SOS Button
- A shield icon appears on the rider home screen header (same placement pattern as driver home).
- Tapping the icon opens the same SOSModal bottom sheet component (shared between rider and driver).
- The modal contains: "Call Emergency (999)" button, SMS text area, and "Send SOS" button.
- Selecting "Call Emergency" calls `Linking.openURL('tel:…')` with `system_config.sos_police_number` AND triggers `POST /api/sos/alert` in background.
- Selecting "Send SOS" calls `POST /api/sos/alert` with `{lat, lng, message}`.
- SOS contact is managed in rider profile settings via `PATCH /api/user/sos-contact`.

Toggle online is DISABLED until `status` IN ('temporary', 'active') and `calls_remaining > 0`.
*Note: Temporarily active drivers can work but must submit consent scan copy before the 30-day deadline (configurable business rule; default 30 days).*

---

## Screen 7: Ride Offer Card (Driver)
Route: overlay on driver home | triggered by WebSocket `ride:offer` event
Replaces GlideX find-customer screen.

### Layout
```
[@BottomSheet — slides up over map]

  [15-second countdown ring — top center]
    Animated arc, red when < 5s remaining
    Note: 15s is the default; actual duration is configurable via `OFFER_TIMEOUT_MS` env var.

  [Scheduled badge — shown only when is_scheduled=true]
    Icon: calendar | "Scheduled: +30 min" (from pickup_eta_minutes context)
    Background: info blue (#2E42A5) with white text

  [Pickup → Dropoff row]
    📍 [pickup address]
    🏁 [dropoff address]

  [Details row]
    Distance to pickup: ~X.X km  |  ETA: ~X min  |  Trip: X.X km
    Source: `pickup_distance_km`, `pickup_eta_minutes`, `fare_breakdown.distance_km`

  [Rider row]
    Avatar circle with rider first initial | "Requested by Karim" | ⭐ 4.8
    Source: `rider_first_name`, `rider_rating`

  [Preference chips — shown only when preferences array is non-empty]
    Horizontal scroll of small chips: e.g. "🧳 Large Luggage" | "🤫 Quiet Ride"
    Source: `preferences` array from `ride:offer` payload

  [Fare row]
    ৳XX (fare from `driver_fare_bdt` — includes preference surcharges)

  [Two buttons — full width, side by side]
    [REJECT — secondary, outlined]    [ACCEPT — primary, green]

  [Auto-dismiss on countdown timeout — no action = no deduction. Default 15s, configurable via `OFFER_TIMEOUT_MS`.]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Appearing | `ride:offer` received | Sheet slides up, countdown starts. `fetch:confirm` is sent when the driver first interacts with the card (touch on swipe handle, card area, or any button — whichever happens first within the deduction window, default 5s, configurable via `CALL_DEDUCTION_WINDOW_MS`). If no interaction occurs within the deduction window, the offer expires with no deduction. Sound and vibration alert triggered on arrival (configurable via driver settings toggle). |
| Accepted | Accept tapped | Sheet closes, navigate to pickup navigation screen |
| Rejected | Reject tapped | Sheet closes, driver stays online |
| Expired | Countdown elapsed (default 15s; configurable via `OFFER_TIMEOUT_MS`) | Sheet closes with "Offer expired" flash toast. No deduction. |
| Deduction confirmed | Server ACKs `fetch:confirm` | Silent (no UI — ledger entry written server-side) |

### Sound & Vibration Settings
Driver can toggle offer alert sound and vibration from driver settings screen.
- **Settings route:** `app/(main)/(rider)/settings/offer-alerts`
- **Toggle: "Sound on new offer"** — default ON
- **Toggle: "Vibration on new offer"** — default ON
- Implementation: Use `expo-av` for sound, `expo-haptics` for vibration. Both gated by the settings toggle values stored in driver-side Zustand store or `AsyncStorage`. Alerts play only when the offer sheet appears (not on subsequent interactions).

> **Dependency note:** `expo-av` and `expo-haptics` must be added to `package.json` and are not currently listed in `03-TECH-STACK.md`. Include them when updating the tech stack for Phase 7.

---

## Screen 7b: Driver Navigation to Pickup
Route: full screen (replaces driver home map) | triggered when `rides.status = 'driver_arriving'` after match

### Rider-side paired state (image-validated companion)
When rider sees `driver_arriving`, the rider bottom sheet expanded mode must include:
- headline: driver en-route status with ETA sentence,
- vehicle identity line (model/color/plate),
- driver identity card (avatar, rating, contact controls),
- ride/payment summary card,
- fare summary card (trip fare, discounts, total paid),
- prominent cancel ride button at bottom.

The rider expanded sheet is informational and does not alter backend state transitions.

### Layout — Status-Aware (button swaps by ride status)

**When `rides.status = 'driver_arriving'`:**
```
[Full-screen map]
  Pickup marker (red pin)
  Driver location (blue dot, updated every 5s via location:update)
  Route line (Google Maps Directions API polyline)

[Bottom card — fixed]
  "Navigating to pickup"
  [Pickup address]
  ETA: ~X min
  [Rider name + masked phone]

  [I'VE ARRIVED AT PICKUP — primary button, full width]
    → POST /api/ride/:id/arrive
    → Transitions rides.status from driver_arriving to driver_arrived
    → Sets rides.arrived_at = now()

  [Chat icon] [Call icon (via GET /api/ride/:id/contact)]
```

**When `rides.status = 'driver_arrived'`:**
```
[Full-screen map]
  Pickup marker (red pin)
  Driver location (blue dot)

[Bottom card — fixed]
  "You have arrived"
  [Waiting timer — green upward counter MM:SS]
    turns amber after 60 seconds (platform-wide constant from system_config.max_free_wait_seconds) to indicate chargeable time
  [Rider name + masked phone]

  [START RIDE — primary button, full width]
    → POST /api/ride/:id/start
    → Transitions rides.status from driver_arrived to in_progress

  [Chat icon] [Call icon (via GET /api/ride/:id/contact)]
```

> **Timer colour threshold:** The free wait duration is a platform-wide constant: 60 seconds (`system_config.max_free_wait_seconds`). The timer turns amber when `elapsed_seconds > 60`. The value is read from `system_config` — never hardcoded.

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Navigating | `ride:matched` received | Map centers on pickup. Driver location updates forwarded to rider via `location:driver`. |
| I've Arrived tapped | `POST /api/ride/:id/arrive` succeeds | Button swaps to "Start Ride". 60-second countdown begins (green, turns amber after 60s). After 60s, ride auto-transitions to `in_progress`. |
| Start Ride tapped | `POST /api/ride/:id/start` | Transitions to in_progress. Navigate to active ride screen. (Also triggered automatically by scheduler after 60s if driver hasn't tapped.) |
| Rider cancels | `ride:cancelled` received | Show cancellation toast. Return to driver home. |
| Stale timeout | System auto-cancels after `stale_arrived_timeout_minutes` | `ride:cancelled` received. Show "Ride cancelled — rider did not show" toast. Return to driver home. |

### Finding Driver screen contract (rider)
Route: shown after request confirmation while dispatch is active and before match

Layout and behavior:
- Keep map visible with current location pulse.
- Show bottom sheet headline: "Finding you a nearby driver...".
- Show explanatory text under headline.
- Show centered pulse indicator.
- Show outlined destructive-style cancel button in the same sheet.
- Cancel button opens reason selection flow before final cancel confirmation.

---

## Screen 7c: Final Fare Summary (Rider)
Route: BottomSheet or full-screen modal | triggered when `ride_completed` WebSocket event received | Auth required: yes (rider)

### Layout
```
[@BottomSheet or full-screen modal]

  [Heading]: "Your ride is complete"

  [Fare breakdown table]
    Base fare:             ৳XX
    Distance charge:       ৳XX
    Actual wait (X min):   ৳XX
    ─────────────────────
    Subtotal:              ৳XX
    [Preference surcharge — shown only if preference_surcharge_bdt > 0]
      🧳 Large Luggage:    ৳XX
    ─────────────────────
    Driver fare:           ৳XX
    [Promo discount — shown only if promo_discount_bdt > 0]
      SAVE20 (−20%):      −৳XX
    ─────────────────────
    You pay:               ৳XX
    [Platform subsidy — shown only if platform_subsidy_bdt > 0, info line]
      Platform covered:    ৳XX
    [Commission line — shown only if platform_commission_percent > 0%]

  [Final fare — large font]: "Pay ৳XX to driver"

  [CTA button]: "OK — Got it"
    → Dismisses sheet, navigates to rating screen
```

### Notes
- All fare amounts are displayed in BDT (converted from integer paisa for display only).
- The preference surcharge section shows each selected preference with its charge. Source: `ride/:id/details → preferences[]`.
- The promo section mirrors the booking-time breakdown. Source: `ride/:id/details → promo`.
- The commission line is only shown if `platform_commission_percent > 0%`. At 0% (default), the rider sees only the fare breakdown without any commission mention.
- The "Pay ৳XX to driver" amount is always `rider_payable_bdt` — what the rider actually pays (driver_fare_bdt minus promo discount). Commission is a driver-platform settlement.

### 7d. Cancel Ride Reason Selection (image-validated)
Route: modal/full-screen form entered from cancel action

Layout contract:
- Header with close icon and title "Cancel Ride".
- Prompt: "Why are you cancelling?".
- Single-select vertical radio list with standard reason set.
- Primary confirm button pinned at bottom.

Interaction contract:
- Confirm is disabled until one reason is selected.
- If `other` is selected, show required text field before enabling confirm.

### 7e. Ride Cancelled Confirmation (image-validated)
Route: post-cancel success confirmation modal/full-screen

Layout contract:
- Success icon, confirmation headline, explanatory body, and single OK CTA.

Messaging rule:
- If rider had wallet/pre-authorized amount: include refund copy.
- If no in-app payment was captured (cash flow): show generic cancellation confirmation without refund sentence.

### 7f. Arrival Summary + Rating Entry (image-validated)
Route: after `ride_completed` before final closeout

Layout contract:
- Arrival confirmation card (destination title + address).
- Trip metrics mini-cards (duration, distance, avg speed).
- Mood selector row (optional metadata capture).
- Primary action for finishing this stage.
- Map context behind this screen is intentionally dimmed/blurred to keep trip context while focusing completion actions.

### 7g. Driver Rating + Optional Tip + Thanks (image-validated)
Route: chained post-ride sequence

Required sequence:
1) Driver rating screen with 1-5 stars and fare/payment detail card.
2) If 5-star (or feature rule): optional tip selection grid + custom amount + skip/pay actions.
3) Final thanks confirmation screen with single OK action.

Rating detail behavior:
- Rating screen supports an expandable fare detail panel with a show/hide details toggle.
- Expanded state must show ride label, payment method, trip fare, discount row, and total paid.

Tip behavior (image contract):
- Tip chips are fixed preset amounts plus custom amount entry.
- Selected chip uses primary accent fill while other chips stay outlined.
- Tip footer copy must clarify wallet charge and driver share policy.
- CTA row contains both `Skip` and `Pay Tip` actions.

Scope guard:
- Tip payment execution must respect current product payment scope.
- If tip processing is disabled in MVP, keep UI as non-transactional placeholder or hide by config.

### 7h. In-Ride Communication States (image-validated)
Route: from driver-arriving/heading states via contact actions

Driver information screen:
- Full profile card with avatar, display name, phone number, and quick copy action.
- Stats cards for rating, ride orders, and years of experience.
- Vehicle metadata rows: member since, car model, color, plate number.
- Sticky bottom CTA pair: `Call` (secondary) and `Chat` (primary).

Chat screen:
- Header actions include voice call and video call shortcuts.
- Conversation supports text bubbles plus inline image attachments.
- Composer includes emoji trigger, attachment trigger, and send button.

Voice/video call overlays:
- Full-screen call surfaces with participant identity, active call timer, and explicit end-call action.
- Voice call controls include at least speaker and microphone toggles.
- Video call shows local preview (picture-in-picture style) with camera toggle plus audio controls.

---

## Screen 8: Fare Breakdown (Rider — before confirm)
Route: modal/sheet shown after `POST /api/ride/request` returns | Auth required: yes (rider)
Adds fare breakdown display that GlideX doesn't have.

### Screen-by-screen deep pass A (image-validated)

#### 8A. Rider Home — Searching User Location
Route: rider home map idle/searching state before destination confirmation

Layout contract:
```
[Map canvas full-screen]
  [Top-right layers button]
  [Bottom-right recenter button]
  [User avatar at current location]
  [Concentric pulse rings around current location in accent green]

[Bottom mini-sheet]
  Headline: "Searching your location..."
  Center pulse indicator (accent ring)

[Bottom tab bar visible]
  Home (active), Promos, Activity, Account
```

Style tokens:
- Light: sheet background #FFFFFF, text #212121, pulse accent #0CC25F.
- Dark: map darkened, sheet background #181A20/#1F222A, text #FFFFFF/#EEEEEE.

Behavior contract:
- This state appears while GPS fix is stabilizing or while user current-location lookup is running.
- Tab bar remains visible and interactive in this state.
- Map remains visible and interactive; no full-screen blocking loader.

#### 8B. Fare Options — Collapsed and Expanded Bottom Sheet
Route: rider home after pickup/dropoff set and route preview drawn

Collapsed mode requirements:
- Show top route card with pickup and dropoff rows.
- Show route polyline and origin/destination markers on map.
- Show at least top 3 vehicle options as selectable cards with icon, ETA range, passenger count, and price.
- Show payment row and promo row directly above primary CTA.
- Primary CTA uses selected vehicle label, for example: "Book GoRide Car".

Expanded mode requirements:
- Keep top route card pinned.
- Expand to long list of vehicle options without obscuring route context completely.
- Preserve selected option styling while scrolling.
- Selection highlight: border/accent emphasis using #0CC25F and soft green background tint.

Data mapping requirements:
- ETA text maps to dispatch estimate field.
- Passenger count maps to vehicle_type seating metadata.
- Price label maps to fare estimate for selected vehicle_type.
- Payment row maps to currently selected payment method.

#### 8C. Schedule Ride Flow (image-validated)
Route: from fare sheet action into schedule picker and confirmation states

Schedule picker contract:
- Bottom-sheet modal with title "Schedule a Ride".
- Horizontal segmented control with options: Now, +15 min, +30 min, +45 min, +60 min.
- The rider selects one preset offset; the app computes `scheduled_at = now() + offset`.
- Secondary action: clear selection / choose Now.
- Dual CTA footer: secondary cancel + primary confirm schedule.

Applied schedule state in fare sheet:
- Selected time is shown as a badge on the confirm-ride screen, e.g. "Scheduled: +30 min" or the exact computed time.
- Primary CTA label changes to "Schedule {selectedVehicleLabel}" when a preset is selected.
- Fare cards remain selectable after schedule set.

Scheduling progress state:
- After submit, show map with route retained and bottom status panel: "Scheduling your ride..." with pulse indicator.

Scheduled success state:
- Show confirmation modal with calendar/status icon, final scheduled datetime, and single acknowledge CTA.
- Confirmation copy points rider to Activity screen for scheduled rides.

#### 8D. Promo and Payment Method Flow (image-validated)
Route: from fare sheet rows "Promos / Vouchers" and "Payment"

Promo list screen contract:
- Top promo-code entry card with input + redeem button.
- Filter chips (All, Discount, Cashback, Partnership).
- Scrollable promo cards with banner art and promo metadata.

Promo status modal contract:
- Invalid code: destructive icon + message + dismiss action.
- Valid code: success icon + message + two actions (Use Later, Use Now).

Promo details screen contract:
- Full promo metadata: code, valid date window, minimum spend, terms, and usage steps.
- Copy action for promo code and primary "Use Now" CTA.

Payment method screen contract:
- Single-select list of saved/default methods.
- Selected method card highlighted with accent border and check icon.
- Support wallet and cash methods for MVP; additional providers can be listed but feature-gated by platform capability.

Applied promo state in fare cards:
- Show discounted price as primary value and original price as strikethrough secondary value.
- Promo badge/tag visible in fare card and in promo row.

#### 8E. Activity Tabs and Ride Details Lifecycle (image-validated)
Route: Activity tab and Ride Details drill-down screens

Activity list shell contract:
- Header title "Activity" with segmented tab chips.
- Tabs include Ongoing, Scheduled, Completed, Canceled (and Top Up when wallet history is enabled).
- Tab change updates list content in place; no full-screen loading flash.

Ongoing tab contract:
- Ongoing card shows destination title, live amount/payment source, route preview (pickup and dropoff rows), and primary "Track Route" CTA.
- "Track Route" re-enters live tracking map for the active ride.

Scheduled tab contract:
- Scheduled rows show destination, created timestamp, and scheduled time/date aligned right.
- Tapping row opens Ride Details (scheduled state).

Scheduled Ride Details contract (pre-driver-found):
- Top summary card: "Your Scheduled Ride" + scheduled datetime.
- Informational banner: "We'll notify you when a driver's found".
- Vehicle fare card includes discounted/current fare and original strikethrough fare when promo is active.
- Details block includes status chip (Scheduled), payment method, date/time, transaction ID, booking ID.
- Footer CTAs: Share Receipt (primary outline) and Cancel Ride (destructive outline).

Driver found modal over scheduled details:
- Modal copy: "We've found the driver!" with driver avatar/name/rating/vehicle snapshot.
- Single acknowledge CTA "Got It" returns rider to scheduled details updated with driver card.

Scheduled Ride Details contract (post-driver-found):
- Replace info banner with in-page driver card and contact action.
- Preserve existing booking/payment/fare breakdown cards and receipt sharing action.

Completed tab + details contract:
- Completed list rows show final paid amount and payment method token.
- Completed details include: driver card, Completed status chip, payment metadata, transaction/booking IDs, fare breakdown with optional tip row, and total paid.

Canceled tab + details contract:
- Canceled list rows include red secondary text "Canceled & Refunded".
- Canceled details include status chip "Canceled & Refunded" and final paid summary (after discount/refund calculations).

Receipt share sheet contract:
- Share action opens native share sheet as bottom sheet overlay.
- Payload contains generated receipt image/file name with transaction and booking references.
- Include recent contacts row and app targets (for example WhatsApp/Facebook/Instagram/Telegram) as provided by platform share targets.

#### 8F. Wallet Top Up Flow (image-validated)
Route: Account wallet card and Activity -> Top Up tab

Entry points:
- Account screen wallet card exposes current available balance and Top Up CTA.
- Activity includes Top Up tab showing top-up history rows.

Top Up tab contract:
- Rows use plus icon avatar, title "Top Up", timestamp, amount, and payment source label.
- Row tap opens Top Up Details for selected transaction.

Top Up details contract:
- Hero card shows top-up amount, wallet destination label, and source method (masked when card-based).
- Metadata block includes status chip (Completed), payment method, date/time, and transaction ID.
- Footer action includes Share Receipt CTA.

Top Up amount entry contract:
- Amount field supports direct numeric entry with keypad.
- Preset amount chips (5/10/20/25/50/75/100/150/200 style grid) update the amount field on tap.
- Continue CTA enabled only when amount is valid and within configured min/max.
- Available balance shown under amount entry and updates after successful top up.

Choose top up method contract:
- Single-select payment method list with visual selected state (accent border + check icon).
- Supports wallets and cards shown in one list.
- Header add action allows adding a new payment method.
- Primary footer CTA includes bound amount in label (example: "Confirm Top Up - $250.00").

Top up success modal contract:
- Blocking success modal with check icon, amount-aware success copy, and single OK action.
- On OK, app returns to wallet context and refreshed balance/history state.

#### 8G. Saved Addresses Flow (image-validated)
Route: Account -> Saved Addresses

Saved Addresses list contract:
- List displays address cards with label (Home/Office/Apartment/custom), full formatted address, share action, and overflow menu trigger.
- Persistent footer CTA: Add Address.

Add Address screen contract:
- Map-first layout with search input and movable pickup pin context.
- Bottom sheet includes selected place preview card, required Name field, optional Address Details field, and actions Cancel/Save Address.
- Save action enabled only when location and name are valid.

New address added state:
- After save success, return to Saved Addresses list with newly created card appended or inserted by configured sort order.

Address card overflow menu contract:
- Menu options: Edit and Delete.
- Edit opens same address form prefilled with existing data.
- Delete opens destructive confirmation bottom sheet.

Delete confirmation contract:
- Bottom sheet headline "Delete Address" with selected address preview and dual actions (Cancel / Yes, Delete).
- Destructive confirmation removes item from list immediately on success.

Deleted feedback contract:
- Show success toast/banner "Address deleted!" with Undo action.
- Undo restores deleted card if pressed within timeout window.

#### 8H. Settings and Payment Method Management (image-validated)
Route: Account -> Settings stack

Personal Info screen contract:
- Editable profile avatar with image edit affordance.
- Editable fields: full name, email, phone number (country selector), gender selector, date of birth picker.
- Field controls use tokenized input styling consistent with account forms.

Notifications screen contract:
- Preference list rendered as labeled toggle rows.
- Categories include lifecycle-critical channels (ride status, safety/security) and marketing/content channels.
- Toggle changes persist immediately with optimistic state and rollback on failure.

Account & Security contract:
- Security toggles for biometric/face and second-factor methods.
- Action rows for change password and device management.
- Destructive account actions (deactivate/delete) shown separately with warning tone.

Linked Accounts contract:
- Provider rows (Google/Apple/Facebook/Twitter style) show connected vs connect state.
- Connect action launches provider auth flow; connected state supports unlink path via details/action sheet.

Data & Analytics contract:
- Action rows for data-usage preferences, ad preferences, and download-my-data request flow.
- Each row routes to dedicated child screen or request wizard.

Payment Methods list contract:
- Displays connected wallet providers and masked card instruments in a single list.
- Footer CTA "Add New Payment" opens add-payment form.

Add New Payment contract:
- Form fields: card number, account holder name, expiry date, CVV.
- Optional camera/scan affordance for card capture.
- Supported-network strip displayed for user guidance.
- Save action validates fields and returns to Payment Methods list with new instrument visible.

#### 8I. Appearance, Help/Support, and Logout (image-validated)
Route: Account -> App Appearance / Help & Support / Logout

App Appearance root contract:
- Two action rows: Theme and App Language, each showing current selected value on the right.
- Row tap opens dedicated selector screen/sheet.

Theme selection contract:
- Bottom sheet with single-select radio options: System Default, Light, Dark.
- Current selection pre-highlighted.
- Footer actions: Cancel and OK.
- Changes apply only on confirm (OK), not on transient selection.

App Language contract:
- Full list selector with checkmark on active language.
- Includes at minimum: English, Spanish, Mandarin Chinese, Hindi, Arabic, Bengali, Portuguese, Russian, Japanese, German, French, Urdu.
- Selection persists immediately and updates visible language label in appearance root.

Help & Support hub contract:
- Link-list surface with primary routes: FAQ, Contact Support, Privacy Policy, Terms of Service.
- Additional routes can include Partner, Job Vacancy, Accessibility, Feedback, About Us, Rate Us, Visit Website, Social links.

FAQ screen contract:
- Search input with category chips.
- Accordion list where one item can expand at a time by default.
- Expanded item reveals full answer body while retaining list context.

Contact Support contract:
- Channel cards for customer support and external channels (website, WhatsApp, Facebook, X, Instagram).
- Each card opens native deep link or in-app webview depending on channel type.

Privacy Policy / Terms screens contract:
- Scrollable long-form legal content with effective date header and sectioned typography.
- Content source should be remotely configurable with cached fallback.

Logout confirmation contract:
- Destructive confirmation bottom sheet with Cancel and Yes, Logout actions.
- Confirm action clears session and returns to auth entry route.

### Layout
```
[@BottomSheet]

  [Vehicle type selector — horizontal scroll]:
    8 vehicle type chips with icons:
    🏍️ Bike Basic | Bike Standard | Bike Plus
    🛺 CNG
    🚗 Car Economy | Car Comfort | Car Premium | Car XL
    Active chip highlighted. Tap to change type.
    Each chip shows fare range preview (e.g., "৳25–৳350"; ranges computed from the `pricing` table — admin-configurable)

  [Heading]: "Fare estimate for your ride"

  [Breakdown table]
    Base fare:          ৳30
    Distance charge:    ৳38
    Wait charge:         ৳5
    ─────────────────────────
    Total:              ৳73
    *(Values shown are examples; actual fares sourced from the `pricing` table — admin-configurable)*

  [Note]: "Final fare may vary based on actual wait time. Cash payment to driver."

  [Preference chips — optional, shown only when preferences are available]
    Loading: 3–4 skeleton pill shapes (shimmer animation)
    Loaded: Horizontal scroll: e.g. 🧳 Large Luggage | 🤫 Quiet Ride | ♀ Female-Friendly | ❄ AC Required
    Tap to toggle. Selected chips have accent green border.
    Some chips show a surcharge badge (e.g. "+৳5").
    Error: Inline toast "Couldn't load preferences" with retry action. Preferences omitted from fare calculation.
    Source: `GET /api/reference/preferences`

  [Promo code input row]
    [Text input: "Enter promo code"] [Apply button]
    If valid promo applied: shows green badge "SAVE20 applied — 20% off" with remove (×) action.
    If invalid: red error toast below input.
    Source: `POST /api/promo/validate`

  [Promo discount breakdown — shown only when promo is applied]
    Original fare:           ৳73
    Promo discount (−20%):   −৳14.60
    ─────────────────────────
    You pay:                 ৳58.40
    Driver receives:         ৳73
    Platform subsidy:        ৳14.60

  [Confirm button — primary, full width]: "Confirm Ride"
  [Cancel link — below]: "Cancel"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | POST in flight | Sheet shows skeleton rows |
| Shown | fare_breakdown returned | Display values |
| Zone error | 422 `outside_zone` | Sheet does not open. Toast shown on the **map screen** (not inside the fare sheet which never opens): "Sorry, we only operate in Dhaka currently." Rider should reposition the pickup pin. |
| Rate limited | 429 | Toast: "You've made too many requests. Please wait before trying again." |
| Active ride | 409 | Toast: "You already have an active ride request." |

**Display label mapping:** "Base fare" ← `base_fare_bdt`, "Distance charge" ← `distance_charge_bdt`, "Time charge" ← `time_charge_bdt`, "Minimum fare" ← `floor_fare_bdt` (shown only when floor applies, i.e. `total_bdt === floor_fare_bdt`). All values sourced from `lib/fareCalc.ts`; admin-configurable via `POST /api/admin/pricing`. Values are converted from paisa to taka for display (divide by 100).

---

## Screen 9: Call Ledger / Transaction History (Driver)
Route: `app/(main)/(rider)/call-ledger` | Auth required: yes (driver)

### Layout
```
[Header]: "Call History"

[Filter bar]
  [Chips]: All | Accepted | Ignored | Refunded | Filtered
  [Vehicle type dropdown]: Bike Basic, Bike Standard, Bike Plus, CNG, Car Economy, Car Comfort, Car Premium, Car XL
  [Date range picker]: From / To

[Summary card]
  This period: X accepted, Y missed, Z filtered by your minimum rate
  [Optional subtitle]: "Showing results for the selected filters."

[Balance summary card]
  Current balance: 42 calls
  Subscription expires: May 18, 2026
  **Note:** If `balance_after = -1` (unlimited subscription), display "Unlimited" instead of the numeric balance.

[Transaction list — paginated]
  For each entry:
  ┌──────────────────────────────────────┐
  │ [event icon] [reason text]  [delta]  │
  │ [ride ID truncated]    [timestamp]  │
  └──────────────────────────────────────┘

  event icons:
    deduction → red minus circle
    refund → green plus circle
    credit → blue star circle
    initial_load → gray package icon
    expiry_writeoff → ⏳ hourglass — "Call written off on package expiry"

[Load more button — bottom]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen open | Skeleton rows |
| Empty | No transactions | "No call history yet. Purchase a package to get started." + CTA |
| Error | API fail | "Couldn't load history. Tap to retry." |
| Loaded | Data returned | List renders |

---

## Screen 10: Admin — Driver Approval Queue (Web only)
Route: `app/(admin)/queue` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Sidebar nav — left, fixed]
  - Queue (active)
  - Packages
  - Zones & Pricing
  - Monitoring

[Main content — right]

  [Page heading]: "Driver Approval Queue"
  [Queue depth]: "12 pending · 2 overdue (>24h)"

  [Filter tabs]: All | Pending | Temporary | Rejected

  [Table]
    | Name | Phone | Vehicle Type Claimed | Vehicle Age | Submitted | Status | Days pending | Action |
    Each row: click → opens detail drawer
    Vehicle Age column: shows registration date and computed age (e.g. "3 years, 2 months")
    If vehicle < 1 year old: ⚠️ warning icon shown in Vehicle Age column

  [Detail drawer — slides in from right]
    Driver info: name, phone, vehicle type, registration
    Vehicle registration date + age display
    If vehicle < 1 year old (threshold from `lib/vehicleTypes.ts` `min_age_years`; configurable): warning banner — "⚠️ Vehicle registered less than 1 year ago (BRTA regulation)"
    Documents: image thumbnails (Firebase presigned URLs)
      Click thumbnail → full-screen image viewer
      [BRTA Certificate row] → doc_type='brta_certificate'
    [Downgrade button — orange] → opens dropdown to select lower vehicle type + mandatory reason textarea
    [Approve button — green]
    [Reject button — red → opens reason input modal]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No pending drivers | "Queue is clear! All drivers reviewed." |
| Overdue rows (standard SLA) | submitted_at > 24h ago (configurable review SLA; default 24 hours) | Row highlighted red. Badge on sidebar nav. |
| Overdue rows (fast-track SLA — legacy operator) | is_legacy_operator=true AND submitted_at > 12h ago (configurable fast-track SLA; default 12 hours) | Row highlighted **orange** (distinct from standard red overdue). Badge on sidebar nav shows separate count for fast-track breaches. Label: "⏱ 12h SLA breach (legacy)". |
| Vehicle < 1 year old (threshold from `lib/vehicleTypes.ts`) | Registration date < 1 year ago | ⚠️ warning icon in table row. Warning banner in detail drawer. Admin may reject with BRTA reason. |
| Downgrade | Downgrade clicked | Dropdown shows lower vehicle types. Admin selects type + enters mandatory reason. Confirm → `POST /api/admin/driver/downgrade` with body `{driver_id, new_vehicle_type, reason}`. Toast: "Vehicle type downgraded." |
| Approve loading | Approve clicked | Row shows spinner, buttons disabled |
| Approve success | API 200 | Row disappears from pending list. Toast: "Driver approved." |
| Reject | Reject clicked | Modal: "Rejection reason" textarea (required) → confirm → API call |

---

## Screen 11: Admin — Package Management (Web only)
Route: `app/(admin)/packages` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Call Packages"
[+ Create Package button — top right]

[Table]
  | Name | Calls | Days | Price (৳) | Trial | Active | Actions |
  Actions: Edit (pencil icon) | Deactivate (toggle)

[Create/Edit modal]
  Name: text input
  Calls: number input (-1 = unlimited)
  Duration (days): number input
  Price (BDT, in taka): number input → stored as paisa
  Is trial package: checkbox
  [Save button]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No packages | "No packages created yet." + Create CTA |
| Create modal | + button | Modal opens, first field autofocused |
| Save loading | Save clicked | Button spinner |
| Save success | API 201 | Modal closes, table row appears, toast: "Package created." |
| Deactivate | Toggle off | Confirmation dialog: "Deactivate this package? Drivers cannot purchase it." |

---

## Screen 12: Admin — Zone & Pricing Setup (Web only)
Route: `app/(admin)/zones` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Operational Zone"

[Map — full width, interactive]
  Draw polygon tool: admin clicks to place points, close polygon.
  Existing zone shown as overlay.

[Zone name input]: text field below map

[Set as Active toggle]

[Save Zone button]

---

[Pricing section — below map]
[Table]: Vehicle Type | Base (৳) | Per km (৳) | Per min wait (৳) | Free wait (min) | Edit
  One row per vehicle type (bike_basic, bike_standard, bike_plus, cng, car_economy, car_comfort, car_premium, car_xl)
  Edit: inline or modal
```

---

## Screen 13: In-App Chat (Matched Ride)
Route: `app/(main)/(customer)/chat` or `app/(main)/(rider)/chat` | Auth required: yes (rider or matched driver)

### Layout
```
[SafeAreaView — full screen]

  [Header bar]
    Back button | "Chat with [Name]" | Phone icon (native dialer fallback)
    Phone icon → GET /api/ride/:id/contact → Linking.openURL('tel:' + phone)

  [GiftedChat component]
    Messages: load from GET /api/ride/:id/messages
    On send: POST /api/ride/:id/message
    Load earlier: pagination via `before` cursor
    Avatar: sender profile image (or initial letter fallback)
    Timestamps: shown per message group

  [Input bar] (hidden when chat_closed)
    Text input (max 1000 chars) + Send button
    Placeholder: "Type a message..."
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen open | Skeleton messages (3 placeholders) |
| Loaded | Messages fetched | GiftedChat renders message list |
| Sending | User taps send | Optimistic append; POST to API on success |
| Send failed | API error | Retry toast on message; message shown with error indicator |
| Chat closed | Ride completed/cancelled | Input bar hidden. "This ride has ended." banner at bottom. Messages still viewable. |
| Empty | No messages yet | "Start the conversation" centered text |
| Error | API failure | "Couldn't load messages. Tap to retry." |

### Real-time updates
- WebSocket `chat:message` event → append to GiftedChat immediately
- Optional: `chat:typing` event → show typing indicator

### Notes
- Both rider and driver screens use the same GiftedChat component.
- The "Call" button is shown to BOTH parties but uses the full phone for the rider's view and is HIDDEN for the driver (driver cannot call rider). If driver needs to contact rider, in-app chat is the only channel.
- Messages persist for 30 days (configurable document retention period; default 90 days). Admin can export for disputes.

---

## Screen 14: Forced Update (Blocking)
Route: `app/(auth)/update-required` | Auth required: no
Shown when `Constants.expoConfig.version < min_app_version` from `GET /api/app-config`.

### Layout
```
[SafeAreaView — full screen, centered]

  [Illustration: update arrow or app icon]

  [Heading]: "Update required"
  [Body]: "Your app version is outdated. Please update to continue using Ride."

  [Primary button]: "Download Update"
    On tap: Linking.openURL(apk_download_url)

  [Secondary text]: "Current version: {local} → Required: {min}"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Blocking | app-config.min_app_version > local version | Screen is non-dismissable. User cannot proceed without updating. |
| Download failed | APK link broken | Show error: "Download failed. Call support at {EXPO_PUBLIC_SUPPORT_PHONE}" |

---

## Screen 15: Support Contact
Not a separate screen — a persistent element on key error/failure screens.

Displayed on:
- Payment failure screens (package purchase)
- Account suspension screen
- Call wallet when balance = 0 and no subscription active
- Any persistent error state

Component:
```
[Contact Support button]
  Icon: phone
  Label: "Call Support: {EXPO_PUBLIC_SUPPORT_PHONE}"
  On tap: Linking.openURL('tel:' + process.env.EXPO_PUBLIC_SUPPORT_PHONE)
```
Display the value of `process.env.EXPO_PUBLIC_SUPPORT_PHONE` as a tappable phone link.

---

## Screen 16: Alternatives Sheet (Rider — no drivers available)
Route: Bottom sheet overlay on ride request screen
Shown when: `rides.status = 'no_drivers'` and `alternatives` array is non-empty.

### Layout
```
[Bottom Sheet]
  [Header]: "No [vehicle type] drivers nearby"
  [Subheading]: "Try one of these instead:"

  [Alternative cards — scrollable list]:
    Each card:
      [Vehicle type icon] [Vehicle type name]
      [Fare estimate]: "৳XX"
      [Available drivers]: "X drivers nearby"
      [Select button]

  [Footer]:
    [Cancel button]: "Cancel request"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Sheet appears | Show skeleton cards |
| Alternative selected | Rider taps Select | POST /api/ride/request with new type. Sheet dismisses. New ride created. |
| Cancel | Rider taps Cancel | Ride cancelled (status='no_drivers'). Sheet dismisses. |
| Timeout | 30s from sheet appearance | Auto-dismiss. Ride expires. |

---

## Screen 17: Driver Minimum Rate (Driver settings)
Route: `app/(main)/(rider)/settings/min-rate`
Auth required: yes (driver, status=active or temporary)

### Layout
```
[Header]: "Minimum per-km rate"
[System rate label]: "System rate: ৳XX.XX/km"
[Slider]: computed range from GET /api/driver/slider-config
  - Left label: "৳{lower_bound÷100}/km ({min_ratio×100}%)"
  - Right label: "৳{upper_bound÷100}/km ({max_ratio×100}%)"
  - Thumb indicator: current value in ৳ + % of system rate
  - Snap point: system rate (100%) — slider defaults here if no custom rate set
[Warning banner] (shown only when slider value < system rate): The lower_bound is 70% of
  system rate (default from `platform_config.driver_min_ratio`; admin-configurable), so the slider can go below 100% of the system rate. This warning fires when the
  driver sets a rate below 100% of system. Message: "Rides where the system rate is below your
  minimum will not be offered to you."
[Missed rides stat]: "~X ride offers filtered in the last 7 days due to your minimum rate."
  Source: GET /api/driver/missed-requests (filtered_count_7d field)
[Reset button]: "Reset to system rate"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Fetch `GET /api/driver/slider-config`. Show system rate, slider range, and current `min_per_km_bdt`. |
| Default (no custom rate) | First open | Slider at 100% (system rate). Missed rides count = 0 or hidden. |
| Slider moved | User drags | Real-time update of value display and % indicator. Missed rides preview refreshes. |
| Save | User releases slider | `PATCH /api/driver/me` with `{min_per_km_bdt}`. Toast: "Minimum rate updated." |
| Reset | User taps Reset | `PATCH /api/driver/me` with `{min_per_km_bdt: null}`. Slider snaps to system rate. |
| Error | API fails | Toast: "Failed to update. Try again." |

**Missed ride offer labels:** Missed ride offers shown on this screen include both expired/refunded offers (count against acceptance rate) and filtered offers (do NOT count against acceptance rate). Use distinct visual labels: "⚡ Rate too high" for filtered, "⏰ No response" for expired.

---

## Screen 18: Driver Incentive Dashboard
Route: `app/(main)/(rider)/incentives` | Auth required: yes (driver)
Accessed from driver home or settings tab.

### Layout
```
[Header]: "Incentives"

[Active incentives section]
  For each active incentive:
  ┌──────────────────────────────────────┐
  │  "Complete 20 rides this week"       │
  │  [Progress ring — circular]          │
  │  14 / 20 rides                       │
  │  Reward: +5 bonus calls              │
  │  Ends: May 20, 2026                  │
  └──────────────────────────────────────┘

  Progress ring:
    - SVG/animated arc showing current_progress / target_value
    - Color: accent green (#0CC25F) for progress, grey for remaining
    - Center text: percentage complete

[Completed incentives section]
  Collapsible section header: "Completed (X)"
  For each completed incentive:
  ┌──────────────────────────────────────┐
  │  ✅ "Online 40 hours this month"     │
  │  Completed: May 10, 2026            │
  │  Earned: +10 bonus calls            │
  └──────────────────────────────────────┘

[Summary card]
  Total bonus calls earned: 15
  Source: GET /api/driver/incentives → total_bonus_calls_earned
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Fetch `GET /api/driver/incentives`. Show skeleton cards. |
| No active | No active incentives | Show empty state: "No active incentives right now. Check back later!" |
| Progress update | Ride completed / hour online | Incentive progress updates on next poll or WebSocket push. Progress ring animates. |
| Completed | `current_progress >= target_value` | Card moves to "Completed" section with ✅ badge. Toast: "Incentive completed! +X bonus calls added to your wallet." |

---

## Screen 19: Driver Preference Opt-In
Route: `app/(main)/(rider)/settings/preferences` | Auth required: yes (driver)
Accessed from driver settings.

### Layout
```
[Header]: "Ride Preferences"
[Subtitle]: "Select which preferences you can accommodate. Riders may filter by these."

[Preference list — vertical]
  For each active preference:
  ┌──────────────────────────────────────┐
  │  [Toggle]  🧳 Large Luggage         │
  │            May receive larger items  │
  └──────────────────────────────────────┘
  ┌──────────────────────────────────────┐
  │  [Toggle]  🤫 Quiet Ride            │
  │            No unnecessary chatting   │
  └──────────────────────────────────────┘
  ┌──────────────────────────────────────┐
  │  [Toggle]  ❄ AC Required            │
  │            Confirmed working AC      │
  └──────────────────────────────────────┘

[Save button — primary, full width]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Fetch `GET /api/reference/preferences` + current opt-ins from `GET /api/driver/me` (response includes `preferences` array with `preference_id` and `name` for each opted-in preference). Show toggles. |
| Toggle | User taps toggle | Toggle updates immediately in UI (optimistic). |
| Save | Save button | `POST /api/driver/preferences` with selected preference IDs. Toast: "Preferences updated." |
| Error | API fails | Revert optimistic toggle. Toast: "Failed to update. Try again." |

---

## Screen 20: Admin — Promo Management (Web only)
Route: `app/(admin)/promos` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Promo Codes"
[+ Create Promo button — top right]

[Filter bar]
  [Status]: All | Active | Expired | Inactive
  [Search input]: Search by code or title

[Table]
  | Code | Title | Discount | Max Uses | Times Used | Active | Valid From | Expires | Actions |
  Actions: Edit (pencil) | Toggle Active

[Create/Edit modal]
  Code: text input (uppercase, alphanumeric + hyphens)
  Title: text input
  Description: textarea
  Discount type: segmented control — Percentage | Flat (BDT)
  Discount value: number input
  Max discount (paisa): number input (for percentage type)
  Max uses: number input (blank = unlimited)
  Max uses per rider: number input (default 1)
  Usage interval (hours): number input (blank = no interval)
  Min spend (paisa): number input (blank = no minimum)
  Valid from: datetime picker
  Expires at: datetime picker
  [Save button]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No promos | "No promo codes created yet." + Create CTA |
| Save success | API 201/200 | Modal closes, table refreshes, toast: "Promo saved." |
| Toggle active | Toggle click | Confirmation dialog, then PATCH call |

---

## Screen 21: Admin — Incentive Management (Web only)
Route: `app/(admin)/incentives` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Driver Incentives"
[+ Create Incentive button — top right]

[Filter bar]
  [Status]: All | Active | Ended | Scheduled

[Table]
  | Name | Metric | Target | Reward | Participants | Completed | Active | Period | Actions |
  Actions: Edit (pencil) | Toggle Active

[Create/Edit modal]
  Name: text input
  Description: textarea
  Target metric: dropdown — Completed rides | Online hours | Acceptance rate | Consecutive accepts
  Target value: number input
  Reward (bonus calls): number input
  Vehicle type filter: dropdown — All | (8 vehicle types)
  Starts at: datetime picker
  Ends at: datetime picker
  [Save button]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No incentives | "No incentives created yet." + Create CTA |
| Save success | API 201/200 | Modal closes, table refreshes. On create: eligible drivers auto-enrolled. |
| Toggle active | Toggle click | Confirmation dialog, then PATCH call |

---

## Screen 22: Admin — Preference Management (Web only)
Route: `app/(admin)/preferences` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Ride Preferences"
[+ Create Preference button — top right]

[Table]
  | Name | English Label | Bengali Label | Surcharge (৳) | Affects Matching | Drivers Opted In | Active | Actions |
  Actions: Edit (pencil) | Toggle Active

[Create/Edit modal]
  Machine name: text input (lowercase, underscores)
  English label: text input
  Bengali label: text input
  Icon: text input (icon name)
  Surcharge (paisa): number input (default 0)
  Affects matching: checkbox (default false)
  [Save button]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No preferences | "No preferences defined yet." + Create CTA |
| Save success | API 201/200 | Modal closes, table refreshes |
| Toggle active | Toggle click | Confirmation dialog, then PATCH call |

---

## Screen 22b: Admin — Referral Campaign Management (Web only)
Route: `app/(admin)/referral-campaigns` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Referral Campaigns"
[+ Create Campaign button — top right]

[Table]
  | Name | Referrer % | Referee % | Max/Referrer | Max Total | Active | Actions |
  Actions: Edit (pencil) | Toggle Active

[Create/Edit modal]
  Name: text input
  Referrer reward (%): number input (1-100)
  Referee reward (%): number input (1-100)
  Max uses per referrer: number input
  Max uses per campaign: number input (blank = unlimited)
  [Save button]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No campaigns | "No referral campaigns created yet." + Create CTA |
| Save success | API 201/200 | Modal closes, table refreshes, toast: "Campaign saved." |
| Toggle active | Toggle click | Confirmation dialog. Only 1 can be active — warn if another is active. |

---

## Screen 22c: Admin — Point Offer Management (Web only)
Route: `app/(admin)/point-offers` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Point Offers"
[+ Create Offer button — top right]

[Table]
  | Title | Points Required | Reward Type | Reward Value | Active | Actions |
  Actions: Edit (pencil) | Toggle Active

[Create/Edit modal]
  Title: text input
  Points required: number input
  Reward type: dropdown — Package Grant | Wallet Credit
  Reward value: text input (package ID or BDT paisa amount)
  [Save button]
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page open | Table skeleton |
| Empty | No offers | "No point offers created yet." + Create CTA |
| Save success | API 201/200 | Modal closes, table refreshes, toast: "Offer saved." |
| Toggle active | Toggle click | Confirmation dialog, then PATCH call |

---

## Screen 23a: Rider Wallet
Route: `app/(main)/(customer)/wallet` | Auth required: yes (rider)

### Layout
```
[Header]: "My Wallet"

[Balance card — GoRide elevated surface]
  Available Balance: ৳XX.XX
  "Referral rewards and platform credits"
  [Top Up button — primary green CTA]

[Recent transactions]
  Each row: type icon | description | amount (৳ green if credit, red if debit) | date
  Source: GET /api/rider/wallet

[Empty state]: "No transactions yet. Top up your wallet or earn referral rewards!"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Balance skeleton, transaction shimmer |
| Top Up | Tap Top Up | Navigate to /wallet/top-up |
| Pull refresh | Pull down | Refetch GET /api/rider/wallet |

---

## Screen 23: Driver Wallet Payout
Route: `app/(main)/(rider)/wallet/payout` | Auth required: yes (driver)

### Layout
```
[Header]: "Withdraw Funds"
[Balance card]: "Available Balance: ৳XX" (Source: GET /api/driver/wallet)

[Withdraw form]
  Amount (৳): number input
  Method: PortPos — select bKash / Nagad / Rocket / bank on checkout page
  Account Number: text input

[Submit Button]: "Request Payout"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Fetch balance. Show skeleton. |
| Submit | Tap Submit | POST payout request. Toast: "Payout requested successfully." |
| Insufficient | Amount > Balance | Disable Submit. Show inline error. |
| Minimum | Amount < 500 BDT | Disable Submit. Show "Minimum payout is ৳500." |

---

## Screen 24: Referral Program
Route: `app/(main)/(rider)/referral` (and customer equivalent) | Auth required: yes (user)

### Layout
```
[Header]: "Invite & Earn"
[Hero Image]: Graphic of friends/sharing.

[Reward text]: "Give 50% off a ride, get ৳50 wallet credit."

[Referral Code card]
  Your code: RIDE-A3F9B2
  [Copy Code button]
  [Share button] → Opens native share sheet

[Stats]
  Friends Invited: X
  Total Earned: ৳Y
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Fetch GET /api/referral/code. |
| Share | Tap Share | Open native iOS/Android share intent. |

---

## Screen 25: Points & Rewards
Route: `app/(main)/(customer)/points` (and driver equivalent) | Auth required: yes (user)

### Layout
```
[Header]: "My Points"

[Points Balance card]
  Total Points: 1,250 🏆
  "You earn 1 point for every ৳1 spent."

[Tab selector]: Offers | History

[If Offers selected]
  Scrollable list of offers (GET /api/points/offers)
  Each card:
    "50 BDT Wallet Credit"
    Cost: 5,000 points
    [Redeem Button]

[If History selected]
  Scrollable list of transactions (GET /api/user/points)
  Each row: "+250 points - Ride Completed - May 10"
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Screen opens | Fetch points and offers. |
| Redeem | Tap Redeem | Modal confirmation. Then POST /api/points/redeem. |
| Success | Redemption OK | Toast: "Points redeemed! Reward added." |
| Insufficient | Points < Cost | Disable Redeem button on card. |

---

## Screen 22d: Admin — Vehicle Model Management (Web only)
Route: `app/(admin)/vehicle-models` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Vehicle Models"
[Description]: "Manage the vehicle model reference database used for auto-classification during driver onboarding."

[Search bar]: Filter by brand, model, or vehicle type
[Vehicle type filter]: Dropdown — all 8 types + "All"
[Active filter]: Dropdown — Active / Inactive / All
[Add Model button — primary green]

[Table]
  Columns: Brand | Model | Year Range | Vehicle Type | AC | Seats | CC Range | Active | Actions
  Each row: edit icon, toggle active switch
  Source: GET /api/admin/vehicle-models
  Pagination: cursor-based

[Add/Edit Modal]
  Fields: Brand (text), Model (text), Year Start (number), Year End (number),
          Default Vehicle Type (dropdown — 8 values), Has AC (true/false/null),
          Passenger Seats (number), Engine CC (number), Is Active (toggle)
  Create: POST /api/admin/vehicle-model
  Update: PATCH /api/admin/vehicle-model/:id
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page opens | Table skeleton |
| Empty | No models | "No vehicle models configured. Add models to enable auto-classification."
| Save success | API 201/200 | Modal closes, table refreshes, toast: "Model saved."
| Toggle active | Toggle click | Confirmation dialog, then PATCH call |

---

## Screen 22e: Admin — Sample Media Configuration (Web only)
Route: `app/(admin)/sample-media` | Auth required: yes (admin role) | Platform: web only

### Layout
```
[Page heading]: "Onboarding Sample Media"
[Description]: "Upload reference images and video shown to drivers during onboarding to illustrate expected quality."

[Media cards — 2x4 grid]
  Each card:
    [Current thumbnail — tappable to view full size]
    Label: e.g. "Vehicle Front Photo"
    [Upload new] button
    [Remove] button (sets URL to empty string)

  Card 1: Vehicle Front (system_config.sample_vehicle_photo_front)
  Card 2: Vehicle Left (sample_vehicle_photo_left)
  Card 3: Vehicle Right (sample_vehicle_photo_right)
  Card 4: Vehicle Rear (sample_vehicle_photo_rear)
  Card 5: Dashboard / AC (sample_vehicle_photo_dashboard)
  Card 6: Front Seats Interior (sample_vehicle_photo_seats)
  Card 7: Walkaround Video (sample_vehicle_video) — shows video thumbnail with play button

[Save All button]
  PATCH /api/admin/config with all 7 keys
```

### States
| State | Trigger | Behavior |
|-------|---------|----------|
| Loading | Page opens | Fetch all 7 config values via GET /api/admin/config |
| Upload | Tap Upload | Open file picker. Upload to Supabase Storage public bucket. Show progress bar. |
| Save success | PATCH 200 | Toast: "Sample media updated. Changes are live."
| No media set | Config value empty | Show placeholder with upload CTA |
