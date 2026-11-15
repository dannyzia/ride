# Goldfish Annotated Review Report

**Target:** `docs/Plan/EGM-REVIEW-2026-11-06/zoom_out_report.md` (`full file`, lines 1–100)
**Round:** 1 of the `egm-review-loop` (7 reviewers, canonical standards, direct dispatch). Round status: **not clean** — unsettled Blocker/Major findings exist; resolution + a second round required.
**Reviewer report ids:** cd = codebase_details (`ses_e4f817a0dffewAneaWH7ENEjlA`, retried once after rate-limit), st = structural (`ses_e4f8136deffe6P6QjRG2Oup1dn`), dc = design_critic (`ses_e4f815750ffeYCNK89J4GreqQw`), zo = zoom_out (`ses_e4f81136fffeORgOqc4w185yg5`), cp = comprehension (`ses_e4f80f56dffe3iqUpD5RhKWxTk`), sy = style (`ses_e4f80d802ffe3Nko5sifXQ0ipr`), ir = implementation_readiness (`ses_e4f80b2e3ffeKkvQNkscrid4Yx`). All 7 completed; none recorded as not run.
**Tree-drift disclosure (Elephant, verified just now):** the working tree moved during the pipeline's pause-for-edits window (user Option 1). `app/api/admin/cancellation-policies+api.ts` GET is now guarded (`catalog.write`, line 29; 401/403 branches at 33–34; file 44→75 lines); route files now number **97** (94 at Stage-5 write time); ~30 admin screens show uncommitted modifications. Findings below distinguish *reviewer error* from *stale-against-a-moved-tree* accordingly.
**Settled-findings ledger (seed):** none yet — Round 1 is the first pass.

---

### C1. Transcription note is stale on all three specifics; body/verdict reassert its refuted claim [cd, zo, st, sy, cp] — Severity: High (Blocker)
*   **Affected Scope:** zoom_out_report.md lines 15–17 (note), 29 / 93 / 99–100 ("96/96", "coverage total")
*   **Discrepancy Description:** cd/F-N1 refutes all three note claims on today's tree: (1) GET is guarded (`catalog.write` line 29, takes `request`, 401/403 branches) — the "ungated GET" defect no longer exists; (2) `tests/api/admin/catalog.test.ts:13` now reads "GET and POST are catalog.write-gated" (opposite of the note's quote); (3) route count is **97** (`rg --files`), not 94 — the 94 anchors on `lib/adminRoute.ts:4`'s stale docstring. cp/1 adds the document-level defect: the Verdict reasserts "96/96 guarded" three times with no in-place caveat, so a verdict-only reader absorbs a fact the preface declares false. sy/S-6 flags the in-document 96-vs-94 split the body never reconciles. zo/AF-3 and st/R-7 independently re-verified the same tree state. Elephant direct read confirms all of it; the tree moved during the edit window.
*   **Rationale:** The note is the report's reconciliation instruction; consumed at face value it would inject three false facts into consolidation (a remediated defect recorded as open; a true coverage claim recorded as known-wrong; a stale count recorded as ground truth). The verdict's reassertion compounds it for every reader who skips the preface.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The note was true when written (verified 2026-11-06 ~05:52) and is stale now. The honest repair is a re-verified stamp replacing the note, plus in-place correction of the three "96/96" verdict/body instances — not deletion of the note (that would falsify the record) and not silently trusting either count.
*   ***Proposed Edit:***
    *   Location: lines 15–17 (replace the transcription note's body, keep the heading)
    *   Change: replace with: "Re-verified 2026-11-06 (post-edit-window): the claims below were true when written (~05:52) and are now stale — the working tree changed during the pipeline's manual-edit pause. Current state, verified by direct read: `cancellation-policies+api.ts` GET takes `request` and calls `requireAdminPermission('catalog.write')` (line 29) with 401/403 branches (33–34); `tests/api/admin/catalog.test.ts:13` now reads 'GET and POST are catalog.write-gated'; route files number 97 (was 94; ~30 admin screens modified mid-window). The reviewer's guard-coverage *claim* ('zero route files lack the guard') is TRUE on today's tree by method-correct rescan (`rg --files-without-match` = 0); its *count* (96) is off by one (97); its *method* (string-presence scan) still cannot distinguish per-handler gating and remains misdescribed as 'exhaustive'. Reconciliation must consume these corrected values."
    *   Location: lines 29, 93, 99–100 (three instances)
    *   Change: replace "All 96 files … zero route files lack it (verified by exhaustive scan)" / "96/96" / "guard coverage is total (96/96)" with "97/97 route files reference the guard (string-presence rescan, method-corrected; per-handler coverage spot-checked)". Also line 5: replace "Stage 5 of 5-stage pipeline; stages 6–9 pending" with "Phase 1 of a five-phase pipeline (phases numbered 5–9 within the parent egm-review run)" [zo/AF-8, cp/9].

### C2. F3's central premise is false — shared import, not a parallel copy; kernel survives in weakened form [zo 🔴, st 🟡, cd 🟡] — Severity: High (Blocker as filed, Major after repair)
*   **Affected Scope:** report lines 44–45 (F3), line 100 (verdict elevates F3 to a pre-verticals decision)
*   **Discrepancy Description:** All three reviewers converge: `computeCarRates`/`computeBikeOrCngRates` are **imported** from `lib/tierRateDerivation.ts` (`fare-config.tsx:14-19`; definitions `lib/tierRateDerivation.ts:83,110`) — one shared module also consumed by `utils-server/__tests__/fuelRecompute.test.ts:14-17` and parity-pinned by `app/__tests__/admin/fare-engine-setup.test.ts:95`. There is no client-side duplicate of the engine primitives. What is client-side is the derivation **composition** (joma back-solve + required-gross in `derivedVehicles`, lines 510–576), and the server has not yet adopted the shared lib (`utils-server/scheduler.ts:2449` marks integration as future work). st/R-1 adds: the report's citation ("`lib/fareFrameworkConfig.ts` is referenced by `adminRbac.ts`") is a comment reference (`adminRbac.ts:98`), not an import — it cannot carry the claim.
*   **Rationale:** A false "parallel copy" premise contaminates the verdict's short list of decisions needed before new verticals; the drift risk is real but is an *inline-composition + server-adoption-pending* issue, not duplication. ir/Part A additionally shows the original remedy ("serve derived values from an API") ignores that fare-config is an editor needing live re-derivation — an unresolved UX decision.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The finding survives re-scoped; as written it misdirects an implementer to consolidate the wrong layer while the actual engine-side trap sits in the server libs (see C5).
*   ***Proposed Edit:***
    *   Location: lines 44–45 (replace F3 body)
    *   Change: rewrite F3 as: "**F3 — Major — fare-config recomposes engine derivations inline over unsaved edits while the server recompute pipeline is still unbuilt.** The rate primitives are correctly shared (`lib/tierRateDerivation.ts:83,110`, imported at `fare-config.tsx:14-19`, parity-tested in `app/__tests__/admin/fare-engine-setup.test.ts:95`). The residual risk is the inline composition at lines 510–576 (joma back-solve, required-gross) drifting from the server once scheduler job 45 adopts the lib (`scheduler.ts:2449` marks it unbuilt), plus an open editor-UX decision (live client-side preview vs debounced server derivation). Re-scope: keep client preview via the shared lib; server adoption of the same lib is the real task."
    *   Location: line 100 (verdict)
    *   Change: replace the F3 clause ("the fare-engine copy living in `fare-config.tsx`… will drift") with "the inline fare derivation composition in `fare-config.tsx:510-576` ahead of the server's pending adoption of the shared `lib/tierRateDerivation`".

### C3. F5 states the wrong failure mechanism and inverts the severity — Alert.alert is a no-op on web, so destructive confirmations are dead buttons; one stale citation; count is 9 [dc 🔴, zo 🟡, cd 🟡] — Severity: High (Blocker)
*   **Affected Scope:** report lines 50–51 (F5), line 100 ("feedback split across 10 screens")
*   **Discrepancy Description:** dc/D-1 verified the installed dependency source: `react-native-web@0.20.0` (wired via the `react-native$` alias, `babel.config.js:19`, no polyfill in repo) implements `Alert.alert` as an **empty static method — a total no-op on web**. Every cited Alert call is a confirmation dialog whose destructive `onPress` lives in the ignored buttons array: approve verification (`verification.tsx:90`), suspend/close fleet (`fleets.tsx:132`), delete service zone, change courier status, suspend shop, delete ride pass, deactivate intro config, review certification, deactivate allowlist — **dead buttons with zero feedback on the panel's primary platform**. That is Blocker-grade, not "pattern inconsistency". Separately, `fleet-plans.tsx:74-109` contains no `Alert` (cd grep: zero matches; zo and dc concur) — a tree-drift casualty: the edit window removed it, and the screen now routes errors through `onError` + toast (dc/D-2). True count: **9 screens / 10 call sites** (`verification.tsx` has two — `:90`, `:119`).
*   **Rationale:** The report prices the panel's worst operator-facing defect as wiring cleanup and its mechanism sentence ("degrades to a blocking browser alert") is false at the dependency source. dc/D-12: the mis-grading runs one direction — toward under-statement.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Mechanical verification against the installed package source settles the mechanism question; the fleet-plans citation is stale-tree, not reviewer fabrication, and is corrected by the same edit.
*   ***Proposed Edit:***
    *   Location: lines 50–51 (replace F5 body)
    *   Change: rewrite F5 as: "**F5 — Blocker — destructive-action confirmations are non-functional on web.** `Alert.alert` on `react-native-web@0.20.0` is a no-op (empty static method, no polyfill; `babel.config.js:19` alias), so every Alert-based confirm's destructive `onPress` never fires and gives no feedback. Affected (9 screens, 10 call sites): `verification.tsx:90,119` (approve/reject), `fleets.tsx:132` (suspend/block/close/reactivate), `marketplace/service-zones.tsx:86` (delete zone), `marketplace/couriers.tsx:57` (status), `marketplace/shops.tsx:65` (suspend), `ride-passes.tsx:68` (delete pass), `rider-intro-configs.tsx:135` (deactivate), `marketplace/certifications.tsx:56` (review), `premium-allowlist.tsx:73` (deactivate). `fleet-plans.tsx` dropped out during the 2026-11-06 edit window (now toast-based) — tree-drift note. Fix: convert each site to `AdminModal` confirm + `useAdminToast` (the kit already covers every use case; this is regression-by-bypass, not inconsistency)."
    *   Location: line 100 (verdict)
    *   Change: replace "feedback split across 10 screens" with "9 screens whose destructive confirmations are dead on web (F5, Blocker)".

### C4. F9's premises are false: `lib/format.ts` already exists; clones are not byte-identical; the remedy would create a third module [zo 🟡, sy 🟡, cd 🟡] — Severity: Medium (Major)
*   **Affected Scope:** report lines 62–63 (F9), line 100 ("kill the clones")
*   **Discrepancy Description:** `lib/format.ts:49` exports `formatDateTime` (Asia/Dhaka-pinned, bn-BD locale) — no admin screen imports it, so the finding inverts into F1's own pattern: the helper exists and is ignored. "Byte-identical" is false for 2 of 6 (`marketplace/orders.tsx:73`, `vehicle-type-changes.tsx:52` use a 4-line ternary form). sy/S-4 and zo/AF-2 further note the clones use runtime-locale `toLocaleString()`, violating the repo's Asia/Dhaka display convention that `lib/format.ts` implements. sy/S-5: `monitoring.tsx` clone is at line 131, not 115.
*   **Rationale:** The prescribed remedy ("combine with F1 into one `lib/adminFormat.ts`") creates a third formatting module beside `lib/money.ts` and `lib/format.ts` — the exact reinvented-wheel failure the persona polices (zo/AF-2), and a dedupe pass acting on "byte-identical" would stall on the two variants (sy/S-4).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Same observation, corrected premise, redirected remedy: adopt the existing module.
*   ***Proposed Edit:***
    *   Location: lines 62–63 (replace F9 body)
    *   Change: rewrite F9 as: "**F9 — Nit — `formatDateTime` cloned in 6 screens while `lib/format.ts:49` ships the canonical implementation (unused by any admin screen).** Four clones are 5-line if-return forms (`queue.tsx:97`, `monitoring.tsx:131`, `zones.tsx:63`, `city-boundaries.tsx:64`); two are 4-line ternary variants (`marketplace/orders.tsx:73`, `vehicle-type-changes.tsx:52`) — semantically equivalent, not byte-identical. All use runtime-locale `toLocaleString()`, violating the Asia/Dhaka display convention. Fix: import `formatDateTime` from `@/lib/format`, delete the clones; do **not** create `lib/adminFormat.ts`."

### C5. F2 stands but mislocates the blast radius: the unit divergence lives in the server config schema too, and the report prescribes no treatment or owner decision [st 🟡 ×2, ir 🔴] — Severity: High (Major, with owner-decision blocker noted)
*   **Affected Scope:** report lines 41–42 (F2), 87 (dead-end 2), 100 (verdict)
*   **Discrepancy Description:** The screen-level claim verifies exactly (cd: `fare-config.tsx:515-536` verbatim). But st/R-2 shows the per-key unit table does **not** live "only in prose comments in one screen": `lib/fareFrameworkConfig.ts:132` ("taka-scale like fuel_price_* (NOT paisa)") and `lib/fuelConfig.ts:30` encode it server-side — and `fareFrameworkConfig.ts` ships **two opposite-unit key families for the same quantities** (`fuel_price_petrol_bdt`='140' taka beside `fuel_price_bike_petrol_bdt_per_l`='14000' paisa; `joma_*_bdt`='8000' taka beside `fare_joma_*_bdt_per_month`='800000' paisa). st/R-4: `lib/fuelConfig.ts:62-96` (`getFuelConfig()`) has **zero consumers** repo-wide and returns unconverted paisa under taka-shaped field names — a pre-loaded 100× trap for the unbuilt scheduler job 45. ir/Part A (F2, 🔴): the report identifies the wound and stops — two mutually exclusive remedies (normalize stored values to paisa via data migration vs keep values and rename/re-document keys) with different blast radii, no consumer enumeration, no rollback plan; an implementer will do the UI-only fix the report itself declares wrong.
*   **Rationale:** This is the report's strongest finding and its most incomplete: the server-side instance is more dangerous than the cited one, and the fix is an owner-level money decision (repo invariant: integer paisa) that must precede F1/F3 work on the same surfaces (ir/Part B sequencing).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The report cannot choose the money migration itself (owner decision), but it must state the fork, the consumer-scan requirement, and the sequencing constraint — otherwise it fails Zero-Decision (ir).
*   ***Proposed Edit:***
    *   Location: lines 41–42 (append to F2)
    *   Change: append: "**Server-side extension (surfaced during validation):** the divergence is not screen-deep — `lib/fareFrameworkConfig.ts` carries two opposite-unit families for the same quantities (fuel 140-taka vs 14000-paisa keys; joma 8000-taka vs 800000-paisa keys, lines 132, 347–349, 362–371, 395–397, 415–418), and `lib/fuelConfig.ts:62-96` is dead code (zero consumers) that returns unconverted paisa under taka-shaped names — a pre-loaded 100× trap for scheduler job 45. **Owner decision required before any fix:** (a) normalize stored values to paisa (data migration on live config, rollback required) or (b) keep values and rename/re-document keys (`_taka` suffix) and update every consumer. Requires an exhaustive consumer scan of all four key families (server consumers included). Money-path banner: this fix itself touches the integer-paisa invariant — lint → tsc → targeted jest, plus a pinned unit-contract test. Sequencing: F2 precedes F1 and F3 work on the same surfaces."

### C6. F7's prescription is dangerous as written — the helper cannot express 404/409/422; blind migration regresses live contracts [st 🟡, ir 🟡] — Severity: Medium (Major)
*   **Affected Scope:** report lines 56–57 (F7), line 100 ("finish the adminRoute migration")
*   **Discrepancy Description:** `adminErrorResponse`'s `CLIENT_ERRORS` covers only 400/401/403 (`lib/adminRoute.ts:17-21`); everything else → 500. Routes that must return domain statuses — approve (404/409), hotspots (404), payment-event recover (422 `invalid_status`), downgrade (422 `not_a_downgrade`) — cannot adopt it without regressing those responses. st/R-5 also corrects "hand-roll the same ladder verbatim": `orders+api.ts:159` returns `'Admin access required'` vs the helper's `'Access denied'` — divergence already present. ir/F7: the ~76-route adoption list is not enumerated; the implementer must regenerate it.
*   **Rationale:** "Finish the migration" executed literally breaks live API contracts — the structural fix needs an extension point first.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The finding stands re-scoped: helper incomplete + adoption stalled, with the extension decision gated before migration.
*   ***Proposed Edit:***
    *   Location: lines 56–57 (replace F7 body)
    *   Change: rewrite F7 as: "**F7 — Major — the error contract exists but is both incomplete and ~80% unadopted.** `adminErrorResponse` (`lib/adminRoute.ts`, docstring :4 names '19 of the 94') maps only 400/401/403 (`:17-21`); 404/409/422 fall through to 500. Adoption today: 19 files / 27 call sites of 97 routes. The hand-rolled ladders are not verbatim clones — messages already diverge (`orders+api.ts:159` vs `adminRoute.ts:20`). Fix order: (1) extend `CLIENT_ERRORS` with per-status domain-message support (or prove per-route that only 400/401/403 reach catch); (2) regenerate the adoption list; (3) migrate route-by-route with `tests/api/admin/*` asserting 401/403/404/409/422 statuses preserved."

### C7. Missed structural finding: a second admin nav registry with no role gating is mounted into the admin layout [st 🟡] — Severity: Medium (Major)
*   **Affected Scope:** new finding (report has no entry); repo `components/GlobalActionButtons.tsx:90-96,276`, `app/admin/_layout.tsx:13,176`
*   **Discrepancy Description:** st/R-3: the admin layout mounts `GlobalActionButtons` — a shared customer/driver component containing its own `ADMIN_ITEMS` drawer (Dashboard, Driver Queue, Monitoring, Platform Config, Fare Config) with **no `roles` filtering at all**: every admin tier sees Platform Config / Fare Config entries that the sidebar gates to owner/admin; tapping yields screens whose writes 403. The same mount drags `lib/supabase`, `lib/sosQueue`, `expo-location`, `NetInfo` into the admin web bundle. The report's scans (scoped to `app/admin/**`) mapped the wrong surface.
*   **Rationale:** F6's disease in a second organ, and a boundary-scan blind spot the report's own methodology should have caught.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Added as an addendum finding with reviewer attribution; code repair is referred to the fix pipeline (this loop edits the report, not source).
*   ***Proposed Edit:***
    *   Location: after F14 (insert addendum block before section (c))
    *   Change: insert: "**F15 — Major (addendum, st/R-3, surfaced during Round-1 validation) — second admin nav registry without role gating.** `app/admin/_layout.tsx:13,176` mounts `components/GlobalActionButtons.tsx`, whose `ADMIN_ITEMS` drawer (`:90-96,276`) exposes owner/admin-gated destinations to every admin tier with no `roles` filter, and pulls `lib/supabase`, `lib/sosQueue`, `expo-location`, `NetInfo` into the admin web bundle. Fix surface: gate or remove the admin items for the admin mount; audit the bundle boundary. Referred to the fix pipeline."

### C8. §(a)'s validation-uniformity claim has a counterexample: `zones+api.ts` POST reads a body and is a two-job route [st 🟡, cd 🟡] — Severity: Medium (Major)
*   **Affected Scope:** report line 31 (§(a)); repo `app/api/admin/zones+api.ts:60-69`
*   **Discrepancy Description:** cd/F-N4 (script-enumerated) and st/R-6 concur: of the 4 write routes without `parseJsonBody`, three are genuinely bodyless (approve, ack, recover) but **`zones+api.ts` POST reads a body** via `safeRequestJson` (:63, wrapping `request.json()` in `lib/parseBody.ts:69-73`) with hand Zod validation (:69) — and is a **two-job route** (zone-create + pricing-create discriminated by `if (body.polygon)`), the server-side twin of the four-job screen F4 flags. "Verified by reading two of them" sampled 2 of 4 and generalized onto the failing one.
*   **Rationale:** The uniformity claim as written is false at one instance; the asymmetric lens (client-side job consolidation inventoried, server-side instance missed) weakens §(a).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Both corrections are factual; the spirit of the boundary claim survives (Zod validation exists) and the edit preserves that.
*   ***Proposed Edit:***
    *   Location: line 31 (§(a) sentence)
    *   Change: replace the sentence with: "Every admin write route that reads a body uses `parseJsonBody` except one: `zones+api.ts` POST reads via `safeRequestJson` with hand-applied Zod schemas (:60-69) and is a two-job handler (zone + pricing creation discriminated by `body.polygon`). The 3 genuinely bodyless POSTs (`approve`, `sos-alerts/ack`, `payment-event/recover`) skip it legitimately. Zero routes call `request.json()` raw outside the shared wrapper."

### C9. Design-layer omissions of Blocker/Major weight, and F8's unstated operator consequence [dc 🟡 ×4] — Severity: Medium (Major)
*   **Affected Scope:** new findings (report absent); repo `app/admin/broadcast.tsx:14-23,48-51`, `app/admin/sos-alerts.tsx:41-57`, `app/admin/queue.tsx:199`, `app/admin/heat-monitor.tsx:62-93`, `components/admin/AdminShell.tsx:497`
*   **Discrepancy Description:** dc/D-9: `broadcast.tsx` posts to **all users** (`target: "all"` default) on a single press with no confirm modal, no preview, no recipient-count gate — while the panel modal-confirms deactivating one package. dc/D-10: `sos-alerts.tsx` `fetchAlerts` has no error branch; on API failure the emergency queue renders the default "No data" — a false all-clear on a life-safety surface. dc/D-8: `queue.tsx:199` **clears the driver table on any failed refresh** (indistinguishable from "no drivers"); `heat-monitor` toast-spams every 60s while down; `live-ops` is the good pattern (last-good stats + stale banner). dc/D-3: F8's per-mount role round-trip has an operator-visible consequence the report misses — `AdminShell.tsx:497` hides role-restricted nav items while `adminRole` is null, so the sidebar flickers on every navigation (~30 of 46+ entries).
*   **Rationale:** A report whose design-adjacent claims otherwise verify missed two worse UX failures and mis-recorded the polling failure-designs as mere divergence without naming the standard (stale-with-banner, once-only alert, table retained).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Added as addendum findings with attribution; code repairs referred to the fix pipeline.
*   ***Proposed Edit:***
    *   Location: after F15 (insert addendum block)
    *   Change: insert: "**F16 — Major (addendum, dc/D-9) — broadcast sends to all users with zero confirmation.** `broadcast.tsx:14-23,48-51`: single press, `target: 'all'` default, no modal/preview/count gate. Fix surface: AdminModal confirm + audience count + preview. **F17 — Major (addendum, dc/D-10) — sos-alerts renders a false all-clear on fetch failure.** `sos-alerts.tsx:41-57` checks only `if (res.data)`; add an error/stale state (the emergency queue must never show empty-on-failure as 'no emergencies'). **F18 — Major (addendum, dc/D-8) — polling failure designs are three different and partially wrong behaviors.** queue clears the table on failed refresh (`:199`), heat-monitor toast-spams per 60s tick, live-ops keeps last-good + banner (the standard to converge on). A shared polling hook must codify the live-ops behavior, not the worst of the three. Referred to the fix pipeline." Also extend F8 (lines 59–60) with: "Operator-visible consequence (dc/D-3): role-restricted nav items render hidden until the per-mount round-trip resolves (`AdminShell.tsx:497`), so the sidebar flickers on every navigation."

### C10. Readiness gaps: no execution order, no verification gates, no money-path banner; F10's deferred bullet is now adjudicated [ir] — Severity: Medium (Major)
*   **Affected Scope:** report lines 38–78 (findings), 65–66 (F10 deferral)
*   **Discrepancy Description:** ir/Part B: dependencies exist (F2 before F1/F3; F10 field-name fix before any queue refactor; F6 drift dispositions before nav derivation; F7 extension before migration; F4 micro-fixes before split) — the report prescribes no order. ir/Part C: no verification gates named per fix. ir/Part D: no finding carries a money-path banner though F1/F2/F3/F4-fixes all touch the integer-paisa invariant. ir/Part E adjudicates the deferred bullet: `driver/upgrade+api.ts:15` expects `driver_id`; `driver/downgrade+api.ts:15` expects `driverId` — **the server is the inconsistent party; `driver_id` is correct**; the client matches each today (downgrade works; convention divergence, not a live bug); 3-file fix: `downgrade+api.ts` (schema/destructure/query var), `queue.tsx:290`, `tests/api/admin/driver-lifecycle.test.ts:356,369`. cd, st/R-9, zo/AF-7 concur on the server-side attribution.
*   **Rationale:** The report is an audit, not a plan; per the readiness standard it fails Zero-Decision on its two most important findings and leaves the deferred item unactionable (cp/4, cp/8 concur).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Adding the adjudication, order, and gates converts the report from audit to actionable brief without changing any severity.
*   ***Proposed Edit:***
    *   Location: lines 65–66 (F10 last bullet) and new section after F14 addenda
    *   Change: replace F10's last bullet with: "Field-name split adjudicated during Round-1 validation: the divergence is **server-side** — `driver/downgrade+api.ts:15` (`driverId`) is the sole outlier against the uniform `driver_id` family; the client posts exactly what each endpoint demands. Fix (3 files, referred to pipeline): normalize `downgrade+api.ts` to `driver_id`, `queue.tsx:290` to post `driver_id`, update `driver-lifecycle.test.ts:356,369`. Must precede any `queue.tsx` refactor." Then insert a closing section: "## Implementation notes (added at Round-1 resolution, from ir) — Safe order: F10-field-fix → F2 owner decision → F9+F1 (defer fare-config portion until F3 settles) → F4 micro-fixes (JSX bug, AdminToggle-as-zone-toggle, money swap) then split → F3 server adoption → F6 drift dispositions then nav derivation → F7 (after extension) → F5 → F8 → F11/F12/F13/F14. Gates per fix: lint → tsc → targeted jest; grep gates (zero remaining clone definitions; `Alert.alert` zero in app/admin; no `<textarea` in app/admin); F6 gets the one new test worth creating (nav-audience ≡ PERMISSION_ROLES parity — requires exporting the module-private map). Money-path banner on F1/F2/F3/F4-fixes: integer-paisa invariant constrains the fixes themselves."

### C11. F11's convention citation is ungrounded; sharper fact available [sy 🟡, dc 🟢] — Severity: Medium (Major)
*   **Affected Scope:** report lines 68–69 (F11)
*   **Discrepancy Description:** sy/S-1: no written repo rule governs API-response JSON key casing — the snake_case rules cover DB columns and Drizzle property names (`AGENTS.md` Drizzle section; `13-CONVENTIONS.md` naming table has no API-payload row; `06-API.md` silent). "Explicit codebase convention" must go; the inconsistency is de facto. dc/D-5 sharpens: `tax/daily` returns snake_case breakdown rows **and** camelCase totals in the same payload (`tax-dashboard.tsx:11-12,35-40`) — a per-field split inside one envelope. ir/F11: fix direction unchosen (change API after consumer scan vs client-side mapper).
*   **Rationale:** An audit report's value is verifiable grounding; a convention invoked that no written rule establishes would misdirect enforcement.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Factual correction plus the missing fix-direction note.
*   ***Proposed Edit:***
    *   Location: lines 68–69 (replace F11 body)
    *   Change: rewrite F11 as: "**F11 — Nit — `/api/admin/tax/daily` mixes casings inside one payload** (`totalBaseAmountBdt`/`totalTaxAmountBdt` at `lib/tax.ts:63-64,78-79` beside snake_case breakdown rows), against the surface's de facto all-snake_case envelope style (no written rule mandates API-JSON casing — DB/Drizzle rules only). Fix direction unchosen: rename API fields after a consumer scan, or add a client mapper."

### C12. F13 under-rated without justification — it violates a written owner ruling [sy 🟡] — Severity: Medium (Major as filed; resolved by rationale, not severity change)
*   **Affected Scope:** report lines 74–75 (F13)
*   **Discrepancy Description:** sy/S-2: the Copy Truth Rule is a written owner ruling (`AGENTS.md`, 2026-08-28) that categorically covers admin guidance; `packages.tsx:538` "Riders can no longer purchase it" references behavior existing nowhere on disk (role options `:47-52` exclude riders). The report stamps Nit with "trivial fix" while grading the analogous rule-contradiction F2 as Major.
*   **Rationale:** egm-resolve bars the Elephant from changing severities; the repair is the explicit downgrade rationale sy demands.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Keeps Nit, states why: one-line copy fix, no behavioral surface, rule violation real but remediation trivial — contrasted with F2 where the contradiction is structural.
*   ***Proposed Edit:***
    *   Location: lines 74–75 (append to F13)
    *   Change: append: "Severity rationale: Nit despite being a written-rule violation (Copy Truth, AGENTS.md 2026-08-28 ruling) because remediation is a one-line copy edit with no behavioral surface — unlike F2, where the same rule-contradiction class is structural."

### C13. Section (e) hex claim: quantifier false, mechanism half-wrong [sy 🟡] — Severity: Medium (Major)
*   **Affected Scope:** report line 94; repo `theme/goRide.ts:18,21,27`, kit components
*   **Discrepancy Description:** sy/S-3: coverage is ~35 of ~54 screens (~65%), not "nearly every"; `#181A20` genuinely bypasses an existing token (`bgDark`/`surfaceDark`) but `#2A2D35` exists in no theme file (`borderDark` is `#35383F`) — nothing to bypass; and the duplication originates in the shared kit components themselves (`AdminTable/AdminModal/AdminForm/AdminShell/AdminToggle` all hardcode it), not only screens. cd/F-N11 measures similarly (~60%).
*   **Rationale:** Presented under the standard's "Hardcoding" heading with an overstated quantifier and a mislocated consolidation locus.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The consolidation recommendation survives; the evidence description must not mislead the fix locus (kit first, then screens).
*   ***Proposed Edit:***
    *   Location: line 94 (replace the hardcoding bullet)
    *   Change: replace with: "Hardcoding: `#181A20` (bypasses existing `bgDark`/`surfaceDark` tokens) and `#2A2D35` (no token exists — admin-local de-facto color) appear in ~65% of admin screens **and in the shared kit components themselves** (`AdminTable`, `AdminModal`, `AdminForm`, `AdminShell`, `AdminToggle`) — consolidate in the kit first, then sweep screens; hotspot tier colors hardcoded (`platform-config.tsx:69-73`)."

### C14. Thesis-bearing quantifier vague while the verdict claims quantifiability [sy 🟡] — Severity: Medium (Major)
*   **Affected Scope:** report lines 34, 100
*   **Discrepancy Description:** sy/S-8: "a meaningful fraction of the surface predates it" is the load-bearing measure of the mid-migration thesis and is unquantified, while line 100 claims "the debt is concentrated and quantifiable". The data exists in the report's own findings.
*   **Rationale:** Vague scope at the exact point the report asks for an architectural decision.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** One sentence derived from the report's own counts closes the gap.
*   ***Proposed Edit:***
    *   Location: line 34 (replace "a meaningful fraction of the surface predates it and never got converted")
    *   Change: replace with: "a quantifiable fraction predates it: ~10 money-format clones against ~7 lib-adopters, 78 of 97 routes off the error contract, 9 screens off the toast kit, 3 role-resolution paths, 4 polling mechanisms (counts as of the Stage-5 snapshot; several improved during the 2026-11-06 edit window)".

### C15. Precision corrections to F1 and §(d) [sy 🟡, cd 🟢, st 🟢] — Severity: Medium (Major, editorial)
*   **Affected Scope:** report lines 38–39 (F1), 86 (§(d)1), 39/63 (monitoring line refs)
*   **Discrepancy Description:** cd/F-N5: F1 substance confirmed with line drift (monitoring 122→138, zone-pnl 66→62, ride-passes/rental/rider-intro off by 1–3). sy/S-5: `monitoring.tsx:115` → 131 (F9). st/R-10: §(d) "46 items today" — NAV has **51** entries. F1's clones and the name-collision claim (string vs number `paisaToTaka`) are byte-confirmed by both cd and zo.
*   **Rationale:** AGENTS.md cross-reference rule: refs that don't resolve are failures. Drift is tree-caused, not reviewer-caused; the tree-stamp in C1 covers new drift, but the count error (46→51) is a snapshot error worth fixing.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Correct the snapshot-verifiable error; annotate drift rather than chase moved lines.
*   ***Proposed Edit:***
    *   Location: line 86 (§(d)1)
    *   Change: replace "46 items today" with "51 items at snapshot". Location: lines 15–17 (C1 edit covers the stamp). No per-line chase for monitoring/zone-pnl refs — the C1 stamp notes tree drift.

### C16. "~78%" is not derivable from the report's own numbers; denominator unpinned [sy 🟢, cp 🟢] — Severity: Low (Nit)
*   **Affected Scope:** report lines 56–57, 100
*   **Discrepancy Description:** sy/S-7: from the report's own figures neither 94 nor 96 yields 78%; cd measures 19 adopters / 97 routes ≈ 80% unadopted. cp/10: denominator never stated.
*   **Rationale:** A number the reader cannot recompute.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** One arithmetic fix, worth it since the figure appears twice.
*   ***Proposed Edit:***
    *   Location: line 57 heading and line 100
    *   Change: replace "~78% of routes bypass it" with "~80% of routes bypass it (19 of 97 adopt `adminErrorResponse` at snapshot)"; align line 100 to "~80% unadopted (19/97)".

### C17. Nit pile — recorded, not fixed [cp, sy, zo, st, dc, cd] — Severity: Low (Nit)
*   **Affected Scope:** various
*   **Discrepancy Description:** Recorded without repair, with reasons: cp/5, cp/6 (external artifacts — the audit TASK brief, zoom-out standard, soft-delete entity list — unpathed in the report; the header's Related block and C1's stamp now carry the standard and pipeline context; TASK brief lives in the Elephant's conversation and cannot be pathed into a repo file without duplicating conversation state — ESCALATE-grade if the owner wants it persisted), cp/12 ("joma", paisa gloss, "Copy Truth" undefined — repo-accessible readers recover these; gloss added where C5/F13 edits touch them), sy/S-9 (decorative evaluatives "exemplary"/"textbook" — line 32's evidence list already carries the substance), sy/S-10 (speculative certainties — conditional phrasing folded into C5/C6 rewrites where touched), cp/14 (F8 client-HTTP vs server-function ambiguity — covered by C9's F8 extension), st/R-10's F12 two-mechanisms note and D-6 (tax-dashboard = server-generated CSV vs fare-config = client-side CSV from unsaved state — the distinction is preserved implicitly by C6/C10 wording; a fix brief will need it), D-11 (tax-dashboard empty state/date validation; broadcast NativeWind third styling regime; riders instant suspend), D-12, cd/F-N2 (scan-method lesson: use `rg --files-without-match`, never bracketed-path string tools), st/R-10's internal-tension note (orders praised at line 32 and flagged at line 57 — reconciled implicitly by C6's rewrite).
*   **Rationale:** egm-resolve: DECLINE records Nits without fix unless the fix is worth it; the worth-it subset is distributed into C1–C16 edits above.
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** Low value per edit against a snapshot document already carrying a drift stamp; all substantive content is preserved via the distributed fixes.
*   ***Proposed Edit:*** none.

---

## Escalated findings

None. Every finding above was resolvable against reviewer-readable evidence (repo files) or by report-text repair. One near-miss recorded under C17: persisting the audit TASK brief into the repo would duplicate Elephant-conversation state — owner's call, not required for this loop.

## Resolution summary counts

- PROPOSE FIX: 16 (C1–C16)
- DECLINE: 1 consolidated Nit pile (C17, ~14 sub-findings preserved above)
- CONTEST: 0 — every reviewer finding either survived verification or was corrected by evidence both parties can read; none was inaccurate enough to warrant rejection without repair.
- ESCALATE: 0
