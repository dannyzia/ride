Verification complete. Full assessment follows.

---

## 1. VERDICT

**READY WITH CORRECTIONS**

The draft is a structurally strong skeptic-audit prompt: correct stack description, correct adversarial posture, evidence requirements, severity discipline, and a false-positive clause that defers Plan 05/06 scope. All 15 Phase 5 endpoints it lists exist, all 24 "existing" components it lists exist, and its L1–L17 restatement matches the plan.

However, it contains **one materially wrong contract source** (it treats the plan's §10.2 WebSocket protocol as the authoritative contract, but the actual wire protocol in `utils-server/types.ts`/`index.ts` has diverged — an auditor following the prompt verbatim would generate false CRITICAL/HIGH findings), **one phantom requirement** (it declares the plan's implementation records / known bugs / verification checklists "authoritative," but the supplied `01-04 Plan V2.md` is truncated at §10.3 and contains none of those sections), and it is **unaware of systematic screen-path drift** between the plan inventory and the repository (~30 screens), which would flood Phase 3 with false "absent" findings. All fixable with targeted edits; no rewrite required.

## 2. REPOSITORY FACTS

- **`utils-server/types.ts` (whole file) + `utils-server/index.ts`** — The real WS protocol includes `ride:status` (emitted at index.ts lines 953, 1069, 1122, 1376), `ride:expired` (1560), `ride:alternatives` (1550), `admin:suspended` (271), plus inbound `auth:refresh` and `ride:subscribe`/`ride:unsubscribe`. **None of these appear in plan §10.2.** Conversely, the plan's "never emitted" list (`ride:offer_expired`, `ride:offer_cancelled`, `ride:status_update`, `subscription:expired`) uses wire names that don't exist — types.ts's header comment explicitly says phantom names were removed and real names (`offer:lost`, `ride:status`, `ride:expired`) declared. The plan's §10.2 is a **stale contract**.
- **`docs/Screens Plan/01-04 Plan V2.md`** — Ends at line 870 (§10.3). Its own TOC promises §12 Coding Agent Instructions, §13 Verification Checklists, §14–17 Implementation Records, §18 Known Bugs, §19 Key Decisions, §20 Files. **These sections do not exist in this file.**
- **`docs/Screens Plan/01-04 - Master Plan.md`** — Sibling file that *does* contain §12/§13, but its tail (≈lines 674–706) is contaminated with chat-log artifacts (python `print(...)` stubs, "any change from the old one? I want you to keep that to u.", a Plan-05 delta table), and §12.1 references `store/useWSStore.ts`, **which does not exist** (actual stores: `useRiderStore`, `useDriverStore`, `useDriverStatusStore`, `useDriverFlowStore`, `useChatStore`, `usePackageStore`, `useCallLedgerStore`).
- **Screen path drift (systematic)** — Rider settings live under `app/(main)/(customer)/(tabs)/settings/` not `settings/` (affects RS1–RS26; also `appearance`→`app-appearance`, `language`→`app-language`); `R8 wallet`→`(tabs)/wallet`, `R9 profile`→`(tabs)/profile`, `R11 referral`→`(tabs)/referral`, `R12 edit-profile`→`profile/edit.tsx`, `R31 chat`→`(tabs)/chat/index.tsx` + `chat/[rideId].tsx`; driver `D17 call-ledger/index.tsx`→`call-ledger.tsx`, `D28 incentives`→`incentives.tsx`, `D30 packages`→`packages.tsx`, `D49 chat`→`chat/[rideId].tsx`. `R23 show-ride` was not found at all. The repo also contains extra screens absent from the inventory (`scheduling-user-ride`, `schedule-ride-after-promo`, `ride-details-scheduled`, `activity-*` variants, `driver-history`, `share-receipt`).
- **Endpoint drift** — Plan §7.13 `GET /api/driver/due-amounts` → actual `app/api/driver/dues+api.ts`. Plan §7.18 `GET /api/driver/subscription-plans` → no such route; the packages domain uses `app/api/package/{list,purchase,active}+api.ts`. (Plan 06 item, so deferred — but the auditor should know.)
- **`app/(main)/(rider)/(tabs)/index.tsx:424`** — the only `new WebSocket` in `app/` (driver home), consistent with L8; `lib/riderSocket.ts` exists for the rider socket. The prompt's L8 audit is checkable as written.
- **Legacy `verify-driver`** — no client usage in `app/**/*.tsx`; only `app/api/admin/verify-driver+api.ts` (legitimate admin route). Prompt 2 §9's check is valid and appears satisfiable.
- **`utils/mapUtils.ts` vs `lib/useBarikoiMapStyle.ts`** — two similarly named files: the style hook lives in `utils/mapUtils.ts` (as plan L5 says); `lib/useBarikoiMapStyle.ts` holds URL helpers (`getBarikoiAutocompleteUrl`, etc.). A grep-only auditor could misattribute imports.
- **AGENTS.md vs plan L1 tension** — AGENTS.md says dark mode "is handled by NativeWind `dark:` variants"; plan L1 forbids `dark:` only in *new* screens and the master-plan global checklist tolerates it "in pre-existing files with TODO." The prompt's blanket "search aggressively for `dark:`" lacks this carve-out.
- **Stack claims verified** — `package.json`: expo ^53.0.0, nativewind 4.1.23, maplibre-react-native 10.4.2, zustand 5, drizzle-orm, jest-expo, ws. `lib/portpos.ts`, `lib/paymentEvents.ts`, `lib/money.ts`, `lib/useAppearance.ts` all exist.
- **Tests** — 23 test files: `lib/__tests__/` (20, incl. portposCallback, paymentEvents, fareCalc, heartbeat), `utils-server/__tests__/` (1), `__tests__/` (2). No screen/UI tests. Utils-server is a separately-typed package excluded from root tsc/eslint.
- **Component inventory** — All 24 "already built" components in plan §8.1 exist. Of §8.2's "new" list, 10 exist (DriverStatsBar, RideInfoCard, DriverActionBar, VerificationStep, EmptyState, ErrorBanner, OfflineIndicator, RadioGroup, DatePicker, TimePicker); ProgressBar/Badge/Avatar/CheckboxGroup/ChartBar/ChartLine/HeatmapOverlay do not (several serve Plan 05/06 screens).

## 3. INCORRECT ASSUMPTIONS

1. **That plan §10.2 is the WS contract.** It is stale. Prompt 2 §2 repeats it verbatim and orders verification "against this contract" — this would misclassify real, intentional events (`ride:status`, `ride:expired`, `ride:alternatives`, `auth:refresh`, `ride:subscribe`, `admin:suspended`) as "undocumented events" and could produce false CRITICAL findings plus wrong remediation (e.g., "remove ride:status handling" — which would break ride tracking).
2. **That the supplied master plan contains implementation records, known bugs, key decisions, and verification checklists.** `01-04 Plan V2.md` is truncated at §10.3; those sections exist only in the sibling file whose tail is contaminated and which references a nonexistent store.
3. **Implicitly, that the plan's screen file paths match the repository.** ~30 screens differ (see Facts). Phase 3 step 1 "Confirm route exists" against plan paths will yield mass false "absent" findings.
4. **That `GET /api/ride/{id}` maps to a file literally named for the path** — it's `app/api/ride/[id]/index+api.ts` (fine), but combined with drift above, the prompt should mandate resolving routes via the router/API tree rather than filename matching (it does warn "do not assume because its filename looks correct" — good — but the path-drift problem is the inverse: files not at plan paths).
5. **That any `dark:` class is an L1 violation.** Per the plan's own global checklist, pre-existing files outside Plans 01–04 scope are tolerated. The prompt lacks this boundary.

## 4. MISSING REQUIREMENTS

1. **Designate the WS protocol source of truth:** `utils-server/types.ts` + actual emissions in `utils-server/index.ts`; treat plan §10.2 as a stale snapshot; explicitly list the six legitimate undocumented-in-plan events so they aren't flagged.
2. **Tell the auditor the plan is truncated** and that §12/§13 live in `01-04 - Master Plan.md` with a contaminated tail (ignore everything after the "End of ... Master Planning File" marker, ~line 673) and a stale `useWSStore.ts` reference.
3. **A path-drift rule:** verify screens by feature/route resolution, not literal plan paths; include the known drift table (or instruct the auditor to derive it first and record it before judging).
4. **Cross-reference the repo's other canonical docs:** `CLAUDE.md`, `docs/Plan/06-API.md` (API contract), `docs/Plan/13-CONVENTIONS.md`, `docs/Plan/18-KNOWN-ISSUES.md` (so known issues TD-01/TD-11/TD-15/TD-31 aren't reported as novel findings), and `docs/Plan/14-DEV-CHECKLIST.yaml`.
5. **Note the dual Barikoi files** (`utils/mapUtils.ts` hook vs `lib/useBarikoiMapStyle.ts` helpers).
6. **Test locations and tooling** (jest-expo preset; `lib/__tests__`, `utils-server/__tests__`) so "no tests" false claims don't arise; note utils-server's separate typing/lint exclusion.
7. **Run-order/operational instructions** — the draft contains four prompts (GLM-5.3 ×2, DeepSeek, MiMo) with three different output schemas plus a comparative schema that presumes prior reports exist. For a single Kilo agent: specify execution order (1→2→3 independent, 4 last) or which prompt to run, and where reports should be written so Prompt 4 can find them.
8. **Read-only enforcement beyond files:** explicitly forbid mutating commands (`drizzle-kit push`, installs); permit only grep/read/`tsc --noEmit`/`lint`.
9. **Phase 3 prioritization:** with ~150 screens, instruct a tiered pass (Plan 01–04-claimed screens, deletion-marked screens, money/WS-touching screens first) to avoid shallow coverage or context exhaustion.

## 5. ARCHITECTURAL RISKS

- **Highest risk:** an auditor "correcting" the WS layer toward the stale §10.2 contract (removing `ride:status` handling or adding `ride:status_update`) would break the working dispatch/tracking pipeline. The prompt's remediation-order section must be anchored to the real protocol.
- Prompt 2's authorization sweep includes "subscriptions" and "due amounts" — the auditor needs the actual route names (`/api/package/*`, `/api/driver/dues`) or will skim past them.
- The plan's own §12 example uses `className="absolute top-4..."` (NativeWind) while L1 mandates inline styles — a pre-existing plan inconsistency the auditor may trip over; not the prompt's fault, but a one-line note prevents confusion.

## 6. SCOPE RISKS

- Phase 3 as written invites auditing all ~150 screens at equal depth — unbounded. Without tiering, the agent either burns context on settings screens or produces filename-level checks (exactly what the prompt forbids).
- The `dark:` search without the legacy carve-out invites re-auditing dozens of pre-Plan-01 screens that are out of scope.
- Extra repo screens not in the inventory (`scheduling-user-ride`, `schedule-ride-after-promo`, `activity-*`, `driver-history`...) could be reported as "dead routes" when some are live legacy flows — the auditor should classify, not assume dead.
- Four prompts in one file given to one agent = conflicting output formats.

## 7. TESTING / VALIDATION GAPS

The prompt should explicitly require the auditor to:
- Verify findings against `npx tsc --noEmit` where relevant (and know `utils-server/` is excluded from root typing).
- Distinguish "test exists" from "test asserts the invariant" for the dispatch/payment invariants listed in AGENTS.md (single deduction per `(ride_id, driver_id)`, idempotency-key uniqueness, compensation-queue within 30s) — AGENTS.md enumerates them; the prompt's Phase 9 should reference these specific invariants rather than generic coverage questions.
- Check `lib/__tests__/portposCallback.test.ts` and `paymentEvents.test.ts` against Prompt 2 §7's five IPN questions rather than re-deriving from scratch.

## 8. REQUIRED PROMPT CORRECTIONS

1. **Prompt 1 & 2, WS sections:** Replace "verify against this contract [§10.2]" with: *"The authoritative WS contract is `utils-server/types.ts` and actual emissions/handlers in `utils-server/index.ts`. Plan §10.2 is a stale snapshot: `ride:status`, `ride:expired`, `ride:alternatives`, `admin:suspended`, `auth:refresh`, `ride:subscribe/unsubscribe` are legitimate and must NOT be flagged as undocumented. The 'never emitted' list (`ride:offer_expired`, `ride:offer_cancelled`, `ride:status_update`, `subscription:expired`) refers to wire names that should not appear anywhere."*
2. **Prompt 1, canonical-spec section:** Add: *"The supplied `01-04 Plan V2.md` ends at §10.3. §12 (agent instructions) and §13 (verification checklists) exist only in `docs/Screens Plan/01-04 - Master Plan.md` — treat content after its 'End of ... Master Planning File' line (~line 673) as chat-log contamination and ignore it. Its `store/useWSStore.ts` reference is stale; the real stores are in `store/` (7 stores, no WS store). Implementation records §14–17 do not exist in either file; rely on the inline per-screen ✅ markers and deletion notes in §6–§7."*
3. **Prompt 1, Phase 3:** Add a pre-step: *"Establish the actual route tree first; the plan's file paths contain systematic drift (e.g., rider settings live under `(tabs)/settings/`, `app-appearance` not `appearance`, `call-ledger.tsx` not `call-ledger/index.tsx`, `packages.tsx`, `incentives.tsx`, `chat/[rideId].tsx`, `profile/edit.tsx` for edit-profile). Record the drift mapping before classifying any screen as absent. `show-ride` (R23) has no file at its plan path — determine whether the feature exists under another name before reporting it missing."*
4. **Prompt 1, L1 section:** Add: *"`dark:` classes in screens not created/rewritten by Plans 01–04 are pre-existing legacy and are NOT L1 violations (per the plan's own global checklist); confirm whether a Plan 01–04 touched the file before reporting."*
5. **Prompt 2, §4/§10:** Note actual route names: driver dues → `GET /api/driver/dues`; subscription/package purchase domain → `app/api/package/{list,purchase,active}`; `subscription-plans` route does not exist (Plan 06, deferred).
6. **All prompts:** Add cross-references: `docs/Plan/06-API.md`, `docs/Plan/13-CONVENTIONS.md`, `docs/Plan/18-KNOWN-ISSUES.md` (known issues must be cited as known, not reported as discoveries), `CLAUDE.md`.
7. **All prompts:** Add read-only enforcement: *"Do not run any command that mutates state (no `drizzle-kit push/generate`, no installs, no git writes). Static inspection plus optionally `npx tsc --noEmit` and `npm run lint` only. Note `utils-server/` is excluded from root tsconfig/eslint."*
8. **File header:** Add run-order guidance: *"This file contains four sequential audit prompts. Run 1, 2, 3 as independent passes (write each report to `docs/` as `audit-report-N.md`), then run 4, which consumes the prior reports."* — or, for a single Kilo session, specify which one prompt to execute.
9. **Prompt 1, Phase 3:** Add tiering: depth-audit Plan-01–04-claimed screens, deletion-marked screens, and money/WS-touching screens; filename-level existence checks suffice for the remainder.
10. **Prompt 1 Phase 1 / Prompt 3:** Note the dual Barikoi utility files so map-style findings attribute to the right module.

## 9. FINAL RECOMMENDATION

The prompt **can be given to Kilo Code after applying corrections 1–4 and 7–8, which are mandatory**. Corrections 1 and 2 are the critical ones: without them, the auditor is auditing against a stale WebSocket contract (guaranteed false CRITICAL/HIGH findings and actively harmful remediation advice) and against plan sections that do not exist in the supplied file. Corrections 3 and 4 prevent two classes of false-positive flooding (path drift and legacy `dark:` classes). The remaining corrections (5, 6, 9, 10) materially improve precision and are strongly recommended but not blocking. The prompt's skeleton — skeptic posture, evidence standards, severity discipline, deferred-scope carve-out, do-not-implement — is sound and needs no structural change.