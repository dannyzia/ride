# 1. EXECUTIVE VERDICT

**GOOD PLAN — MINOR CORRECTIONS**

Terra's Execution Architecture is structurally sound. It correctly mirrors the master plan's wave structure, treats the Zone Foundation as a separate platform track with a hard gate before Wave 4, preserves the locked Z-1→Z-2→Z-3→Z-4→Z-5→Z-7→Z-6 order, and makes the right strategic call to allocate top-tier reasoning to concurrency/money/safety-critical work rather than spreading it evenly across waves. The parallelization boundaries are correct, and the grep-gate-before-deletion discipline is preserved.

However, the plan has two correctable weaknesses:

1. **Tree drift inherited from the master plan.** Several items the master plan labels "NEW" or "FACT" do not match the repository structure in `list.txt`. At least two components marked NEW already exist (`components/ErrorBanner.tsx`, `components/OfflineIndicator.tsx`), one endpoint marked NEW already exists (`app/api/sos/alert+api.ts`), one endpoint name appears wrong (`/api/driver/heatmap` vs. the tree's `app/api/driver/hotspots+api.ts`), and the master plan's repeated `components/plan03/*` paths do not exist in the tree (components are flat, consistent with AGENTS.md). Terra did not catch any of these because it operates at section level. A coding agent executing literally could rebuild existing components or create duplicate endpoints.

2. **A handful of small but real work items have no owner** — most notably the R5 apply-promos screen/store fix, the home screen's unauthorized direct `redeem` call removal, the SOS 30-minute auto-resolve scheduler job, Z-8, store `reset()` wiring into the logout flow, and the L23 emergency-contacts same-table verification that SOS SMS depends on.

None of this requires replanning. It requires a **repository-aware reconciliation pass** before coding starts, plus a few explicit unit additions.

---

# 2. WHAT TERRA GOT RIGHT

- **Correct program decomposition.** Terra correctly识别s that Plan 05 is not "59 features" but ~4 engineering programs (scheduled-ride/cancellation state machine, rider safety, multi-zone geo foundation, driver integration) plus foundation and release work. This is the single most important strategic insight and it is correct.
- **Zone track treated as platform infrastructure, not a wave.** The hard gate before Wave 4, the preserved internal ordering (Z-7 hygiene before Z-6 forecasting, per the master plan's explicit lock), and the two-stage independent gate review (dependency audit + adversarial skeptic) are all correct.
- **Risk-tiered model allocation.** Reserving the highest tier for cancel transaction semantics, scheduler/idempotency, SOS failure isolation, zone resolution, and the forecast writer — rather than assigning one tier per wave — matches where expensive downstream repair would occur.
- **Grep gates honored as hard blockers.** Route deletions (DEL-1..4, D8 fold) are correctly gated behind G-1/G-2, and Terra explicitly notes deletions are non-rollbackable.
- **What NOT to parallelize** (§24) is correct: Z-1 before Z-2, Z-2 before Z-3, Z-4 after Z-2, Z-7 before Z-6, backend before vehicle UI integration, deletions after gates, Wave 4 after the Zone Gate.
- **Scope discipline.** Terra does not pull in deferred/rejected items (no insurance rebuild, no withdrawal epic, no `missed-requests` screen, no charts library). Wave 3 correctly recognizes `insurance` stays untouched.
- **Seed/QA correctly promoted** from mechanical work to cross-domain work (GLM-5.2 rather than the cheapest tier), since QA seed spans zones, forecasts, promos, passes, scheduled rides, lost items, disputes, and emergency contacts.
- **Three-level verification architecture** (mechanical gates → independent system review → adversarial skeptic) matches the master plan's §16 and is appropriately skeptical.

---

# 3. MASTER PLAN COVERAGE

| Requirement | Terra coverage | Assessment |
|---|---|---|
| Wave 0 items 0.1–0.9 (deps, tokens, ErrorBanner, OfflineIndicator, EmptyState, i18n, track exemption, time helpers, flags, G-1 audit) | Complete | All nine mapped to W0-A…W0-I. But "build" directives conflict with tree (see §4). |
| R1 Confirm Ride: schedule toggle, sheet, promo selector, book-for-other | Partial | FSM/sheet/UI covered (W1-C). **Home screen's unauthorized direct `redeem` call removal** (master §5.1) has no explicit owner. S4 VERIFY-first for `SchedulePicker.tsx` not explicitly restated. |
| R2 Ride Scheduled rebuild | Complete | W1-D, entry wiring via `router.replace` noted. |
| R3/R4 Cancel screens server-bound (L19) | Complete | W1-E; Terra correctly forbids client-side fee math. |
| R5 Apply Promos fix (deep-link param, redeem call, staging fix) | **Partial** | W1-F covers `lib/discountEngine.ts` precedence only. The screen-side fix (deep-link pre-fill, redeem call, no-op `applyPromo` store action fix) is not explicitly assigned. |
| R6 Emergency SOS rebuild + S5 SOSButton repoint | Mostly complete | W2-A/W2-B/W2-D. Missing: 30-min `resolved_auto` scheduler job (§12.3) has no owner. `sos/alert` labeled NEW but exists in tree. |
| R7 Lost Items | Complete | W2-C. |
| R8 Fare Dispute verify + badge | Complete | W2-C. |
| R9 Ride Passes verify | Complete | Wave 3. |
| R10 Share Trip + link expiry hardening (§12.8 headers, terminal-status death) | **Partial** | Terra frames Wave 3 as verify-only; but §12.8 hardening (no-store/noindex headers, expiry message) is mandated implementation work, not defect-driven. |
| R11 Scheduled Ride Detail fix | Complete | W1-D. |
| DEL-1..4 route deletions after G-1 | Complete | W1-G. |
| D1 Find Customer (banner, call split, no-show link) | Complete | W4-A. Hotspot-adjacent entry pill for D3 not explicitly included (see §4). |
| D2 Rider No-Show | Complete | W4-A. |
| D3 Hotspot Map build | Complete | W4-D. Entry pill in `DriverStatsBar` not explicitly scoped. |
| D4 Performance Stats | Complete | W4-C. |
| D5/D6 Incentives auth fix + Earnings Goal | Complete | W4-C. |
| D7/D8 Vehicle Management + type-change + G-2 | Complete | W4-B, correctly top-tier. |
| D9 Min Rate / D10 Payout Methods (NEW screens) | Complete | W4-C. |
| D11/D12 Subscription content + settings rows | Complete | W4-C. |
| Backend contracts §8.1–8.20 | Mostly complete | §8.5 endpoint naming mismatch; §8.2 build-vs-extend mismatch (see §4). |
| utils-server §9.1 scheduler (promotion, catch-up, reminders, cutoff) | Complete | W1-B. Auto-redispatch of scheduled rides on driver cancel (§12.2) not explicitly owned. |
| utils-server §9.4 Jobs 19/26/27 regression check | Partial | Terra's gate criteria mention Job-19 counts only; Jobs 26/27 not named. |
| Zone Z-1…Z-7 | Complete | Correct order and allocations. |
| **Z-8 ops note (seed-pricing per zone, script header doc)** | **Missing** | Not assigned anywhere in Terra's plan. |
| §4.8 Store hygiene: `scheduledRides` filter fix | Complete | W1-G. |
| §4.8 Store hygiene: `reset()` on all 7 stores wired to logout; user-scoped AsyncStorage keys | **Partial** | No implementation unit owns the 7-store `reset()` wiring. Terra only reviews "stale state after logout" in the final skeptic. |
| L23: `/api/sos/contacts` verified same-table as `user_emergency_contacts` or deprecated | **Missing** | SOS SMS reads contacts; source-of-truth verification unowned. |
| §13 Deep links | Complete | W0-F + W5-A. |
| §14.1 Feature flags | Complete | W0-H. Which endpoint is the public flag source (reference/preferences vs admin/config) left to discovery. |
| §14.2 Monitoring log codes | Implicit | Embedded in backend units; acceptable, but no explicit owner for the ops review (master 5.6). |
| §14.3 Rollback runbook / 5.6 ops review | Partial | Acknowledged in Terra's Wave 5 preamble but no unit assigned. |
| §14.4 Seed QA + manual matrix | Complete | W5-C. |
| §14.5 Native release checklist | Complete | W0-A. |
| §14.6 Retention (policy locked, jobs deferred) | Complete | Correctly absent. |
| §15 wave sequencing + exit criteria | Mostly complete | Sequence correct; Terra does not restate Wave 1/2 exit criteria (relies on master doc). |
| §16 Verification gates | Complete | Mechanical + review layers match. No decision on automated (jest) coverage for race-sensitive paths. |
| §18 Legal placeholders (BLOCKED on owner copy) | Complete | W5-B with correct caveat. |

---

# 4. REPOSITORY-SCOPE GAPS

These are the highest-value findings, because they are visible from structure alone.

**FINDING 4.1 — ErrorBanner and OfflineIndicator already exist in the tree; master says NEW, Terra says "Build".**
BASIS: `list.txt` shows `components\ErrorBanner.tsx` and `components\OfflineIndicator.tsx`. Master plan §2.3 S1/S2 and §7.1/§7.2 label them NEW; Terra W0-C says "Build ErrorBanner + OfflineIndicator".
CONFIDENCE: CONFIRMED (file existence); contract compliance REQUIRES SOURCE-CODE VERIFICATION.
WHY IT MATTERS: A coding agent told to "build" will either overwrite existing implementations or create duplicates — the master plan itself calls duplicate components "a review-blocker".
RECOMMENDED ACTION: Convert W0-C to a VERIFY-then-extend task: diff existing components against §7.1/§7.2 contracts (props interface, `dangerLight/amberLight/infoLight` tokens, `accessibilityRole="alert"`, NetInfo cleanup) and fix gaps only.

**FINDING 4.2 — `components/plan03/` paths referenced by the master plan do not exist; components are flat.**
BASIS: `list.txt` has no `components\plan03\` folder; `EmptyState.tsx`, `StatusBadge.tsx`, `SettingsRow.tsx`, `TransactionRow.tsx` all sit directly under `components\`. AGENTS.md explicitly mandates a flat `components/` with only `admin/` and `auth/` subfolders.
CONFIDENCE: CONFIRMED.
WHY IT MATTERS: Master plan references like `components/plan03/EmptyState.tsx` (§2.3 S3, §4.5, §6.9, §7.3, §7.4) will fail import resolution, or an agent may create a `plan03/` folder and duplicate components to satisfy the literal path.
RECOMMENDED ACTION: Add an explicit correction note to the execution plan: all plan03-prefixed component paths resolve to flat `components/` paths.

**FINDING 4.3 — `/api/sos/alert` already exists; only `resolve` and `active` are truly new.**
BASIS: `list.txt` shows `app\api\sos\alert+api.ts` and `app\api\sos\contacts+api.ts`. No `resolve` or `active` files. Master §8.2 labels `/api/sos/alert` NEW; Terra W2-A scopes it as a build.
CONFIDENCE: CONFIRMED (existence); behavior REQUIRES SOURCE-CODE VERIFICATION.
WHY IT MATTERS: Rebuilding from scratch risks destroying a working implementation; the real work may be verifying auth/role coverage (rider+driver), Zod bounds, cooldown, and adding `resolve`/`active`.
RECOMMENDED ACTION: W2-A must start with contract verification of the existing `alert+api.ts` against §8.2, then extend; build `resolve`/`active` fresh.

**FINDING 4.4 — Endpoint naming mismatch: `/api/driver/heatmap` vs tree's `hotspots+api.ts`.**
BASIS: Master §6.3/§8.5 reference `GET /api/driver/heatmap`; `list.txt` contains `app\api\driver\hotspots+api.ts` and no heatmap file. (Note `lib/hotspots.ts` also exists.)
CONFIDENCE: CONFIRMED (naming); which endpoint is canonical REQUIRES SOURCE-CODE VERIFICATION.
WHY IT MATTERS: An agent told to "extend `/api/driver/heatmap`" may create a brand-new route, producing two hotspot endpoints and a silent split.
RECOMMENDED ACTION: Verify `hotspots+api.ts` is the intended endpoint; extend it. Do not create `heatmap+api.ts`.

**FINDING 4.5 — Driver SOS endpoint `/api/driver/sos-alert` claimed FACT but absent from the tree.**
BASIS: Master §5.5 says driver SOS "stays on existing `/api/driver/sos-alert` (FACT)". `list.txt` lists ~35 files under `app\api\driver\` — no `sos-alert` among them.
CONFIDENCE: LIKELY gap in master plan's FACT labeling (list.txt could be partial, but it is otherwise granular).
WHY IT MATTERS: Driver-parity assumption in W2-A may be false; driver SOS may live elsewhere or be missing. S5's rationale (rider button 403s on a driver-only endpoint) also needs re-verification.
RECOMMENDED ACTION: Grep for SOS handling in `app/api/driver/` and `lib/safety.ts` before W2-A scope is frozen.

**FINDING 4.6 — `scripts/` directory absent from the tree.**
BASIS: Master references FACT `scripts/seed-pricing.js` (Z-8, §14.4) and NEW `scripts/zone-hygiene.ts` (Z-7), `scripts/seed-qa.ts`. `list.txt` shows no `scripts\` entries (though it also omits `docs/` and `.claude/`, so it may be partial).
CONFIDENCE: POSSIBLE.
WHY IT MATTERS: If `scripts/` doesn't exist, "extend the FACT seed-pricing pattern" is false; Z-7/Z-8/W5-C become from-scratch creations with no pattern to follow.
RECOMMENDED ACTION: Verify directory existence; adjust unit descriptions accordingly.

**FINDING 4.7 — Home screen direct-redeem fix has no file target.**
BASIS: Master §5.1 requires fixing "the home screen's unauthorized direct `redeem` call". Candidate files: `app/(main)/(customer)/(tabs)/home/index.tsx`, `app/(main)/(customer)/index.tsx`, `app/(main)/(customer)/home-raster/index.tsx` — all exist. Terra assigns no unit.
CONFIDENCE: LIKELY missing work; exact file REQUIRES SOURCE-CODE VERIFICATION.
WHY IT MATTERS: If unremoved, promos can still be redeemed outside the locked flow, undermining R5/W1-F.
RECOMMENDED ACTION: Add to W1-C or W1-F scope: grep `promo/redeem` in customer screens; remove unauthorized call; redeem only on apply-promos.

**FINDING 4.8 — Store-reset wiring point exists but is unowned.**
BASIS: `lib/authCleanup.ts` exists (likely logout cleanup hook); `store/` has 7 stores + `index.ts`. Master §4.8 requires `reset()` on all 7 stores called from logout. No Terra unit owns this.
CONFIDENCE: LIKELY missing work; integration point POSSIBLE (needs source check).
WHY IT MATTERS: Cross-account leakage of goals, staged promos, SOS state is exactly what §4.8 prevents.
RECOMMENDED ACTION: Add a small explicit unit (Wave 1 or 2): verify/add `reset()` per store, wire into `lib/authCleanup.ts` logout flow, verify user-scoped AsyncStorage keys.

**FINDING 4.9 — `app/track/[rideId].tsx` hardening is implementation, not verification.**
BASIS: File exists. Master §12.8 mandates `Cache-Control: no-store`, `X-Robots-Tag: noindex`, terminal-status expiry message. Terra's Wave 3 is framed verify-only with defect-driven fixes.
CONFIDENCE: LIKELY under-scoped.
WHY IT MATTERS: Mandated security/privacy hardening could be skipped because no defect "triggers" it.
RECOMMENDED ACTION: Carve a mini implementation unit out of Wave 3 for track-page hardening.

**FINDING 4.10 — Admin zones UI impact (Z-5).**
BASIS: `app/admin/zones.tsx` exists. Master Z-5 says API response carries `multi_zone_active:true` warning "until UI catches up" — ambiguous whether Z-5 touches the UI.
CONFIDENCE: POSSIBLE.
RECOMMENDED ACTION: State explicitly whether Z-5 includes minimal admin UI accommodation or is API-only.

---

# 5. MISSING DEPENDENCIES

1. **L23 emergency-contacts source-of-truth verification** — SOS SMS (W2-A) reads emergency contacts; both `app/api/user/emergency-contacts+api.ts` and `app/api/sos/contacts+api.ts` exist. Which table backs which must be verified **before** W2-A's SMS template work, or SOS may SMS the wrong contact set. (Master L23; absent from Terra.)
2. **Public feature-flag endpoint determination** — W0-H (flags seeded) and all client flag gating depend on knowing whether `app/api/reference/preferences+api.ts` or `app/api/admin/config+api.ts` is the public read. Master marks this VERIFY; Terra doesn't.
3. **Quote contract (`quote_valid_until`, L27)** — confirm-ride UI (W1-C) and schedule backend (W1-B) both depend on where `quote_valid_until` is emitted. `app/api/ride/estimate+api.ts` exists but is **not** in the master plan's §8 contract table — an internal master-plan ambiguity Terra inherited. The estimate endpoint's quote field needs an agreed contract before W1-C wiring.
4. **SchedulePicker verification (S4) gates the sheet decision** — reuse `components/SchedulePicker.tsx` (exists) vs build `ScheduleRideSheet.tsx`. This VERIFY must complete before W1-C's sheet work, or duplication results.
5. **SOS auto-resolve job** — §12.3's `resolved_auto` after 30 min "via scheduler" needs an owner (likely `utils-server/scheduler.ts`). It is a dependency of the SOS lifecycle Terra's W2-A scope list omits.
6. **Scheduled-ride auto-redispatch on driver cancel** (§12.2 "driver cancelled → auto-redispatch until cutoff") — depends on existing dispatch/cancel flows in `utils-server/dispatch.ts` / ride cancel paths; no owner named in W1-B's scope list.
7. **`lib/time.ts` helpers (W0-G)** are prerequisites for the schedule picker (Dhaka display/UTC send), earnings-goal daily reset (`dhakaTodayKey`), and countdown math (`msUntil`). Terra respects this implicitly via Wave-0-first ordering but should state it so no Wave 4 task re-implements time helpers.

---

# 6. SCOPE PROBLEMS

**Unnecessary/duplicate work risk (highest priority):**
- Building ErrorBanner, OfflineIndicator, and `/api/sos/alert` from scratch when files already exist (Findings 4.1, 4.3).
- Potential creation of a duplicate `heatmap` route alongside `hotspots` (4.4).
- Potential creation of a `components/plan03/` shadow folder to satisfy bad paths (4.2).

**Missing work:**
- Z-8 ops note (unassigned anywhere).
- R5 screen/store fix as distinct from discountEngine precedence.
- Home screen direct-redeem removal.
- SOS 30-min auto-resolve job.
- Share-trip hardening implementation owner.
- Book-for-other backend guards, especially the **5 SMS/hour per booker rate limit** (§12.7) — Terra's verify-only Wave 3 cannot deliver a server-side rate limit; the ride request/schedule endpoints (`app/api/ride/request+api.ts`, `app/api/ride/schedule+api.ts`) likely need work.
- 7-store `reset()` + logout wiring; user-scoped AsyncStorage key constants in `constants/data.ts`.
- Jobs 26/27 regression naming in Zone Gate criteria (only Job-19 named).
- Wave 5 items 5.3 (i18n verify sweep) and 5.6 (rollback runbook + ops review of log codes) have no units.

**Over-engineering:** None detected. Terra's three-level verification is proportionate, and Terra correctly refuses to expand into deferred items.

**Under-engineering:** No automated test requirement for race-sensitive logic (cancel atomic guard, overlap guard + advisory lock, scheduler catch-up, forecast upsert). AGENTS.md's testing culture (dispatch/payment invariants via jest) suggests at least targeted tests for W1-A/W1-B. This is a judgment call the master plan leaves open, but it should be decided explicitly, not silently skipped.

---

# 7. CROSS-MODULE RISKS

Areas outside the immediate feature that should be checked if Terra's plan is executed as written:

1. **Home booking flow** (`(customer)/(tabs)/home/index.tsx` or `(customer)/index.tsx`): schedule toggle entry, promo selector handoff, and redeem-call removal all touch it. Regression risk on the primary booking path.
2. **`lib/notify.ts` push templates**: G-1 requires zero references to deleted routes including push templates; scheduled-ride notification matrix (§12.2) adds new templates. Both directions touch the same file.
3. **Logout/auth flow** (`lib/authCleanup.ts`, `app/api/auth/logout+api.ts`): store-reset wiring lands here.
4. **Admin surface**: `app/admin/zones.tsx` (multi-zone), `app/admin/sos-alerts.tsx` (must show rider alerts created by the new/extended flow), `app/admin/lost-items.tsx`, `app/admin/fare-disputes.tsx`. No admin rebuilds are in scope, but data flowing into them changes.
5. **PortPos/subscription flow**: D11 content changes across 5 subscription screens reference the FACT checkout flow (`lib/activateSubscription.ts`, `lib/paymentEvents.ts`). Content-only changes must not touch write-ownership-protected code.
6. **call-ledger** (`app/(main)/(rider)/call-ledger.tsx` + `store/useCallLedgerStore.ts`): D5 incentive credits copy depends on it; missed-tab is canonical for `missed-requests`.
7. **i18n files** (`i18n/locales/{en,bn}/common.json`): touched by every wave; key-collision risk if waves run in parallel without coordination.
8. **EAS/dev build**: Wave 0 native deps (datetimepicker, slider, NetInfo) force a dev build; anything OTA-released between Wave 0 and later waves needs the native baseline preserved (§14.5).
9. **Drizzle schema/migrations**: M1 would follow migration `0041` in `src/db/migrations/`; Z-7 hygiene touches `rides`/`drivers zone_id`. Verify no concurrent migration work collides.
10. **ESLint config drift (minor)**: `list.txt` shows `eslint.config.mjs`, while AGENTS.md and master §16 reference the legacy `.eslintrc.json` flow (`npm run lint`). Verification commands should be confirmed before gate runs.

---

# 8. IMPLEMENTATION-SEQUENCE REVIEW

Terra's sequence is fundamentally sound and matches the master plan's authoritative ordering:

- Wave 0 before everything: **PREREQUISITE** — correct.
- Waves 1–3 parallel after Wave 0, Zone track parallel, Zone Gate hard-stop before Wave 4, Wave 5 last: **correct**.
- Z-1→Z-2→Z-3→Z-4→Z-5→Z-7→Z-6: **correct** (hygiene before forecasting preserved).
- G-1 before DEL-1..4; G-2 before D8 fold: **correct**.
- Backend-before-UI within vehicle management: **correct**.

Corrections/additions:

1. **Insert a Tree Reconciliation step at the very start of Wave 0** (before W0-C/W0-H/W2-A scoping is trusted): verify existence-vs-NEW for ErrorBanner, OfflineIndicator, sos/alert, hotspots endpoint, scripts/, driver SOS endpoint, and resolve the plan03 path references. Classification: **PREREQUISITE** for W0-C, W2-A, W4-D, Z-8, W5-C.
2. **L23 contacts verification** is a **PREREQUISITE** for W2-A's SMS work.
3. **S4 SchedulePicker verification** is a **PREREQUISITE** for the W1-C sheet decision.
4. **W1-F (discountEngine precedence)** should land before or alongside the confirm-ride promo selector integration in W1-C; the master plan's own Wave 1 order (1.8 after 1.2) is loose here, but selector UI tested against wrong precedence wastes a cycle. Classification: **DEPENDENT** (UI integration depends on engine rule).
5. **Store-reset unit** should run in Wave 1 or 2 (not Wave 5) because staged promos (W1) and SOS state (W2) are exactly what leak; it is **INDEPENDENT** of other units but must precede Wave 5 sign-off.
6. **Book-for-other backend guards** should be explicitly scheduled (Wave 1 with scheduling, since `ride/schedule` is one carrier) rather than left in verify-only Wave 3. **DEPENDENT** on knowing where `secondary_rider_*` fields live.
7. Everything else in Terra's sequence stands.

---

# 9. CODING-AGENT READINESS

**BLOCKERS (must be resolved before a coding agent starts the affected unit):**

1. Contradictory build-vs-extend directives for ErrorBanner, OfflineIndicator, `/api/sos/alert`, and the heatmap/hotspots endpoint (Findings 4.1–4.4). A literal agent will duplicate functionality.
2. `components/plan03/*` paths in the master plan do not resolve (Finding 4.2). Import paths must be corrected in the execution guidance.
3. No owner/target for the book-for-other SMS rate limit (§12.7) — a coding agent cannot infer which endpoint enforces it.
4. Z-6 forecast writer has no named target file (new `utils-server/` module vs extension of `scheduler.ts`).
5. Public feature-flag read endpoint undetermined (reference/preferences vs admin/config).
6. SOS auto-resolve job owner unspecified (§12.3).
7. Terra's document is an execution architecture, not a self-contained spec — it repeatedly references "the canonical plan". Coding agents must receive **both** documents, and the tree-reconciliation corrections must be appended, or agents will follow the master plan's stale FACT/NEW labels literally.

**DISCOVERABLE DURING IMPLEMENTATION (competent agent can resolve in-repo):**

- Which home file contains the direct redeem call (grep `promo/redeem`).
- Exact AsyncStorage key constant placement (`constants/data.ts`).
- Migration numbering (drizzle-kit generate after `0041`).
- SchedulePicker adequacy (that verification is itself a scoped task).
- Notification channel definitions for `sos`/`rides`/`marketing` (check `app.config.js` + notification permission screen).
- Whether Jobs 26/27 are zone-aware (regression check at gate exit).

---

# 10. SOURCE-CODE VERIFICATION CHECKLIST

Repository-aware reviewers (Gemini / Claude / Qwen Code) should verify exactly these items:

1. `components/ErrorBanner.tsx` and `components/OfflineIndicator.tsx` — do they match master §7.1/§7.2 contracts (props, tokens, accessibility, NetInfo cleanup)? Extend or fix, never rebuild.
2. Confirm no `components/plan03/` folder exists; `EmptyState.tsx`, `StatusBadge.tsx`, `SettingsRow.tsx`, `TransactionRow.tsx` live flat under `components/`.
3. `app/api/sos/alert+api.ts` — current auth (rider? driver? both?), Zod bounds, cooldown, table written; confirm `sos_alerts.ride_id` column exists (no-migration claim).
4. `app/api/driver/hotspots+api.ts` — current response shape vs §8.5 contract; confirm this is the endpoint to extend (no `heatmap` route creation).
5. Grep for driver SOS: any `sos` handler under `app/api/driver/`; inspect `lib/safety.ts`.
6. `app/api/user/emergency-contacts+api.ts` vs `app/api/sos/contacts+api.ts` — same underlying table? (L23).
7. `components/SchedulePicker.tsx` — covers date + time + Asia/Dhaka display + min/max? (S4 reuse decision).
8. Which screen calls `POST /api/promo/redeem` directly today: `app/(main)/(customer)/(tabs)/home/index.tsx`, `app/(main)/(customer)/index.tsx`, or `home-raster/index.tsx`? Also verify `store/useRiderStore.ts` `applyPromo` is the no-op described.
9. `store/useRiderStore.ts` — confirm `scheduledRides` filter is `'pending'` (the claimed bug); check all 7 stores for `reset()`; inspect `lib/authCleanup.ts` and `store/index.ts` as wiring points.
10. `utils-server/scheduler.ts` — current job inventory; where promotion/reminders/cutoff would land; whether a SOS auto-resolve job exists; `utils-server/heartbeat.ts` — locate the sentinel/fake zone stamp (Z-4 target).
11. `lib/zone.ts` — single-zone assumptions; `src/db/schema.ts` + `src/db/migrations/0009_intercity_geo_fencing.sql` (and later) — confirm `zones_one_active` unique index exists (Z-1 drop target) and `demand_forecasts(zone_id, forecast_hour)` is not already unique.
12. `app/api/reference/preferences+api.ts` vs `app/api/admin/config+api.ts` — which is publicly readable for client feature flags.
13. `app/track/[rideId].tsx` — current cache/robots headers and terminal-status behavior (§12.8 delta).
14. `lib/notify.ts` — any templates referencing `schedule-ride`, `scheduling-user-ride`, `schedule-ride-after-promo`, `no-drivers-available` (G-1 baseline).
15. `scripts/` — does it exist? Is there a seed-pricing script to extend (Z-8, W5-C)?
16. `app/api/ride/estimate+api.ts` — current response fields; where `quote_valid_until` (L27) would attach; also `app/api/driver/calculate-price+api.ts` relationship.
17. `app/api/ride/request+api.ts` and `app/api/ride/schedule+api.ts` — presence of `secondary_rider_*` fields (book-for-other guards, SMS rate limit location).
18. `theme/goRide.ts` — presence of `amberLight`, `successLight`, `infoLight` tokens (W0-B).
19. `app/admin/zones.tsx` — whether multi-zone operation needs minimal UI accommodation under Z-5.
20. `package.json` — whether `@react-native-community/datetimepicker`, `@react-native-community/slider`, and NetInfo are already installed (W0-A scope: install vs verify-only).

---

# 11. REQUIRED CHANGES TO TERRA'S PLAN

Only changes justified by the analysis above:

1. **Add a Wave 0 Tree Reconciliation unit (W0-0)**: execute checklist items 1–6, 11, 15, 20; convert build-vs-extend decisions for ErrorBanner, OfflineIndicator, sos/alert, hotspots endpoint; correct all `components/plan03/*` references to flat paths. Gate W0-C, W2-A, W4-D on its output.
2. **Convert W0-C** from "Build" to "Verify-then-extend against §7.1/§7.2".
3. **Convert W2-A** to "Verify/extend existing `sos/alert`; build `resolve` + `active`"; add the **30-min auto-resolve scheduler job** to its scope; add **L23 contacts verification** as a precondition.
4. **Add explicit owners** for: R5 apply-promos screen + store staging fix (attach to W1-F or W1-C); home-screen direct-redeem removal (W1-C/W1-F); Z-8 (attach to Z-5 or Zone Gate exit); 7-store `reset()` + logout wiring (new small unit, Wave 1/2); Wave 5 items 5.3 and 5.6 units.
5. **Re-scope Wave 3** as "verify + two mandated mini-implementations": track-page hardening (§12.8) and book-for-other server guards (§12.7, including 5 SMS/hour limit) — the latter likely belongs in Wave 1 with `ride/schedule`/`ride/request` work.
6. **Fix endpoint naming** in W4-D: extend `app/api/driver/hotspots+api.ts`; explicitly forbid creating a `heatmap` route. Include the `DriverStatsBar` hotspot pill entry in W4-D scope.
7. **Name the Z-6 target file** decision (new module vs scheduler extension) in the Z-6 unit.
8. **Add Jobs 26/27** to Zone Gate regression criteria alongside Job-19.
9. **Add a decision line on targeted jest coverage** for cancel atomic guard, overlap guard/advisory lock, and scheduler catch-up (align with AGENTS.md invariant-testing culture).
10. **Note quote contract dependency**: determine where `quote_valid_until` is emitted (estimate endpoint) before W1-C integration.

No changes are required to Terra's wave structure, Zone Gate design, parallelization boundaries, or model-tier philosophy.

---

# 12. RECOMMENDED PLAN DIRECTION

Keep Terra's execution architecture as the backbone — it is the right strategy. Augment it as follows:

1. **Run a structure-first reconciliation pass inside Wave 0.** Before any component or endpoint is built, a repository-aware agent verifies every NEW/FACT label that touches files visible in `list.txt` (components, sos endpoints, hotspots endpoint, scripts/, driver SOS). Outputs: a corrected build-vs-extend list and corrected import paths (flat `components/`, no `plan03`).
2. **Execute Wave 0 per Terra**, with W0-C in verify-extend mode, plus the L23 contacts verification and public flag-endpoint determination folded into W0-H's neighbors.
3. **Run Waves 1–3 and the Zone track in parallel per Terra**, with the added units from §11 (store reset, R5 screen fix, home redeem removal, book-for-other guards, SOS auto-resolve, Z-8). Wave 3 carries its two mandated mini-implementations rather than being purely verify-only.
4. **Hold the Zone Gate exactly as Terra specifies** (dependency audit + adversarial skeptic + the master plan's exit list, plus Jobs 26/27).
5. **Wave 4 and Wave 5 per Terra**, with the hotspot entry pill, corrected endpoint naming, and explicit 5.3/5.6 units.
6. **Verification per Terra's three levels**, plus the master plan's §16 grep gates and an explicit decision on targeted jest tests for race-sensitive backend paths.

Notably, Terra's own §22 says a heavyweight repository re-analysis is justified "if the repository state has materially changed since Plan 05 v2.0 was tree-verified." The discrepancies documented in §4 of this audit are evidence of exactly that condition — several FACT/NEW labels in the master plan do not match the current tree. The reconciliation pass is therefore justified by Terra's own criteria.

---

# 13. FINAL ASSESSMENT

**B. Repository-aware review first.**

The plan's architecture and sequencing are good enough to proceed, but it must not go directly to coding agents: at least four directives (build ErrorBanner/OfflineIndicator, create `/api/sos/alert`, extend `/api/driver/heatmap`, import from `components/plan03/`) conflict with the visible repository structure and would cause duplication or failure if executed literally. A focused repository-aware review — using the §10 checklist — converts those conflicts into verified extend-vs-build decisions and attaches owners to the ~8 orphaned work items. After that pass, the corrected plan can proceed to implementation without major replanning.

---

# 14. CONFIDENCE

**MEDIUM**

Primary uncertainties:

1. **I can see structure, not content.** Existing files (`ErrorBanner.tsx`, `sos/alert+api.ts`, `hotspots+api.ts`) may be stubs, partial implementations, or fully compliant — only source inspection can say whether "extend" means a one-line fix or substantial work.
2. **`list.txt` completeness is unproven.** It omits directories AGENTS.md says exist (`docs/`, and apparently `scripts/`, `.claude/`, `eas.json`, `.eslintrc.json`). Some absence-based findings (scripts/, driver/sos-alert) could be listing artifacts rather than real gaps — they are therefore marked POSSIBLE/LIKELY and routed to verification rather than asserted.
3. **Model-allocation fitness cannot be evaluated** from this vantage point; I assessed structure and scope only.

Where findings are marked CONFIRMED, they rest on file-existence evidence in `list.txt` cross-checked against AGENTS.md conventions, and are safe to act on.