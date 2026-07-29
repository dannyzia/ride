# Prompt For Frontend Development — Two-Pass Execution Strategy

> Copy-paste each section below into your coding agent. Feed one task at a time.
> After the session prompt, paste one task block, wait for output, then paste the next task block.

---

## System Prompt (set once at session start)

```
You are a code execution agent for the Ride project (Expo Router + React Native + Supabase).
Your ONLY job: read the task given and produce the exact output it asks for.
You do NOT design. You do NOT improve. You do NOT add features.

RULES — any violation = output rejected:

1. OUTPUT: One line with the file path, then the complete file in a code block.
   Nothing else. No explanations. No summaries.

2. COPY THE TEMPLATE EXACTLY. The code_template in the task is verified correct.
   If it imports X, you import X. If it omits Y, you omit Y.

3. NO ADDITIONS. No error boundaries. No TypeScript interfaces unless the
   template has them. No comments except what the template says. No refactoring.

4. DARK MODE MANDATORY: Every color className (bg-*, text-*, border-*) MUST have
   a dark: variant. bg-white MUST have dark:bg-goBgDark. No exceptions.

5. ALLOWED IMPORTS ONLY:
   - react, react-native
   - react-native-safe-area-context (SafeAreaView)
   - expo-router (router, useRouter, useLocalSearchParams)
   - expo-location, expo-image-picker
   - @/lib/supabase (supabase)
   - @/lib/logger (logger)
   - @/theme/goRide (colors)
   - @/store/useDriverStore, @/store/useDriverFlowStore
   - @/store/useRiderStore (from @/store/useRiderStore, NOT barried)
   - @/store (useCustomer, useWSStore, useAppUserStore, useRideOfferStore only)
   - @/lib/vehicleTypes (VEHICLE_TYPES)
   - @/components/CustomButton, RideLayout, BarikoiAutocomplete, InputField, etc.
   Importing from any other path IS AN ERROR.

6. INSTANT BAN — if you write any of these, delete them immediately:
   - font-[Urbanist] or font-inter → use font-JakartaBold / font-Jakarta
   - StyleSheet.create → use NativeWind className only
   - console.log → use logger.info/warn/error from @/lib/logger
   - // TODO or "In a real app" → no placeholder comments
   - @react-navigation/*, redux/*, next/* → wrong framework, NEVER import
   - SafeAreaView from 'react-native' → must be react-native-safe-area-context

7. SELF-CHECK before every output:
   [ ] All color classNames have dark: variant
   [ ] All imports from allowed paths only
   [ ] Fonts: font-JakartaBold / font-Jakarta (never font-[Urbanist] or font-inter)
   [ ] SafeAreaView from react-native-safe-area-context
   [ ] No console.log, no TODO
   [ ] Matches template exactly — nothing added, nothing removed
```

---

## PASS 1 OF 2: Audit & Fix (modify existing files)

Run ALL of these in order. They are find-replace operations on EXISTING files.
No files are created — only modified.

### Batch 1: Font & Security fixes (affects shared auth files — run FIRST)

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-001-PHONE-ENTRY.
It is an audit_and_fix on app/(auth)/phone-entry.tsx.
Apply ALL find/replace pairs in the "fixes" section.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-006-SIGNUP.
It is an audit_and_fix on app/(auth)/register.tsx.
Apply ALL find/replace pairs.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-007-OTP.
It is an audit_and_fix on app/(auth)/otp-verify.tsx.
Apply ALL find/replace pairs.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-009-SIGNIN.
It is an audit_and_fix on app/(auth)/login.tsx.
CRITICAL: This fixes a security bug — plaintext password in logs.
Apply BOTH find/replace pairs.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-023-LOGOUT.
It is an audit_and_fix on app/(main)/(customer)/(tabs)/profile/index.tsx.
Verify signOut exists. Run tsc after.
```

### Batch 2: Rider P0 audit (core booking flow — files already exist)

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-011-HOME.
It is an audit_and_fix on app/(main)/(customer)/(tabs)/home/index.tsx.
Apply ALL find/replace pairs (console.warn → logger.warn, font fixes).
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-012-SEARCH.
It is an audit_and_fix on app/(main)/(customer)/autocomplete/index.tsx.
Apply the fix (console.error → logger.error).
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-013-FIND-RIDE.
It is an audit_and_fix on app/(main)/(customer)/find-ride/index.tsx.
No fixes needed — just verify by running tsc.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-016-FARES.
It is an audit_and_fix on app/(main)/(customer)/book-ride/index.tsx.
No fixes needed — just verify by running tsc.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-017-CONFIRM.
It is an audit_and_fix on app/(main)/(customer)/confirm-ride/index.tsx.
No fixes needed — just verify by running tsc.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-018-TRACKING.
It is an audit_and_fix on app/(main)/(customer)/final-page/index.tsx.
Apply font fixes (font-urbanist-bold → font-JakartaBold, font-inter → font-Jakarta).
```

### Batch 3: Driver P0 audit (core driver flow — files already exist)

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-004-SIGNUP.
It is an audit_and_fix on app/(auth)/register.tsx.
Apply the font fix. Wait—register.tsx was already fixed in Batch 1. If
font-[Urbanist] is already replaced, skip. Only apply if still present.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-005-DOCUMENTS.
It is an audit_and_fix on app/(main)/(rider)/onboarding/documents.tsx.
No fixes needed. Just verify tsc passes.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-006-SIGNIN.
It is an audit_and_fix on app/(auth)/login.tsx.
login.tsx was already fixed in Batch 1. If the security fix and font fixes
are already applied, skip. If not, apply ALL pairs.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-009-HOME.
It is an audit_and_fix on app/(main)/(rider)/index.tsx.
Apply ALL find/replace pairs (console.warn → logger.warn, 3 instances).
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-010-NAVIGATE-PICKUP.
It is an audit_and_fix on app/(main)/(rider)/find-customer/index.tsx.
No fixes needed. Just verify tsc passes.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-011-START-TRIP.
It is an audit_and_fix on app/(main)/(rider)/enter-otp/index.tsx.
No fixes needed. Just verify tsc passes.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-012-ACTIVE-TRIP.
It is an audit_and_fix on app/(main)/(rider)/finish-ride/index.tsx.
CRITICAL 4 bugs: Indian phone codes +91, wrong WS event names, wrong role.
Apply ALL 4 find/replace pairs.
```

### Batch 4: Rider P1 audit

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-024-FORGOT-PASSWORD.
It is an audit_and_fix on app/(auth)/forgot-password.tsx.
Apply font fixes (font-[Urbanist] → font-JakartaBold, font-inter → font-Jakarta).
```

**--- END OF PASS 1 ---**
**Now run: npx tsc --noEmit from the project root. Must pass before continuing.**

---

## PASS 2 OF 2: Create (build new screens)

Run ALL of these in order. Each creates NEW files from code_templates.
Copy the template EXACTLY — it is verified correct.

### Batch 5: Rider P0 create (auth onboarding — screens 2-10)

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-002-WALKTHROUGH-1.
CREATE file at app/(auth)/walkthrough-1.tsx. Copy code_template exactly.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-003-WALKTHROUGH-2.
CREATE file at app/(auth)/walkthrough-2.tsx. Copy code_template exactly.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-004-WALKTHROUGH-3.
CREATE file at app/(auth)/walkthrough-3.tsx. Copy code_template exactly.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-005-WELCOME.
CREATE file at app/(auth)/welcome.tsx. Copy code_template exactly.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-008-PROFILE.
CREATE file at app/(main)/(customer)/profile/edit.tsx.
Copy code_template exactly. This screen has photo upload + API integration.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-010-LOCATION.
CREATE file at app/(auth)/enable-location.tsx. Copy code_template exactly.
```

### Batch 6: Rider P0 create (booking flow — screens 14-22)

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-014-CATEGORY.
This task has TWO files:
1. CREATE components/VehicleCategoryCard.tsx (new_components section)
2. CREATE app/(main)/(customer)/select-category/index.tsx (code_template section)
Copy BOTH code_templates exactly. Do them in order.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-015-VEHICLE.
CREATE file at app/(main)/(customer)/select-vehicle/index.tsx.
Copy code_template exactly. Uses useLocalSearchParams for category param.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-019-DRIVER-INFO.
CREATE file at app/(main)/(customer)/driver-info/index.tsx.
Copy code_template exactly. Reads driver from useRiderStore activeRide.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-020-RATE.
CREATE file at app/(main)/(customer)/rate-driver/index.tsx.
Copy code_template exactly. API call to POST /api/ride/{id}/rate.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-021-COMPLETED.
CREATE file at app/(main)/(customer)/ride-completed/index.tsx.
Copy code_template exactly.
```

```
Read docs/Plan/RIDER-P0-TASKS.yaml. Execute ONLY task RIDER-022-CANCEL.
This task has TWO files:
1. CREATE app/(main)/(customer)/cancel-reason/index.tsx (code_template)
2. CREATE app/(main)/(customer)/canceled/index.tsx (extra_files section)
Copy BOTH exactly. The cancel-reason screen has the API call.
```

### Batch 7: Driver P0 create (onboarding + home flow)

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-001-SPLASH.
CREATE file at app/(auth)/driver-splash.tsx. Copy code_template exactly.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-002-WALKTHROUGH.
This task has THREE files:
1. CREATE app/(auth)/driver-walkthrough-1.tsx (code_template)
2. CREATE app/(auth)/driver-walkthrough-2.tsx (extra_files)
3. CREATE app/(auth)/driver-walkthrough-3.tsx (extra_files)
Copy all three exactly.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-003-WELCOME.
CREATE file at app/(auth)/driver-welcome.tsx. Copy code_template exactly.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-007-LOCATION.
CREATE file at app/(auth)/driver-enable-location.tsx.
Copy code_template exactly. Uses expo-location permission request.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-008-VEHICLE-SELECT.
CREATE file at app/(main)/(rider)/select-active-vehicle.tsx.
Copy code_template exactly. Uses VEHICLE_TYPES from @/lib/vehicleTypes.
IMPORTANT: useDriverStore from @/store/useDriverStore (SEPARATE FILE),
NOT from @/store barrel.
```

```
Read docs/Plan/DRIVER-P0-TASKS.yaml. Execute ONLY task DRIVER-013-RATE-RIDER.
CREATE file at app/(main)/(rider)/rate-rider/index.tsx.
Copy code_template exactly. API call to POST /api/ride/{id}/rate-rider.
```

**--- STOP: Run npx tsc --noEmit. Must pass. ---**

### Batch 8: Rider P1 create (secondary screens 23-38)

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-025-NOTIFICATIONS.
CREATE file at app/(auth)/notifications-permission.tsx. Copy template exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-026-AVAILABLE-OPTIONS-EXPANDED.
CREATE file at app/(main)/(customer)/available-options-expanded/index.tsx.
Copy template exactly. Has fare calculation logic.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-027-APPLY-PROMOS.
CREATE file at app/(main)/(customer)/apply-promos/index.tsx.
Copy template exactly. API call to POST /api/promo/apply.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-028-NO-DRIVERS.
CREATE file at app/(main)/(customer)/no-drivers-available/index.tsx.
Copy template exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-029-VOICE-CALL.
CREATE file at app/(main)/(customer)/voice-call/index.tsx.
Copy template exactly. CANONICAL version — P3 has a skip_if_exists duplicate.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-030-VIDEO-CALL.
CREATE file at app/(main)/(customer)/video-call/index.tsx.
Copy template exactly. CANONICAL version — P3 has a skip_if_exists duplicate.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-031-VIDEO-CALL-EXPANDED.
CREATE file at app/(main)/(customer)/video-call-expanded/index.tsx.
Copy template exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-032-ADD-TIP.
CREATE file at app/(main)/(customer)/add-tip/index.tsx. Copy template exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-033-EMERGENCY-SOS.
CREATE file at app/(main)/(customer)/emergency-sos/index.tsx. Copy template exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-034-ACTIVITY-ONGOING.
CREATE file at app/(main)/(customer)/(tabs)/activity/index.tsx.
Copy template exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY task RIDER-035-ACTIVITY-SCHEDULED.
This task has TWO files:
1. CREATE app/(main)/(customer)/(tabs)/activity-scheduled/index.tsx (code_template)
2. CREATE app/(main)/(customer)/(tabs)/activity-completed/index.tsx (extra_files)
Copy both exactly.
```

```
Read docs/Plan/RIDER-P1-TASKS.yaml. Execute ONLY tasks RIDER-036, RIDER-037, RIDER-038.
These are profile/settings creation screens. Execute one at a time.
```

### Batch 9: Driver P1 create (subscription, hotspot, earnings)

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute ONLY task DRIVER-014-PERSONAL-PROFILE.
CREATE file at app/(main)/(rider)/personal-profile/index.tsx. Copy template.
```

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute ONLY task DRIVER-015-SUBSCRIPTION-PLANS.
CREATE file at app/(main)/(rider)/subscription-plans/index.tsx. Copy template.
```

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute ONLY task DRIVER-016-SUBSCRIPTION-DETAILS-CHECKOUT.
This task has TWO files. Create both in order.
```

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute ONLY task DRIVER-017-SUBSCRIPTION-CONFIRM-RENEW-ACTIVE.
This task has THREE files. Create all three in order.
```

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute tasks DRIVER-018 through DRIVER-024.
These are: Hotspot Map, Performance Stats, Schedule, Break Mode, Rider No-Show,
Turn-by-Turn, Trip Issue. Execute one at a time in order.
```

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute ONLY task DRIVER-025-EARNINGS.
This task has FOUR files. Create all four in order.
```

```
Read docs/Plan/DRIVER-P1-TASKS.yaml. Execute ONLY task DRIVER-048-NOTIFICATIONS-PERMISSION.
CREATE file at app/(auth)/driver-notifications-permission.tsx. Copy template.
```

**--- STOP: Run npx tsc --noEmit. Must pass. ---**

### Batch 10: Rider P2 create (payment, scheduling, settings)

```
Read docs/Plan/RIDER-P2-TASKS.yaml. Execute ONLY tasks RIDER-041 through RIDER-054.
14 tasks total. Run them in order — one at a time. These are: Add Stop, Choose
Payment, Schedule Ride, Schedule After Promo, Scheduling User Ride, Ride Scheduled,
Finding Driver, Activity Share Receipt, Settings (Linked Accounts, App Appearance,
Help & Support, Privacy Policy, Delete Account, Request Data).
Each task may have extra_files — create all files listed.
```

### Batch 11: Driver P2 create (wallet, profile, vehicles)

```
Read docs/Plan/DRIVER-P2-TASKS.yaml. Execute ONLY tasks DRIVER-026 through DRIVER-035.
10 tasks total. Run in order: Wallet, Wallet TopUp, Payout Methods, Payout History,
Profile + Edit Profile, Vehicle Management, Add Vehicle, Documents, Insurance, Ratings.
Each may have extra_files — create all.
```

**--- STOP: Run npx tsc --noEmit. Must pass. ---**

### Batch 12: Rider P3 create (history, receipts, inbox, referral)

```
Read docs/Plan/RIDER-P3-TASKS.yaml. Execute create tasks only. Skip tasks marked
skip_if_exists (they are duplicates of P1/P2 tasks):
- RIDER-055 (Home Raster): CREATE
- RIDER-056 (Fares After Promo): CREATE
- RIDER-057 (Voice Call): SKIP (duplicate of P1-029)
- RIDER-058 (Video Call): SKIP (duplicate of P1-030)
- RIDER-059 (Share Trip): CREATE
- RIDER-060 (User Arrived): CREATE
- RIDER-061 (Rate Driver 5Star): CREATE
- RIDER-062 (Ride History Detail): CREATE
- RIDER-063 (Driver Trip History): CREATE (has extra_file)
- RIDER-064 (Share Receipt): SKIP (duplicate of P2-048)
- RIDER-065 (Activity Canceled): CREATE
- RIDER-066 (Activity TopUp): SKIP (duplicate of P2-048 sub-file)
- RIDER-067 (Top Up Flow): CREATE (has extra_files)
- RIDER-068 (Inbox): CREATE
- RIDER-069 (Referral): CREATE
- RIDER-070 (Saved Addresses): CREATE (has extra_files)
- RIDER-071 (Linked Accounts): SKIP (duplicate of P2-049)
```

### Batch 13: Driver P3 create (settings, support, safety, referral)

```
Read docs/Plan/DRIVER-P3-TASKS.yaml. Execute ONLY tasks DRIVER-036 through DRIVER-044.
9 tasks total. Run in order: Settings, Settings Notifications, Settings Account,
Settings Appearance + Language, Support + FAQ, Contact Support + Report Issue,
Safety, Cancellation Reasons, Referral.
Each may have extra_files — create all.
```

**--- FINAL: Run npx tsc --noEmit. Must pass with zero errors. ---**

---

## Quick Reference: Task Count & Order

| Pass | Batch | Tasks | Files Created | Type |
|---|---|---|---|---|
| 1 | 1 | RIDER-001,006,007,009,023 | 0 (modify 4+1 shared) | audit_and_fix |
| 1 | 2 | RIDER-011,012,013,016,017,018 | 0 (modify 6) | audit_and_fix |
| 1 | 3 | DRIVER-004,005,006,009,010,011,012 | 0 (modify 7) | audit_and_fix |
| 1 | 4 | RIDER-024 | 0 (modify 1) | audit_and_fix |
| **P1 TOTAL** | | **21 audit tasks** | **0 files** | |
| | | | | |
| 2 | 5 | RIDER-002,003,004,005,008,010 | 6 | create |
| 2 | 6 | RIDER-014,015,019,020,021,022 | 8 (+2 extras) | create |
| 2 | 7 | DRIVER-001,002,003,007,008,013 | 9 (+2 extras) | create |
| 2 | 8 | RIDER-025–038 | 11 (+2 extras) | create |
| 2 | 9 | DRIVER-014–025,048 | 14 (+8 extras) | create |
| 2 | 10 | RIDER-041–054 | 14 (+6 extras) | create |
| 2 | 11 | DRIVER-026–035 | 10 (+5 extras) | create |
| 2 | 12 | RIDER-P3 creates only | 10 (+4 extras) | create |
| 2 | 13 | DRIVER-036–044 | 9 (+8 extras) | create |
| **P2 TOTAL** | | **~93 create tasks** | **~120 files** | |

---

## If a tsc error occurs at any STOP point:

1. Filter errors to YOUR files only:
   `npx tsc --noEmit 2>&1 | Select-String "<your-filename>"`
2. If the error is in a file YOU created/modified → fix it.
3. If the error is in a file you NEVER touched → it is a NEW pre-existing error.
   REPORT IT TO THE HUMAN. Do NOT try to fix it.
4. The `expect: 0` in verification means "zero errors introduced by THIS task".
   Pre-existing repo errors (fixed as of 2026-07-15) should return 0 total errors — if
   non-zero, someone regenerated them. Report them.
5. After fixing: re-run `npx tsc --noEmit` and confirm zero errors.
