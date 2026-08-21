# Ride App — Plans 06–11 Draft Implementation Plan & Model Allocation

**Version:** Draft 1.0
**Date:** 2026-08-21
**Source Basis:** Kimi `01 06-10 Features Update.md` v3.2, current Ride repository structure, current stack, Plan 05 supporting-feature constraints, and Kilo model-orchestration strategy.

---

## 1. Purpose

This document converts Kimi's revised Plans 06–11 into an **executable implementation program** for Kilo Code.

It does **not** replace the product requirements in Kimi's document.

It establishes:

* implementation phases;
* dependency order;
* repository verification requirements;
* backend/frontend sequencing;
* reusable-component strategy;
* model allocation;
* review gates;
* high-risk areas;
* parallelization opportunities;
* completion criteria.

Kimi's document remains the feature specification. This document is the execution strategy.

Kimi explicitly identifies Plan 06 as the foundation, followed by Plans 07–10, with Plan 11 and cross-cutting work integrated around them.

---

# 2. Repository Baseline

The current application is an Expo SDK 53 / React Native / TypeScript application using:

* Zustand;
* NativeWind;
* MapLibre;
* Supabase/PostgreSQL;
* Drizzle ORM;
* Expo API routes under `app/api`;
* a separate WebSocket dispatch server;
* H3-based dispatch;
* PortPos for payments;
* Barikoi for Bangladesh geocoding/maps.

The repository already contains substantial driver infrastructure.

Examples include:

* driver tabs;
* driver home;
* earnings;
* call ledger;
* incentives;
* vehicles;
* documents;
* subscriptions;
* wallet;
* ratings;
* performance;
* hotspot map;
* schedule;
* support;
* safety;
* driver APIs.

The repository therefore **must not be treated as greenfield**.

The coding agents must inspect existing implementations before creating replacements.

The current repository structure already contains driver API routes such as:

`daily-stats`, `call-ledger`, `commission-statement`, `documents`, `dues`, `incentives`, `lost-items`, `me`, `missed-requests`, `payout-method`, `performance`, `ratings`, `schedule`, `slider-config`, `status`, `vehicle-models`, `vehicles`, `vehicle-type-change`, `wallet`, and earnings endpoints.

This is important because Kimi's document frequently describes endpoints as if they may need to be created, while the repository indicates that many already exist.

Therefore:

> **VERIFY → MODIFY/EXTEND → CREATE ONLY IF ABSENT**

is the governing implementation rule.

---

# 3. Overall Implementation Architecture

The execution should be organized into **seven major implementation waves**, not 52 independent screen tasks.

```text
WAVE 0
Repository / component / API verification
        ↓
WAVE 1
Driver navigation + status foundation
        ↓
WAVE 2
Driver core tabs
        ↓
WAVE 3
Vehicle + subscription + package ecosystem
        ↓
WAVE 4
Money / ledger / payout / lost-items
        ↓
WAVE 5
Support / safety / communication / schedule
        ↓
WAVE 6
Performance / ratings / intelligence / profile
        ↓
WAVE 7
Cross-cutting completion + legal + i18n + final audit
```

The critical principle is:

**Do not send 52 screens to one coding model as one task.**

Each wave should be divided into coherent implementation units.

---

# 4. High-Level Phase Allocation

| Phase | Main Scope                                      | Dependency | Primary Model     | Review          |
| ----- | ----------------------------------------------- | ---------- | ----------------- | --------------- |
| 0     | Repository verification + architecture baseline | None       | GPT-5.6 Luna      | MiMo Pro        |
| 1     | Driver foundation                               | Phase 0    | GLM-5.3           | MiMo Pro        |
| 2     | Driver core tabs                                | Phase 1    | GLM-5.2 / GLM-5.3 | MiMo Pro        |
| 3     | Vehicle/subscription/packages                   | Phase 1    | GLM-5.2           | MiMo Pro        |
| 4     | Money + ledger + lost items                     | Phases 1–3 | GLM-5.3           | GLM-5.3 skeptic |
| 5     | Support/safety/communication                    | Phase 1    | GLM-5.2           | MiMo Pro        |
| 6     | Performance/profile/intelligence                | Phases 2–4 | GLM-5.2           | MiMo Pro        |
| 7     | Cross-cutting + legal + i18n + final audit      | All        | DeepSeek/GLM-5.2  | GLM-5.3         |

---

# 5. Phase 0 — Repository Reality Check

## Objective

Before implementation, establish which parts of Kimi's plan already exist, which require modification, and which are genuinely new.

This phase should **not modify application behavior** unless a verification reveals an existing blocker that is explicitly part of the execution prerequisites.

## Tasks

### 0.1 Route Inventory

Verify every route mentioned by Plans 06–11 against the actual repository.

Classify each:

* EXISTING + correct;
* EXISTING + incomplete;
* EXISTING + buggy;
* EXISTING + wrong contract;
* MISSING.

The repository already demonstrates significant overlap with Kimi's proposed API surface.

### 0.2 Component Inventory

Locate and classify:

* `EmptyState`;
* `StatusBadge`;
* `SettingsRow`;
* `TransactionRow`;
* `LoadingRider`;
* skeleton components;
* `DriverStatsBar`;
* `MinRateSlider`;
* `SchedulePicker`;
* `SOSButton`;
* payment components;
* theme utilities;
* driver state stores.

Plan 05 explicitly states that existing reusable components should be reused rather than duplicated. `EmptyState`, `StatusBadge`, `SettingsRow`, `TransactionRow`, `LoadingRider`, and related components are specifically identified as reuse candidates.

### 0.3 API Contract Audit

For each API:

1. inspect current implementation;
2. inspect authentication;
3. inspect role authorization;
4. inspect request validation;
5. inspect database queries;
6. inspect response shape;
7. compare against Kimi contract;
8. determine whether modification is required.

### 0.4 Navigation Audit

Verify:

* `(main)/(rider)` really is the driver namespace;
* existing tab layout;
* existing stack layout;
* authentication routing;
* driver onboarding;
* driver status;
* deep-link behavior.

### 0.5 Existing Defect Inventory

Known repository issues already called out by Plan 05 must be included in the implementation baseline, including the vehicle-type-change flow and SOS routing issues.

### Deliverable

A machine-readable/internal implementation map:

```text
route
  → existing file
  → required action
  → API dependency
  → component dependency
  → risk
  → implementation phase
```

**Model:** GPT-5.6 Luna

**Why:** This is repository decomposition, not a major architecture redesign. Terra is unnecessary at this stage unless the repository inspection discovers a fundamental architectural conflict.

---

# 6. Phase 1 — Driver Foundation

## Priority: CRITICAL

Kimi correctly identifies this as the foundation without which the driver application cannot function.

### Unit 1A — Driver Tab Layout

Target:

`app/(main)/(rider)/(tabs)/_layout.tsx`

Responsibilities:

* five tabs;
* 64px driver tab bar;
* Pattern A theming;
* no header;
* wallet badge;
* `DriverStatusGuard`.

This should be implemented first.

### Model

**GLM-5.3**

Reason:

This is navigation infrastructure and affects every downstream driver screen. A bad implementation creates widespread routing problems.

---

## Unit 1B — DriverStatusGuard

Target:

`components/DriverStatusGuard.tsx`

States:

| Status    | Result                      |
| --------- | --------------------------- |
| temporary | onboarding                  |
| pending   | pending review              |
| suspended | suspended                   |
| rejected  | rejected + reason + reapply |
| active    | driver application          |

Requirements include:

* `GET /api/driver/me`;
* polling while blocked;
* retry/check status;
* support routing;
* onboarding routing;
* authorization boundary.

### Model

**GLM-5.3**

This is not merely UI. It is an authorization/navigation boundary.

---

## Unit 1C — Storage Registry

Target:

`lib/storageKeys.ts`

Centralize driver storage keys.

This is mechanical and can be handled by:

**DeepSeek V4 Flash**

---

## Unit 1D — Shared Foundation Components

Build/verify:

* `ErrorBanner`;
* `OfflineIndicator`;
* Pattern A skeleton;
* reusable confirmation modal;
* reusable driver section/card primitives;
* `ProgressBar`;
* `StatCard`.

However, existing components must be inspected first. Plan 05 explicitly identifies reuse of existing `EmptyState`, `StatusBadge`, `SettingsRow`, `TransactionRow`, and loading components.

### Model

**GLM-5.2**

The shared components are simple, but they become dependencies for many screens.

---

# 7. Phase 2 — Driver Core Tabs

## Dependency

Phase 1 complete.

Kimi's specified order is:

1. Earnings;
2. Wallet;
3. Activity;
4. Profile;
5. Settings.

The draft execution should preserve this order because Earnings and Wallet establish the core driver data surfaces.

---

## Unit 2A — Earnings Tab

Includes:

* daily earnings;
* goal tracking;
* weekly chart;
* stats;
* earnings navigation;
* goal modal;
* refresh;
* empty/loading/error states.

The repository already has `/api/driver/daily-stats`, so this should initially be treated as an existing API to verify rather than automatically recreated.

### Model

**GLM-5.3**

Reason:

Money + chart + persisted goal + date logic + driver UX.

---

## Unit 2B — Wallet Tab

Includes:

* balance;
* dues;
* subscription;
* recent transactions;
* top-up;
* due payment;
* payment routing.

Payment purpose tags must be respected:

* `wallet_topup`;
* `due_payment`.

Kimi explicitly specifies these payment purposes.

### Model

**GLM-5.3**

Reason:

Wallet and payment state are high-trust functionality.

---

## Unit 2C — Activity Tab

Includes:

* trip history;
* filters;
* pagination;
* pull-to-refresh;
* empty state;
* trip detail routing.

### Model

**GLM-5.2**

The logic is substantial but comparatively conventional.

---

## Unit 2D — Profile Tab

Includes:

* driver identity;
* rating;
* trip count;
* vehicle summary;
* vehicle/document/verification links;
* settings/support/referral;
* sign-out.

Sign-out must clear driver application state correctly.

### Model

**GLM-5.2**

---

## Unit 2E — Settings Tab

Includes:

* Auto Accept;
* sound;
* navigation app;
* minimum rate;
* account settings;
* support;
* legal.

The minimum-rate flow should reuse the existing `MinRateSlider` and its validation path rather than creating a second slider abstraction. Plan 05 explicitly mandates this reuse.

### Model

**GLM-5.2**

---

## Phase 2 Gate

Before proceeding:

* five tabs work;
* status guard works;
* navigation is correct;
* driver APIs return expected data;
* money values are correct;
* TypeScript passes;
* lint passes;
* no duplicate shared components;
* no `console.log`;
* no legacy theme logic.

---

# 8. Phase 3 — Vehicle, Subscription & Package Ecosystem

## Priority: HIGH

Kimi defines this as 10 screens with seven backend dependencies.

This phase should be divided into three functional groups.

---

## Unit 3A — Vehicle Management

Screens:

* Add Vehicle;
* Select Active Vehicle;
* Vehicle Management.

Existing repository routes include:

* `vehicles`;
* `vehicle-models`;
* `vehicle-type-change`.

Therefore the coding agent must inspect these before creating anything.

### Important existing issue

Plan 05 explicitly identifies the existing active-vehicle implementation as incorrectly PATCHing `vehicle_type` to `/api/driver/me`, where it is silently stripped.

The intended fix is the dedicated:

`/api/driver/vehicle-type-change`

flow.

This is a **high-value correctness item**, not cosmetic cleanup.

### Model

**GLM-5.3**

Use GLM-5.3 specifically for the vehicle-state transition and type-change implementation.

---

## Unit 3B — Subscription

Screens:

* Subscription Plans;
* Subscription Checkout;
* Subscription Confirmation;
* Subscription Details;
* Subscription Renewal;
* Active Subscription.

Payment flow uses PortPos.

Payment purpose:

* `subscription`;
* `subscription_renewal`.

Kimi explicitly specifies these purpose tags.

The repository already has payment and package infrastructure, so the coding agent must inspect existing subscription activation/payment-event logic before changing it.

### Model

**GLM-5.2**

Escalate a specific payment-state bug to GLM-5.3.

---

## Unit 3C — Call Packages

Includes:

* available packages;
* active package;
* purchase;
* package confirmation behavior.

Payment purpose:

`driver_package`.

### Model

**GLM-5.2**

---

## Phase 3 Review

**MiMo 2.5 Pro**

Review specifically for:

* vehicle state transitions;
* subscription state;
* payment callback behavior;
* accidental duplication;
* online/offline vehicle switching;
* stale subscription state.

---

# 9. Phase 4 — Money System

## Priority: HIGH / HIGH-RISK

This phase should receive more model budget than ordinary UI work.

Kimi classifies this as 11 screens and 10 backend dependencies and explicitly describes money screens as high-trust.

The repository also contains existing earnings, wallet, dues, commission, call-ledger, and payout endpoints.

---

## Unit 4A — Call Ledger

Includes:

* monthly grouping;
* deductions;
* pagination;
* missed-request integration.

Important repository fact:

Plan 05 explicitly says there should **not** be a separate missed-requests screen. The existing missed-request endpoint feeds the call-ledger missed tab.

Therefore the implementation should not create a redundant screen unless repository evidence proves the existing architecture has changed.

### Model

**GLM-5.2**

---

## Unit 4B — Commission Statement

Includes:

* monthly statement;
* earnings;
* deductions;
* net;
* PDF export.

### Model

**GLM-5.2**

---

## Unit 4C — Earnings Breakdown / Weekly / Detail

Reuse existing earnings APIs where possible.

The repository already contains:

* `/api/driver/earnings/breakdown`;
* `/api/driver/earnings/weekly`.

The Kimi plan also identifies `/api/driver/earnings/breakdown` as an existing contract requiring extension/verification.

### Model

**GLM-5.2**

---

## Unit 4D — Due Amounts

Includes:

* due balance;
* explanation;
* payment action;
* payment callback;
* Wallet synchronization.

### Model

**GLM-5.3**

Reason:

Due amounts interact directly with wallet/payment state.

---

## Unit 4E — Payout Methods

Kimi proposes bKash payout methods.

Plan 05 explicitly locks bKash-only payout methods and identifies a new GET requirement alongside the existing POST endpoint.

### Model

**GLM-5.2**

---

## Unit 4F — Minimum Rate

Reuse:

`components/MinRateSlider.tsx`

and:

`GET /api/driver/slider-config`

plus:

`PATCH /api/driver/me`

with `validateDriverMinKm()`.

This validation requirement is explicitly identified in Plan 05.

### Model

**GLM-5.2**

---

## Unit 4G — Driver Lost Items

This is a critical gap identified by Kimi.

The driver must be able to respond:

* I Have It;
* Not Found;
* Arrange Return.

The repository already contains:

`app/api/driver/lost-items+api.ts`

so the first task is contract verification, not API recreation.

### Model

**GLM-5.3**

Reason:

This crosses rider/driver state and must preserve the lost-item state machine.

---

## Phase 4 Gate

Require:

* monetary values verified in paisa;
* no floating-point persistence;
* payment callbacks verified;
* due state synchronized;
* ledger state correct;
* lost-item transitions correct;
* API authorization verified;
* pagination verified.

### Review

**GLM-5.3 Code Skeptic**

This is one of the places where spending scarce GLM-5.3 capacity is justified.

The skeptic should actively attempt to break:

* ledger calculations;
* duplicate payment handling;
* callback replay;
* stale wallet balance;
* negative balances;
* concurrent transactions;
* lost-item transitions.

---

# 10. Phase 5 — Support, Safety, Communication & Schedule

## Priority: HIGH

Kimi defines 10 screens.

Group them by technical complexity.

---

## Unit 5A — Support

Includes:

* Contact Support;
* FAQ;
* Support chat;
* Trip Issue;
* Report Issue.

Requirements:

* category selection;
* attachments;
* issue classification;
* chat;
* retry;
* empty/loading states.

### Model

**GLM-5.2**

---

## Unit 5B — Safety

Includes:

* Safety;
* SOS;
* emergency contacts.

The repository already has an `SOSButton`.

Plan 05 explicitly identifies an existing defect: it currently routes to a driver-only SOS endpoint that produces 403s for riders. The intended endpoint is:

`POST /api/sos/alert`

This should be treated as a cross-cutting safety correction.

### Model

**GLM-5.3**

Reason:

Safety actions are high-risk and authorization-sensitive.

---

## Unit 5C — Communication

Includes:

* Driver Chat;
* Customer Navigation.

Customer Navigation uses MapLibre.

### Model

**GLM-5.2**

Escalate MapLibre lifecycle problems to GLM-5.3 if discovered.

---

## Unit 5D — Schedule

Includes:

* day selection;
* availability;
* time ranges;
* conflict detection;
* save.

Existing `SchedulePicker` must be inspected before creating a new scheduling component. Plan 05 explicitly says to reuse it if it already covers the required behavior.

### Model

**GLM-5.2**

---

# 11. Phase 6 — Performance, Ratings, Intelligence & Profile

## Priority: MEDIUM

Kimi defines eight screens and five backend dependencies.

This phase should be divided into:

---

## Unit 6A — Profile

* Edit Profile;
* Personal Profile.

Photo upload must use the existing Supabase storage conventions.

Kimi specifies:

* gallery-only selection;
* JPG/PNG;
* 5MB maximum;
* upload progress.

### Model

**GLM-5.2**

---

## Unit 6B — Ratings

Includes:

* average;
* count;
* distribution;
* reviews;
* empty state.

Existing:

`/api/driver/ratings`

must be verified before modification.

### Model

**GLM-5.2**

---

## Unit 6C — Referral

Includes:

* referral code;
* rewards;
* history;
* copy;
* share.

No new referral deep-link system should be introduced without repository/product evidence; Plan 05 explicitly excludes referral deep linking.

### Model

**DeepSeek V4 Flash**

---

## Unit 6D — Hotspot Map

Uses the existing H3/geospatial architecture and MapLibre.

This is more technically sensitive than an ordinary screen because hotspot rendering is connected to the dispatch/geospatial system.

Existing `/api/driver/hotspots` and related heatmap infrastructure should be inspected.

### Model

**GLM-5.3**

This is a good GLM-5.3 use because incorrect assumptions about H3 or map data can cause functional rather than cosmetic failure.

---

## Unit 6E — Incentives / Performance

Includes:

* performance statistics;
* incentives;
* earnings-performance visualization.

Existing performance and incentives endpoints exist.

Plan 05 specifically calls for daily earnings bars using `react-native-svg` rather than introducing a chart library.

### Model

**GLM-5.2**

---

## Unit 6F — Rider No-Show

This is an operational ride-state transition and should not be treated as ordinary UI.

### Model

**GLM-5.3**

---

# 12. Phase 7 — Plan 11: Legal + i18n

## Priority: LOW TECHNICAL RISK / HIGH COMPLETION VALUE

Plan 11 contains:

* rider Terms;
* rider Privacy;
* driver Terms;
* driver Privacy;
* i18n foundation.

Kimi specifies `lib/legalContent.ts` and English/Bengali structure.

However, there is an important dependency:

Plan 05 states that legal content is **blocked on owner-provided copy**.

Therefore the implementation plan must distinguish:

### 7A — Legal UI Infrastructure

Can proceed:

* screen layout;
* content loader;
* section rendering;
* theme;
* typography;
* navigation.

### 7B — Actual Legal Copy

Blocked until authoritative legal content is supplied.

Do not have a coding model invent legally binding Terms or Privacy Policy language.

### 7C — i18n

Extend the existing i18n system if repository inspection confirms its structure.

Plan 05 indicates:

`i18n/locales/{en,bn}/common.json`

and:

`i18n/i18n.ts`

already exist and should be extended.

Therefore do **not** automatically create a competing `lib/i18n.ts`.

This is a concrete example where repository reality should override Kimi's suggested alternative implementation location.

### Model

**DeepSeek V4 Flash** for mechanical string migration.

**GLM-5.2** for the initial i18n architecture migration if existing implementation is inconsistent.

---

# 13. Cross-Cutting Implementation

These should not be postponed blindly until the end.

## 13.1 Theme

Every new/modified screen must follow Pattern A:

* `useIsDark()`;
* theme tokens;
* no `theme === "dark"`;
* no NativeWind `dark:` classes.

Kimi's master verification requires this for all screens.

---

## 13.2 Loading

Standardize:

* initial loading;
* refresh loading;
* pagination loading;
* action loading.

Do not create one bespoke skeleton per screen.

---

## 13.3 Empty State

Reuse the existing `EmptyState`.

Duplicate EmptyState components should be considered a review failure because Plan 05 explicitly identifies duplication as a blocker.

---

## 13.4 Errors

Use `ErrorBanner` consistently.

Required categories:

* error;
* warning;
* info.

---

## 13.5 Offline

Implement the shared `OfflineIndicator`.

Then apply it to data-heavy driver screens.

---

## 13.6 Image Upload

Centralize the upload behavior:

* gallery;
* validation;
* compression;
* unique filename;
* Supabase Storage;
* progress;
* retry.

Kimi specifies compression to 1200px width and retry with exponential backoff.

The exact bucket names must be verified against the repository before implementation.

---

## 13.7 PaymentWebView

Standardize the `purpose` contract.

Required purposes from Kimi:

```text
wallet_topup
due_payment
subscription
subscription_renewal
driver_package
```

Payment callback/deep-link handling should be implemented as one coherent system rather than independently by each screen.

---

## 13.8 Push Notifications

Implement notification-to-route mapping centrally.

Kimi identifies this as a previously missing cross-cutting requirement.

---

# 14. Dependency Graph

```text
Repository Audit
      │
      ├── Shared Components
      │
      ├── API Contract Audit
      │
      └── Navigation Audit
              │
              ▼
       Driver Tab Foundation
              │
       ┌──────┼───────────┐
       ▼      ▼           ▼
    Earnings Wallet    Activity/Profile/Settings
       │      │
       └──────┼───────────┘
              │
              ▼
       Vehicle Ecosystem
              │
              ├── Vehicle
              ├── Subscription
              └── Packages
              │
              ▼
          Money System
              │
       ┌──────┼─────────────┐
       ▼      ▼             ▼
     Ledger  Wallet      Lost Items
       │
       ▼
 Support / Safety / Communication
              │
              ▼
 Performance / Profile / Intelligence
              │
              ▼
 Cross-Cutting Completion
              │
              ▼
 Final Audit
```

---

# 15. Parallelization Strategy

Parallelization should happen **between independent functional domains**, not between tightly coupled files.

## Safe Parallelization

After Phase 1:

```text
                 Driver Foundation
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
   Vehicle          Support          Performance
   Ecosystem        & Safety         Screens
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                  Money System
```

However, money should not be implemented concurrently with changes to shared wallet/payment contracts unless the API contracts have already been frozen.

---

# 16. Model Allocation

## GPT-5.6 Luna

Use for:

* Phase 0 repository analysis;
* decomposition;
* dependency mapping;
* routine planning.

Do not spend Terra capacity here.

---

## GLM-5.3

Reserve for:

1. DriverStatusGuard;
2. Driver tab foundation;
3. Earnings/Wallet high-risk implementation;
4. Vehicle state transition;
5. Due/payment integrity;
6. Driver lost-items state machine;
7. SOS/safety;
8. Hotspot/H3 integration;
9. rider no-show;
10. final code skepticism/audit.

This is approximately **10 high-value uses**, rather than consuming GLM-5.3 on dozens of ordinary screens.

---

## GLM-5.2

Primary implementation model for:

* ordinary driver screens;
* API extensions;
* subscription UI;
* package UI;
* activity;
* support;
* schedule;
* profile;
* ratings;
* performance;
* forms.

---

## DeepSeek V4 Flash

Use for:

* repetitive UI;
* legal screen rendering;
* string migration;
* straightforward CRUD;
* simple component extraction;
* mechanical refactors;
* test additions.

---

## MiMo 2.5 Pro

Use as an independent reviewer after:

* Phase 1;
* Phase 3;
* Phase 5;
* Phase 6.

It should not receive the implementer's reasoning as truth.

---

## GLM-5.3 Skeptic

Use after:

* Phase 4 money system;
* complete Plans 06–11 implementation.

The final skeptic should attempt to disprove correctness rather than merely review style.

---

# 17. Recommended Execution Schedule

The Kimi plan suggests a three-week implementation sequence.

The more useful execution schedule is:

### Stage 1 — Foundation

1. Repository audit.
2. Shared component verification.
3. API contract audit.
4. Driver tab layout.
5. DriverStatusGuard.
6. Storage registry.
7. Core shared components.

### Stage 2 — Driver Core

8. Earnings.
9. Wallet.
10. Activity.
11. Profile.
12. Settings.

### Stage 3 — Vehicle / Monetization

13. Vehicle management.
14. Vehicle type-change correction.
15. Subscription.
16. Packages.

### Stage 4 — Money

17. Call Ledger.
18. Earnings breakdown.
19. Commission.
20. Due amounts.
21. Payout methods.
22. Minimum rate.
23. Lost items.

### Stage 5 — Operational Support

24. Support.
25. FAQ.
26. SOS.
27. Emergency contacts.
28. Chat.
29. Customer navigation.
30. Schedule.

### Stage 6 — Driver Intelligence

31. Profile editing.
32. Ratings.
33. Referral.
34. Hotspot.
35. Incentives.
36. Performance.
37. Rider no-show.

### Stage 7 — Completion

38. i18n.
39. Legal UI.
40. Notification routing.
41. Deep links.
42. Offline behavior.
43. accessibility pass.
44. loading/empty/error pass.
45. TypeScript/lint.
46. independent review.
47. GLM-5.3 final skeptic.
48. final corrections.

---

# 18. Verification Gates

## Gate A — Foundation

Must pass before screens:

* navigation;
* status guard;
* auth;
* shared components;
* theme;
* TypeScript;
* lint.

## Gate B — Core Driver

Must pass before Vehicle/Money:

* all five tabs;
* real API data;
* navigation;
* refresh;
* loading;
* empty;
* errors.

## Gate C — Money

Must pass before Support/Performance:

* wallet;
* payments;
* ledger;
* dues;
* payout;
* lost items.

This is the most important functional gate.

## Gate D — Complete Driver Experience

All Plans 06–10 implemented.

## Gate E — Final System Audit

Check:

* requirements;
* API contracts;
* authorization;
* state transitions;
* money;
* payments;
* navigation;
* deep links;
* push routing;
* theme;
* accessibility;
* errors;
* loading;
* empty states;
* TypeScript;
* lint;
* regression.

Kimi's master checklist explicitly requires these screen/API verification categories.

---

# 19. Important Plan Reconciliation Items

These are not implementation decisions to silently make. They are items the execution process must explicitly verify.

### 19.1 Screen Count

Kimi's document states:

* 52 screens + 3 infrastructure items;
* while also describing an earlier 55-screen figure.

The implementation tracker should use the **actual repository route inventory**, not the headline number.

### 19.2 Existing vs New APIs

Many APIs already exist.

Therefore "backend needs N endpoints" should be interpreted as:

> N endpoint contracts requiring verification/extension,

not necessarily N new files.

### 19.3 i18n Location

Kimi proposes `lib/i18n.ts`.

Plan 05 indicates an existing:

`i18n/i18n.ts`

and locale structure.

The coding agent must inspect and extend the existing implementation rather than creating a competing i18n system.

### 19.4 Missed Requests

Do not create a separate missed-request screen merely because Kimi lists missed requests within the money scope.

Plan 05 explicitly establishes the call-ledger missed tab as canonical.

### 19.5 Payout History / Instant Pay

Plan 05 explicitly excludes:

* `instant-pay`;
* `payout-history`.

The wallet should therefore not silently acquire a withdrawal subsystem during Plans 06–11.

### 19.6 Legal Content

The UI can be prepared, but authoritative legal copy is blocked on owner content.

### 19.7 Referral Deep Linking

Do not build it during this program without new product authorization.

---

# 20. Final Model Strategy

The optimal allocation is **not**:

```text
Every screen → GLM-5.3
```

and it is also not:

```text
Everything → cheapest model
```

The correct allocation is:

```text
              HIGH RISK
                  │
      ┌───────────┴────────────┐
      │                        │
 GLM-5.3                  GLM-5.3 Skeptic
      │                        │
 state/payment/security       final audit
      │
      ▼
 GLM-5.2
 normal implementation
      │
      ▼
DeepSeek V4 Flash
mechanical work
      │
      ▼
MiMo 2.5 Pro
independent review
```

This preserves GLM-5.3 for the areas where one incorrect implementation can cause substantial downstream rework.

---

# 21. Immediate Next Step

Do **not** generate all Kilo prompts yet.

The next execution artifact should be:

**Phase 0 + Phase 1 detailed implementation specification**, containing:

1. exact files to inspect;
2. existing files to reuse;
3. API contracts to verify;
4. DriverTabsLayout implementation boundary;
5. DriverStatusGuard implementation boundary;
6. shared components;
7. acceptance criteria;
8. GLM-5.3 implementation prompt for the foundation;
9. MiMo Pro review prompt for the completed foundation.

Once that foundation is reviewed, the remaining Kilo prompts can be generated in dependency order rather than producing a large collection of prompts that may encode incorrect assumptions about the repository.
