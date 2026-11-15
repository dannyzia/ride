# EGM Review — Stage 5: Initial Zoom Out Report

**Purpose:**     Stage 5 (Initial Zoom Out Review) report of the EGM review of the Ride Admin Panel (`app/admin/` + `app/api/admin/`), run per the `egm-review` skill in Interactive mode.
**Owner:**       Elephant (Kilo orchestrator session) — keeps this file; content is a Goldfish product and is reproduced verbatim.
**Status:**      ACTIVE (Stage 5 of 5-stage pipeline; stages 6–9 pending)
**Source of truth:** Verbatim output of Goldfish session `ses_e5045c825ffe3fy840YJSGQIEw` (persona: `egm-zoom-out` at `C:\Users\callz\.agents\agents\zoom_out.md`; standard: `zoom-out-standard.md`). Reviewer context: the audit TASK brief only — no Elephant conversation history.
**Related (concrete paths):**
  - `docs/Plan/EGM-REVIEW-2026-11-06/comprehension_report.md` — Stage 6 output (pending)
  - `docs/Plan/EGM-REVIEW-2026-11-06/critic_report.md` — Stage 7 output (pending)
  - `docs/Plan/EGM-REVIEW-2026-11-06/intermediate_zoom_out_report.md` — Stage 8 output (pending)
  - `docs/Plan/EGM-REVIEW-2026-11-06/implementation_readiness_report.md` — Stage 9 output (pending)
**Last verified:** 2026-11-06 (reviewer ran against the live working tree; Elephant transcribed output verbatim same day)
**How to update:** Never edit the reviewer body below. Findings are reconciled at consolidation into `consolidated_review_report.md`; supersede this file only by re-running the stage (max 1 re-audit per stage).

## Elephant transcription note (added 2026-11-06, not part of reviewer output)

One reviewer claim is known-wrong from independent verification performed earlier the same day: the reviewer states "All 96 files under `app/api/admin/` call `requireAdminPermission(...)` (verified by exhaustive scan — zero route files lack it)". That scan is a string-presence artifact: `app/api/admin/cancellation-policies+api.ts` contains the guard only in its POST handler; its `GET()` (line 22) takes no request and calls no guard (confirmed by direct read, and `tests/api/admin/catalog.test.ts:13` documents "GET ungated"). The route-file count also differs (Elephant count: 94 `*+api.ts` files vs reviewer's 96). Reconciliation belongs in `consolidated_review_report.md`.

---

# Zoom-Out Audit — Ride Admin Panel (architecture-level pass)

Persona adopted: Skeptical Architect (Zoom Out), Mode REVIEW. Read-only; no files modified. Evidence below is limited to files I actually opened; where I did not open a file I say so.

## (a) Does the architecture solve the root problem — one coherent admin system?

At the boundary layer, yes, and this is the panel's core strength:

- **RBAC is uniform and server-enforced.** All 96 files under `app/api/admin/` call `requireAdminPermission(...)` (verified by exhaustive scan — zero route files lack it), and zero admin routes call `requireRole`/`requireAnyRole`/`verifySupabaseToken` directly; the only entry is the curried guard in `lib/adminRbac.ts:85-93`. Zero `console.log` in `app/admin/**`.
- **No client-side DB access.** Grep for `.from(` across `app/admin/**.tsx` returns nothing; `lib/supabase` is imported only for auth in `login.tsx`, `_layout.tsx`, and `tax-dashboard.tsx` (CSV download auth). Invariant 4 holds.
- **Body validation is uniform.** Every admin write route that reads a body uses `parseJsonBody` (71 call sites found); the 4 write routes without it (`sos-alerts/[id]/ack`, `verification/[kind]/[id]/approve`, `zones`, `payment-event/[id]/recover`) are bodyless POSTs — verified by reading two of them — and zero routes call `request.json()` raw.
- **A real component kit exists and dominates:** `AdminTable` used in ~33 screens, `AdminForm` in ~11, `AdminModal`/`AdminToast` widely. `marketplace/orders+api.ts` is an exemplary route: transaction with `for('update')` lock, append-only reversal via `lib/shopLedger.reverseShopOrder` (money logic in lib, not route), audit write, WS notify (lines 182-317).

The root problem is therefore *not* a missing architecture — it is a **mid-migration architecture**: shared infrastructure exists for nearly every cross-cutting concern, but a meaningful fraction of the surface predates it and never got converted. The system fights itself only at that seam.

## Findings

**F1 — Major — Money-formatting primitive cloned ~10× despite `lib/money.ts`.**
Scope: local helpers `formatPaisa` in `fleet-plans.tsx:35`, `fleet-billing.tsx:29`, `monitoring.tsx:122`, `marketplace/orders.tsx:68`; `fmtBdt` in `zone-pnl.tsx:66`; `formatPaisaTaka` in `fare-config.tsx:357`; a **local `paisaToTaka` returning a string** in `fare-gate-metrics.tsx:169` — same name as the lib function in `lib/money.ts:33` but a different signature and semantics (a name-collision divergence trap); a second local `paisaToTaka` in `pricing.tsx:78`; plus dozens of inline `/100` conversions (`fare-disputes.tsx:76-88`, `packages.tsx:390`, `promos.tsx:130,186-192`, `preferences.tsx:114,155,326`, `rider-intro-configs.tsx:85-86,156-162`, `ride-passes.tsx:42,79`, `point-offers.tsx:333`, `marketplace/rental.tsx:161-166`). Meanwhile `lib/money.ts` provides `takaToPaisa` (overflow-safe, comma-stripping, NaN-signaling) and `formatBdt`, used correctly by only ~6 screens. Rationale: this is the exact "reinvented wheel" vector — the canonical helper exists, is stable, and most of the surface ignores it. Every clone is an independent chance to get the paisa invariant wrong, and the shadowed-name clone makes grep-based audits actively misleading.

**F2 — Major — Money-unit divergence *inside* `*_bdt` config keys (invariant 1 contradiction).**
Scope: `app/admin/fare-config.tsx:515-536`. The screen's own comments document that `fuel_price_*` and `joma_*` keys store **taka** while `driver_maint_per_km_*` and `daily_target_bdt_*` store **paisa** — all named `*_bdt`. The audit brief's invariant says all `*_bdt` values are integer paisa. This is not a UI bug; it is a schema/config-contradiction that forces every future consumer to learn a per-key unit table (which currently lives only in prose comments in one screen). Severity Major rather than Blocker only because the conversions are at least annotated; but it will silently corrupt any new surface touching these keys.

**F3 — Major — Business logic in the view layer: fare-config embeds a parallel copy of the fare engine.**
Scope: `fare-config.tsx` (1507 lines) implements `computeCarRates`/`computeBikeOrCngRates`, joma back-solve, and required-gross derivation client-side (lines ~340-404, 510-576), producing numbers the admin displays as authoritative. The engine's real home is server-side (`lib/fareFrameworkConfig.ts` is referenced by `adminRbac.ts`). Rationale: altitude violation and an architectural dead-end — when fare-engine logic changes server-side, the admin's private re-derivation silently diverges, and the admin surface is precisely where an operator would trust it. The screen should receive derived values from an API route, not recompute them from raw config strings.

**F4 — Major — `platform-config.tsx` is a four-job screen with its own money code and a rendering bug.**
Scope: the screen's header (lines 1-13) admits it consolidates three surfaces, plus a fourth (Hotspots, section 4). It maintains four independent load/dirty/serialize/save state machines (dispatch, policy, ops, hotspots), hand-rolls scale-based money conversion (`parseDisplayNumber`/`serializeNumber` with `scale=100`, lines 262-275) instead of `lib/money`, and hand-rolls a switch (`toggleTrack/toggleThumb`, lines 980-998) even though `AdminToggle` exists with a `danger` prop documented for exactly this case ("dispatch pause", `AdminToggle.tsx:11`). Defect: lines 1002-1007 put JS string concatenation inside JSX *text* — the literal characters `"` and `+` render on screen in the multi-zone warning banner. Rationale: screens doing four jobs cannot share one save/dirty discipline, and this one already demonstrates the cost: duplicated primitives, a visual bug, and 1300+ lines that resist the detail-stage audit.

**F5 — Major — Two competing feedback primitives (toast vs Alert).**
Scope: `useAdminToast`/`AdminToastProvider` is mounted in `_layout.tsx:170` and used broadly, but 10 screens use `Alert.alert` for both errors and confirmations: `fleet-plans.tsx:74-109`, `fleets.tsx:91-129`, `marketplace/service-zones.tsx:56-93`, `marketplace/couriers.tsx:51-62`, `marketplace/shops.tsx:49-64`, `verification.tsx:87-135`, `rider-intro-configs.tsx:133`, `premium-allowlist.tsx:73`, `marketplace/certifications.tsx:53-64`, `ride-passes.tsx:67`. On Expo Web `Alert.alert` degrades to a blocking browser alert. Rationale: pattern inconsistency with a user-visible consequence; the newer kit already covers every Alert use case (toast + AdminModal confirm).

**F6 — Major — RBAC audiences duplicated between nav and server.**
Scope: `AdminShell.tsx:39-44` hand-maintains role arrays (`OWNER_ADMIN`, `OWNER_ADMIN_OPS`, …) that mirror `PERMISSION_ROLES` in `lib/adminRbac.ts:57-70`. The mapping has already drifted once: the queue nav entry's comment claims `verification.write` (`AdminShell.tsx:53`) while the route enforces `support.write` (`queue+api.ts:19`) — coincidentally the same role set today, different permissions tomorrow. Rationale: the server map is the single source of truth by design ("Server-enforced; the admin UI mirrors it for display only", `adminRbac.ts:6`), but the mirror is a hand-kept copy with no shared export, so every permission change requires a coordinated edit in two files and nothing detects drift. Marketplace/orders adds a documented-intent drift: the screen header says "admin.read to list" (`marketplace/orders.tsx:11`) but the route requires `marketplace.write` on GET (`orders+api.ts:83`) — coherent in behavior (nav hides it too) but the *stated* RBAC model and the enforced one disagree.

**F7 — Major — The "one error contract" exists but ~78% of routes bypass it.**
Scope: `lib/adminRoute.ts` (`adminErrorResponse`) was built explicitly to fix "19 of the 94 admin routes mapped only 401" (its own docstring, lines 1-13). Only ~18 routes adopt it (26 call sites found). The rest hand-roll catch ladders duplicating the same 400/401/403/500 mapping — e.g. `verification/[kind]/[id]/approve+api.ts:39-56` and `marketplace/orders+api.ts:154-162,334-342` each re-implement the ladder verbatim. Rationale: textbook workarounds-vs-structural-fix — the structural fix shipped and was never finished, so the failure it was built to prevent is one new route away from recurring.

**F8 — Major — Role resolution triplicated, uncached, per navigation.**
Scope: `_layout.tsx:43-100` resolves the role server-side on every auth event; `AdminShell.tsx:460-465` re-POSTs `/api/auth/verify-token` on **every screen mount** (every navigation, since each screen wraps itself in `AdminShell`); `fare-config.tsx:441` fetches it a third time for editor gating. There is no shared context/store. Rationale: three parallel sources of "who am I", a per-navigation server round-trip at 55 screens, and three places for the "admin but which tier" logic to diverge. A single role provider in the layout (the layout already computes it) would delete two of the three.

**F9 — Nit — `formatDateTime` cloned in 6 screens.**
Scope: `queue.tsx:97`, `monitoring.tsx:115`, `marketplace/orders.tsx:73`, `zones.tsx:63`, `city-boundaries.tsx:64`, `vehicle-type-changes.tsx:52` — byte-identical 5-line helpers. No shared formatting module exists. Combine with F1 into one `lib/adminFormat.ts`.

**F10 — Major — `queue.tsx`: two parallel modal systems, raw DOM in RN, and a sibling-endpoint contract mismatch.**
Scope: 1426-line screen with the primary action modal (lines 667-934) *and* a second "extra action" modal with its own state (lines 254-297, 1050-1087); raw `<textarea>`/`<input>` DOM elements inside RN trees (`:876-894`, `:908-926`, `:1074-1075`) bypassing `AdminForm`; the vehicle-chip UI implemented three times in one file; and the upgrade call posts `driver_id` (`:281`) while the downgrade call posts `driverId` (`:290`) — two field names for the same concept on sibling endpoints (I did not open `driver/downgrade+api.ts` to adjudicate which is correct; flagging for the detail stage). Rationale: altitude drop — the screen re-implements primitives the kit already owns, and the doubled modal state machine is where review fatigue produces exactly the kind of inconsistency in the last bullet.

**F11 — Nit — API envelope naming inconsistency.**
Scope: `tax-dashboard.tsx:35-40` consumes `totalBaseAmountBdt`/`totalTaxAmountBdt` (camelCase) from `tax/daily`, while the entire admin surface otherwise speaks snake_case (explicit codebase convention). One-off boundary wart that every consumer of that route must memorize.

**F12 — Nit — CSV export auth+blob+download hand-rolled per screen.**
Scope: `tax-dashboard.tsx:88-110` (with an honest comment that `adminFetch` is JSON-only) and `fare-config.tsx:586-599`. A missing shared `adminFetchBlob`, not a violation — but the third screen that needs a download will clone it again.

**F13 — Nit — Copy contradicting the screen's own data model.**
Scope: `packages.tsx:538` — "Riders can no longer purchase it," while the same screen's role options (lines 47-52) define packages for drivers/delivery/shops, not riders. Copy Truth issue; trivial fix.

**F14 — Nit (acceptable-by-design, watch it) — Client/server enum duplication acknowledged in place.**
Scope: `marketplace/orders.tsx:42-53` duplicates `FORCE_CANCEL_REASON_CODES` with a comment declaring "the vocabulary is the contract" (`orders+api.ts:46-55`). Documented, so not a finding against the author — but nothing enforces the parity; a one-line import from the route module (server file is importable in this monorepo layout only if boundaries allow) or a generated check would.

## (c) Altitude problems (summary)

Beyond F3/F4/F10: **polling is re-invented per screen** — `queue.tsx:168-229` (failure-count backoff), `fare-gate-metrics.tsx:186-217` and `heat-monitor.tsx:60-89` (intervalRef auto-refresh), `live-ops.tsx:26-37` (5s interval, **no** failure backoff). Four mechanisms, three shapes, one shared hook that doesn't exist. Each new live screen re-decides backoff policy.

## (d) Architectural dead-ends for multi-vertical growth

1. **The nav's linear growth with hand-mirrored permissions** (F6): 46 items today; the six groups in `AdminShell.tsx:46-422` will keep accreting, and every addition re-risks the nav/server drift because the audience lists are not derived from `PERMISSION_ROLES`.
2. **Per-key money units in config** (F2): each new vertical that adds `*_bdt` config keys inherits an untyped unit convention that one screen's comments currently guard. That is a growth-blocking ambiguity in the platform's own currency invariant.
3. **`lib/money` bypass** (F1): every vertical's pricing/promo/billing screen so far cloned its own converter; vertical #6 will clone a sixth variant unless the shared helper becomes the only one exported.
4. The **verification model** is healthy in shape (`lib/roleVerification` with kinds + approve/reject routes + audit) — new verticals slot in without a dead-end; I note this as a positive boundary.

## (e) Anti-patterns from the standard

- Bypassed auth: **none found** — the opposite; guard coverage is total (96/96).
- Hardcoding: hotspot tier colors hardcoded (`platform-config.tsx:69-73`) and hex values sprinkled across screens (`#181A20`, `#2A2D35` in nearly every screen's StyleSheet) despite `theme/goRide.ts` being the declared token source — cosmetic inconsistency, worth one consolidation pass.
- Ad-hoc solutions: F1, F5, F7, F8, F12, and the per-screen polling (c).
- Hard deletes: exactly one, `hotspots+api.ts:175` deleting `zone_heat` rows — derived, recomputable heat data, not in the soft-delete entity list. Verified acceptable.

## Verdict

The admin panel's architecture is **fundamentally sound with wiring problems, not structurally wrong**. The load-bearing decisions — one auth gate in the layout, one server-side permission map, one fetch wrapper, one table/modal/toast kit, money logic in `lib/` on the server — are all correct and mostly enforced; the API layer in particular is unusually uniform for a surface this size (96/96 guarded, Zod everywhere, exemplary transactional money handling in the marketplace force-cancel path). The debt is concentrated and quantifiable: roughly ten shared primitives exist and are bypassed at meaningful rates (money conversion ~10 clones; error contract ~80% unadopted; feedback split across 10 screens; role resolution ×3; polling ×4), indicating conversions that started and stopped. Two items are more than wiring and deserve decisions before new verticals land: the taka/paisa divergence *inside* `*_bdt` config keys (F2), which quietly breaks the platform's first invariant, and the fare-engine copy living in `fare-config.tsx` (F3), which will drift from the server engine with zero signal. Everything else on this list is consolidation work — kill the clones, finish the `adminRoute` migration, derive nav audiences from the permission map, split the four-job config screen — none of it requires re-architecting.
