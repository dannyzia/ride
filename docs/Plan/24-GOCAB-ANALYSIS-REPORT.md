# GoCab Analysis Report

> Reference app: `D:\My Projects\Current Project\Ride\_reference\GoCab v1.0\GoCab v1.0\codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel`
>
> Comparison targets: `docs/Plan/01-PRD.md`, `docs/Plan/06-API.md`, and the current Ride Expo/Supabase/WebSocket implementation.

## Phase 1 - Discovery

### 1.1 Project Structure

GoCab is not a single app. It is a commercial multi-project stack:

| Project | Path | Purpose |
|---|---|---|
| Rider mobile app | `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_user` | Rider-facing React Native app for booking rides, rentals, parcels/freight, payments, coupons, wallet, chat, scheduled rides, bidding |
| Driver mobile app | `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_driver` | Driver-facing React Native app for online/offline status, live location, ride requests, earnings dashboard, wallet, subscriptions, fleet/rental vehicles, SOS, incentives |
| Laravel backend/admin | `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_laravel` | Laravel modular backend and web admin. Core ride module lives under `Modules/CabBooking` |
| Firebase functions | `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/firebase-functions/functions` | Firestore-triggered assignment timers and push notification workflows |

The Laravel project uses a modular structure. The important module is `Modules/CabBooking`, which contains:

| Area | Representative files |
|---|---|
| API routes | `Modules/CabBooking/routes/api/api.php` |
| Admin routes | `Modules/CabBooking/routes/admin.php` |
| Service/category seeds | `Modules/CabBooking/database/seeders/ServiceSeeder.php`, `ServiceCategorySeeder.php` |
| Ride and request schema | `Modules/CabBooking/database/migrations/2024_10_02_115840_create_rides_table.php` |
| Ride request orchestration | `Modules/CabBooking/app/Http/Traits/RideRequestTrait.php` |
| Fare/bidding calculation | `Modules/CabBooking/app/Http/Traits/BiddingTrait.php` |
| Ride lifecycle | `Modules/CabBooking/app/Repositories/Api/RideRepository.php` |
| Bids | `Modules/CabBooking/app/Repositories/Api/BidRepository.php` |
| Driver/rider wallet | `Modules/CabBooking/app/Repositories/Api/DriverWalletRepository.php`, `RiderWalletRepository.php` |
| Admin tables | `Modules/CabBooking/app/Tables/*Table.php` |

### 1.2 Tech Stack

| Layer | GoCab | Ride |
|---|---|---|
| Mobile framework | React Native CLI 0.77 | Expo / React Native 0.79 |
| Navigation | React Navigation v6 | Expo Router / React Navigation |
| State | Redux Toolkit | Zustand stores + Supabase/API state |
| Auth | Laravel Sanctum plus Firebase phone/social auth bridge | Supabase Auth phone OTP |
| Maps | `react-native-maps`, Google Maps APIs, Leaflet/WebView map code | MapLibre, Barikoi, H3 |
| Realtime | Firestore listeners + Cloud Functions + FCM | WebSocket dispatch server + FCM fallback |
| Backend | Laravel modular monolith | Expo API routes + Supabase/Postgres + `utils-server` |
| Payments | Many gateways/modules: bKash, SSLCommerz, Stripe, PayPal, PhonePe, etc. | PortPos hosted checkout, old bKash/Nagad fallback |
| Push | Firebase Cloud Messaging | Expo Notifications / FCM fallback planned |
| Documents/storage | Laravel media + Firebase Storage in driver app | Supabase Storage |

GoCab relies heavily on Firestore as the realtime coordination bus. Laravel creates SQL records, writes Firestore documents, and Firebase Functions react to those documents. Ride already has a cleaner architecture for its business model: Supabase/Postgres as the durable source of truth, H3 driver indexing, and WebSocket-first dispatch with app-level `fetch:confirm` call deduction.

### 1.3 GoCab Feature List

GoCab supports a broad ride-hailing marketplace:

| Feature | Evidence | Notes |
|---|---|---|
| Standard cab ride | `ServiceSeeder.php`, `ServiceCategorySeeder.php` | Primary service `cab`, category `ride` |
| Intercity rides | `ServiceCategorySeeder.php` | Separate service category for cab/parcel/freight |
| Scheduled rides | `ServiceCategorySeeder.php`, rider schedule UI | Category `schedule`; rider app includes custom calendar/time selector |
| Hourly/package rides | `ServiceCategorySeeder.php`, `HourlyPackage` pricing in `BiddingTrait.php` | Not equivalent to Ride subscription packages; it is rider-facing hourly booking |
| Cab rental | `RideRequestRepository.php`, `RentalVehicleRepository.php`, driver `VehicleList` | Per-day vehicle and driver rental pricing |
| Parcel delivery | `ServiceSeeder.php`, ride schema fields `parcel_receiver`, `weight`, `parcel_delivered_otp`, `cargo_image_id` | Includes parcel OTP at delivery |
| Freight | `ServiceSeeder.php` | Similar to parcel but for goods transport |
| Ambulance | `ServiceSeeder.php`, rider and driver ambulance screens | Emergency transport vertical |
| Bidding | `BidRepository.php`, `BiddingTrait.php`, Firebase `bids` collection | Drivers place bids; rider accepts a bid |
| Coupons/promos | rider `couponSheet`, backend coupon API | Coupon validation and vehicle applicability |
| Wallets | `DriverWalletRepository`, `RiderWalletRepository` | Rider top-up, driver top-up, withdrawal requests |
| Driver subscriptions/plans | driver `Subscription` screen, Laravel `PlanController` | GoCab subscriptions are conventional driver plans, not Ride call packages |
| Fleet management | fleet auth/routes, fleet screens | Fleet managers can manage drivers/vehicles |
| Driver incentives | driver `Incentive` screen, incentive services | Ride-count targets with bonus amounts |
| SOS | driver SOS UI and API | Sends driver location and opens dialer |
| Chat | Firestore `chats`, chat notification function | Push notification on chat update |
| Ratings/reviews | rider/driver review endpoints and screens | Mutual review workflows |
| Zone/peak zone pricing | zone tables, peak zone Firestore listener | Dynamic peak price overlays |
| Preferences/add-ons | `preferences` tables and rider booking UI | Rider-selected preferences can affect fare and driver matching |

### 1.4 UI/UX Patterns

GoCab's strongest UX patterns are in the rider booking flow and driver home flow.

| Pattern | GoCab implementation | Why it matters |
|---|---|---|
| Map-first booking with persistent bottom sheet | `GoCab_user/src/screens/bookRide/index.tsx` uses `@gorhom/bottom-sheet` over a route map | Keeps map context visible while rider selects vehicle, payment, coupons, preferences |
| Vehicle cards with fare comparison | `GoCab_user/src/screens/bookRide/bookRideItem/index.tsx` | Shows image, vehicle name, original fare, discounted fare, preference-adjusted fare |
| Coupon bottom sheet | `GoCab_user/src/screens/bookRide/component/couponSheet/index.tsx` | Lightweight promo entry without leaving checkout |
| Bidding fare stepper | `GoCab_user/src/screens/bookRide/index.tsx` | Rider can increase/decrease fare within allowed min/max |
| Driver request card | `GoCab_driver/src/screen/home/component/upcomingRide.tsx/index.tsx` | Shows rider profile/rating, ride number, date/time, pickup/drop, distance, fare, accept/decline, progress timeout |
| Driver availability control | `GoCab_driver/src/screen/home/homeScreen/index.tsx` | Online/offline toggle with wallet guard and live location start/stop |
| Ring/vibration on request | driver home + `UpcomingRide` | Strong attention pattern for incoming ride requests |
| Earnings dashboard | `GoCab_driver/src/screen/dashBoard/index.tsx` | Driver can see earnings, ride counts, completion/cancellation breakdown |
| Incentive progress | `GoCab_driver/src/screen/settings/incentive/index.tsx` | Weekly goal UI with progress ring and bonus amount |
| Scheduled ride picker | `GoCab_user/src/screens/dateTimeSchedule/index.tsx` | Calendar plus time controls |
| SOS bottom sheet | `GoCab_driver/src/screen/home/homeScreen/index.tsx` | Safety action available from home map |
| External navigation map launcher | commented in `GoCab_driver/src/screen/home/acceptFare/index.tsx` | Google/Waze/Bing navigation options |

### 1.5 Driver-Specific Features

| Feature | Implementation | Notes for Ride |
|---|---|---|
| Online/offline toggle | Firestore `driverTrack/{driverId}` `is_online`, `last_online_at`, `total_online_time_today` in `GoCab_driver/src/screen/home/homeScreen/index.tsx` | Ride already has `POST /api/driver/status`; GoCab's reasoned UX around low balance and offline confirmation is worth copying |
| Live location tracking | `startLiveLocation`, `stopLiveLocation`; Firestore driverTrack updates | Ride should keep WebSocket heartbeat/H3 approach |
| Low wallet guard | Blocks online if wallet below minimum | Ride equivalent is no active subscription, no calls remaining, expired package, daily cap reached |
| Incoming ride queue | Firestore `driver_ride_requests/{driverId}` listener | Ride uses WebSocket `ride:offer`; GoCab card UX can be adapted |
| Driver filters | Filter sheet on home map | Useful for offer history/missed requests, not dispatch authority |
| Earnings dashboard | `DashBoard` screen | Ride PRD says driver earnings dashboard is post-MVP; should be promoted to strategic addition |
| Incentives | `Incentive` screen | Strong retention pattern if converted to call credits |
| Rental vehicle management | `VehicleList`, `AddVehicle` | Future roadmap for rental/fleet vertical |
| SOS | SOS contacts and location alert | Good MVP quick win |
| Document onboarding | registration document screens | Ride already has stronger BRTA-focused onboarding requirements |

### 1.6 Rider-Specific Features

| Feature | Implementation | Notes for Ride |
|---|---|---|
| Multiple vehicle types | Vehicle type API and rider vehicle cards | Ride already has 8 Bangladesh-specific vehicle types |
| Fare estimates | `BookRideItem`, `BiddingTrait` charge calculation | Ride already has `lib/fareCalc.ts`; UI can be richer |
| Scheduled rides | `DateTimeSchedule`, schedule category | Ride already supports `scheduled_at`; UX can improve |
| Cancellation flow | cancellation reasons, ride update status | Ride already has cancellation rules; GoCab's reason sheet is useful |
| Coupons | Coupon bottom sheet and fare display | Ride lacks explicit promo implementation |
| Parcel/freight | Receiver, weight, image, delivery OTP | Future vertical |
| Rental | Dedicated rental booking and payment | Future vertical |
| Other rider/contact booking | `new_rider` fields and contact permission flow | Could be useful for booking for family, but adds abuse concerns |
| Chat/call | Chat screen and native dialer | Ride already includes chat and native dialer |
| Ride history/invoices | invoice endpoints and ride status lists | Ride PRD has ride history as post-MVP |

### 1.7 Backend Integration Patterns

GoCab API is route-heavy and repository-driven:

| Concern | GoCab pattern |
|---|---|
| Auth | public login/register/OTP routes; authenticated routes under Sanctum |
| Ride request creation | `POST /api/rideRequest` creates SQL row, computes fare, finds eligible drivers, writes Firestore |
| Driver assignment | Firestore document under `ride_requests/{rideId}/instantRide/{rideId}` stores `current_driver_id`, `eligible_driver_ids`, `queue_driver_id`, rejected IDs |
| Driver timeout | Firebase Function waits configured accept time, then rotates to another driver |
| Bidding | Drivers create `bids`; accepted bid creates a ride |
| Status updates | SQL updates mirrored into Firestore `rides/{rideId}` |
| Push notifications | Firebase Functions send FCM for chat, ride request, bid accepted, ride status changes |

Ride should not copy this backend architecture. Ride's WebSocket-first model is better aligned with:

- App-level `fetch:confirm` before call deduction
- H3 ring expansion and weighted scoring
- strict call ledger idempotency
- FCM as fallback rather than primary realtime state
- Supabase Auth and Postgres as the source of truth

### 1.8 Unique / Innovative Features

The most useful GoCab ideas for Ride are:

1. Driver incentive progress converted into call credits.
2. Platform-funded promo codes without reducing driver fare.
3. Driver SOS with location and phone shortcut.
4. Better scheduled ride picker.
5. Richer driver offer sheet with attention cues, rider quality, pickup distance, fare, and timer.
6. Preference/add-on matching for controlled use cases.
7. Booking for another person, if anti-spam controls are strong.
8. Parcel/freight delivery as a later vertical.
9. Fleet mode for multi-driver operators.

## Phase 2 - Gap Analysis

### 2.1 High-Value Gaps

| Feature | What GoCab does | Ride alignment | Complexity | Acquisition / retention impact |
|---|---|---|---|---|
| Platform-funded promo codes | Validates coupon in booking flow, shows original and discounted fare by vehicle | Strong for rider acquisition if platform funds discount and driver receives full fare | Moderate | High |
| Driver incentives / goals | Shows weekly/daily ride targets, progress, bonus amount | Strong fit if rewards are bonus calls, credit vouchers, or package discounts | Moderate | High |
| Driver SOS | SOS list sends current location and opens phone dialer | Strong fit for Bangladesh driver trust and safety | Simple | High |
| Rich incoming offer sheet | Request card with fare, rider, rating, pickup/drop, distance, accept/decline, timeout | Strong fit; improves driver confidence and response speed | Medium | High |
| Better scheduled ride UX | Calendar/time picker for scheduled service | Ride already has scheduled ride API; UX gap only | Simple | Medium |
| Driver filters | Filter sheet for home requests/map | Good for offer history and preference settings; dispatch remains server-side | Simple | Medium |
| Rider preferences/add-ons | Preferences have prices and driver matching | Useful if tightly scoped; avoid bloated booking | Moderate | Medium |

### 2.2 Medium / Future Gaps

| Feature | What GoCab does | Ride alignment | Complexity | Acquisition / retention impact |
|---|---|---|---|---|
| Parcel delivery | Receiver details, package weight, cargo image, parcel OTP | Adjacent opportunity, not core subscription ride-lead MVP | Large | Medium |
| Freight | Goods transport service type | Larger operational complexity than parcel | Large | Medium |
| Rental / hourly packages | Per-day vehicle and driver rental charges | Interesting for car owners/fleets, but separate marketplace surface | Large | Medium |
| Fleet manager mode | Fleet auth, drivers, vehicles, fleet wallets | Useful for fleet operators after MVP | Large | Medium |
| Booking for someone else | `new_rider` payload and contact permission flow | Useful but increases spam/fraud risk | Moderate | Medium |
| Driver rental vehicle listing | Driver manages rentable vehicles | Future rental vertical only | Large | Low/Medium |
| External map launcher | Google/Waze/Bing buttons | Good driver ergonomics | Simple | Medium |

### 2.3 Features To Avoid Or Defer

| Feature | Why |
|---|---|
| Bidding | Conflicts with Ride's fixed transparent fare model and PRD out-of-scope item: "Marketplace fare negotiation" |
| Surge/peak price uplift | PRD explicitly avoids real-time surge pricing. Ride can use heatmaps for supply guidance without changing rider fare dynamically |
| Rider wallet as primary payment | MVP is cash to driver plus driver package payments through PortPos. Rider wallet adds compliance and support load |
| Ambulance vertical | Operationally sensitive and high-liability; not aligned with initial Dhaka ride-lead MVP |
| Ad monetization | GoCab includes mobile ads, but it would cheapen a trust-sensitive ride product |

## Phase 3 - Prioritized Recommendations

### 3.1 Quick Wins

#### 1. Driver Safety / SOS Sheet

**Value for Ride:** Improves driver trust and safety with a small implementation footprint. This matters in Bangladesh, especially for night rides and unfamiliar pickups.

**How GoCab implements it:** Driver home has an SOS bottom sheet. It posts current location to an SOS alert endpoint and opens the native phone dialer.

**Ride adaptation:** Add an admin-configured `sos_contacts` table or `system_config` JSON key. Add `POST /api/driver/sos-alert` to store `driver_id`, location, timestamp, and selected contact. Add a driver home SOS button that calls the API and then opens `tel:`.

**Estimated effort:** Small.

#### 2. Better Scheduled Ride Picker

**Value for Ride:** Ride already supports scheduled rides in the PRD/API, but a polished picker will increase rider confidence and reduce invalid scheduled times.

**How GoCab implements it:** `DateTimeSchedule` uses `react-native-calendars`, month/year dropdowns, AM/PM control, and hour/minute steppers.

**Ride adaptation:** Keep Ride's 15-60 minute MVP scheduling window. Replace free-form datetime selection with segmented options: "Now", "15 min", "30 min", "45 min", "60 min", plus exact time if needed later.

**Estimated effort:** Small.

#### 3. Driver Offer History Filters

**Value for Ride:** Drivers need to understand which leads they missed and why. This is especially important because Ride charges for app-level lead interaction.

**How GoCab implements it:** Driver home includes filter sheets and selected request types.

**Ride adaptation:** Add filter controls to call ledger/missed requests for: accepted, ignored, expired, refunded, filtered by `min_per_km`, scheduled/instant, vehicle type, and fare range. Dispatch eligibility must remain server-side.

**Estimated effort:** Small.

#### 4. External Navigation Launchers

**Value for Ride:** Lets drivers quickly open Google Maps or Waze after accepting a ride.

**How GoCab implements it:** Accept fare screen has FAB actions for Google, Waze, and Bing map navigation.

**Ride adaptation:** Add "Navigate" action on driver matched/arriving screens using Expo Linking with Google Maps web URL fallback.

**Estimated effort:** Small.

### 3.2 Strategic Additions

#### 5. Platform-Funded Promo Codes

**Value for Ride:** Strong rider acquisition lever while preserving driver economics. This matters because Ride's driver promise is "keep 100% of fares"; promos should not silently reduce driver earnings.

**How GoCab implements it:** Coupon bottom sheet validates coupon and updates vehicle card pricing.

**Ride adaptation:** Add `promo_codes`, `promo_redemptions`, and `platform_subsidy_bdt`. Fare display should separate:

- `driver_fare_bdt`: what driver receives in cash.
- `rider_payable_bdt`: discounted rider amount, if subsidy is operationally supported.
- `platform_subsidy_bdt`: amount owed/absorbed by platform.

For MVP simplicity, use non-cash promo messaging such as "free priority support" or package-partner promos unless platform is ready to settle subsidies.

**Estimated effort:** Medium.

#### 6. Driver Goal / Incentive Dashboard

**Value for Ride:** Driver retention is central to Ride's subscription model. Incentives can reward quality supply without taking commissions.

**How GoCab implements it:** Incentive screen shows date chips, completed rides, target rides, progress ring, and earned bonus.

**Ride adaptation:** Use bonus calls, credit vouchers, or renewal discounts:

- "Complete 20 rides this week and keep acceptance rate above 75% to earn 10 bonus calls."
- "Stay online 6 hours/day for 5 days and receive a micro-trial top-up."

Data can come from `rides`, `driver_online_sessions`, `dispatch_offers`, and `call_ledger`.

**Estimated effort:** Medium.

#### 7. Richer Ride Offer Sheet

**Value for Ride:** Drivers make accept/reject decisions quickly. A stronger offer sheet can reduce ignored offers and disputes.

**How GoCab implements it:** `UpcomingRide` shows rider rating, fare, pickup/drop, request time, distance, schedule details, and a progress timeout.

**Ride adaptation:** Improve `components/RideOfferSheet.tsx` with:

- pickup distance from driver
- estimated pickup ETA
- rider rating or rider quality label
- full fare and distance
- scheduled badge
- "calls deducted only when you view/interact" microcopy outside the critical accept button
- sound/vibration based on settings

Preserve current WebSocket `fetch:confirm` semantics.

**Estimated effort:** Medium.

#### 8. Rider Preferences / Add-ons

**Value for Ride:** Helps riders select practical needs without creating fare negotiation.

**How GoCab implements it:** `preferences`, `driver_preferences`, and `vehicle_type_zone_preferences` allow selected rider preferences to affect price and driver matching.

**Ride adaptation:** Start with a controlled list:

- large luggage
- quiet ride
- female-friendly driver preference
- AC required for eligible vehicle types
- extra waiting flexibility

Implement as optional `ride_preferences` and filter/match only where driver/vehicle profile explicitly supports it.

**Estimated effort:** Medium.

### 3.3 Future Roadmap

#### 9. Parcel Delivery

**Value for Ride:** Opens a second demand channel during off-peak passenger hours.

**How GoCab implements it:** Parcel service supports receiver details, package weight, cargo image, additional weight charge, and parcel delivery OTP.

**Ride adaptation:** Add `lead_type='parcel'`, `parcel_receiver`, `parcel_weight_kg`, optional photo, and delivery OTP. Treat parcel leads as separate package eligibility or a package add-on.

**Estimated effort:** Large.

#### 10. Rental / Hourly Booking

**Value for Ride:** Useful for car/CNG owners and corporate customers, but changes the operational model.

**How GoCab implements it:** Rental vehicles include per-day vehicle price, driver price, availability toggle, and rental request flow.

**Ride adaptation:** Keep separate from normal dispatch. Add after MVP as "reserved driver/day package" with manual admin oversight at first.

**Estimated effort:** Large.

#### 11. Fleet Accounts

**Value for Ride:** Bangladesh fleets and garages may buy packages centrally for multiple drivers.

**How GoCab implements it:** Fleet auth, fleet driver registration, fleet wallets, fleet vehicle management.

**Ride adaptation:** Add organization accounts, pooled call packages, driver-level usage ledgers, and admin approvals per vehicle.

**Estimated effort:** Large.

#### 12. Bidding / Negotiated Fare

**Value for Ride:** Low for MVP and potentially harmful.

**How GoCab implements it:** Rider request enters bidding mode; drivers create bid rows; accepted bid creates a ride.

**Ride adaptation:** Do not add to MVP. It conflicts with transparent fare, driver-set minimum per-km already gives drivers some control, and the PRD explicitly excludes fare negotiation.

**Estimated effort:** Large.

## Phase 4 - Specific Code References

### 4.1 Promo / Coupon Flow

**GoCab files**

- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_user/src/screens/bookRide/index.tsx`
- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_user/src/screens/bookRide/component/couponSheet/index.tsx`
- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_user/src/screens/bookRide/bookRideItem/index.tsx`

**Key component names**

- `BookRide`
- `CouponsBottomSheet`
- `BookRideItem`

**Key snippet**

```tsx
const isCouponApplicable =
  couponsData?.success &&
  (couponsData?.is_apply_all === 1 ||
    couponsData?.applicable_vehicles?.includes(item?.id));
```

```tsx
if (isCouponApplicable) {
  const discountValue = `${couponsData?.amount ?? 0}`;
  const flatValue = couponsData?.total_coupon_discount ?? 0;

  if (couponsData?.coupon_type === "percentage") {
    couponSaving = originalFare * (Number(discountValue) / 100);
  } else {
    couponSaving = flatValue;
  }
}
```

**Ride adaptation**

Add:

- `components/PromoCodeSheet.tsx`
- `app/api/ride/estimate+api.ts` promo validation support
- `promo_codes` and `promo_redemptions` tables

Use with existing customer booking screens:

- `app/(main)/(customer)/book-ride/index.tsx`
- `app/(main)/(customer)/confirm-ride/index.tsx`
- `components/FareBreakdownSheet.tsx`

Important constraint: never reduce the driver's displayed/expected fare unless Ride creates an explicit platform subsidy settlement mechanism.

### 4.2 Driver Incentive Dashboard

**GoCab file**

- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_driver/src/screen/settings/incentive/index.tsx`

**Key component name**

- `Incentive`

**Key snippet**

```tsx
const completedRides = currentData?.rides_completed || 0;
const progressPercentage = Math.min((completedRides / nextTarget) * 100, 100);

const totalEarned = achievedLevels.reduce(
  (acc: number, lvl: any) => acc + parseFloat(lvl.incentive_amount || 0),
  0,
);
```

**Ride adaptation**

Create a driver goal screen under the driver settings/package area. Suggested files:

- `app/(main)/(rider)/packages.tsx`
- `app/(main)/(rider)/call-ledger.tsx`
- new `app/(main)/(rider)/incentives.tsx`

Backend can calculate goals from:

- `rides.status='completed'`
- `driver_online_sessions`
- `dispatch_offers`
- `call_ledger`
- `credit_vouchers`

Recommended first incentive: bonus call credits, not cash.

### 4.3 Driver Availability And Online Guard

**GoCab file**

- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_driver/src/screen/home/homeScreen/index.tsx`

**Key component name**

- `Home`

**Key snippet**

```tsx
if (walletBalance < minWalletBalance) {
  setLowBalance(true);
  notificationHelper("", translateData.insufficientWalletBalance, "error");
  setIsOnline(false);
}
```

```tsx
await setDoc(driverRef, updatePayload, { merge: true });
await startLiveLocation(driverId, selfDriver);
```

**Ride adaptation**

Ride already has stronger server-side enforcement through:

- `app/api/driver/status+api.ts`
- `store/useDriverStatusStore.ts`
- `store/usePackageStore.ts`
- `app/api/package/active+api.ts`

Recommended improvement is UX clarity:

- Show "No active package", "Calls exhausted", "Daily cap reached", or "Package expired".
- Offer direct CTA to package purchase.
- Show `calls_remaining`, `daily_calls_used`, `expires_at` before allowing online toggle.

### 4.4 Incoming Driver Offer Sheet

**GoCab file**

- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_driver/src/screen/home/component/upcomingRide.tsx/index.tsx`

**Key component name**

- `UpcomingRide`

**Key snippets**

```tsx
dispatch(acceptRequestValue(payload))
  .unwrap()
  .then(async res => {
    if (res?.id) {
      navigate('AcceptFare', {
        ride_Id: rideDetails?.id,
        ride_Details: rideDetails,
      });
    }
  });
```

```tsx
{biddingOf &&
  !declined &&
  ride?.service_category?.service_category_type !== 'rental' &&
  ride?.service?.service_type !== 'ambulance' && (
    <ProgressBar
      onComplete={() => {
        declineRide(ride?.id);
      }}
    />
  )}
```

**Ride adaptation**

Enhance:

- `components/RideOfferSheet.tsx`
- `components/CountdownRing.tsx`
- `store/useDriverStore.ts`
- WebSocket event payload in `utils-server/index.ts` and `utils-server/dispatch.ts`

Suggested event payload additions:

```json
{
  "pickup_distance_km": 1.8,
  "pickup_eta_minutes": 6,
  "rider_rating": 4.8,
  "rider_completed_rides": 12,
  "is_scheduled": false
}
```

Keep Ride's current call-deduction model: deduction only after `fetch:confirm`, never passive receipt.

### 4.5 Rider Preferences / Add-ons

**GoCab files**

- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_laravel/Modules/CabBooking/database/migrations/2024_10_02_115839_create_preferences_table.php`
- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_laravel/Modules/CabBooking/app/Http/Traits/RideRequestTrait.php`
- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_user/src/screens/bookRide/index.tsx`

**Key structures**

```php
Schema::create('preferences', function (Blueprint $table) {
    $table->id();
    $table->string('name')->nullable();
    $table->unsignedBigInteger('icon_image_id')->nullable();
    $table->integer('status')->nullable()->default(1);
});
```

```php
Schema::create('vehicle_type_zone_preferences', function (Blueprint $table) {
    $table->unsignedBigInteger('vehicle_type_zone_id')->nullable();
    $table->unsignedBigInteger('preference_id')->nullable();
    $table->double('price')->default(0);
});
```

```php
$driverIds = $driverIds->whereRelation('preferences', function ($driver) use ($preferenceIds) {
    $driver->WhereIn('preference_id', $preferenceIds);
});
```

**Ride adaptation**

Add a small preference system:

- `preferences`
- `driver_preferences`
- `ride_preferences`
- optional `preference_charge_bdt` in fare breakdown

Initial preferences should be practical and limited:

- Large luggage
- Quiet ride
- AC required
- Female-friendly driver preference
- Extra waiting flexibility

This should integrate with:

- `lib/fareCalc.ts`
- `app/api/ride/estimate+api.ts`
- `app/api/ride/request+api.ts`
- `utils-server/dispatch.ts`

### 4.6 Parcel Delivery

**GoCab files**

- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_laravel/Modules/CabBooking/database/seeders/ServiceSeeder.php`
- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_laravel/Modules/CabBooking/database/migrations/2024_10_02_115840_create_rides_table.php`
- `_reference/GoCab v1.0/GoCab v1.0/codecanyon-61391802-gocab-grab-uber-clone-taxi-booking-cab-rental-bidding-parcel/GoCab_user/src/screens/outStation/Parcel/index.tsx`

**Key fields**

```php
$table->json('parcel_receiver')->nullable();
$table->integer('parcel_delivered_otp')->nullable();
$table->string('weight')->nullable();
$table->unsignedBigInteger('cargo_image_id')->nullable();
```

**Ride adaptation**

Defer until post-MVP. When added, model it as a separate lead type:

```ts
lead_type: 'ride' | 'parcel'
```

Parcel dispatch should have separate package eligibility and probably a different deduction price than passenger ride leads.

## Final Recommendation

Ride should borrow GoCab's product surfaces, not its architecture.

The highest-confidence improvements are:

1. Driver SOS.
2. Better scheduled ride picker.
3. Driver offer filters / missed-request clarity.
4. Platform-funded promo codes.
5. Driver incentives as bonus calls.
6. Richer incoming offer sheet.

Avoid bidding and surge pricing for MVP. They conflict with Ride's subscription-based, fixed-fare, driver-first positioning.

