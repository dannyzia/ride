# Independent Repository Audit — Plan 05 v2.0 "Implemented" Claim

**Auditor role:** Independent repository auditor / implementation-plan skeptic
**Master plan:** [`docs/Screens Plan/05 Supporting Features v2.md`](docs/Screens%20Plan/05%20Supporting%20Features%20v2.md)
**Proposed plan under review:** `Plan 05 v2.0 — Execution Architecture & Model Allocation` (uploaded, wave/model-allocation orchestration doc; no code)
**Trigger:** The coding model asserts Plan 05 v2.0 is implemented. No implementation summary, diff, or completion report was supplied — the claim was verbal only.
**Method:** Live repository inspection via Filesystem/Desktop Commander MCP against `D:\My Projects\Current Project\Ride`. `list.txt` (the tree baseline the master plan itself was written against) was found **3 days stale** relative to live tree state, so all findings below are from direct filesystem/file-content reads, not from `list.txt`.

---

# 1. EXECUTIVE VERDICT

**REJECT**

The "already implemented" claim is false for at least three of the plan's four core engineering programs (its own §26 framing: scheduled-ride/cancellation, rider safety, multi-zone geo foundation, driver feature integration). Concretely:

- The **Zone Foundation track (Z-1…Z-8)** — the document under review's own hard-blocking gate for all of Wave 4 — has **not been started**. [`lib/zone.ts`](lib/zone.ts:1) is unchanged single-zone logic with a sentinel `id: 'fallback'` zone object, the exact pattern Z-3 is chartered to remove.
- Despite the Zone Gate not being met, **Wave 4 driver work has already been attempted** (`payout-methods/`, `add-payout-method/` directories exist) — a direct sequencing violation of the reviewed plan's own §24 ("Wave 4 and Zone Gate — Hard stop. No exceptions").
- **W1-A cancellation backend** (`cancel-preview`) omits `free_until` and `server_now` from its response, breaking Lock L19 ("Zero client-side fee/window math") at the contract level.
- **W2-A SOS backend** is a partial stub: no SMS dispatch, no push, no rate-limit/cooldown, wrong response shape, and two of the three required endpoints (`/api/sos/resolve`, `/api/sos/active`) do not exist.
- **D9 Minimum Rate** screen does not exist at all.

Some genuine correct work does exist (see §8 Reuse Opportunities and the S5 SOSButton fix below) — this is not a "nothing was done" verdict. It is a "the specific claim of completion is false, and what exists is unsafe to build on top of without repair" verdict.

---

# 2. REPOSITORY REALITY

- **Stack:** Expo Router file-based API routes (`app/api/**/+api.ts`), Drizzle ORM/Postgres (`src/db/schema.ts`, `src/db/migrations/0000`–`0041`), Zustand stores, NativeWind theming, `lib/*` shared helpers, `utils-server/` for the standalone dispatch/WS process.
- **Rider/driver/admin screens** live under `app/(main)/(customer)/`, `app/(main)/(rider)/`, `app/admin/`. All FACT paths named in the master plan for R1–R11 and D1–D8, D11–D12 exist on disk.
- **Migrations:** 42 migration files (`0000`–`0041`), auto-named by drizzle-kit (non-descriptive). The most recent (`0041`) adds an unrelated FK (`rides.pass_subscription_id`) — no zone-index migration matching Z-1's description (remove single-active-zone unique index; add active-zone index, forecast uniqueness index, ride zone/time index) was found in the migrations directory.
- **Zone logic:** `lib/zone.ts` exposes `getActiveZone()` (singular), which does `.limit(1)` against `zones WHERE is_active = true` and falls back to a hardcoded `id: 'fallback'` Bangladesh-wide polygon when no active zone or a malformed polygon is found. There is no `getZoneForLocation()` (the function name the reviewed plan's §8 explicitly names), no multi-zone iteration, no hysteresis, no zero-zone `503`, no outside-both-zones `422`.
- **SOS:** `app/api/sos/alert+api.ts` exists and is real code (not a stub) — it does auth, role check, ride-ownership check (C-4), and per-ride open-alert dedupe. But it inserts `contacts_notified: []` unconditionally and contains no call to any SMS/push helper. `app/api/sos/resolve+api.ts` and `app/api/sos/active+api.ts` do not exist anywhere in `app/api/sos/` (confirmed via direct directory listing, not `list.txt`).
- **SOSButton.tsx** (`components/SOSButton.tsx`) has genuinely been repointed to `POST /api/sos/alert` and dials `tel:` first, independent of the fetch outcome — this one item matches its spec (§5.5, S5) correctly.
- **Cancel-preview:** `app/api/ride/[id]/cancel-preview+api.ts` returns only `{ fee_bdt, reason }`. `lib/cancellation.ts`'s `evaluateCancellation()` return shape was not independently opened, but the route handler itself does not surface `free_until` or `server_now` under any field name.
- **D9/D10:** No `app/(main)/(rider)/min-rate/` directory exists anywhere in the tree (confirmed via targeted file search, zero results). `app/(main)/(rider)/payout-methods/`, `add-payout-method/`, `instant-pay/`, `payout-history/`, and `earnings-detail/` all exist — the latter two are explicitly listed as **out of scope** in master-plan §2.4 ("do not build — prevents drift from old drafts... instant-pay · payout-history").
- **Wave 0 shared components:** `components/ErrorBanner.tsx` and `components/OfflineIndicator.tsx` (S1/S2) both exist. `components/EmptyState.tsx` also exists, though at `components/EmptyState.tsx` rather than the `components/plan03/EmptyState.tsx` path the master plan documents for S3 — a path-documentation discrepancy in the master plan itself, not a missing-file problem.

---

# 3. CRITICAL / HIGH FINDINGS

### [CRITICAL] Zone Foundation track not started, yet its hard-blocked downstream (Wave 4) has already been touched

**Problem:**
The reviewed execution-architecture document treats Z-1→Z-7→Z-6 as a **hard, no-exceptions gate** before any Wave 4 driver work ("Wave 4 and Zone Gate — Hard stop. No exceptions," §24). The repository shows zero evidence any Z-task has been executed, while Wave 4 artifacts (`payout-methods/`, `add-payout-method/` directories) already exist in the tree.

**Repository evidence:**
[`lib/zone.ts`](lib/zone.ts:36) — `getActiveZone()` selects a single active zone (`.limit(1)`) and falls back to a hardcoded sentinel object `{ id: 'fallback', name: 'Bangladesh (fallback)', ... }` when none is found or the polygon is malformed. No `getZoneForLocation()` function exists in the file, no multi-zone iteration, and zero-zone behavior returns the entire-country fallback polygon rather than the `503` the plan's Zone Gate criteria require. This is architecturally indistinguishable from pre-Plan-05 single-zone code — exactly the sentinel/fallback pattern the plan's own gate criteria forbid ("no sentinel UUID/fallback writes").

**Why it matters:**
Every downstream consumer the plan lists as depending on the zone resolver (dispatch, pricing, forecast, hotspot, admin multi-zone, driver heartbeat zone assignment) is still operating on single-zone semantics. Any Wave 4 work already started (payout/vehicle/hotspot screens) was built without its declared platform dependency in place, and per the reviewed plan's own logic must be treated as provisional until the Zone Gate is re-run against it.

**Required correction:**
Treat Zone Foundation as 0% complete. Before any further Wave 4 work is accepted, run Z-1 (migration) → Z-2/Z-3 (resolver rewrite + sentinel removal) → Z-4 (heartbeat) → Z-5 (admin) → Z-7 → Z-6, then the two-reviewer Zone Gate exactly as the reviewed document specifies, and only then re-validate whatever Wave 4 screens already exist against the new zone contract.

---

### [CRITICAL] Cancellation preview response violates Lock L19 (zero client-side fee/window math)

**Problem:**
Master-plan Lock L19 states cancel UI must bind 100% to server-provided `fee_bdt` + `free_until` + `server_now`, with **zero client-side fee/window math**. The live `cancel-preview` endpoint does not return `free_until` or `server_now` at all.

**Repository evidence:**
[`app/api/ride/[id]/cancel-preview+api.ts`](app/api/ride/[id]/cancel-preview+api.ts:34) — `return Response.json({ fee_bdt: feeBdt, reason });` is the entire response body. No `free_until`, no `server_now` field under any name.

**Why it matters:**
R3/R4 (§5.3) require rendering a countdown to `free_until` anchored on `server_now`, explicitly to avoid trusting the device clock. Without these fields in the contract, any front-end built against this endpoint is forced to either (a) not show a countdown at all, or (b) reintroduce client-side clock/window math — the exact anti-pattern L19 was written to eliminate, and a direct regression risk for the "no hardcoded ৳25, no 120s window" requirement the plan calls out by name.

**Required correction:**
Extend `evaluateCancellation()` (`lib/cancellation.ts`, not independently opened in this pass — verify its return shape) and the route handler to surface `free_until: string | null` (UTC ISO) and `server_now: string` (UTC ISO, `new Date().toISOString()` at request time) alongside `fee_bdt`.

---

### [CRITICAL] SOS backend is a partial stub — no SMS, no push, no cooldown, wrong response contract, two required endpoints missing

**Problem:**
Master-plan §8.2/§5.5 requires: SMS to `user_emergency_contacts` via `lib/dprelay` with a circuit breaker (§11.6), a push notification via `lib/notify`, a 15-minute rate-limit/cooldown (`429 sos_cooldown`), a `201` response containing `{ alert_id, status: "triggered", sms_sent, location_shared }`, and a post-trigger lifecycle backed by `GET /api/sos/active` and `POST /api/sos/resolve`.

**Repository evidence:**
[`app/api/sos/alert+api.ts`](app/api/sos/alert+api.ts:76) inserts `contacts_notified: []` unconditionally with no call to any SMS or push helper anywhere in the file. The response is `Response.json({ ok: true })` (default `200`) or `{ ok: true, deduped: true }` — none of `alert_id`, `status`, `sms_sent`, `location_shared` are present. The dedupe check uses `sosAlerts.status === "open"`, not the `triggered/acknowledged/resolved` lifecycle enum the plan specifies. Directory listing of `app/api/sos/` confirms only `alert+api.ts` and `contacts+api.ts` exist — **`resolve+api.ts` and `active+api.ts` do not exist**.

**Why it matters:**
This is explicitly flagged by the reviewed execution plan itself as "security/safety-sensitive infrastructure" where "SMS failure must not cause the SOS alert itself to fail" — i.e., the SMS path was supposed to exist and merely be fault-isolated, not be entirely absent. Without it, a rider or driver in danger gets no emergency-contact notification at all beyond the 999 dial the client already does unconditionally. Without `/api/sos/active` and `/api/sos/resolve`, the R6 "I'm safe" flow and the post-trigger polling UI (§5.5) cannot function even if the front-end code for them exists, because their backend has no endpoint to call.

**Required correction:**
Build the SMS dispatch (via `lib/dprelay`, per user memory this is the existing SMS-relay integration) with a circuit breaker, wire push via `lib/notify`, add the 15-minute cooldown check, correct the response contract to match §8.2, and build `resolve+api.ts` / `active+api.ts` with the `triggered → acknowledged → resolved` status enum (which also requires reconciling the `sosAlerts.status` column values, currently `"open"`, against the plan's enum).

---

### [HIGH] D9 Minimum Rate screen does not exist

**Problem:**
Master-plan D9 requires `app/(main)/(rider)/min-rate/index.tsx`, reusing the FACT `components/MinRateSlider.tsx`.

**Repository evidence:**
Directory listing of `app/(main)/(rider)/` (live, not `list.txt`) shows no `min-rate` entry. A targeted recursive file search for `min-rate` under that directory returned zero results. `components/MinRateSlider.tsx` does exist (confirmed present in `components/` listing), so the reusable slider component is available but has no screen wired to it.

**Why it matters:**
D12 (Driver Settings) is specified to add an entry row linking to Min Rate; if D12 was implemented pointing at a non-existent route, that's a dead link in production driver settings. This is also one of the plainest, cheapest-to-verify claims in the whole plan — its absence is a strong signal the "implemented" claim was not checked against the tree before being made.

**Required correction:**
Build `app/(main)/(rider)/min-rate/index.tsx` per §5 driver spec (not independently re-read in this pass — pull the D9 spec section before implementing) using the existing `MinRateSlider.tsx`, and verify D12's settings row target path.

---

### [HIGH] Out-of-scope screens exist in the tree despite explicit exclusion

**Problem:**
Master-plan §2.4 explicitly lists `instant-pay` and `payout-history` as **do-not-build** items ("prevents drift from old drafts... no withdrawal backend — separate epic"). Both directories exist in the live tree.

**Repository evidence:**
Directory listing of `app/(main)/(rider)/` shows `instant-pay/` and `payout-history/` as present alongside the in-scope `payout-methods/` and `add-payout-method/`.

**Why it matters:**
Two possibilities, both requiring investigation before Wave 4 sign-off: (a) these are legacy pre-Plan-05 routes that were never cleaned up, in which case they're dead weight and a UX trap (wallet screen is supposed to say "No withdrawals are available yet." per §2.4, which conflicts with having a live `instant-pay` route sitting in the router), or (b) the coding model built them anyway in violation of the explicit scope fence, which would indicate the model was not actually working from this master plan's §2.4 when it claimed completion.

**Required correction:**
Open both directories, determine provenance (git blame / file mtime vs. Plan-05 work start date), and either confirm they predate Plan 05 and leave them alone, or remove them if newly created in violation of §2.4.

---

# 4. MEDIUM / LOW FINDINGS

**[MEDIUM] `list.txt` is stale and cannot be trusted as a scope baseline.** Modified Aug 15, accessed Aug 18 with material tree drift already observed (e.g., `payout-methods/` present live but absent from `list.txt`). Any future planning pass must re-baseline against a fresh tree listing, not reuse `list.txt`.

**[MEDIUM] `components/EmptyState.tsx` location mismatch.** Master-plan S3 documents the FACT path as `components/plan03/EmptyState.tsx`; the live file is at `components/EmptyState.tsx` with no `plan03/` subdirectory in `components/`. Low-risk (file exists, just at a different path), but any coding agent grepping for the documented path will falsely conclude the file is missing and risk duplicating it — which §2.4/S3 explicitly forbids ("never duplicate").

**[LOW] `earnings-detail/` directory exists** under `app/(main)/(rider)/` with no corresponding item in the master plan's D-table (which lists `earnings` and `earnings-breakdown` as the FACT earnings screens). Likely legacy or a genuine addition — flag for provenance check, not a blocker.

---

# 5. MISSING REQUIREMENTS

Against master-plan §2–§5 and the reviewed execution plan's own Wave/Zone breakdown, the following are confirmed absent or non-functional, based on direct evidence gathered this pass (this is not an exhaustive sweep of all 59 items — see §11 for what remains unverified):

- D9 Minimum Rate screen (§2.2) — **absent**
- `POST /api/sos/resolve`, `GET /api/sos/active` (§8.3) — **absent**
- SOS SMS dispatch + circuit breaker (§8.2, §11.6) — **absent**
- SOS push notification — **absent**
- SOS rate-limit/cooldown (429 `sos_cooldown`) — **absent**
- `cancel-preview` `free_until` / `server_now` fields (§8.1, L19) — **absent**
- Z-1 index-only migration (no single-active-zone unique index removal, no active-zone/forecast/ride-zone-time indexes found in `0000`–`0041`) — **absent**
- Z-2/Z-3 `getZoneForLocation()` multi-zone resolver + sentinel removal — **absent**; current code is the sentinel pattern Z-3 is meant to delete
- Z-4 driver heartbeat hysteresis (3-consecutive-heartbeat zone commit + 10-min forced re-resolution) — **not located** (would live in a heartbeat/driver-location handler not opened this pass — UNVERIFIED, but no evidence of it surfaced anywhere touched)

---

# 6. INCORRECT ASSUMPTIONS

- **"Plan 05 has already gone through substantial planning/review and explicitly declares itself canonical/tree-verified... I would therefore avoid spending [heavyweight] quota merely to have them re-review the entire plan."** (reviewed doc, §22) — This assumption is contradicted by direct evidence: the tree has materially drifted since the master plan's `list.txt` baseline (3 days, with at least one Wave-4-relevant directory added), and the plan's own "one exception" clause ("If the repository state has materially changed since Plan 05 v2.0 was tree-verified, then a fresh heavyweight repository analysis becomes justified") is therefore triggered by the plan's own stated criterion.
- **Implicit assumption that Wave 4 has not been started** — false; `payout-methods/`/`add-payout-method/` directories exist, meaning execution has already deviated from the reviewed plan's own hard-gate sequencing before this audit even began.
- **Implicit assumption that S5 (SOSButton repoint) needed to be built** — this one is actually already correctly done; not every "NEW/FIX" item in the master plan is outstanding.

---

# 7. DEPENDENCY / SEQUENCING PROBLEMS

Per the reviewed plan's own §23/§24 dependency map, the correct order is:

```
W0 → {W1, W2, W3, Zone track in parallel} → Zone Gate (hard) → W4 → W5 → Final Audit
```

**Actual repository state relative to this order:**

- W0 (ErrorBanner, OfflineIndicator, EmptyState, MinRateSlider, SOSButton scaffolding) — present, consistent with W0 having run.
- W1 cancellation backend — started but **contract-incomplete** (missing `free_until`/`server_now`), i.e. mid-flight, not done.
- W2 SOS backend — started but **contract-incomplete and missing two of three endpoints**, i.e. mid-flight, not done.
- Zone track — **not started at all** (0 of Z-1…Z-8).
- W4 driver work — **artifacts already exist** (`payout-methods/`, `add-payout-method/`) despite the Zone Gate — which the reviewed plan calls a hard, no-exceptions stop — never having been reached.

This is the one unambiguous sequencing violation directly attributable to actual execution (as opposed to a documentation gap): **Wave 4 work commenced before its declared hard prerequisite exists.** Whether this happened because the coding model skipped the gate, or because these Wave-4-looking directories predate Plan 05 entirely and aren't really Wave-4 output, could not be resolved from directory listings alone (see §11 — UNVERIFIED, needs `payout-methods/index.tsx` content + git history read).

---

# 8. REUSE OPPORTUNITIES

- `components/MinRateSlider.tsx` — already exists, correctly reusable for the still-missing D9 screen; do not rebuild.
- `components/ErrorBanner.tsx`, `components/OfflineIndicator.tsx` — Wave 0 items already present; do not rebuild.
- `components/EmptyState.tsx` — present (at a different path than documented); reuse, do not duplicate under a new `plan03/` path.
- `components/SOSButton.tsx` — already correctly repointed to `/api/sos/alert` with dial-first, fetch-best-effort semantics matching §5.5's T-1 requirement; this piece of work should be left alone, not "fixed" again.
- `app/api/sos/contacts+api.ts` — exists and is consumed correctly by `SOSButton.tsx`; the plan's L23 concern (verify same-table as `/api/user/emergency-contacts`) is still open but the endpoint itself doesn't need rebuilding.

---

# 9. TESTING GAPS

- No SOS SMS-failure-isolation test exists (and can't, since there's no SMS call to isolate yet) — once built, needs an explicit test that a `lib/dprelay` throw does not prevent the `sos_alerts` insert or the `201` response.
- No cancellation-countdown test against `server_now`/`free_until` — can't exist yet since the fields aren't returned.
- No zone-gate regression suite exists because no zone work has started; when it does, the reviewed plan's own §13 gate criteria (two active zones, outside-both `422`, zero-zone `503`, no sentinel writes, forecast rows, heatmap data, P&L regression) should become literal test assertions, not just a manual checklist.
- No test found (or expected, given the code) verifying `payment_events` write-ownership for cancellation goes through `lib/paymentEvents.ts` inside a transaction (L20) — `lib/cancellation.ts` was not opened this pass; **UNVERIFIED**, flag for the next pass.

---

# 10. REQUIRED PLAN CHANGES

For the reviewed execution-architecture document to be safe to execute against the actual repository state found:

1. **Insert a repository re-verification step before authorizing further Wave 4 work.** The document's own §22 exception clause is triggered; a fresh tree/contract check (this audit) was overdue.
2. **Do not treat W1-A/W2-A as complete.** Both need the specific contract fixes in §3 above (CRITICAL findings) before their dependent UI work (R3/R4, R6) can be correctly built or verified.
3. **Roll back or quarantine any Wave-4 UI already built against the pre-Zone-Gate state** (`payout-methods`, `add-payout-method`) until Zone Foundation lands and the Zone Gate passes, per the document's own hard-stop rule.
4. **Add an explicit "audit the coding model's self-report against the tree" step** before accepting any future "implemented" claim — this pass found the claim false within the first six tool calls.
5. **Resolve the `instant-pay`/`payout-history` provenance question** before Wave 4 sign-off, since their presence contradicts §2.4.

---

# 11. FINAL IMPLEMENTATION READINESS

**Can a coding agent implement further Plan 05 work safely right now? NO.**

**What must be fixed first:**
- Zone Foundation (Z-1 through Zone Gate) must actually be started — it currently does not exist in any form.
- `cancel-preview` response contract (add `free_until`, `server_now`).
- SOS backend: SMS dispatch, push, cooldown, response contract, `resolve`/`active` endpoints.
- D9 Minimum Rate screen.
- Provenance check on `instant-pay`/`payout-history`/`earnings-detail`.

**What can remain unchanged:**
- `components/SOSButton.tsx` (S5) — correctly done.
- `components/ErrorBanner.tsx`, `components/OfflineIndicator.tsx`, `components/EmptyState.tsx`, `components/MinRateSlider.tsx` — present and reusable.
- `app/api/sos/contacts+api.ts`, `app/api/sos/alert+api.ts`'s existing auth/ownership/dedupe logic (extend, don't rewrite — the ownership and dedupe checks in the current file are sound and shouldn't be thrown away when the SMS/push/response-shape gaps are fixed).

**What should NOT be changed without further investigation:**
- `lib/zone.ts`'s Bangladesh-wide fallback polygon behavior — this is a deliberate "never block rides on a config gap" safety net (per its own comments); the Z-2/Z-3 rewrite needs to preserve equivalent fail-open behavior for the zero-zone case rather than simply deleting it, even though the sentinel `id` value itself must go.
- `instant-pay`/`payout-history` directories — do not delete until provenance is confirmed (§7/§10.5); deleting legacy-but-linked routes blind could break existing navigation.

---

# 12. OPTIONAL IMPROVEMENTS

- Given `list.txt` demonstrably drifts within days, consider generating it as part of a pre-flight script step immediately before any planning session rather than treating it as a standing artifact — or drop reliance on it entirely in favor of live directory listings, as this audit did.
- The reviewed execution-architecture document's model-allocation table (§2/§21) is well-reasoned as an *orchestration* strategy and does not need revision on its own terms — the finding here is entirely that its premises about current repository state (§22, "no material change since tree-verification") do not hold, not that its wave/model logic is wrong.
- Once Zone Foundation actually starts, consider adding a lightweight automated check (e.g., a grep gate for `id: 'fallback'` / `sentinel` string literals in `lib/zone*.ts`) to the plan's own Level-1 mechanical verification list (§20), so the Zone Gate reviewers don't have to manually rediscover this pattern the way this audit did.
