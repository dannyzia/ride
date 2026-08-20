Viewed Plan%2005%20v2.0%20%E2%80%94%20Execution%20Architecture%20&%20Model%20Allocation.md:1-800
Viewed Plan%2005%20v2.0%20%E2%80%94%20Execution%20Architecture%20&%20Model%20Allocation.md:1-800
Viewed Plan%2005%20v2.0%20%E2%80%94%20Execution%20Architecture%20&%20Model%20Allocation.md:801-1097
Listed directory lib
Listed directory ride
Viewed dprelay.ts:1-91
Listed directory utils-server
Searched for "status='scheduled'"
Searched for "status\s*=\s*'scheduled'"
Searched for "scheduled"
Viewed scheduler.ts:1-100
Searched for "reminders"
Searched for "catch-up"
Searched for "SCHEDULED_PROMOTION_MISSED"
Searched for "demand_forecasts"
Listed directory scripts
Listed directory track

Here is the whole-system repository audit of Terra's execution plan, reconciled against the Master Plan and the current repository state.

# 1. EXECUTIVE VERDICT

**APPROVE WITH CHANGES**

Terra’s execution plan correctly identifies the high-risk, system-level dependencies (especially isolating the Zone Track as a platform dependency blocking Wave 4). However, it makes unsafe parallelization assumptions for Wave 1, mischaracterizes the state of the existing scheduler, and misses a critical cross-module risk regarding the new SOS SMS circuit breaker.

# 2. TERRA PLAN VALIDATION

**What Terra got right:**
- **Zone Track Isolation:** Correctly identifying that Z-1 through Z-7 is not a feature wave but a "platform dependency track" that fundamentally alters the system's dispatch semantics and must be a hard gate before Wave 4.
- **Zone Internal Ordering:** Respecting the locked order of the Zone track (Z-1 → Z-2 → Z-3 → Z-4 → Z-5 → Z-7 → Z-6), specifically noting that hygiene (Z-7) must run before forecasting (Z-6).
- **Model Allocation for Risk:** Correctly reserving the high-tier model (GLM-5.3) for atomic database transitions (cancellations), distributed state machines (scheduler), and core geo-resolution changes, rather than wasting it on straightforward UI tasks.
- **MapLibre Hygiene:** Recognizing the risk of `addSource` leaks in the Hotspot Map and requiring strict verification.

# 3. WHOLE-SYSTEM ISSUES

Problems that become visible only when considering the entire repository:

- **CRITICAL: SOS Circuit Breaker vs. OTP Delivery.** The Master Plan (§11.6) calls for a "global hourly send cap circuit breaker in `lib/dprelay`" for the new SOS feature. `lib/dprelay.ts` is the single source for `sendSms` and `sendOtp`. If a *global* circuit breaker is tripped by an SOS SMS spike, it will accidentally block all user authentication (OTPs). The circuit breaker MUST be scoped strictly to SOS traffic, or use an isolated counter.
- **HIGH: Scheduler Performance.** The `utils-server/scheduler.ts` already runs a 30s tick. Adding the new "catch-up" sweep for overdue rides must use the newly proposed indexes. If it does a full table scan on `rides` every 30 seconds, it will degrade DB performance.

# 4. MISSING DEPENDENCIES

Dependencies Terra missed or misunderstood:
- **`SchedulePicker.tsx` Verification:** The Master Plan explicitly dictates verifying the existing `components/SchedulePicker.tsx` before building new schedule UI components. Terra skips this and immediately allocates the Schedule UI build.
- **Missing SOS Endpoints:** `/api/sos/resolve+api.ts` and `/api/sos/active+api.ts` do not currently exist in `app/api/sos/` (only `alert` and `contacts` exist). Terra treats W2-A as simply "SOS backend" without explicitly acknowledging that these are greenfield routes.

# 5. INCORRECT ASSUMPTIONS

Assumptions in Terra's plan contradicted by repository evidence:
- **FINDING:** Terra assumes W1-B "Scheduling backend + scheduler" is an expensive, from-scratch implementation.
  **REPOSITORY EVIDENCE:** `utils-server/scheduler.ts` (1,100+ lines) ALREADY contains a 30-second scheduled dispatch loop with an overlap guard and internal HTTP triggers for `status='scheduled'`.
  **IMPACT:** Over-scoping. The task is an *extension* (adding catch-up, reminders, and cutoffs) to a mature base, not a greenfield build.
- **FINDING:** Terra assumes Wave 1 can be aggressively parallelized (Scheduling API, Cancellation, Promos, Rider Screens).
  **REPOSITORY EVIDENCE:** The Master Plan (§15) explicitly states `cancel-preview` MUST land first because the cancel screens depend on its exact payload (`server_now`, `free_until`).
  **IMPACT:** If UI is built in parallel with the API, it will implement mocked or incorrect schemas rather than binding to the actual server contracts.

# 6. REQUIREMENTS LOST OR ALTERED

Compare against the master plan:
- **Minimum Rate Slider:** Terra assigns W4-C "Minimum Rate" to GLM-5.2 but loses the explicit Master Plan instruction to reuse `components/MinRateSlider.tsx`.
- **Cancellation Preview API:** Terra allocates W1-A as a build, ignoring that `/api/ride/[id]/cancel-preview+api.ts` already exists and merely needs extension.

# 7. REUSE OPPORTUNITIES

Existing functionality that should be reused:
- `utils-server/scheduler.ts`: Base scheduled dispatch loop exists.
- `components/MinRateSlider.tsx`: Exists (3,015 bytes).
- `components/SchedulePicker.tsx`: Exists (4,353 bytes) and must be verified for reuse before building `ScheduleRideSheet.tsx`.
- `/api/ride/[id]/cancel-preview+api.ts`: Exists and is ready for extension.

# 8. ARCHITECTURAL / CROSS-MODULE RISKS

Potential regressions or inconsistencies:
- **Driver Auto-Offline Transaction (W4-B):** The vehicle-type-change backend requires an auto-offline transition in-transaction. This modifies driver state outside of the standard heartbeat flow, which could cause race conditions with `utils-server/dispatch.ts` if the dispatcher queries the driver concurrently.
- **Deep Link Expiry (W5-A):** Setting `Cache-Control: no-store` on `app/track/[rideId].tsx` requires ensuring that Expo's web server respects these headers dynamically and doesn't serve a statically pre-rendered version of the terminal state to other links.

# 9. IMPLEMENTATION ORDER

**Terra's proposed order:** Parallelize W1 (Scheduling API, Cancellation API, Promos, Rider Screens) aggressively.
**Corrected order:** Wave 1 MUST be strictly sequential to respect API contracts:
1. `cancel-preview` API (W1-A).
2. ONLY THEN: Cancellation UI (W1-E) and Schedule API (W1-B).
3. VERIFY: `SchedulePicker.tsx`.
4. ONLY THEN: Schedule UI (W1-C).

# 10. REQUIRED CHANGES TO TERRA'S PLAN

Only concrete changes necessary to make the plan implementation-ready:
1. **Amend W2-A (SOS Backend) instructions:** Explicitly mandate that the SMS circuit breaker in `lib/dprelay.ts` MUST be scoped to SOS traffic only to protect OTP deliverability.
2. **Amend W1-B (Scheduler) instructions:** Provide the existing `scheduler.ts` dispatch loop as context so the model extends it rather than replacing it.
3. **De-parallelize Wave 1:** Enforce the API-first dependency chain (API → UI).
4. **Insert S4 Verification:** Add an explicit verification step for `SchedulePicker.tsx` before authorizing W1-C.
5. **Amend W4-C (Minimum Rate):** Explicitly require the reuse of `components/MinRateSlider.tsx`.

# 11. FINAL RECOMMENDED PLAN

**Phase 1: Foundation & APIs (Sequential)**
- Wave 0: Shared Components & Contracts (GLM-5.2)
- W1-A: Extend `cancel-preview` API (GLM-5.3)
- Z-1 to Z-5: Zone Foundation Phase 1 (GLM-5.3)

**Phase 2: Core Logic & Initial UI (Parallelizable)**
- W1-B: Extend existing `scheduler.ts` & Schedule API (GLM-5.3)
- W1-E: Cancellation UI (GLM-5.2)
- W1-F: Promo Precedence Logic (GLM-5.3)
- W2-A: SOS Backend (with isolated circuit breaker) (GLM-5.3)
- S4: Verify `SchedulePicker.tsx` (DeepSeek)
- Z-7: Zone Hygiene (GLM-5.2)

**Phase 3: Dependent UI & Forecasting**
- W1-C: Schedule UI (requires S4 clearance) (GLM-5.2)
- W2-B: SOS UI (GLM-5.2)
- Z-6: Forecast Writer (requires Z-7) (GLM-5.3)

**Phase 4: Zone Gate & Driver UI**
- ZONE GATE: Full system review of Z-track (Qwen/GLM-5.3)
- W4: Driver Features (incorporating `MinRateSlider.tsx` reuse)
- W5: Integration & Release Readiness

# 12. CONFIDENCE

**HIGH**. 
The repository state has been verified to contradict several of Terra's assumptions (the scheduler already exists, `cancel-preview` exists, `MinRateSlider` exists). The catch regarding the SOS circuit breaker potentially taking down the OTP system is a critical cross-module risk that justifies the architectural intervention.