# Ride — Draft / Initial Implementation Plan

## Pass 3 — Repository-Grounded Execution Plan for Plans 06–11

This is the **revised implementation plan**, not a review of the previous plan.

It is based on:

* Kimi Plans 06–10 v3.2, which defines **52 screens + 3 infrastructure items** and explicitly adds edge cases, validation, accessibility, backend Zod contracts, notification/deep-link mapping, etc. 
* `FEATURES.md` v14 and the current Plan 05 state. 
* The repository audit, which establishes the actual current implementation state: 24 implemented, 7 defective, 8 partial, 6 UI-only, 1 backend-only, and 6 not started. 
* The audit's exact remaining-work and dependency lists. 

The central change from the earlier draft is:

> **We are not implementing Plans 06–11 from scratch. We are completing and repairing an existing system against the Kimi specification.**

---

# 1. Execution Model

The implementation should **not** be executed as:

```text
Plan 06 → Plan 07 → Plan 08 → Plan 09 → Plan 10 → Plan 11
```

That would unnecessarily serialize work and would cause coding agents to repeatedly modify the same foundation.

Instead:

```text
                    ┌─────────────────────────┐
                    │  P0 — Architecture Gates │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ P1 — Driver Foundation  │
                    │ Activity + Wallet       │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       P2 Vehicle          P3 Money/Payment    P4 Support/Safety
       + Subscription      + Payout            + Schedule
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │ P5 Performance/Intell.  │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼───────────┐
                    │ P6 Legal + i18n        │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼───────────┐
                    │ P7 Cross-cutting       │
                    │ + Final Verification   │
                    └────────────────────────┘
```

---

# 2. Phase 0 — Architecture / Safety Gates

**Do not start the dependent implementation units until these gates are settled.**

This phase is intentionally small. It is not a giant architecture project.

## P0.1 Driver navigation/status gate

### Required

Modify:

```text
app/(main)/(rider)/(tabs)/_layout.tsx
```

to establish the intended driver tab foundation.

Current problems:

* tab bar is hidden;
* `DriverStatusGuard` is not wrapping the tabs;
* Settings exists but isn't wired into the tab layout;
* actual guard lives at `components/auth/DriverStatusGuard.tsx`;
* guard lacks the specified 30-second polling/check-status behavior. 

### Decision

**Do not create a second `DriverStatusGuard`.**

Use the existing component and modify it only as required.

### Model

**GLM-5.2**

This is architecture-sensitive enough to avoid a weak implementation, but not sufficiently uncertain to spend GLM-5.3 yet.

---

# 3. Phase 0.2 — Payment / Subscription Boundary

This is the most important architectural gate.

The repository already has:

```text
packages
subscriptions
callLedger
paymentEvents
```

and working:

```text
/api/package/list
/api/package/purchase
```

while Kimi proposes dedicated subscription endpoints.

The audit explicitly identifies the conflict and marks the subscription flow high risk. 

## Required decision

Determine whether:

### Option A — Extend existing package architecture

```text
package/*
    ↓
subscriptions
    ↓
callLedger
```

or:

### Option B — Introduce dedicated driver subscription APIs

```text
driver/subscription-plans
driver/subscription/checkout
driver/subscription/renew
    ↓
subscriptions
    ↓
callLedger
```

### Constraint

**Do not allow both systems to become independent sources of truth.**

The existing `subscriptions` table relates drivers to packages, while the existing package APIs are already used by working flows. 

### Model

**GPT-5.6 Terra**

This is one of the few places where the scarce planning model is justified: one wrong decision can cause four screens, payment handling, and wallet/subscription state to be rebuilt later.

---

# 4. Phase 0.3 — Money / Payment Integrity Gate

Before modifying wallet, payout, subscription, or instant-pay flows:

Audit and lock:

```text
paymentEvents
wallet
driver transactions
payouts
subscriptions
callLedger
accounting
tax
```

The repository already has accounting integration and payment-event infrastructure. `FEATURES.md` confirms wallet top-up, instant pay, subscription sale and payout accounting are already integrated. 

### Required invariant

Every payment-producing operation must have:

```text
one transaction owner
one payment-event owner
one ledger effect
one accounting effect
```

No new agent is allowed to invent another payment-event writer.

### Model

**GLM-5.3**

This is data-integrity-sensitive work, exactly the class for which GLM-5.3 should be reserved. 

---

# 5. Phase 0.4 — Vehicle State Gate

Fix the canonical active vehicle state before vehicle UI work.

Current API behavior returns:

```text
is_active: true
```

for every vehicle. 

The existing backend already has:

```text
POST /api/driver/vehicle-type-change
```

with authorization, eligibility checks and a transaction. 

## Decision

Do **not** blindly replace this with Kimi's proposed:

```text
PATCH /api/driver/vehicles/{id}/activate
```

Instead:

1. establish canonical active-vehicle semantics;
2. fix `vehicles+api.ts`;
3. preserve the existing vehicle-type-change business logic unless it demonstrably fails the product requirement;
4. make the frontend conform to the canonical backend behavior.

### Model

**GLM-5.2**

---

# 6. Phase 0.5 — Zone / H3 Gate

The hotspot screen is visually implemented, but the audit establishes that the backend currently derives hotspot positions from zone polygon centroids rather than H3. 

`FEATURES.md` also establishes that Zone Z-4 remains unfinished and heartbeat still stamps a single active zone. 

Therefore:

```text
Hotspot screen ≠ fully compliant hotspot implementation
```

### Required

Do not rebuild the hotspot UI first.

Resolve:

* H3 resolution 9;
* zone → H3 mapping;
* actual demand/supply cell semantics;
* multi-zone compatibility;
* heartbeat zone resolution where required.

This is partly Plan 05 carryover, but it is a **prerequisite to calling Plan 10 hotspot intelligence complete**.

### Model

**GLM-5.3**

---

# 7. Phase 1 — Driver Foundation

## P1.1 Driver Tab Layout

**R-04 + R-05**

Implement:

* visible 5-tab navigation;
* Pattern A theming;
* correct icons;
* status guard wrapping;
* wallet badge support;
* correct driver route structure.

The Kimi specification defines the tab layout as Wave 0 and explicitly makes it the foundation for all other driver tabs. 

**Model:** DeepSeek V4 Flash for straightforward wiring, with **MiMo 2.5 review**.

---

## P1.2 DriverStatusGuard

Repair existing guard:

```text
components/auth/DriverStatusGuard.tsx
```

Required:

* pending;
* suspended;
* rejected;
* temporary;
* active;
* polling while on status screen;
* status refresh;
* rejection reason;
* verification retry/check-status path;
* no access to active driver tabs when blocked.

**Model:** GLM-5.2.

---

## P1.3 Earnings Goal

**R-01 + R-23**

Restore the removed earnings-goal functionality.

Required:

* goal modal;
* persistence;
* canonical storage key;
* allowed range;
* Dhaka-date reset;
* progress calculation;
* earnings breakdown integration;
* empty/loading/error state.

The feature is explicitly identified as a regression: the API remains but the UI has disappeared from the tree. 

**Model:** GLM-5.2 rather than MiMo Pro. The audit's MiMo allocation is acceptable for routine work, but this is a regression in a primary tab and should be implemented correctly the first time.

---

# 8. Phase 1.4 — Activity Tab

## R-02

This is a **rebuild**, not a modification.

Current Activity is only a static menu. It does not provide trip history. 

### Backend

Create:

```text
GET /api/driver/trips
```

using existing:

```text
rides
```

### Frontend

Implement:

* trip cards;
* date/time;
* origin/destination;
* fare;
* status;
* filters;
* pagination/infinite scroll;
* pull-to-refresh;
* loading;
* empty;
* error;
* offline state.

### Important

Do not disturb existing:

* Call Ledger;
* Missed Requests;
* Due Amounts;
* Schedule.

Those remain separate destinations.

**Model:** GLM-5.3.

This is one of the three critical defects identified by the audit. 

---

# 9. Phase 1.5 — Wallet

## R-03 + R-12

Current Wallet is incomplete:

* no due card;
* no subscription card;
* no transaction list;
* no top-up/withdraw actions;
* wallet API response does not provide the expected due field. 

### Canonical Wallet contract

The final contract should support:

```text
balance
due
active subscription
transactions
top-up
withdraw / instant pay
```

But transaction/top-up/withdraw implementations must reuse existing payment/accounting infrastructure.

### API

Fix:

```text
GET /api/driver/dues
GET /api/driver/wallet
```

and verify:

```text
GET /api/driver/active-subscription
GET /api/driver/transactions
POST /api/driver/instant-pay
```

where applicable.

### Model

**GLM-5.3** for the backend/data-integrity portion.

Wallet UI can then be implemented by **GLM-5.2**.

---

# 10. Phase 2 — Vehicle Ecosystem

## P2.1 Vehicle Management

**R-06 + R-22**

Fix:

```text
GET /api/driver/vehicles
```

first.

Then modify UI for:

* actual active state;
* vehicle photo;
* document expiry;
* inactive vehicle activation prompt;
* delete confirmation;
* appropriate empty state.

**Model:** GLM-5.2.

---

## P2.2 Select Active Vehicle

**R-07**

Use the canonical vehicle-type-change implementation.

Add:

* radio selection;
* online-state warning;
* confirmation;
* automatic offline transition if required by product semantics;
* refresh after change.

Do not create a duplicate activation API merely to match Kimi's path literally.

**Model:** GLM-5.2.

---

# 11. Phase 2.3 — Subscription / Package Ecosystem

## R-08

This is a dedicated implementation epic.

It includes:

```text
subscription-plans
subscription-checkout
subscription-details
subscription-renewal
```

### Order

```text
subscription architecture decision
        ↓
API/data contract
        ↓
payment flow
        ↓
active subscription state
        ↓
screens
        ↓
wallet integration
        ↓
renewal
```

The existing package purchase flow already works, including PaymentWebView and polling. 

Therefore the implementation must **extend/reuse existing payment infrastructure**, not create a parallel checkout system.

### Model

**GLM-5.3**

### Review

**Claude 5 / Claude Code**

This is exactly the kind of high-risk multi-screen architecture where independent review is warranted.

---

# 12. Phase 3 — Money Features

## P3.1 Earnings Breakdown

Modify:

```text
earnings-breakdown/index.tsx
```

to use the required date-driven contract rather than the current fixed weekly range. 

**Model:** GLM-5.2.

---

## P3.2 Commission Statement

**R-11**

Add:

* month selector;
* 12-month history;
* PDF export if supported by existing infrastructure;
* API `?month=`.

The audit identifies this as a current partial implementation. 

**Model:** MiMo Pro / GLM-5.2.

---

## P3.3 Payout Methods

**R-09 + R-13**

Implement:

```text
GET /api/driver/payout-method
POST /api/driver/payout-method
```

and management screen.

Preserve the existing:

* bKash-only rule;
* validation;
* driver authorization;
* single-active-method behavior.

The POST already exists; the missing capability is listing/management. 

**Model:** GLM-5.2.

---

## P3.4 Minimum Rate

**R-10**

Create settings screen around existing:

```text
MinRateSlider
GET /api/driver/slider-config
PATCH /api/driver/me
```

Use canonical `validateMinPerKm`.

**Model:** DeepSeek V4 Flash.

Review with MiMo 2.5.

---

# 13. Phase 4 — Support / Safety / Schedule

These are mostly **modification and verification**, not greenfield work.

## P4.1 Support

**R-14**

Verify whether the generic:

```text
POST /api/support/ticket
```

can safely serve driver support.

Do not create:

```text
/api/driver/support-tickets
```

unless role semantics require it.

The current screen works against the generic endpoint, but lacks the richer Kimi form. 

Add:

* category;
* subject;
* message;
* attachment if required by spec;
* success/error;
* driver authorization semantics.

**Model:** GLM-5.2.

---

# 14. Phase 4.2 — Emergency Contacts

Modify existing CRUD:

```text
GET/POST/DELETE /api/user/emergency-contacts
```

Add:

* Bangladesh phone validation;
* maximum five contacts;
* confirmation;
* empty state.

The underlying feature already works. 

**Model:** DeepSeek V4 Flash.

---

# 15. Phase 4.3 — SOS

Do not rebuild the existing SOS button.

Repair the known gaps:

* actual cooldown enforcement;
* active-alert state;
* retry behavior;
* offline handling;
* polling;
* resolve behavior.

`FEATURES.md` confirms the existing alert pipeline already includes DB, SMS, push, admin broadcast and auto-resolution. 

The remaining issue is primarily correctness of the cooldown/state behavior.

**Model:** GLM-5.3.

---

# 16. Phase 4.4 — Scheduling

Current schedule is only day toggles and lacks time ranges/conflict detection. 

Implement:

* time ranges;
* overlap validation;
* server-side conflict logic;
* correct GET/PUT contract;
* remove or implement the currently-404 overlap endpoint.

**Model:** GLM-5.2.

---

# 17. Phase 4.5 — Lost Items

**Do not rebuild.**

The feature already exists end-to-end:

* GET;
* driver-scoped authorization;
* "I Have It";
* "Not Found";
* "Arrange Return";
* persisted state transition. 

Only verify against the current Kimi specification and repair the `return_method` schema typing if necessary.

**Model:** DeepSeek V4 Flash / MiMo review.

---

# 18. Phase 5 — Performance / Intelligence / Profile

## P5.1 Performance

Already implemented.

Only:

* verify against Plan 10;
* test period switching;
* verify ≤30 points;
* verify chart rendering;
* verify retry.

**Model:** MiMo 2.5.

---

## P5.2 Incentives

Already implemented and authenticated.

Verify only.

**Model:** MiMo 2.5.

---

## P5.3 Ratings

**R-15**

Add:

* 5-star distribution bars;
* anonymous-review indication;
* preserve current API semantics.

**Model:** MiMo Pro.

---

## P5.4 Referral

**R-16**

First verify whether `/api/user/referral` is correctly role-safe and semantically suitable.

Only create `/api/driver/referral` if repository evidence demonstrates that the generic endpoint cannot meet the driver requirement.

**Model:** DeepSeek V4 Flash.

---

## P5.5 Driver Profile

Add:

* member since;
* vehicle information;
* preserve existing photo/name/city editing.

Also fix the unrelated-but-real navigation regression:

```text
router.push("/(main)/(rider)/onboarding")
```

→ correct profile return behavior.

This is **R-21**.

**Model:** MiMo Pro.

---

## P5.6 Hotspot

Treat as a backend/data-architecture task first.

Current screen is already visually implemented, but the backend is not using the required H3 model. 

### Model

**GLM-5.3**

### Review

**Gemini 3.1 Pro**

---

# 19. Phase 6 — Plan 11 Content / i18n

## P6.1 Legal Content

**R-17 + R-18**

Create:

```text
lib/legalContent.ts
```

then make:

* Rider Terms;
* Driver Terms;
* Rider Privacy;
* Driver Privacy

consume the shared content.

Do not duplicate legal text across screens.

**Model:** DeepSeek V4 Flash.

---

## P6.2 i18n

**R-19 + R-20**

There is already:

```text
i18n/
  locales/en/common.json
  locales/bn/common.json
```

Therefore:

> **Extend the existing i18n architecture. Do not create a competing i18n implementation.**

Add:

* language persistence;
* driver strings;
* missing Bengali strings;
* correct hydration on startup.

**Model:** GLM-5.2.

---

# 20. Phase 7 — Shared Component Cleanup

These should be handled opportunistically, not allowed to become a standalone giant phase.

## Keep and wire where they have a real consumer

### R-24

`ProgressBar`

### R-25

`Badge`

### R-26

`Avatar`

### R-28

`CheckboxGroup` — first verify whether it has a legitimate consumer.

## Delete

### R-27

`HeatmapOverlay`

The audit explicitly says it is superseded by the existing Map CircleLayer implementation. 

Do not manufacture consumers just to eliminate an "unwired component" finding.

---

# 21. Cross-Cutting Plan 05 Carryovers

These should **not disappear simply because they are outside Plans 06–11.**

The following remain tracked:

| Item                                            | Treatment                                    |
| ----------------------------------------------- | -------------------------------------------- |
| Zone Z-4                                        | Complete before hotspot is declared complete |
| Nil-UUID zone sentinel                          | Remove                                       |
| `zone_multi_active_enabled` admin configuration | Fix                                          |
| Apply-promos contract                           | Fix separately                               |
| SOS cooldown                                    | Included in P4                               |
| Schedule overlap                                | Included in P4                               |
| platform_config seeding                         | Fix                                          |
| Shared component cleanup                        | P7                                           |

`FEATURES.md` explicitly identifies the zone and configuration items as remaining Plan 05 work. 

---

# 22. Model Allocation

## High-end models

| Work                               | Model             | Reason                              |
| ---------------------------------- | ----------------- | ----------------------------------- |
| Subscription/package architecture  | **GPT-5.6 Terra** | Cross-domain architecture decision  |
| Payment-event/accounting integrity | **GLM-5.3**       | Financial/data integrity            |
| Activity rebuild                   | **GLM-5.3**       | Primary driver navigation/data flow |
| Wallet/payment integration         | **GLM-5.3**       | Financial state                     |
| Subscription implementation        | **GLM-5.3**       | Payment + state machine             |
| SOS correctness                    | **GLM-5.3**       | Safety/state machine                |
| H3 hotspot architecture            | **GLM-5.3**       | Geospatial architecture             |
| Schedule state/overlap             | **GLM-5.2**       | Complex but contained               |
| Vehicle state                      | **GLM-5.2**       | Existing architecture modification  |

The allocation follows the stated model strategy: GLM-5.3 is reserved for complex, architecture-sensitive, security/data-integrity and difficult state-machine work rather than routine UI. 

---

## Normal implementation

**GLM-5.2**

Use for:

* vehicle management;
* payout;
* commission;
* support;
* scheduling;
* i18n;
* medium-complexity API changes;
* normal multi-file features.

---

## High-volume implementation

**DeepSeek V4 Flash / Kilo Auto Free**

Use for:

* legal content;
* simple CRUD;
* simple settings screens;
* shared-component wiring;
* simple validation;
* straightforward UI modifications;
* mechanical cleanup.

Kilo Auto should only be used where exact model identity is not important. 

---

# 23. Review Allocation

| Implementation          | Reviewer                                 |
| ----------------------- | ---------------------------------------- |
| Driver foundation       | MiMo Pro                                 |
| Activity                | GLM-5.3 final verification               |
| Wallet                  | MiMo Pro + GLM-5.3 audit                 |
| Vehicle                 | MiMo 2.5                                 |
| Subscription            | **Claude 5 / Claude Code**               |
| Payment/accounting      | **Claude + GLM-5.3**                     |
| SOS                     | MiMo Pro                                 |
| Scheduling              | MiMo Pro                                 |
| Hotspot/H3              | **Gemini 3.1 Pro**                       |
| i18n/legal              | MiMo 2.5                                 |
| Final Plans 06–11 audit | **Claude + Gemini + Qwen independently** |

The independent reviewers should receive the same source context but different review roles, consistent with the orchestration protocol. 

---

# 24. Parallelization

After Phase 0:

### Can run in parallel

```text
Vehicle
    │
    ├── Vehicle Management
    └── Active Vehicle

Money
    │
    ├── Earnings Breakdown
    ├── Commission
    ├── Payout
    └── Minimum Rate

Support/Safety
    │
    ├── Support
    ├── Emergency Contacts
    └── SOS

Performance
    │
    ├── Ratings
    ├── Referral
    └── Profile

Plan 11
    ├── Legal
    └── i18n
```

### Must remain serialized

```text
Subscription architecture
        ↓
Subscription backend
        ↓
Subscription UI
        ↓
Wallet subscription card
        ↓
Renewal
```

and:

```text
Payment integrity
        ↓
Wallet
        ↓
Payout / Instant Pay
        ↓
Final money audit
```

and:

```text
Vehicle state
        ↓
Vehicle management
        ↓
Active vehicle
        ↓
Vehicle-dependent subscription/package behavior
```

---

# 25. Implementation Unit Inventory

The audit already gives us **R-01 through R-28**. I would retain those IDs as the execution IDs rather than inventing another numbering system. 

### Core units

| ID   | Work                         | Action          | Model        |
| ---- | ---------------------------- | --------------- | ------------ |
| R-01 | Earnings Goal                | NEW             | GLM-5.2      |
| R-02 | Activity                     | REBUILD + API   | GLM-5.3      |
| R-03 | Wallet                       | MODIFY          | GLM-5.3      |
| R-04 | Settings/tab wiring          | MODIFY          | Auto         |
| R-05 | Status Guard                 | MODIFY          | GLM-5.2      |
| R-06 | Vehicle management           | MODIFY          | GLM-5.2      |
| R-07 | Active vehicle warning/state | MODIFY          | GLM-5.2      |
| R-08 | Subscription ecosystem       | VERIFY + MODIFY | GLM-5.3      |
| R-09 | Payout management            | NEW             | GLM-5.2      |
| R-10 | Minimum rate                 | NEW             | DeepSeek     |
| R-11 | Commission history           | MODIFY          | GLM-5.2      |
| R-12 | Wallet due contract          | BUG FIX         | DeepSeek     |
| R-13 | Payout GET                   | MODIFY          | DeepSeek     |
| R-14 | Driver support               | VERIFY + MODIFY | GLM-5.2      |
| R-15 | Rating distribution          | MODIFY          | MiMo/GLM-5.2 |
| R-16 | Referral                     | VERIFY          | DeepSeek     |
| R-17 | Legal content                | NEW             | DeepSeek     |
| R-18 | Legal screens                | MODIFY          | DeepSeek     |
| R-19 | Language persistence         | MODIFY          | GLM-5.2      |
| R-20 | Driver translations          | CONTENT         | DeepSeek     |
| R-21 | Profile navigation bug       | BUG FIX         | DeepSeek     |
| R-22 | Vehicle active-state API     | BUG FIX         | GLM-5.2      |
| R-23 | Storage keys                 | NEW             | DeepSeek     |
| R-24 | ProgressBar                  | MODIFY          | DeepSeek     |
| R-25 | Badge                        | MODIFY          | DeepSeek     |
| R-26 | Avatar                       | MODIFY          | DeepSeek     |
| R-27 | HeatmapOverlay               | DELETE          | DeepSeek     |
| R-28 | CheckboxGroup                | VERIFY / DELETE | DeepSeek     |

---

# 26. Verification Gates

Every implementation unit must pass its own verification before downstream work treats it as complete.

## Gate A — Static

```text
TypeScript
ESLint
imports
dead code
API route existence
auth headers
Zod schemas
```

## Gate B — Contract

For each API:

```text
frontend request
      =
server request schema
      =
server response
      =
frontend response expectation
```

## Gate C — State

For relevant features:

```text
idle
loading
success
empty
error
offline
retry
destructive action
```

## Gate D — Navigation

Every new screen must have:

```text
entry point
→ screen
→ successful action
→ next screen
```

and notification/deep-link entry where applicable.

## Gate E — Data integrity

For money:

```text
integer paisa
transaction
payment event
ledger
accounting
```

must remain consistent.

## Gate F — Regression

After every major phase:

```text
existing rider flows
existing driver ride flow
existing dispatch
existing payment
existing zone logic
existing SOS
```

must remain functional.

---

# 27. Final Independent Audit

After all implementation units:

### Claude

**Repository / agentic implementation audit**

Look for:

* duplicated architecture;
* incorrect abstractions;
* hidden dependencies;
* incomplete wiring;
* implementation drift.

### Gemini

**Whole-system consistency audit**

Look for:

* cross-plan contradictions;
* state-model inconsistencies;
* navigation inconsistencies;
* payment/subscription/vehicle interactions;
* H3/zone consistency.

### Qwen

**Technical feasibility audit**

Look for:

* API/DB mismatches;
* wrong file assumptions;
* missing imports;
* incorrect dependencies;
* backend/frontend contract errors.

They should work independently first, as specified in the orchestration protocol. 

---

# 28. Final Definition of Done

Plans 06–11 are **not complete** merely because all 52 screens exist.

The final condition is:

```text
52 screens
+
3 infrastructure items
+
existing features repaired
+
API contracts verified
+
DB relationships verified
+
navigation wired
+
payment/accounting integrity verified
+
driver status gating verified
+
vehicle state verified
+
subscription state verified
+
H3 hotspot architecture verified
+
i18n persisted
+
legal content centralized
+
offline/error/empty/loading states
+
accessibility
+
notification/deep-link routing
+
TypeScript
+
lint
+
independent audits
```

The repository audit gives us the current baseline and the exact R-01–R-28 remaining-work inventory; the revised Kimi specification supplies the target behavior.  

## Recommended execution sequence

```text
P0.1  Driver navigation/status
P0.2  Subscription architecture decision
P0.3  Payment integrity gate
P0.4  Vehicle state gate
P0.5  Zone/H3 gate
        │
        ▼
P1    Driver foundation
      ├─ Earnings Goal
      ├─ Activity
      └─ Wallet
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
P2 Vehicle        P3 Money       P4 Safety/
   ecosystem         ecosystem       Support/
                                     Schedule
        │              │              │
        └──────────────┴──────────────┘
                       ▼
P5 Performance / Intelligence / Profile
                       ▼
P6 Legal / i18n
                       ▼
P7 Cross-cutting cleanup
                       ▼
        Independent audits
                       ▼
             FINAL VERIFICATION
```

**This is the draft implementation baseline I would now use to generate the individual Kilo execution prompts.** It is materially different from a simple Plan-06-through-11 screen implementation sequence because the repository audit proves that a large portion of the functionality already exists and should be **repaired, verified, or extended rather than rebuilt**. 
