<!--
AI INSTRUCTIONS
===============
Base: GlideX UX conventions (React Native, Expo Router, NativeWind, bottom sheets, map-centric layout).
This file inherits all GlideX UX rules. Only Ride-specific overrides and additions are documented here.
If a rule is not listed here, apply the GlideX default.
Read first: 08-UI-SPEC.md (screen-specific behavior), 07-USER-FLOWS.md (flow connections).
-->

# UX Spec: Ride
> GoRide interaction patterns are the canonical UX baseline for Ride. Existing GlideX logic remains, but visual and interaction behavior follows this spec.

---

## GoRide-first interaction baseline (replaces generic inherited rules)
- Map-centric layout remains mandatory, with translucent overlays and high-radius pull-up sheets that match GoRide screen naming patterns (home, searching, driver heading, heading to destination).
- Primary ride actions use strong direct manipulation patterns: swipe-to-accept or swipe-confirm where timing is critical.
- Haptic feedback is mandatory for lifecycle boundary events: offer received, accepted, cancelled, scheduled, and completed.
- Bottom sheets should animate with GoRide-style staged elevation: handle visible first, then content reveal.
- Navigation and tab interactions remain Expo Router compatible, but visual transitions should follow GoRide panel motion (fast easing in, slower easing out).

## GoRide micro-interaction catalogue (derived from UI kit screen taxonomy)
- Processing states: use full-screen processing overlays for payment confirmation, scheduling confirmation, and ride assignment transitions.
- Scheduled states: use scheduled chips/badges and timeline-aware cards for "schedule a ride", "scheduling user ride", and "ride scheduled" moments.
- Cancel ride reason flow: use a reason-first action sheet (not immediate cancellation) with explicit confirmation state.
- Promo validity states: use clear valid/invalid state cards and preserved input context for promo entry retry.
- Driver progression states: driver heading -> expand details -> arrived -> heading to destination -> completed, each with visual continuity in map overlays.
- Post-ride states: rating -> tip -> completion are a chained interaction path with no abrupt screen-jump.

## Active-ride and feature-behavior UX rules (second pass)
- Use stacked overlays in map states: compact top route card + large bottom sheet for primary actions/details.
- Keep map legible during status changes; do not replace the map with full-page blank loaders during `finding_driver`, `driver_arriving`, or `heading_to_destination`.
- Cancellation UX is mandatory reason-first. User must choose one reason before confirm is enabled.
- In `driver_arriving`, expanded detail mode must surface ride summary + payment context, not only driver profile.
- In `driver_arrived`/post-arrival, include a short trip-summary + quick sentiment capture component before final completion CTA.
- Keep tab navigation hidden during focused ride lifecycle screens to prevent accidental context switching.

## Screen-by-screen interaction contract — Pack A

Rider Home Searching:
- Use non-blocking location-search state with map still interactive.
- Keep primary tab bar visible.
- Use concentric pulse around rider location avatar to indicate active location resolution.

Fare Options (collapsed/expanded):
- Collapsed sheet prioritizes selected vehicle + payment/promo + primary booking CTA.
- Expanded sheet prioritizes discoverability of all vehicle options while preserving selected state and route context.
- Vehicle selection must be single-select, immediate, and optimistic in UI.

Finding Driver:
- Present actionable waiting state with clear cancel path.
- Cancel action enters reason-first flow; no immediate destructive action.

Driver Arriving Expanded (rider side):
- Expanded panel must include both transport context (driver/vehicle/ETA) and money context (fare/payment/discount summary).
- Contact actions remain one tap and non-blocking.

Communication surfaces:
- Driver profile view is an informational checkpoint (identity, trip history, vehicle facts) and should be reachable from active-ride cards without leaving ride context permanently.
- Chat supports mixed message content: text plus inline image attachments.
- Voice and video call screens are full-screen transient overlays and must return user to prior ride context on end.
- Call duration timer must be visible once call connection is established.

## Screen-by-screen interaction contract — Pack B

Scheduled ride flow:
- Use a modal picker flow (not full navigation break) from fare context.
- After schedule is set, preserve route and selected vehicle context; only CTA and schedule chip should change.
- Scheduling submit should show short progress state before success confirmation.

Promo flow:
- Promo entry must provide immediate success/error feedback in modal form.
- Valid promo state should let user apply now or defer without losing context.
- Invalid promo state should preserve typed code for correction/retry.

Payment method flow:
- Payment method selection must be single-select and immediately reflected back in fare sheet row.
- Wallet/cash are first-class methods in UX; unsupported methods should be disabled or hidden by config, not selectable dead ends.

## Screen-by-screen interaction contract — Pack C

Activity tab UX:
- Activity segmented tabs (ongoing/scheduled/completed/canceled) switch datasets in place and retain scroll position per tab where feasible.
- Tab chips should communicate active state with tokenized accent fill; inactive chips remain neutral outline.

Ride details UX:
- Ride Details must be the canonical source for booking metadata (status, payment, date/time, transaction ID, booking ID, fare breakdown).
- For scheduled rides, show a pre-driver-found informational state, then transition to driver-card state when match is received.
- Driver-found acknowledgment should be modal and blocking until dismissed to ensure rider sees assignment event.

Cancellation-history UX:
- Canceled history entries must include explicit refunded status copy when refund exists.
- Completed and canceled details should both keep receipt sharing reachable without additional navigation.

Receipt sharing UX:
- Share Receipt opens native/system share sheet with prepared receipt artifact.
- If share target list cannot be resolved, show fallback action (copy receipt link/file) rather than a dead-end modal.

## Screen-by-screen interaction contract — Pack D

Top-up entry UX:
- Top-up must be reachable from both Account wallet card and Activity Top Up tab.
- Entering top-up amount should support both quick preset chips and manual numeric keypad input.

Top-up method selection UX:
- Method selection is single-select and immediately reflected in confirm CTA context.
- Confirm CTA must include the exact amount the rider is about to load.

Top-up confirmation UX:
- Success state appears as blocking modal with explicit acknowledgment.
- On acknowledgment, wallet balance and top-up history should refresh before showing idle state.

Top-up history/details UX:
- Top-up history rows should expose amount, source method, and timestamp at scan speed.
- Top-up details must keep receipt sharing as a first-class action.

## Screen-by-screen interaction contract — Pack E

Saved addresses list UX:
- Saved address cards should be scan-friendly and stable in layout with fixed affordances for share and overflow actions.
- Add Address CTA remains persistent at the bottom as primary path for creation.

Address create/edit UX:
- Address creation uses map + search + form composition in one flow, with clear validation on required name/location fields.
- Edit must reuse the same form with prefilled values and preserve user intent when returning.

Address deletion UX:
- Delete action is always mediated by explicit destructive confirmation.
- After deletion, show success feedback with an Undo affordance for quick recovery.
- Undo should be time-bounded and idempotent.

## Screen-by-screen interaction contract — Pack F

Personal profile UX:
- Profile edits should be locally buffered and validated before commit, with clear save confirmation.
- Phone, gender, and DOB controls should use native-appropriate pickers where available.

Notifications and security UX:
- Toggle changes are immediate with optimistic UI and concise failure feedback.
- Security-critical toggles (biometric/2FA) require device capability checks and may prompt re-authentication.

Linked account UX:
- Connected state and connect state must be visually distinct and accessible.
- Linking/unlinking should be explicit and recoverable without forcing app restart.

Data/privacy UX:
- Data-usage and ad preference controls should be transparent and reversible.
- Download-my-data action should provide request acknowledgment and expected delivery timeline.

Payment method UX:
- Add-payment form validates card fields progressively and prevents save until valid.
- On successful save, return to payment methods list and surface the newly added instrument immediately.

## Screen-by-screen interaction contract — Pack G

Appearance UX:
- Theme chooser should stage selection and apply only on explicit confirmation.
- Language selection should update app copy and formatting context without requiring full reinstall.

Help/support UX:
- Help hub rows should clearly differentiate internal content screens (FAQ/legal) vs external channel jumps.
- FAQ supports quick find (search + category) and progressive disclosure via accordion.

Legal content UX:
- Privacy and terms pages should preserve readable typographic rhythm for long-form text and maintain scroll position on transient interruptions.

Logout UX:
- Logout must always be confirm-gated with explicit destructive intent language.
- On confirm, clear auth/session state and prevent back-navigation into authenticated screens.

Cancellation completion and post-ride closure:
- After cancel submit, always show explicit success confirmation screen before returning to map/activity.
- Refund-specific copy is conditional on actual wallet/preauth reversal state.

Rating/tip/thanks chain:
- Post-ride closure is sequential: arrival summary -> rating -> optional tip -> thanks confirmation.
- Keep a clear back/close affordance on each step.
- Do not skip directly from completion to home unless user explicitly exits.
- Rating screen fare card is toggleable (show/hide details) without clearing selected stars.
- Tip step appears only when trigger rule is met (for example 5-star) and must expose both `Skip` and `Pay Tip` actions.
- If wallet cannot fund tip, keep rider in flow with clear fallback (skip or choose lower/custom supported amount) instead of hard-failing the sequence.

## Design-state consistency
- All loading skeletons, empty states, warning banners, and error states must use the GoRide color palette and typography tokens defined in 08-UI-SPEC.md.
- Do not use default grey skeletons or unrelated legacy GlideX palettes.
- Error and success states must remain non-color-only (icon + text + shape), while still using GoRide semantic colors.

---

## Override: Loading states

### Call deduction window (5-second heartbeat)
- When `ride:offer` bottom sheet renders: do NOT show any visible loading state for the `fetch:confirm` send — it is silent and immediate.
- The 15-second countdown ring (default; configurable via `OFFER_TIMEOUT_MS`) IS the primary loading/waiting indicator on the offer card.
- If the WebSocket reconnects during the offer window: show a brief "Reconnecting…" toast (orange, auto-dismiss 2s). Do not cancel the offer card.

### PortPos payment polling
- After WebView closes: show a full-screen "Confirming payment…" overlay with a pulsing Lottie animation.
- Poll `GET /api/package/active` every 3s. Show elapsed time: "This usually takes under a minute."
- After 2 minutes with no result: show "Taking longer than expected. Your payment is being confirmed. You can close this and check later." with a Dismiss button.

---

## Override: Error handling

### Money-related errors — never silently fail
Any error involving call deduction, package activation, or payment must:
1. Always show a persistent (non-auto-dismissing) error message.
2. Always provide a support contact path: "Contact support if this persists."
3. Never leave the driver in a state where calls were deducted but no ride was assigned without a visible explanation in the Call Ledger.

### Zone rejection
- If pickup is outside the active zone: show error on the map directly (pin turns red, tooltip: "Outside service area"). Do NOT navigate away from the map. Allow rider to reposition pin.

### Authentication errors
- If Firebase ID token expires mid-session: silently refresh token once. If refresh fails: show "Session expired. Please log in again." modal — no dismissal without re-auth. Do not lose ride-in-progress state; restore after re-auth.

---

## Addition: Time-critical UI rules (ride dispatch context)

These rules apply specifically to the ride offer card and dispatch flow:

- **Countdown is authoritative.** The 15-second ring display (default; configurable via `OFFER_TIMEOUT_MS`) is driven by `expires_in_ms` from the `ride:offer` payload (initial visual countdown). The authoritative deadline is `expires_at` (server absolute time). The client MUST check `Date.now() < expires_at` to determine expiry — if they disagree due to clock skew, `expires_at` wins. Never compute a client-side 15-second countdown from local `Date.now()`.
- **Haptic feedback on offer arrival.** Use `expo-haptics` `notificationAsync(NotificationFeedbackType.Warning)` when the offer card appears.
- **Accept/Reject are one-tap — no confirmation dialog.** Confirmations add latency. The default 15-second window (configurable via `OFFER_TIMEOUT_MS`) is too tight for a modal.
- **Expired offers must not be interactable.** After the offer timeout elapses (default 15s; configurable via `OFFER_TIMEOUT_MS`), the Accept and Reject buttons are disabled immediately (not after server ACK). The card auto-dismisses after 2s.

---

## Addition: Offline and low-connectivity rules

- **Network type detection.** Use `@react-native-community/netinfo`. If connection type is `cellular` and `effectiveType` is `2g` or `slow-2g`:
  - Suppress map tile loading (show static zone outline instead).
  - Reduce location update frequency from 5s to 15s.
  - Show persistent banner: "Low bandwidth mode — maps disabled."
- **Offline request queue (driver).** If driver app loses connection during an active offer window:
  - Cache the offer locally (AsyncStorage).
  - On reconnect within the offer timeout window (default 15s; configurable via `OFFER_TIMEOUT_MS`): re-present the offer card with remaining time.
  - On reconnect after the offer timeout (default 15s): discard cached offer silently (it already expired server-side).
- **Offline indicator.** When `netInfo.isConnected = false`: show persistent red bar at top: "No internet connection." Dismiss automatically when connection restores.

---

## Addition: Bengali language / local formatting

- **Currency display.** Always display as `৳{amount}` (taka symbol, no space). Never display paisa to the rider or driver — convert from paisa to taka (divide by 100) before display. Example: 4700 paisa → `৳47`.
- **Phone number display.** Show as `+880 1X-XXXX-XXXX` format in all UI. Store as E.164 in DB.
- **Date/time display.** Use `Asia/Dhaka` timezone for all displayed times. Store UTC in DB. Format: `DD MMM YYYY, h:mm a` (e.g. "18 May 2026, 3:45 pm").
- **Font.** Use a font that renders Bengali script correctly for any user-generated content fields (driver names, addresses). Font stack: `'Noto Sans Bengali', 'Hind Siliguri', system-ui, sans-serif`. Preload Noto Sans Bengali via `expo-font` in `app/_layout.tsx` before rendering any screen. Test on a low-end Bangladesh-market device (Symphony, Walton) to verify glyph coverage.

---

## Addition: Driver status-gated UI rules

The driver home screen and related screens behave differently based on `drivers.status`:

| Driver status | Toggle online | Offer cards | Buy calls |
|--------------|--------------|-------------|-----------|
| pending | Hidden | Hidden | Hidden |
| temporary | Enabled | Shown | Enabled |
| active | Enabled | Shown | Enabled |
| suspended | Disabled (locked) | Hidden | Disabled |
| rejected | Disabled | Hidden | Show "Account rejected" with contact link |

Do not surface status strings directly in UI — map to human-readable messages:
- `pending` → "Application under review"
- `temporary` → "Temporarily active" + days until full activation required
- `suspended` → "Account suspended — contact support"
- `rejected` → "Application not approved — [reason]"

---

## Addition: Admin web panel UX (web-only screens)

Admin screens follow standard web UX patterns, not React Native patterns:

- **Table row click** opens a slide-in detail drawer (right side, 480px wide on desktop).
- **Destructive actions** (reject driver, deactivate package): always require a confirmation dialog with explicit reason input.
- **SLA breach rows** (driver pending > 24h; configurable review SLA, default 24 hours): highlighted with red left border and badge. Admin cannot dismiss the highlight — it clears only when the driver is approved or rejected.
- **Keyboard shortcuts** on approval queue: `A` = approve focused row, `R` = open reject modal.
- **Presigned document URLs** expire after 15 minutes. If admin opens a document image and it is expired: show "Image expired — click to reload" with a refresh button that fetches a new presigned URL.
- **BRTA age warning.** When reviewing a driver whose vehicle registration date is < 1 year ago (threshold from `lib/vehicleTypes.ts` `min_age_years`; configurable), the approval drawer shows a prominent red banner: "Vehicle is less than 1 year old — BRTA requirement not met. Approve or reject with reason." Admin must enter a reason to approve such a vehicle.
- **Admin vehicle type downgrade.** If admin selects a vehicle type different from the driver's claim in the approval drawer, the "Reason" field becomes mandatory before submitting. The driver receives a push notification and in-app modal on next launch showing the old type, the new type, and the reason.

---

## Addition: Vehicle type alternatives (no_drivers flow)

- **Alternatives are gated by `allow_downgrade`.** Alternatives are shown automatically ONLY when `allow_downgrade=true` in the original ride request. The rider's explicit action of enabling this flag (e.g., by tapping 'I'm flexible with vehicle type' before requesting) constitutes consent. The alternatives sheet appears within 1 second of the `no_drivers` status or `ride:alternatives` WebSocket event.
- **Fare transparency.** Each alternative must show the full fare breakdown (base, per-km, total — all values sourced from the `pricing` table; admin-configurable) and the available driver count so the rider can compare before selecting.
- **No dead ends.** If no alternatives exist for any vehicle type, the ride expires and the rider sees: "No drivers available right now. Try again in a few minutes." with a Retry button.
- **Rider consent required.** The alternatives sheet is a selection — the rider must tap a vehicle type to consent. There is no auto-downgrade without explicit tap. The `allow_downgrade: true` flag is set at ride request time. If the rider checked 'I'm flexible with vehicle type' before requesting, `allow_downgrade=true` is included in the initial `POST /api/ride/request` body.

---

## Addition: Driver minimum per-km rate slider

- **Real-time preview.** As the driver moves the slider, show a preview stat: "You may miss ~X rides/week at this rate." Computed from `GET /api/driver/missed-requests` response field `filtered_count_7d`. The preview is approximate and non-binding.
- **Bounds.** Slider range is `lower_bound` to `upper_bound` as returned by `GET /api/driver/slider-config` (dynamically computed from `platform_config.driver_min_ratio` and `driver_max_ratio` × current system per-km rate for the driver's vehicle type). Values outside this range are not selectable.
- **Default.** When `min_per_km_bdt` is NULL (no custom rate set), the slider defaults to the system rate (100%). This ensures the driver receives all available ride offers.
- **Warning when set above system rate.** If the driver moves the slider above 100% (system rate): show an inline warning beneath the slider: "At this rate, rides with a lower system rate will not be offered to you." The warning is informational only — saving is not blocked. Setting a minimum above the system rate is an expected use case for drivers who need an earnings floor.
- **Warning when set below system rate.** Show informational text beneath the slider: "You'll accept rides at below the standard rate. You'll receive more ride offers." No blocking — below-rate minimums are permitted within the computed lower_bound (default 70% of system rate, from `platform_config.driver_min_ratio`; admin-configurable).
- **Persistence.** The selected rate persists across app restarts. When the driver's vehicle type changes (after the 7-day cooling-off; configurable business rule; default 7 days), `min_per_km_bdt` is reset to NULL and the driver is notified.

---

## Addition: BRTA compliance rules

- **Vehicle registration date must be collected during onboarding (Step 1).** Show a date picker labelled "Vehicle first registration date (from BRTA certificate)." If the entered date is < 1 year before today (threshold from `lib/vehicleTypes.ts` `min_age_years`; configurable), show an inline warning: "This vehicle may not meet the BRTA 1-year minimum age requirement (configurable via `lib/vehicleTypes.ts`). Admin will review." The driver may still submit — the warning does not block submission.
- **BRTA enlistment certificate is mandatory for all vehicle types.** The upload card for `brta_certificate` is always shown in Step 1, regardless of vehicle type. The Next button is disabled until this document is uploaded.
- **Type-specific additional documents (enforced at upload — Next button disabled until complete):**
  - `bike_basic`, `bike_standard`, `bike_plus`: helmet photos required.
  - `car_economy`: dashboard photo (no AC visible).
  - `car_comfort`: dashboard photo (OEM AC controls visible).
  - `car_premium`: premium interior photo.
  - `car_xl`: third-row seat photo.
  - `cng`: no additional photo required beyond standard documents.

---

## Addition: Vehicle type change and downgrade

- **Downgrade notification.** When admin downgrades a driver's vehicle type during approval, the driver receives a push notification AND an in-app modal on next launch showing: the old type, the new type, and the admin's mandatory reason. The modal must be dismissed manually — no auto-dismiss.
- **Driver-initiated type change cooling-off.** After admin approves a driver-initiated type change, show a clear timeline: "Your request to change to [type] was approved. The change takes effect on [date + 7 days] (configurable business rule; default 7 days)." During the 7-day cooling-off (configurable business rule; default 7 days), the driver continues receiving offers for their current type. The pending change is shown as a status chip on the Driver Home screen.
- **Min rate reset on type change.** When a vehicle type change takes effect (after the 7-day cooling-off; configurable business rule; default 7 days), `min_per_km_bdt` is reset to NULL. Driver is notified: "Your vehicle type changed to [type]. Your minimum rate has been reset to the system rate." The driver can set a new minimum immediately after the change takes effect.

---

## Addition: Ride Waiting UX

- **Rider banner:** When rider app receives `driver_arrived` WebSocket event → show persistent banner "Your driver has arrived" with a pulsing icon. Banner dismisses when `in_progress` status received.
- **Driver waiting timer:** Driver sees green upward counter MM:SS on the 'arrived' screen. After 60 seconds (platform-wide constant from `system_config.max_free_wait_seconds`) the counter turns amber to indicate chargeable waiting has begun and the ride auto-transitions to `in_progress`. The 60-second threshold is read from `system_config` — never hardcoded.

---

## Addition: Wallet, Referral, and Points UX

- **Wallet Top-Up/Withdrawal Status:** Wallet top-ups (rider) and payouts (driver) should use a clear, blocking success modal once PortPos confirms payment. If a timeout occurs, show a non-blocking toast "Payment is processing" and poll silently in the background.
- **Combined Payment UX:** If a rider selects Wallet but has insufficient funds, the fare breakdown must explicitly show "Wallet Contribution" and the remaining "Cash to Pay". The UI should smoothly handle the transition without blocking the booking.
- **Promo/Referral Input Prominence:** The promo/referral code input must be an always-visible text field or primary-colored button on the fare sheet (not buried in a sub-menu) to encourage usage.
- **Referral Code Sharing:** Tapping "Share" on the referral code screen should invoke the native share sheet directly with a pre-filled, friendly message containing the code.
- **Points Redemption:** When a user redeems points for an offer, the points balance should optimistically update on the client immediately after tapping "Redeem" to provide instant gratification, with a revert if the API call fails.

---

## Addition: Enhanced SOS UX

- **Two-Tap SOS:** The SOS flow is intentionally designed to prevent accidental triggers while remaining fast. Tap 1: Shield Icon. Tap 2: "Send SOS Alert".
- **Custom Message Field:** The SOS message field should default to empty but have quick-select chips (e.g., "Feeling unsafe", "Car broke down") below it to allow rapid reporting without typing.
- **Rider SOS Parity:** The rider's SOS experience must be identical to the driver's — same modal, same Call Police / Send SOS actions, same triple SMS dispatch. The shield icon on the rider home must be equally prominent and accessible as on the driver home.
- **Wallet Balance Visibility:** Both rider and driver wallet balances must be visible from their respective home screens or account menus without requiring navigation to a dedicated screen. Use a compact card or badge showing the current balance.
- **Referral Code Prominence:** The referral code and share CTA must be reachable from the user's profile/account screen with ≤ 2 taps. The share action must use the native share sheet.
- **Points Progress Feedback:** After completing a ride that earns points, show a brief non-blocking toast or badge animation indicating points earned (e.g., "+250 points"). Do not block the post-ride flow.
- **Promo/Referral Input Always Visible:** The code input field on the fare breakdown sheet must be immediately visible (not hidden behind a sub-menu or accordion). It accepts both promo codes and referral codes.
- **Driver Offer Card Exclusion:** The driver's ride offer card (RideOfferSheet) must NEVER show promo badges, discount amounts, or referral information. Only the undiscounted `driver_fare_bdt` is shown. The driver learns about discounts only on the post-ride invoice.
- **Driver Invoice Transparency:** After ride completion, the driver's fare summary must clearly show: original fare, promo/referral discount (if any, labelled "Platform Subsidy"), and the platform receivable amount. This builds trust that the platform covers the discount.

## Addition: Onboarding UX (Driver Photo, Vehicle Model, Vehicle Media)

- **Brand/Model/Year Autocomplete:** As the driver types a brand name, show autocomplete suggestions from `GET /api/reference/vehicle-models?search=` after a 300ms debounce. When a brand is selected, the model field appears and filters by that brand. When model is selected, the year field appears. This progressive disclosure prevents overwhelming the driver with too many choices at once.
- **Auto-Suggestion Banner:** When `GET /api/reference/vehicle-suggest` returns a match, show a persistent banner: "Based on your [Brand] [Model], we suggest: [Vehicle Type] ([AC status])". The driver can tap "Confirm" to accept or "Choose manually" to override. The banner should NOT block the form — it should appear below the fields as an informational card with two actions.
- **AC Selector Warnings:** For `car_economy` and `car_comfort`, the AC selector shows two radio buttons (AC / Non-AC). If the driver selects Non-AC, a red warning appears immediately: "Vehicles without AC receive fewer ride requests. Consider upgrading your vehicle to increase earnings." This is advisory only — it does NOT block submission. For `car_premium` and `car_xl`, AC is mandatory and the selector is replaced with a read-only badge: "AC Required".
- **Driver Photo Face Detection:** The camera preview must show a face detection overlay (green circle when face detected, grey when not). The capture button should be disabled with a tooltip "Position your face in the frame" when no face is detected. This ensures the captured photo has a high chance of passing the face-match threshold.
- **Face Match Non-Blocking:** The face-match comparison happens in the background after photo upload. The driver should NOT wait for the result — proceed to the next onboarding step immediately. If the face match returns `low_confidence`, it is flagged for admin review in the approval queue (not blocking the driver). Show a brief loading spinner (max 2 seconds) then auto-advance.
- **Photo Capture Grid with Samples:** The vehicle photo capture screen (Screen 4c) uses a 2×3 grid where each cell shows a small sample thumbnail from `system_config` alongside the capture button. Tapping the sample opens a full-screen viewer with the reference image and a description of what's expected. This teaches drivers the expected framing without requiring separate instructions.
- **Walkaround Video Recording:** The "Record Video" button opens the device camera in video mode (rear-facing, `expo-camera`). During recording, show a live timer (MM:SS) and a red recording indicator. Auto-stop at 30 seconds with a brief haptic. On playback, the driver can review and re-record if needed. Validate: duration ≥15s, resolution ≥720p, file size ≤50MB. Show inline errors for each validation failure.
- **Photo/Video Upload Progress:** Each photo and the video should show an upload progress bar after capture. If upload fails, show a retry button with the captured media still visible as a thumbnail. Do NOT require re-capture on upload failure.
