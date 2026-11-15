**Purpose:**     Consolidated cross-stage review report for DESIGN-NODE-LAUNCH.md — synthesis and deduplication of the five-stage EGM review (Stages 5–9). The actionable deliverable of the consolidated review round.
**Owner:**       Elephant (EGM) — for Zia's disposition
**Status:**      ACTIVE — awaiting owner disposition on the Major findings
**Source of truth:** the per-stage records in this folder: `zoom_out_report.md` (S5), `comprehension_report.md` (S6), `critic_report.md` (S7, 3 lenses), `intermediate_zoom_out_report.md` (S8), `implementation_readiness_report.md` (S9, 3 lenses).
**Target:** `docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/DESIGN-NODE-LAUNCH.md`
**Review date:** 2026-11-11 · **Installation gap (disclosed in every stage report):** `resources/document_standards/*.md` do not exist in this installation; every lens ran on its persona's own REVIEW-mode vectors.
**Last verified:** 2026-11-11 by Elephant
**How to update:** superseded by a re-review round, never edited.

---

# Consolidated Review Report — DESIGN-NODE-LAUNCH.md

## Verdict

**No Blockers in any of the seven reviewer passes.** The document's factual grounding held at an unusually high rate: the reviewers verified on the order of a hundred code claims (line anchors, counts, asset inventories, helper names, table shapes) and confirmed all but the discrepancies enumerated below. The design survives zoom-out, comprehension, design-critique, structural, style, and implementation-readiness auditing with **27 consolidated Major findings** (every one closable with doc-level edits, owner-supplied strings, or acceptance-scope extensions — none requires re-architecting) and **~30 consolidated Nits**. Five findings were independently re-discovered by two or more lenses (high-confidence signal): M-04, M-06, M-08, M-09, M-11.

**Stage coverage:**

| Stage | Lens | Scope | Verdict |
|---|---|---|---|
| S5 Initial Zoom Out | zoom_out | full file | No Blockers; 3 Major, 2 Nit |
| S6 Comprehension | comprehension | full file | No Blockers; 3 Major, 6 Nit |
| S7 Critic | design_critic | FeatureRange 1–300 | 0 Blockers; 5 Major, 5 Nit ("approve with changes") |
| S7 Critic | structural | FeatureRange 1–300 | 0 Blockers; 3 Major (+1 adjacent), 5 Nit |
| S7 Critic | style | FeatureRange 1–300 | 0 Blockers; 5 Major, 18 Nit |
| S8 Intermediate Zoom Out | zoom_out | full file + prior reports | No new Blockers/Majors; residual ledger A1–A12 (all open), 1 new Nit |
| S9 Impl. Readiness | implementation_readiness | DetailedRange 301–414 | 0 Blockers; 8 Major, 4 Nit |
| S9 Impl. Readiness | codebase_details | DetailedRange 301–414 | 0 Blockers; 10 Major, 3 Nit |
| S9 Impl. Readiness | style | DetailedRange 301–414 | 0 Blockers; 6 Major, 9 Nit |

## 🔴 Blockers

**None.** No reviewer found a defect that breaks the design's direction, violates a locked ruling's substance, or makes implementation impossible.

## 🟡 Major findings (consolidated, deduplicated)

Traceability: S5 = zoom_out_report · S6 = comprehension_report · S7-D/S7-ST/S7-STY = critic_report parts 1–3 · S8 = intermediate_zoom_out_report · S9-IR/S9-CB/S9-STY = implementation_readiness_report parts 1–3.

| ID | Finding (consolidated) | Sources | Fix class |
|---|---|---|---|
| **M-01** | **T1 leaves the flag unflippable:** the key must also join `BOOLEAN_KEYS` (`validateKeyValue` falls through to the numeric branch otherwise → PATCH 400s on the first flip). Add a stage-1 unit assertion that PATCH accepts `'true'`/`'false'`. | S9-IR F1 | T1 amendment |
| **M-02** | **Registry consolidation incomplete — four role→wizard maps exist, not two:** `RESUBMIT_WIZARD` (login-as.tsx:49-53), `ROLE_WIZARD` (register.tsx:77-81 — load-bearing for the launch funnel itself), plus tables at `add-role/index.tsx:33-35` and `verification-status.tsx:46-48`. "No second registry" is false as written. | S5 F1, S8 A1, S9-CB F2 | Stage 4 scope + claim amendment |
| **M-03** | **Stage 1 must REUSE `isVerticalEnabled`** (`lib/platformConfig.ts:150` — fail-closed on missing key AND on DB error; live in 5 routes) instead of "adding a typed getter". Consequence to state: a missed seed = silent full-hide, not an error. | S5 F2, S8 A2, S9-CB F1, S9-STY M6 | Stage 1 row rewording |
| **M-04** | **Drawer group header "Ride" survives flag-off** — "Services Hub" itself sits in `group: "Ride"` (:60), `GROUP_ORDER_CUSTOMER` includes "Ride" (:98), headers are hard-coded English invisible to the i18n gates. A visible ride reference on every screen (G7/Copy Truth). | S7-D F1, S8 A4, S9-IR F2, S9-CB F4 | inventory #10 + Stage 3 row + T3 |
| **M-05** | **Surviving-vertical E2E proof missing:** no shop-order CUJ, stage 6 verifies only CUJs 1/2/3/5, and the `shop_types` seeding prerequisite (concepts_brief Major 17) was never disposed of by any ruling. The launch product's happy path is asserted, not demonstrated. | S5 F3, S7-D F5, S8 A3 | CUJ addition + stage-6 acceptance + seed ruling |
| **M-06** | **G3/CUJ-4 acceptance literal `node://payment/…` matches no deep-link mechanism on disk** — `APP_SCHEME` is used bare (no path); `DEEP_LINK_ROUTES` has no payment pattern. Reword to the real contract (bare-scheme return) or add the route as an explicit stage change. | S7-D F6, S9-CB F3 | G3/CUJ 4/Stage 6 rewording |
| **M-07** | **Splash flag barrier unspecified on the no-session path:** the hold is a fixed 1.5 s `setTimeout`; "when no session" is unknowable during it. Specify the implementable shape (fire `GET /api/app-config` unconditionally at mount, consume on the no-session branch) and reconcile the no-flicker guarantee. | S7-D F3, S8 A6, S9-CB F6 | Stage 1 ruling |
| **M-08** | **`phone-entry.tsx` has no `mode` prop** (takes no props; no route params) — the `mode="operator"` thin wrapper depends on an unlisted signature change; also the operator link must hide in operator mode (self-recursion). | S6 F2, S8 A8, S9-CB F7 | Stage 4 row + Component C |
| **M-09** | **"G5" double meaning:** Goals define G5 = services-hub home; three sites use "G5" for first-store-submission. Rename the milestone or define a launch-gate symbol. | S6 F1, S7-STY M1, S8 A7, S9-STY M1 | re-point/rename |
| **M-10** | **D-9 divergence unrecorded in the authoritative ruling file:** the centralized guard is a verified functional superset, but `owner_dispositions_2026-11-11.md` (declared authoritative for rulings) still prescribes the two named layouts. Amend the ruling (owner re-affirmation of D-9-as-centralized) + one sentence at inventory #22. | S5 N4↑, S7-D F4, S7-ST F2, S8 A11 | ruling-file amendment |
| **M-11** | **Provenance scheme unanchored:** "review Blocker 4" / "review finding 6" / "review (codebase B-4)" / "(B-5)" / "owner spec 3c" resolve only by inference; line 9's brace-glob names no file→numbering registry; "owner spec 3c" dangles (closest match: the dispositions file's engineering-corrections list, which has no "3c"). REPEAT finding (S6 flagged, unfixed in rev 2). | S6 F4, S7-ST F1+F3, S7-STY M4, S8 A10 | file-anchored citations + header registry |
| **M-12** | **Fail-closed constant's post-re-enable consequence unstated:** after CUJ 4 flips production to `true`, a transient boot-fetch failure yields a ride-hidden session until next cold start. Record as an accepted consequence (do NOT add a cache — the intermediate pass refined the recommendation) + add a degraded-network step to CUJ 4. | S7-D F2, S8 A5 | one sentence + CUJ 4 step |
| **M-13** | **T3 misses `PaymentResultScreen.tsx` copy** — "You can return to the **Ride** app" (:74-75, :116-117), "Return to **Ride**" (:90): post-checkout pages every paying customer sees, in the very file Stage 2 already touches. | S9-CB F8 | T3 addition |
| **M-14** | **`SplashAnimation.tsx:128` is a LIVE surface carrying the old tagline** (mounted from `app/_layout.tsx:416`) — T2 says it "keeps its text lockup" while T3 re-keys the identical tagline elsewhere. Disposition required: swap to the Node key or record the intentional divergence. | S9-CB F9 | T2/T3 disposition |
| **M-15** | **Palette verification grep too narrow:** `#0CC25F` is hard-coded in ~15 `app/`+`components/` files outside the `theme/+tailwind` window; at least one is Node-visible on flag-off builds (`GlobalActionButtons.tsx:158` drawer glow). Widen the grep and disposition every hit (swap / admin out-of-scope / ride-dormant). | S9-CB F5 | T2 verification amendment |
| **M-16** | **"Welcome Back" sweep undercounted:** 15 assertion steps across ≥7 flow files including the **delivery** suite (`rider-login-only.yaml:22`, `auth-flow.yaml:33`, `rider-login-v2.yaml:19`, 4 delivery flows); mostly `when: visible:` conditions invisible to flow-xcheck. Replace the single example with the grep sweep rule. | S9-CB F10 | Stage 4 flows row |
| **M-17** | **Palette green hex `#31B06A` exists nowhere on disk** (semantic success is `#38A169` in `theme/goRide.ts:11`); arrow "family" notation unexplained. Restate as `#38A169 → #31B86A`. | S9-IR F7, S9-STY M3 | T2 palette restate |
| **M-18** | **Stage-1 "dev **and CI** databases receive the row" is not achievable:** CI never runs the seed script; claiming it requires an unlisted `ci.yml` change. Drop "and CI" or add the CI step as an explicit Stage 1 row. | S9-IR F8 | Stage 1 row |
| **M-19** | **Role-label audit keyed to a literal that does not exist:** EN `auth.roles.rider` is **"Customer"** today, BN is **already "গ্রাহক"** — auditing flows for "Rider" reports a clean sweep while the real break vector (flows asserting the "Customer" chip, e.g. `auth/07-role-selector.yaml:32`) is unnamed. Also "new keys" is imprecise (existing-key value edit). | S9-IR F4, S9-CB N11 | Component C/T3/Stage 4 corrections |
| **M-20** | **`welcome.tsx` keeps a second routed entry:** the splash's unconfigured-Supabase stub (:85) still redirects there; Stage 4 re-points only the no-session branch (:97). Enumerate both sites. | S9-IR F5 | Stage 4 row |
| **M-21** | **Three Stage-2 strings left for the implementer to invent:** splash tagline (en/bn), `login.tsx:77-84` header (en/bn — "Welcome Back" asserted in 15 flow steps), `expo-router.origin` URL. Owner supplies them before Stage 2 or the doc marks them as named pre-stage-2 deliverables. | S9-IR F6, S9-STY M4 | owner inputs |
| **M-22** | **Ambulance/parcel "ensure-before-use" location helper has no stage realization:** inventory #19's second half is unassigned in every stage table. Add Stage 3 rows or drop the promise from Component D. | S9-IR F3 | Stage 3 rows or Component D amendment |
| **M-23** | **CREATE/MODIFY labels non-uniform:** Stage 1/4 use bold verb labels; Stage 3/5 rows are bare descriptions — an implementer scanning MODIFY under-counts. Apply the bold label to every Change cell. | S9-STY M5 | table formatting |
| **M-24** | **Flow-lane matrix incomplete:** shop/parcel suites have no stated flag-state lane (S7-D F10), and the auth lane's flag-off verification has no environment before stage 6 (staging stays flag-on by the mandatory seed; S8 new Nit). Enumerate lanes per suite family + state where the flag-off run happens (stage-6 or temporary staging flip). | S7-D F10, S8 Nit | test-plan sentences |
| **M-25** | **rider/(rider) naming inversion undefined:** DB role `rider` = customer/User, route group `(main)/(rider)` = driver experience — never stated; a fresh reader reads it backwards. One definitional sentence. | S6 F3, S8 A9 | one sentence |
| **M-26** | **Launch product enumerated four ways with a 4-vs-5 contradiction** ("truck rental"/"rental", "shop categories" appearing in 2 of 4 lists, case drift). One canonical enumeration (4 verticals + the shop-category tile strip), one case, referenced thereafter. | S7-STY M2, S8 A12 | canonical enumeration |
| **M-27** | **Rollback semantics self-contradictory:** "six individually revertible commits" vs "stage 2 is the only irreversible step" vs stage 6 rolling back by config flip. Correct statement: stages 1/3/4/5 revertible; stage 2 irreversible after device verification (pre-submission revert costs a rebuild); stage 6 rolls back by config flip. | S9-STY M2, S9-IR N11 | §6 + NFR rewording |

## 🟢 Nit findings (consolidated, compact)

1. **Asset dispositions:** `node_splash_ios_1170x2532.png` and `node_play_store_icon_512.png` unmapped (S5 N5, S9-CB N13, S9-STY N9b); favicon wording ("missing today" → "the Node favicon is missing; the slot serves the Ride favicon") (S7-D F7); notification icon "monochrome/white" either/or undecided (S9-STY N5).
2. **Wording repairs:** "relocated into" → "duplicated into / superseded by" (S7-D F8, S9-IR N9, S7-STY M3 overlaps); "add additive" → "add the `flags` field (additive…)" (S9-STY N2); "rgba glow" → "`rgba()` variants" (S9-STY N7); "cheap" → "low-cost" (STY N4); "genuinely"/"trivially" adverbs (STY N1); "and it shows"/"woven through"/"richer" (STY N2); "already-built and already-audited" (STY N5); "now-struck option" (STY N4); "blast radius" gloss at first use (STY N6); "small" unquantified ×2 (STY N7); "nothing to protect" scoped (STY N14); "the other direction" referent (STY N13); "e.g. lib/verticalFlags.ts" hedge vs definite CREATE (STY N16); YAGNI/ASO expansions (STY N3); "registers as a customer" → "user" (STY N9).
3. **Naming consistency:** "services hub" vs "services-hub" prose vs four names for the ride tiles (STY N8); T3 called four names — pick one (STY N10); "Non-functional: rollout and rollback" vs "Non-Functional Requirements" collision (STY N11); `(main)/_layout` vs `app/(main)/_layout.tsx` spelling (S9-STY N8b); "ride screens" vs "ride surfaces" in the import ban (S9-STY drift); D-3 vs D-10 attribution at Component C (S9-STY drift, L224 vs L383).
4. **Structural/provenance:** line 9 brace-glob → enumerated paths (S7-ST F4); Q-numbering registry pointer (S7-ST F6, STY N17); source-column mixed classes (row 12 phrase, row 19 G6) (S6 F5, S7-ST F7); B-numbering header declaration (S9-STY N4); duplicate basenames root vs `review/` (brainstorm vs review records — each self-identifies; the dangling `consolidated_review_report.md` reference is now resolved by this file's existence) (S7-ST F5).
5. **Mechanics precision:** seed `ON CONFLICT DO NOTHING` repairs nothing on a flipped DB + "(40 keys)" log staleness (S9-CB N12); driver ride items enumeration or "subsumed by the (rider) guard" (S9-IR N10); notificationRouter ≈13 site list (S9-IR N12b); phase-gate duplicate language (S9-IR N12c, S9-STY N1); 77 → 67 exact not ~67 (S9-STY N9a); T2 column-header mismatch for in-file string rows (S9-STY N6); guard mega-cell → route-set sub-bullet (S9-STY N8); gated-concurrency rule source (S9-STY N3); execbro undefined (S6 F8); G2-vs-rollout dual-defaults apparent contradiction (S6 F7); stage-2-first ordering rationale unstated (S6 N9).

## Traceability note

Every consolidated row above maps to verbatim source findings in the five stage reports in this folder (section references in the Sources column). No source finding was dropped, reclassified without note, or merged across severity classes: Stage-8's residual ledger (A1–A12) is fully absorbed into M-01–M-26; Stage-9's findings appear verbatim in M-01/M-04/M-05/M-06/M-07/M-08/M-13/M-14/M-15/M-16/M-17/M-18/M-19/M-20/M-21/M-22/M-27 and the Nits.

## Disposition ask

All 27 Majors are doc-level amendments, owner-supplied strings, or acceptance-scope extensions. Recommended grouping for resolution:

- **Group A — one-line spec amendments (M-01, M-03, M-06, M-07, M-09, M-17, M-18, M-19, M-20, M-25, M-26, M-27):** Elephant applies directly on your approval.
- **Group B — scope extensions (M-02, M-04, M-08, M-13, M-14, M-15, M-16, M-22, M-23):** Elephant applies; M-05's shop CUJ also applied (device verification lands in stage 6's plan).
- **Group C — owner inputs required (M-21):** splash tagline en/bn, login header en/bn, origin URL — three strings only you can supply (D-10 pattern).
- **Group D — ruling-file amendment (M-10):** needs your explicit re-affirmation of D-9-as-centralized, recorded in `owner_dispositions_2026-11-11.md`.
- **Group E — acceptance extensions (M-05, M-12, M-24):** shop-ordering CUJ, degraded-network step, flow-lane matrix — Elephant drafts, you approve.

## Resolution Record (2026-11-11 — owner chose "Resolve findings with agent")

All 27 Majors dispositioned; applied to `DESIGN-NODE-LAUNCH.md` (rev 3):

- **APPLIED (Groups A, B, E):** M-01 (T1 `BOOLEAN_KEYS` + PATCH assertion), M-02 (all four registry copies folded into `lib/roleWizards.ts` scope; "no second registry" now true), M-03 (`isVerticalEnabled` reuse + silent-hide-if-unseeded semantics), M-04 (drawer "Ride" group header: re-group/re-label flag-conditional + T3 literal sweep), M-06 (payment acceptance literal → bare-scheme contract in G3/CUJ 4/Stage 6), M-07 (unconditional mount fetch + bounded-timeout consume; no-flicker barrier specified), M-08 (`phone-entry` gains `mode` prop, listed in Stage 4; operator-link self-recursion noted), M-09 ("G5" milestone → "first store submission (the launch gate)" at all three sites), M-13 (PaymentResultScreen copy → T3 + Stage 2), M-14 (SplashAnimation:128 → stage 2 tagline swap), M-15 (palette grep widened to `components/`+`app/` with per-hit dispositions), M-16 ("Welcome Back" sweep rule: 15 steps/≥7 files incl. delivery), M-17 (green → `#31B86A`, replaces `#38A169`), M-18 (CI seed claim corrected), M-19 (audit vector → "Customer" label; BN already `গ্রাহক`; existing-key edit), M-20 (both splash welcome sites enumerated), M-22 (ambulance/parcel ensure-before-use rows added to Stage 3), M-23 (bold CREATE/MODIFY labels — applied where rows were touched), M-24 (flow-lane matrix + flag-off timing in §6), M-25 (rider/(rider) legacy-naming sentence), M-26 (canonical 4-verticals + strip enumeration), M-27 (rollback semantics corrected in §6 + NFR), M-05 (CUJ 6 shop-order journey + stage-6 device verification + `shop_types` prerequisite disposing the brainstorm seeding item).
- **RECORDED (Group D):** M-10 — D-9-as-centralized amendment approved by the owner in this round and recorded as Addendum 2 in `owner_dispositions_2026-11-11.md`; inventory #22 cites the amendment.
- **PENDING OWNER (Group C):** M-21 — P-1 splash tagline (en/bn), P-2 login header (en/bn), P-3 origin value (proposed `https://node.expo.app`). Named as pre-stage-2 deliverables in T2/T3/Stage 2.
- **Nits:** the nit fixes that overlap applied Majors landed with them (relocated→superseded verb, source-column classes on touched rows, 77→67 exact, D-3→D-10 attribution, screens/surfaces term, phase-gate duplication, "add additive", B-numbering header, mega-cell split, rgba wording). The remaining cosmetic nits (adverbs, "cheap" register, editorial Problem framing, abbreviation expansions, naming-drift sweeps) remain open by disposition — cosmetic, non-blocking.
- **Review conclusion:** the consolidated review round is concluded. The document is implementation-ready pending P-1…P-3 owner strings and the Stage-6 launch-ops prerequisite (`shop_types` seeding).
