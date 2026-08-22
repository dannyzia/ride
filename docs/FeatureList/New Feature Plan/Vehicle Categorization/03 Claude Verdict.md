 Let me first read the master planning file and explore the repository to understand the current state before giving UI/UX instructions.  
 Let me read the critical reference files to understand the full scope.  
  Let me read the remaining plans and inspect key current files to understand the actual implementation state.    
   Now let me inspect the actual current state of key files in the repository to understand what's really implemented.    
   Let me read the critical theme files and inspect key screens to understand the actual implementation state.      
    Let me check a few more critical files to complete my audit before writing the comprehensive instruction document.        
     Let me check a few key components to see if they follow the Pattern A theming correctly.          
       Now I have a complete picture of the actual state. I found critical infrastructure gaps. Let me write the comprehensive evaluation and instruction document.          
         Now I'll write the comprehensive evaluation and coding instruction document. This will be saved as a downloadable file.           
           The file was too long. Let me write it in chunks using append mode.            
             The document is too large for a single file. Let me split it into multiple focused documents.              
 I have completed the evaluation and written **Part 1: Infrastructure Fix Pack** to:

📄 **`/mnt/agents/output/Ride_App_UIUX_Part1_Infrastructure_Fix_Pack.md`**

This document contains the exact code to fix the critical infrastructure gaps. Below, I provide the **remaining screen specifications, backend wiring, and execution order** directly in this response since the file-writing budget is exhausted.

---

## PART 2: SCREEN-BY-SCREEN SPECIFICATIONS (PLANS 05-11)

### PLAN 05 — RIDER SUPPORTING FEATURES

#### 5.1 `app/(main)/(rider)/break-mode/index.tsx`
**Purpose:** Driver break mode — set type, duration, auto-return.
**State Machine:** `IDLE → SELECT_TYPE → SELECT_DURATION → CONFIRM → LOADING → ACTIVE → END → IDLE`
**API:** `POST /api/driver/break/start+api.ts`, `POST /api/driver/break/end+api.ts`
**Pattern A with `RadioGroup`, `ProgressBar`, `Switch`**

```tsx
// TOP of EVERY new screen:
import { useIsDark } from '@/lib/useAppearance';
import { colors } from '@/theme/goRide';
import { ThemeToggle } from '@/components/ThemeToggle';
const isDark = useIsDark();
const bg = isDark ? colors.bgDark : colors.bgLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
const borderColor = isDark ? colors.borderDark : colors.borderLight;
```

**Wireframe:**
```
┌─────────────────────────────┐
│ [ThemeToggle]    Break Mode │
├─────────────────────────────┤
│      [Clock Icon]           │
│      Take a Break           │
│  Pause ride requests        │
├─────────────────────────────┤
│  Break Type                 │
│  [Meal] [Prayer] [Rest]   │
├─────────────────────────────┤
│  Duration: [====●====] 30m │
├─────────────────────────────┤
│  [ ] Auto-return            │
├─────────────────────────────┤
│  [    Start Break    ]      │
└─────────────────────────────┘
```

---

#### 5.2 `app/(main)/(rider)/packages/index.tsx`
**Purpose:** View active subscription and purchase new ones.
**API:** `GET /api/driver/packages+api.ts`, `POST /api/package/purchase+api.ts`
**Pattern A with card list, `Badge` for active status**

---

#### 5.3 `app/(main)/(rider)/incentives.tsx`
**Purpose:** View and claim incentive campaigns.
**API:** `GET /api/driver/incentives+api.ts`
**Use `ProgressBar` for trip progress, `Badge` for "Active"/"Upcoming" status**

---

#### 5.4 `app/(main)/(rider)/commission-statement/index.tsx`
**Purpose:** Commission breakdown with period filters.
**API:** `GET /api/driver/commission-statement+api.ts`
**Pattern A with filter chips and `TransactionRow`-style list**

---

#### 5.5 `app/(main)/(rider)/earnings/index.tsx`
**Purpose:** Earnings overview with period selector.
**API:** `GET /api/driver/earnings+api.ts`, `GET /api/driver/earnings/weekly+api.ts`
**Use `DriverStatsBar` at top, `ChartBar` for visualization, tab switcher for Daily/Weekly/Monthly**

---

#### 5.6 `app/(main)/(rider)/earnings-detail/[date].tsx`
**Purpose:** Daily earnings detail.
**API:** `GET /api/driver/earnings/breakdown+api.ts?date=YYYY-MM-DD`
**Pattern A with summary header + trip list**

---

#### 5.7 `app/(main)/(rider)/earnings-breakdown/index.tsx`
**Purpose:** Earnings by category (fare, tips, bonuses).
**API:** `GET /api/driver/earnings/breakdown+api.ts`
**Use `ProgressBar` for percentage visualization**

---

#### 5.8 `app/(main)/(rider)/call-ledger.tsx`
**Purpose:** Call history log.
**API:** `GET /api/driver/call-ledger+api.ts`
**Use `Badge` with `variant="info"` for Inbound, `variant="secondary"` for Outbound**

---

#### 5.9 `app/(main)/(rider)/due-amounts/index.tsx`
**Purpose:** View and pay due amounts.
**API:** `GET /api/driver/dues+api.ts`, `POST /api/payment/bkash/create+api.ts`
**Pattern A with total due header + itemized list + `CustomButton` "Pay Now"**

---

#### 5.10 `app/(main)/(rider)/performance-stats/index.tsx`
**Purpose:** Driver performance analytics.
**API:** `GET /api/driver/performance+api.ts`
**Use `ChartLine` for 30-day rating trend, stat cards for acceptance/completion rates**

---

#### 5.11 `app/(main)/(rider)/hotspot-map/index.tsx`
**Purpose:** View demand heatmap.
**API:** `GET /api/driver/hotspots+api.ts`
**Use `Map` component + `HeatmapOverlay` component (NEW)**

---

#### 5.12 `app/(main)/(rider)/subscription-plans/index.tsx`
**Purpose:** Browse and select subscription plans.
**API:** `GET /api/driver/packages+api.ts`
**Pattern A with 3-tier card layout (Basic/Premium/Elite)**

---

#### 5.13 `app/(main)/(rider)/subscription-checkout/index.tsx`
**Purpose:** Checkout for subscription purchase.
**API:** `POST /api/package/purchase+api.ts`
**Pattern A with summary card + payment method selector + `CustomButton`**

---

#### 5.14 `app/(main)/(rider)/subscription-confirmation/index.tsx`
**Purpose:** Post-purchase confirmation.
**Pattern A with `SuccessCheckmark` + confirmation details**

---

#### 5.15 `app/(main)/(rider)/subscription-details/index.tsx`
**Purpose:** View active subscription details.
**API:** `GET /api/driver/packages+api.ts`
**Pattern A with status card + feature list + renewal date**

---

#### 5.16 `app/(main)/(rider)/subscription-renewal/index.tsx`
**Purpose:** Renew subscription before expiry.
**API:** `POST /api/package/purchase+api.ts`
**Pattern A similar to checkout**

---

#### 5.17 `app/(main)/(rider)/active-subscription/index.tsx`
**Purpose:** Quick view of active subscription.
**API:** `GET /api/driver/packages+api.ts`
**Pattern A compact card**

---

### PLAN 06 — DRIVER TAB FOUNDATION

#### 6.1 `app/(main)/(rider)/(tabs)/activity/index.tsx`
**Purpose:** Driver activity history.
**API:** `GET /api/driver/trips+api.ts`
**Pattern A with filter tabs (All/Completed/Cancelled) + `RideCard`-style list**

---

#### 6.2 `app/(main)/(rider)/(tabs)/earning/index.tsx`
**Purpose:** Earnings tab (simplified view).
**API:** `GET /api/driver/earnings+api.ts`
**Use `DriverStatsBar` + recent transactions list**

---

#### 6.3 `app/(main)/(rider)/(tabs)/profile/index.tsx`
**Purpose:** Driver profile view.
**API:** `GET /api/driver/me+api.ts`
**Use `Avatar` + stats grid + menu list with `SettingsRow`**

---

#### 6.4 `app/(main)/(rider)/(tabs)/settings/index.tsx`
**Purpose:** Driver settings.
**Pattern A with `SettingsRow` list: Account Security, Appearance, Language, Auto-Accept, Notifications, Lost Items, Privacy Policy, Terms of Service**

---

#### 6.5 `app/(main)/(rider)/(tabs)/wallet/index.tsx`
**Purpose:** Driver wallet view.
**API:** `GET /api/driver/wallet+api.ts`
**Pattern A with balance card + `TransactionRow` list + top-up button**

---

### PLAN 07 — VEHICLE, SUBSCRIPTION & PACKAGES

#### 7.1 `app/(main)/(rider)/vehicle-management/index.tsx`
**Purpose:** Manage driver vehicles.
**API:** `GET /api/driver/vehicles+api.ts`, `POST /api/driver/vehicles+api.ts`
**Pattern A with vehicle list + "Add Vehicle" button + `VehicleCategoryCard`**

---

#### 7.2 `app/(main)/(rider)/select-active-vehicle/index.tsx`
**Purpose:** Choose which vehicle to drive today.
**API:** `POST /api/driver/vehicles+api.ts` (update active)
**Pattern A with `RadioGroup` of vehicles**

---

#### 7.3 `app/(main)/(rider)/add-vehicle/index.tsx`
**Purpose:** Add new vehicle to driver profile.
**API:** `POST /api/driver/vehicles+api.ts`
**Pattern A with form: brand, model, year, color, registration number, vehicle type**

---

#### 7.4 `app/(main)/(rider)/documents/index.tsx`
**Purpose:** Upload and manage driver documents.
**API:** `GET /api/driver/documents+api.ts`, `POST /api/driver/documents+api.ts`
**Pattern A with `DocumentUploadCard` list + `VerificationStep` for approval status**

---

#### 7.5 `app/(main)/(rider)/verification/index.tsx`
**Purpose:** Track document verification status.
**API:** `GET /api/driver/documents+api.ts`
**Use `VerificationStep` component showing: Uploaded → Under Review → Approved**

---

#### 7.6 `app/(main)/(rider)/onboarding/index.tsx`
**Purpose:** Driver onboarding checklist.
**Pattern A with `VerificationStep` + checklist using `CheckboxGroup`**

---

#### 7.7 `app/(main)/(rider)/rider-intro-configs/index.tsx`
**Purpose:** Configure driver preferences.
**API:** `GET /api/driver/preferences+api.ts`, `POST /api/driver/preferences+api.ts`
**Pattern A with preference toggles**

---

### PLAN 08 — MONEY: EARNINGS, PAYOUTS, LEDGER

#### 8.1 `app/(main)/(rider)/payout-method/index.tsx`
**Purpose:** Manage payout methods (bKash, Nagad, bank).
**API:** `GET /api/driver/payout-method+api.ts`, `POST /api/driver/payout-method+api.ts`
**Pattern A with `RadioGroup` for method selection + form fields**

---

#### 8.2 `app/(main)/(rider)/wallet/topup/index.tsx` (Driver)
**Purpose:** Top up driver wallet.
**API:** `POST /api/driver/wallet/topup+api.ts`
**Pattern A with amount selector + payment method + `CustomButton`**

---

### PLAN 09 — SUPPORT, SAFETY, COMMUNICATION

#### 9.1 `app/(main)/(rider)/contact-support/index.tsx`
**Purpose:** Contact support.
**API:** `POST /api/support/ticket+api.ts`
**Pattern A with issue category `RadioGroup` + `InputField` for description + `CustomButton` "Submit"**

---

#### 9.2 `app/(main)/(rider)/report-issue/index.tsx`
**Purpose:** Report a trip issue.
**API:** `POST /api/support/ticket+api.ts`
**Pattern A with trip selector + issue type + description**

---

#### 9.3 `app/(main)/(rider)/trip-issue/index.tsx`
**Purpose:** Report issue for specific trip.
**API:** `POST /api/support/ticket+api.ts`
**Pattern A with trip info header + issue form**

---

#### 9.4 `app/(main)/(rider)/safety/index.tsx`
**Purpose:** Safety center.
**Pattern A with `SOSButton` prominently displayed + safety tips list**

---

#### 9.5 `app/(main)/(rider)/emergency-contacts/index.tsx`
**Purpose:** Manage emergency contacts.
**API:** `GET /api/driver/emergency-contacts+api.ts`, `POST /api/driver/emergency-contacts+api.ts`
**Pattern A with contact list + "Add Contact" button**

---

#### 9.6 `app/(main)/(rider)/faq/index.tsx`
**Purpose:** Driver FAQs.
**API:** `GET /api/faqs+api.ts`
**Pattern A with accordion-style FAQ list**

---

#### 9.7 `app/(main)/(rider)/chat/[rideId].tsx`
**Purpose:** Chat with customer.
**API:** `POST /api/chat/message+api.ts`
**Pattern A with `ChatScreen` component (must be themed)**

---

### PLAN 10 — PERFORMANCE, RATINGS, INTELLIGENCE

#### 10.1 `app/(main)/(rider)/ratings/index.tsx`
**Purpose:** View customer ratings and feedback.
**API:** `GET /api/driver/ratings+api.ts`
**Pattern A with rating summary card + review list**

---

#### 10.2 `app/(main)/(rider)/rate-rider/index.tsx`
**Purpose:** Rate customer after trip.
**API:** `POST /api/ride/[id]+api.ts` (rating endpoint)
**Pattern A with star rating + `InputField` for comment + tags**

---

### PLAN 11 — CONTENT FILL

#### 11.1 `app/(main)/(rider)/settings/privacy-policy/index.tsx`
**Purpose:** Privacy policy screen.
**Pattern A with `LegalDocumentScreen` component (must be themed)**

---

#### 11.2 `app/(main)/(rider)/settings/terms-of-service/index.tsx`
**Purpose:** Terms of service screen.
**Pattern A with `LegalDocumentScreen` component**

---

#### 11.3 `app/(main)/(rider)/settings/appearance/index.tsx`
**Purpose:** Theme selection.
**Pattern A with `RadioGroup`: System / Light / Dark
**Wiring:** Calls `useAppearance().setTheme()`

---

#### 11.4 `app/(main)/(rider)/settings/language/index.tsx`
**Purpose:** Language selection.
**Pattern A with `RadioGroup`: English / বাংলা
**Wiring:** Calls `useAppearance().setLanguage()`

---

#### 11.5 `app/(main)/(rider)/settings/account-security/index.tsx`
**Purpose:** Security settings.
**Pattern A with change password, 2FA toggle, biometric toggle

---

#### 11.6 `app/(main)/(rider)/settings/auto-accept/index.tsx`
**Purpose:** Auto-accept ride toggle.
**Pattern A with `Switch` + explanation text

---

#### 11.7 `app/(main)/(rider)/settings/notifications/index.tsx`
**Purpose:** Notification preferences.
**Pattern A with `CheckboxGroup` for notification types

---

#### 11.8 `app/(main)/(rider)/settings/lost-items/index.tsx`
**Purpose:** Report lost items.
**API:** `POST /api/driver/lost-items+api.ts`

---

## PART 3: BACKEND API CONTRACTS (NEW + VERIFY)

### New API Routes to Create

| Route | Method | File | Purpose |
|-------|--------|------|---------|
| `/api/driver/break/start` | POST | `app/api/driver/break/start+api.ts` | Start break mode |
| `/api/driver/break/end` | POST | `app/api/driver/break/end+api.ts` | End break mode |
| `/api/driver/packages` | GET | `app/api/driver/packages+api.ts` | List packages |
| `/api/driver/incentives` | GET | `app/api/driver/incentives+api.ts` | List incentives |
| `/api/driver/commission-statement` | GET | `app/api/driver/commission-statement+api.ts` | Commission details |
| `/api/driver/performance` | GET | `app/api/driver/performance+api.ts` | Performance stats |
| `/api/driver/hotspots` | GET | `app/api/driver/hotspots+api.ts` | Demand hotspots |
| `/api/driver/payout-method` | GET/POST | `app/api/driver/payout-method+api.ts` | Payout methods |
| `/api/driver/emergency-contacts` | GET/POST | `app/api/driver/emergency-contacts+api.ts` | Emergency contacts |

### Existing APIs to Verify Still Work

| Route | File | Check |
|-------|------|-------|
| `/api/driver/vehicles` | `app/api/driver/vehicles+api.ts` | CRUD works |
| `/api/driver/documents` | `app/api/driver/documents+api.ts` | Upload + status |
| `/api/driver/earnings` | `app/api/driver/earnings+api.ts` | Returns data |
| `/api/driver/earnings/weekly` | `app/api/driver/earnings/weekly+api.ts` | Returns data |
| `/api/driver/earnings/breakdown` | `app/api/driver/earnings/breakdown+api.ts` | Returns data |
| `/api/driver/wallet` | `app/api/driver/wallet+api.ts` | Balance correct |
| `/api/driver/wallet/topup` | `app/api/driver/wallet/topup+api.ts` | Payment works |
| `/api/driver/trips` | `app/api/driver/trips+api.ts` | List correct |
| `/api/driver/me` | `app/api/driver/me+api.ts` | Profile data |
| `/api/driver/preferences` | `app/api/driver/preferences+api.ts` | Get/set works |
| `/api/driver/ratings` | `app/api/driver/ratings+api.ts` | Ratings data |
| `/api/driver/call-ledger` | `app/api/driver/call-ledger+api.ts` | Call log |
| `/api/driver/dues` | `app/api/driver/dues+api.ts` | Due amounts |
| `/api/chat/message` | `app/api/chat/message+api.ts` | Send/receive |
| `/api/support/ticket` | `app/api/support/ticket+api.ts` | Create ticket |
| `/api/faqs` | `app/api/faqs+api.ts` | FAQ list |

### Database Schema Checks

Verify these tables exist in `src/db/schema.ts`:
- `driver_breaks` (id, driver_id, break_type, started_at, ended_at, duration_minutes, auto_return)
- `subscription_packages` (id, name, price, duration_days, features, is_active)
- `driver_subscriptions` (id, driver_id, package_id, started_at, expires_at, status)
- `incentives` (id, title, description, trip_threshold, reward_amount, start_date, end_date, status)
- `commission_statements` (id, driver_id, trip_id, amount, created_at)
- `payout_methods` (id, driver_id, method_type, account_details, is_default)
- `emergency_contacts` (id, user_id, name, phone, relationship)

---

## PART 4: CODING AGENT EXECUTION ORDER

### Phase 0: INFRASTRUCTURE (DO FIRST — NOTHING ELSE WORKS WITHOUT THIS)
1. Fix `lib/useAppearance.ts` — add `useIsDark()`, `useLanguage()`, `Appearance.setColorScheme()`
2. Fix `theme/goRide.ts` — correct all color values
3. Update `tailwind.config.js` — add all `go*` color mappings
4. Create `components/Themed.tsx`
5. Create `components/ThemeToggle.tsx`
6. Fix `global.css`

### Phase 1: CRITICAL COMPONENT REWRITES
7. Rewrite `components/InputField.tsx` — remove ALL hardcoded dark colors
8. Rewrite `components/RideCard.tsx` — remove ALL hardcoded dark colors
9. Rewrite `components/CustomButton.tsx` — remove ALL hardcoded dark colors
10. Audit and rewrite: `RiderRidesItem`, `ChatScreen`, `FareBreakdownSheet`, `RideOfferSheet`, `DriverNavigation`, `SOSButton`, `DocumentUploadCard`, `LoadingRider`, `ErrorFindDriver`, `SchedulePicker`, `PreferenceChips`, `ExtraChargeApproval`, `TollParkingModal`, `UpfrontTipSlider`, `MinRateSlider`, `VehicleCategoryCard`, `SuccessCheckmark`, `CountdownRing`, `SlideButton`, `FloatingNavMenu`, `DriverStatusBadge`, `RiderHeader`, `AnimatedCard`, `BarikoiAutocomplete`, `FinalDetails`, `Start`, `Middle`, `End`, `OnWay`, `ScreenLabel`, `Skeleton`, `WalletSkeleton`, `NotificationSkeleton`, `RideCardSkeleton`, `Toast`, `Badge`, `Avatar`, `StatusBadge`, `ProgressBar`, `NotificationCard`, `TransactionRow`, `SettingsRow`, `PinInput`, `AlternativesSheet`, `AuthLayout`

### Phase 2: NEW COMPONENTS
11. Create `EmptyState.tsx`
12. Create `ErrorBanner.tsx`
13. Create `OfflineIndicator.tsx`
14. Create `RadioGroup.tsx`
15. Create `CheckboxGroup.tsx`
16. Create `ProgressBar.tsx`
17. Create `Badge.tsx`
18. Create `Avatar.tsx`
19. Create `DriverStatsBar.tsx`
20. Create `RideInfoCard.tsx`
21. Create `DriverActionBar.tsx`
22. Create `VerificationStep.tsx`

### Phase 3: PLAN 05 SCREENS
23. `break-mode/index.tsx`
24. `packages/index.tsx`
25. `incentives.tsx`
26. `commission-statement/index.tsx`
27. `earnings/index.tsx`
28. `earnings-detail/[date].tsx`
29. `earnings-breakdown/index.tsx`
30. `call-ledger.tsx`
31. `due-amounts/index.tsx`
32. `performance-stats/index.tsx`
33. `hotspot-map/index.tsx`
34. `subscription-plans/index.tsx`
35. `subscription-checkout/index.tsx`
36. `subscription-confirmation/index.tsx`
37. `subscription-details/index.tsx`
38. `subscription-renewal/index.tsx`
39. `active-subscription/index.tsx`

### Phase 4: PLAN 06 SCREENS
40. `(tabs)/activity/index.tsx`
41. `(tabs)/earning/index.tsx`
42. `(tabs)/profile/index.tsx`
43. `(tabs)/settings/index.tsx`
44. `(tabs)/wallet/index.tsx`

### Phase 5: PLAN 07 SCREENS
45. `vehicle-management/index.tsx`
46. `select-active-vehicle/index.tsx`
47. `add-vehicle/index.tsx`
48. `documents/index.tsx`
49. `verification/index.tsx`
50. `onboarding/index.tsx`
51. `rider-intro-configs/index.tsx`

### Phase 6: PLAN 08 SCREENS
52. `payout-method/index.tsx`
53. `wallet/topup/index.tsx` (driver)

### Phase 7: PLAN 09 SCREENS
54. `contact-support/index.tsx`
55. `report-issue/index.tsx`
56. `trip-issue/index.tsx`
57. `safety/index.tsx`
58. `emergency-contacts/index.tsx`
59. `faq/index.tsx`
60. `chat/[rideId].tsx`

### Phase 8: PLAN 10 SCREENS
61. `ratings/index.tsx`
62. `rate-rider/index.tsx`

### Phase 9: PLAN 11 SCREENS
63. `settings/privacy-policy/index.tsx`
64. `settings/terms-of-service/index.tsx`
65. `settings/appearance/index.tsx`
66. `settings/language/index.tsx`
67. `settings/account-security/index.tsx`
68. `settings/auto-accept/index.tsx`
69. `settings/notifications/index.tsx`
70. `settings/lost-items/index.tsx`

### Phase 10: BACKEND WIRING
71. Create new API routes for break, packages, incentives, commission, performance, hotspots, payout-method, emergency-contacts
72. Verify all existing API routes still function
73. Add any missing database migrations

### Phase 11: VERIFICATION
74. Run `npx tsc --noEmit` — must pass with 0 errors
75. Test light mode on every screen
76. Test dark mode on every screen
77. Test theme toggle on every screen
78. Test language switch (EN/BN)
79. Verify no `theme ===` or `dark:` classes remain
80. Verify `useIsDark` is used in every screen file

---

## PART 5: MASTER VERIFICATION CHECKLIST

### Infrastructure
- [ ] `lib/useAppearance.ts` exports `useIsDark` and `useLanguage`
- [ ] `theme/goRide.ts` has correct colors: `primary: '#0CC25F'`, `bgDark: '#181A20'`, `textPrimaryDark: '#FFFFFF'`
- [ ] `tailwind.config.js` has all `go*` mappings
- [ ] `components/Themed.tsx` exists
- [ ] `components/ThemeToggle.tsx` exists and works
- [ ] `global.css` has `@tailwind` directives

### Components
- [ ] `InputField` — no hardcoded `text-white`, `bg-neutral-950`
- [ ] `RideCard` — no hardcoded `bg-neutral-900`, `text-white`
- [ ] `CustomButton` — no hardcoded color classes
- [ ] All 12 new components created and themed

### Screens
- [ ] Every screen imports `useIsDark` from `@/lib/useAppearance`
- [ ] Every screen (except SplashAnimation) has `<ThemeToggle />`
- [ ] Every screen uses Pattern A (inline styles with `useIsDark`)
- [ ] No screen uses NativeWind `dark:` classes
- [ ] No screen has hardcoded `bg-neutral-900`, `text-white`, `bg-black`
- [ ] All 52 Plan 05-11 screens exist and compile

### Backend
- [ ] All new API routes return correct data
- [ ] All existing API routes still work
- [ ] Database schema has all required tables
- [ ] Zod validation on all new endpoints

### Quality
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] App runs in light mode without visual glitches
- [ ] App runs in dark mode without visual glitches
- [ ] Theme toggle switches instantly
- [ ] Language switch (EN/BN) works
- [ ] No console errors or warnings

---

## CRITICAL RULES FOR THE CODING AGENT

1. **NEVER use `theme === 'dark'`** — always use `const isDark = useIsDark()`
2. **NEVER use NativeWind `dark:` classes** — they are banned
3. **ALWAYS import `useIsDark` at the top of every screen**
4. **ALWAYS render `<ThemeToggle />` in the absolute top-right of every screen** (except SplashAnimation)
5. **ALWAYS define these 6 variables at the top of every screen:**
   ```tsx
   const isDark = useIsDark();
   const bg = isDark ? colors.bgDark : colors.bgLight;
   const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
   const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
   const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
   const borderColor = isDark ? colors.borderDark : colors.borderLight;
   ```
6. **NEVER hardcode colors** — always use `colors` from `theme/goRide.ts`
7. **Use `StyleSheet.create`** for static styles, inline objects for dynamic colors
8. **Font families:** `Jakarta-Bold`, `Jakarta-SemiBold`, `Jakarta-Medium`, `Jakarta-Regular`
9. **Test BOTH light and dark mode** after every screen
10. **If a component is complex, use `ThemedView` and `ThemedText` helpers**

---

**FILES DELIVERED:**
- ✅ `/mnt/agents/output/Ride_App_UIUX_Rethink_3_Master_Plan.md` (existing master plan)
- ✅ `/mnt/agents/output/Ride_App_UIUX_Part1_Infrastructure_Fix_Pack.md` (new — exact code for infrastructure fixes)
- ✅ This response contains Parts 2-5 (screen specs, backend wiring, execution order, verification checklist)

**The coding agent should start with Part 1 (Infrastructure Fix Pack) and follow the execution order exactly. Do not skip Phase 0. Do not build screens before components are fixed.**