# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cross-Reference with AGENTS.md

**Read AGENTS.md first for critical rules and commands.** This file (CLAUDE.md) focuses on:
- Implementation methodology and execution rules
- Source of truth hierarchy and what changed from GlideX
- Development phases and their current status
- Auth/dispatch flows
- Glossary

**When updating CLAUDE.md:** You must also update AGENTS.md if you change:
- Critical rules (money, auth, dispatch, database)
- Architecture boundaries or package structure
- Environment variables reference
- Known issues list
- Essential commands

**When updating AGENTS.md:** You must also update CLAUDE.md if you change:
- Implementation status
- Development phases or gates
- What's implemented vs planned
- Any methodology or workflow guidance

**The two files stay in sync.** AGENTS.md is the "quick reference" for day-to-day work. CLAUDE.md is the "deep dive" for implementation context.

## Quick Reference

For the most up-to-date command reference, critical rules, and architecture map, see **AGENTS.md**. This file focuses on implementation methodology, source of truth hierarchy, and what has changed from the original GlideX codebase.

Model-chain orchestration (Owner / Architect / Orchestrator / Planning-Coding roles, verification protocol, rulings-beat-artifacts) is defined in **AGENTS.md § Model Chain & Orchestration** — it applies to every model working in this repo. The Copy Truth Rule (AGENTS.md § Critical Rules) binds all user-facing text: no copy references non-live behavior. The File Cross-Reference Convention (AGENTS.md § Critical Rules) binds every AI-written artifact: header block + concrete path anchors, not loose pointers. **Multi-agent task tracking and resource reservation are governed by Rhizome MCP** — see **AGENTS.md § Agent Coordination with Rhizome** (the rhizome://guides/{agent-workflow,issue-lifecycle,multi-agent-handoff} resources are the authoritative API reference; do not implement a feature that another agent's Rhizome task claims without an explicit handoff). **The builder-side two-agent loop is live** — hub ISSUE-83 (`01M45P6SWP6D1157H5PZD1JNMD`), STEP reports after every build step, `QUESTION:` comments for scope — defined in **AGENTS.md § Orchestrator Protocol** and `.agents/skills/rhizome-builder/SKILL.md`.

## Agent Coding Conduct

**All agents editing this repo, any tool** (mirrored from AGENTS.md § Agent Coding Conduct — keep in sync). Bias caution over speed; use judgment for trivial tasks.

1. **Think before coding** — state assumptions explicitly; if multiple interpretations exist, present them, don't pick silently; push back when a simpler approach exists; stop and ask when confused.
2. **Simplicity first** — no features beyond what was asked; no speculative abstractions or configurability; no error handling for impossible scenarios; if 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what the task requires; don't "improve" adjacent code, comments, or formatting; match existing style; remove only orphans your own change created (mention pre-existing dead code — don't delete). Every changed line must trace to the request.
4. **Goal-driven execution** — convert tasks into verifiable goals ("fix the bug" → write a reproducing test, make it pass); loop until verified (validation order: lint → tsc → jest).

## Implementation Methodology

This is a **modification of existing GlideX code**, not a greenfield build. Follow these execution rules:

1. Use strict execution order from `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md`, with phase definitions from `docs/Plan/14-DEV-CHECKLIST.yaml` and file-level changes from `docs/Plan/20-DEVELOPER-CHANGE-LIST.md`.
2. Follow API and WebSocket contracts in `docs/Plan/06-API.md`, UX/UI contracts in `docs/Plan/07-USER-FLOWS.md`, `docs/Plan/08-UI-SPEC.md`, `docs/Plan/09-UX-SPEC.md`, and test requirements in `docs/Plan/22-TEST-TEMPLATES.md`.
3. Complete one handoff step at a time — do not reorder.
4. Stop immediately on any failure condition from `docs/Plan/14-DEV-CHECKLIST.yaml`, fix, then continue.
5. After each completed step, output: Step completed, Files changed, Commands run, Validation evidence, Remaining risk.
6. Keep changes minimal and scoped to current step only.
7. Do not modify checklist scope unless explicitly requested.
8. Preserve existing GlideX business behavior unless plan explicitly changes it.
9. At phase boundaries, run full validation and provide a go or no-go recommendation.

## Source of Truth

Read in this order:

**Primary:**
- **`AGENTS.md`** — Critical rules, essential commands, architecture map, known issues, env vars reference
- **`docs/Plan/14-DEV-CHECKLIST.yaml`** — Canonical machine-readable implementation spec. Parse at start of every session. Treat `failure_conditions` as hard blockers.
- **`docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md`** — Strict ordered execution through H-00 through H-17. Do not reorder.
- **`docs/Plan/20-DEVELOPER-CHANGE-LIST.md`** — File-by-file implementation guide with exact code shapes per phase.

**Contracts:**
- **`docs/Plan/06-API.md`** — API and WebSocket event contracts.
- **`docs/Plan/05-DATA-MODEL.md`** — Database schema deltas from GlideX.
- **`docs/Plan/13-CONVENTIONS.md`** — Coding conventions, naming, and critical Ride-specific rules.

**Additional reference (load as needed):**
- `docs/Plan/02-ARCHITECTURE.md` — Component map: what's KEEP/REPLACE/DELETE/ADD from GlideX.
- `docs/Plan/07-USER-FLOWS.md` — User flow specs with all alternate paths.
- `docs/Plan/08-UI-SPEC.md` — Screen specs with GoRide design tokens.
- `docs/Plan/09-UX-SPEC.md` — Interaction contracts and GoRide micro-interactions.
- `docs/Plan/01-PRD.md` — Product requirements with acceptance criteria.
- `docs/Plan/03-TECH-STACK.md` — Package changes from GlideX baseline.
- `docs/Plan/04-ADR.md` — Architecture Decision Records explaining WHY decisions were made.
- `docs/Plan/10-DEV-SETUP.md` — Local dev setup steps (execute in order).
- `docs/Plan/11-ENV-VARS.md` — Complete env var reference.
- `docs/Plan/12-FOLDER-STRUCTURE.md` — File delta from GlideX (delete/replace/add).
- `docs/Plan/15-RUNBOOK-DEPLOY.md` — Deploy procedures for all 3 components.
- `docs/Plan/16-INCIDENT-RESPONSE.md` — Ride-specific incident response (P1-P4).
- `docs/Plan/17-MONITORING.md` — Dashboards and alert thresholds.
- `docs/Plan/18-KNOWN-ISSUES.md` — Known bugs and tech debt (check before fixing bugs).
- `docs/Plan/19-GLOSSARY.md` — Canonical domain term definitions.
- `docs/Plan/21-MIGRATION-SQL.md` — SQL migration reference.
- `docs/Plan/22-TEST-TEMPLATES.md` — Unit test templates for critical modules.

> ⚠️ **The root `README.md` is stale.** It is the original GlideX README and contradicts the current architecture (it documents Clerk auth, Stripe payments, Google Maps, Firebase storage, Neon DB, and wrong store names). **Do not trust it.** Auth = Supabase phone OTP, payments = PortPos, maps = Barikoi/MapLibre, storage = Supabase, DB = Supabase Postgres. For accuracy, read this file and AGENTS.md instead. (If you rewrite README.md, update or remove this note.)

## Project Overview

**Ride** is a subscription-based ride lead distribution platform for Bangladesh. Drivers buy call packages and keep the fare minus optional platform commission. Rebuilt from the GlideX open-source ride-hailing codebase.

### Key differences from GlideX (current implementation)

| Area | GlideX (Old) | Ride (Current) |
|------|--------------|----------------|
| **Auth** | Clerk (email/social) | **Supabase Auth phone OTP** |
| **Payments** | Stripe | **PortPos unified gateway** (bKash/Nagad stubs kept inert) |
| **Map** | Google Maps | **Barikoi Maps API** (via @maplibre/maplibre-react-native) |
| **Driver monetization** | Per-ride fare | Subscription call-package wallet |
| **Dispatch** | None | H3 hexagonal indexing + WebSocket sequential dispatch (debit-on-offer) |
| **Admin** | None | Web admin panel |
| **Database** | Neon + Prisma | **Supabase PostgreSQL + Drizzle ORM** |
| **Cloud Functions** | Firebase (planned) | **None** — all backend in Expo API routes + utils-server |

## ⛔ HARD CONSTRAINT: Expo Managed Workflow (Non-Negotiable)

The Ride project MUST remain on **Expo Managed workflow with Development Builds**. This is non-negotiable and applies to all future development, build configurations, and architectural decisions.

### What this means
- **NO bare workflow migration** — Do not eject to Expo bare workflow or React Native CLI. The project is intentionally designed to leverage Expo's managed services (OTA updates, EAS Build, EAS Submit).
- **NO react-native.config.js** — Do not add native module configurations that require bare workflow.
- **Development Builds ONLY** — When native code changes are needed, use Expo Development Builds (not Expo Go). Development builds allow custom native code while staying in the managed workflow.
- **EAS Build for production** — All production builds (Android APK/AAB, iOS IPA) must go through EAS Build. Do not use local builds for production releases.
- **EAS Submit for stores** - App Store and Play Store uploads must go through EAS Submit.
- **Keep app.json clean** — The `app.json` / `app.config.js` is the source of truth for Expo configuration. Do not duplicate settings in `eas.json` unless they're build-profile-specific.

### Why this matters
- OTA updates require managed workflow — `expo-updates` is incompatible with bare workflow.
- Simplifies CI/CD — No Xcode/Android Studio setup required for most team members.
- Consistent build environment — EAS Build provides reproducible builds across the team.
- Faster iteration — OTA updates allow instant bugfixes without new app store submissions.

### Architecture Boundaries

npm workspace (since 2026-09-09, commit `b346ec4`) with two independently-typed packages — ONE root lockfile, ONE `npm ci` at the repo root installs both; never install inside `utils-server/` (see AGENTS.md "Why a workspace" for the drizzle two-copy rationale):
1. **Root** (`package.json`): Expo app — React Native mobile client + Expo API routes (`app/api/`)
2. **`utils-server/`** (`utils-server/package.json`): WebSocket dispatch server with separate `tsconfig.json` and own manifest — a workspace member, not a nested install

`tsconfig.json` excludes `utils-server/` and `functions/` (functions/ doesn't exist). ESLint ignores `utils-server/` and `_reference/`.

## Development Commands

See AGENTS.md for the complete command reference. Key commands:

```bash
# Device-testing env (run BEFORE expo start; laptop IP differs WiFi vs hotspot — see TEST-SETUP.md)
node scripts/dev-env-sync.js    # Sync .env.local dev IPs to current LAN IP

# Install (workspace root ONLY — never npm install/ci inside utils-server/)
npm ci

# Expo app
npx expo start                  # Dev server  (alias: `npm start`)
npx expo run:android            # Native build (required after plugin changes)
npx tsc --noEmit                # Type check (must pass)
npm run lint                    # Lint (must pass; unused _-prefixed vars allowed)
npx jest --testPathPattern="name"  # Single test

# Concurrency lane (opt-in, real Postgres) — run before billing/schema changes (see AGENTS.md Testing)
npm run test:concurrency           # tests/concurrency with RUN_CONCURRENCY_TESTS=1. DB PREREQUISITE: SCRATCH_DATABASE_URL from
                                   #   `node scripts/concurrency-scratch-project.mjs` — never the shared dev project

# Database
npx drizzle-kit generate        # Generate migration SQL from schema
npx drizzle-kit push            # Push to remote Supabase DB  (alias: `npm run push`)

# utils-server (separate process)
cd utils-server && npm run dev  # Start WebSocket server with tsx watch

# Commit-time checks (run all)
grep -r "console\.log" app/ lib/ utils-server/ src/       # must return nothing
grep -ri "clerk\|stripe" app/ lib/ utils-server/           # must return nothing

# Automated pre-commit gate — scripts/git-hooks/pre-commit (install: node scripts/install-hooks.js)
# 9 stages, any failure BLOCKS the commit, in order:
#   1 vacuous-assertions  2 date-in-sql  3 Maestro flow selector
#   4 testID codemod idempotence (B-1)  5 testID map freshness  6 testID flow currency  7 i18n orphan ratchet  8 shellcheck (shell scripts)  9 eslint (staged files only)
# ON-DEMAND HARNESS (opt-in, ~3min pre-commit / ~5min pre-push): node scripts/pre-commit-harness.cjs [--gate 5] [--list]
#   [--json] [--keep] [--base <ref>] [--no-copy] [--push]. Runs the REAL hook in a disposable git worktree
#   (node_modules linked so stage 8's CWD-relative eslint path resolves) and asserts every gate
#   still BLOCKS its fault and still PASSES. It asserts two things beyond exit status, and both are
#   load-bearing: a BLOCK case must show THAT GATE's banner (the hook exits at the first failure,
#   so finding it is what proves the earlier gates passed), and a PASS case must show the gate's
#   "it ran" marker — because a run with nothing staged exits 0 with all seven stages SKIPPED, which
#   is indistinguishable from green unless you check. A baseline run (clean tree + benign app/ edit)
#   gates the whole thing: if that fails, no case result means anything. Fast drift guards for the
#   harness's own banner/marker strings live in tests/meta/pre-commit-harness.test.ts.
#   --push drives scripts/git-hooks/pre-push instead: one case per exit 1 site (missing tsc, tsc
#   failure, missing scripts/check-web-imports.js, failing native import check), each fed git's ref
#   line on stdin; the two import-check exits additionally require the type check's success marker,
#   so a stage reorder fails the harness instead of proving the wrong path. Its baseline is a CLEAN
#   tree that must print all three success markers — which is also its pass direction.
# DEVICE-PREFLIGHT HARNESS (opt-in, ~1min): node scripts/device-preflight-harness.cjs [--case <key>] [--list]
#   [--json] [--keep]. Replays .github/workflows/device-preflight.yml's preflight lane OFFLINE against a simulated
#   ubuntu-latest — LF worktree (core.autocrlf=false), Windows env stripped, stub adb/maestro on a PATH filtered
#   free of real toolchain dirs, ANDROID_AVD_HOME pointed at scratch so the dev machine's real AVD can never make a
#   case pass by luck. Cases: healthy (every runnable step must print its run marker), missing adb, missing Maestro
#   (MAESTRO_BIN pinned dead — run-device-day.sh's hardcoded /c/maestro/bin/maestro fallback otherwise masks the
#   absence on Windows; MEASURED 2026-10-05), and PREFLIGHT_DEVICE=required on a device-less host (must hard-fail,
#   never ⊘ skip). The two network install steps report SIMULATED, never passing. Drift pins (step names/order,
#   scripts, marker strings) live in tests/meta/device-preflight-harness.test.ts.
# Stage 4 runs `node maestro/tools/testid-idempotence.cjs` whenever an app/**.tsx? or
# maestro/tools/add-testids.cjs is staged. Proves the Gate-1 codemod is a FIXED POINT:
# a second write-mode run touches zero files (B-1 double-prefixed every testID across
# 221 files this way), --strip -> regen reproduces app/ byte-for-byte, and no ID repeats
# a path segment. Runs against a SANDBOX COPY of app/ (add-testids.cjs honours
# APP_TESTIDS_ROOT) because --strip deletes every testID it is pointed at; the real tree
# is never written. Nothing else in the pipeline can catch this: tsc/eslint ignore
# testIDs, and flow-xcheck passes a self-consistent wrong map by construction.
# Stage 5 runs `node maestro/tools/testid-map-freshness.cjs` whenever ANY app/ path is staged
# (declarations INCLUDED — a deleted screen drops its ids out of the regenerated map, which only a
# stale committed map can contradict) or the map itself is. It regenerates the manifest from the
# STAGED app/ tree into a sandbox (git checkout-index, then testid-manifest.cjs's
# TESTID_MAP_APP_ROOT/TESTID_MAP_OUT) and diffs id -> file ATTRIBUTION against the STAGED map.
# THREE BLOCKING differences: `vanished` (the map records an id app/ no longer has), `unrecorded`
# (app/ has an id the map does not), and `moved` (id attributed to a different file). Line drift is
# reported, NOT blocked — attribution is what every consumer resolves, and nothing reads `line`.
# MEASURED rationale (do not "simplify" this back): stage 3 is NOT defeated by a stale map — its
# MAP DRIFT check re-reads app/, so a flow-referenced id that goes stale still fails there. Flows
# reference 93 of the map's ids (map total 1101 at the 2026-10-05 post-purge regen — regenerate with
# node maestro/tools/testid-manifest.cjs before quoting); the rest rot with NO signal (verified: renaming an
# unreferenced id leaves flow-xcheck at exit 0), and stage 3 only runs on flow commits, so the rot
# surfaces later to whoever selects the id, in an unrelated commit. The map is also the index used
# for flow REWRITING and the skeptic audit, read by humans and agents. Both sides come from the
# INDEX, so the check answers "is the tree I am committing self-consistent?": it does not demand a
# map regenerated from unstaged code, and it still catches a map regenerated in the working tree
# but never staged.
# Stage 6 runs `node maestro/tools/testid-flow-currency.cjs` on the SAME trigger as stage 5. Stage 5
# proves the map agrees with app/ but says NOTHING about the flows: rename a testID, regenerate the map
# correctly, commit only app/ + the map — stage 5 is green (the map really was regenerated) and stage 3
# never runs (no flow staged), so every flow selecting the old id keeps a DEAD selector until some
# later unrelated commit touches that flow and makes it read as a flow bug. Stage 6 intersects the
# ids this commit REMOVES with the set flows actually select (93 of the map's ids, test-pinned), so it blocks ONLY real
# orphans — renaming an id no flow uses stays green. It stands down when any flow is staged, because
# stage 3 then verifies every selector authoritatively. Both maps come from git (`HEAD:` vs `:`), so it
# asks "what does THIS commit delete". MEASURED, do not "simplify" this back: writing the selector
# regex with the POSIX class `[[:space:]]` is VALID in the `git grep -E` pattern but NOT in JavaScript
# (it means "one of [ : s p a c e then a literal ]"), which yields ZERO selectors and turns this into
# a gate that silently passes every commit forever. `tests/meta/testid-flow-currency.test.ts` pins the
# pre-commit INDEX-mode count at exactly 99 for that reason (its fixture tree is a copy of the
# shipped CLI; the open tree's worktree-mode count is 100). Replace 93/99 only if a committed
# flow selector set itself changes.
# CI MODES (2026-10-05, owner ruling): both tools gained `--head-vs-worktree`, and the
# `maestro-drift` job runs them on every PR — on a clean checkout the index modes above compare
# HEAD with itself, so CI audits the COMMITTED state instead: stage 5 diffs the map AT HEAD against
# the manifest regenerated from the CHECKED-OUT tree; stage 6's removal diff is map-at-HEAD vs the
# map regenerated from the tree (the ruling's wording), intersected with the worktree's flow
# selectors. Neither mode needs git history (shallow checkouts are fine); stage 6's flow-staged
# stand-down does not apply there (no index, and stage 3 runs on every maestro-drift run anyway).
# The `maestro-drift` job additionally re-runs BOTH drift tools on the real tree and treats any
# non-zero exit as a block: flow-currency exit 2 = map unreadable/broken, exit 1 = a flow-selected
# testID removed without an update to any flow (a dead selector, exactly the commit-class the
# local hook can miss). Nothing else in CI audits the flow tree against the map with selector
# resolution.
# MEASURED 2026-10-05 on the real tree (uncommitted screen deletions present): stage 5 exit 2 —
# 8 vanished + 1 unrecorded (13 line-drift, advisory) — stage 6 exit 0 (8 removed, none
# flow-selected). Proofs: tests/meta/testid-map-freshness.test.ts and
# tests/meta/testid-flow-currency.test.ts each run the SHIPPED CLI in a throwaway git repo for
# this mode, PAIRED with a fault-injected copy whose detector is neutralised and must flip the
# outcome (6 new tests; a no-op gate fails the suite instead of passing quietly). On the open tree
# the CI-mode number is 100 flow-selected testIDs (index mode, `git grep --cached`, is 99) —
# do not re-pin the harness until the next committed flow edit.
# Stage 3 runs `node maestro/tools/flow-xcheck.cjs` whenever a maestro/flows/**.yaml is staged.
# TWO BLOCKING checks: (a) a flow `id:` selector absent from maestro/tools/testid-map.json can
# never resolve on device; (b) MAP DRIFT — the selector is in the map but no longer in the app/
# file the map attributes it to, which is exactly what editing app/ without regenerating the
# manifest leaves behind. Neither tsc nor eslint sees YAML. Plus ONE BLOCKING check and ONE
# non-blocking advisory:
# (a) dead-copy — BLOCKING as of 2026-10-03 (was advisory). An assertion literal found in NO locale
# value AND no app/components source string cannot match on device, so the step burns its full wait
# timeout. The corpus is "locale OR source" on purpose: of 178 distinct flow assertion literals, 125
# resolve in a locale value and 40 resolve ONLY in app/components source. Those 40 render fine (they
# are hard-coded JSX — "Enter your phone number to continue" in phone-entry.tsx, "Tap to replace
# document" in components/DocumentUploadCard.tsx), so a locale-ONLY rule would block ~40 working,
# already-committed assertions on an i18n-convention technicality rather than a runtime failure.
# MEASURED, do not "tighten" this to locale-only without re-measuring — and treat that as an i18n
# -discipline decision, not a bug fix. Suppress genuinely external text (OS dialog, third-party API)
# via maestro/tools/flow-xcheck-suppressions.json.
# Since 2026-10-05 the corpus admits only LIVE locale values: a key classified ORPHANED by
# scripts/audit-i18n-orphans.cjs (spawned at RUN time with --json, like the nav audit) renders
# nothing, so its value must never rescue an assertion — the shape by which the 106 keys purged
# 2026-10-05 (confirm_ride.*, find_ride.*, apply_promos.*, ride.request) could satisfy assertions
# no screen can ever render (SHIELDED keys count as live; they render through dynamic evidence).
# If the orphan audit cannot run the gate REFUSES (exit 2, loudly) instead of degrading to the full
# value set — degrading would silently re-enable the masking. MEASURED 2026-10-05: 73 locale
# values carried only by orphaned keys are excluded; 7 distinct assertion candidates matched an
# orphaned value and no live one, all still rescued by source/containment, so 0 assertions flipped
# to dead. Two "log in" claims in the logout flows (auth/08-logout.yaml,
# shared/auth/_logout.yaml) now surface in the advisory MASKED tier, where the orphan `auth.login`
# ("Log in") had been silently exact-rescuing them; they still match on device via the live
# "Sign up or log in to continue" sentence. This is a live-copy rule, not a locale-only tightening:
# source literals keep rescuing exactly as before.
# 2026-10-05, extractor widened: assertions written block-style (the keyword on one line,
# `text: "…"` on the next) matched no regex and were UNCHECKED — 57 lines / 51 checkable claims
# across ~20 flows, 4 of them dead. Disposition (owner ruling): the 3 Barikoi result-row claims
# were already covered by the `savar` suppression; the bilingual truckCatalog Freight tab gained
# external-data suppressions (freight / মালবাহী); 8 locale-only catalog-label claims (others, now,
# food, truck, ton, furniture, bls) joined the locale ratchet as 7 entries. A claim the gate
# cannot see is worse than a masked one — the "every text assertion resolves" pass message would
# be a lie — so `text:` lines are claims like any other (12 env-interpolated claims are now
# tracked and skipped, up from 5).
# (a2) LOCALE-ONLY COPY — BLOCKING, ratcheted. A literal that resolves in app/components SOURCE but in
# NO locale value is hard-coded JSX: it renders today so the flow works, but it is not localizable and
# the assertion breaks the day that screen is wired to a t() key or the app runs non-en. Any such
# literal NOT in maestro/tools/flow-locale-baseline.json blocks. MEASURED 2026-10-03: 39 distinct
# literals / 74 assertion steps across ~15 files predate the gate and are grandfathered in that
# baseline rather than force-fixed here — blocking all of them at once would reject working, committed
# flows and bury a real regression under pre-existing noise. The baseline is a RATCHET: it must only
# ever shrink, each entry being deleted as its screen is localized (the count moved 39 → 40 entries /
# 74 → 75 steps on 2026-10-04, when a dead-screen purge unmasked a pre-existing hard-coded "Payout"
# in the driver onboarding; its reason field records the fix; and 40 → 47 entries / 75 → 85 steps
# on 2026-10-05, when block-style `text:` extraction surfaced 8 catalog-label claims — others, now,
# food, truck, ton, furniture, bls — baselined per owner ruling rather than force-wired, since
# they are catalog/data labels, not t() copy). Do NOT re-derive these numbers by
# hand: an earlier hand-rolled audit reported "40" plus 13 spurious DEAD COPY findings, both wrong
# because it scanned app/ but not components/.
# (b) MASKED COPY — NON-BLOCKING — an assertion that survives only as a mid-phrase fragment of a longer live
# string (the dead "Documents Submitted" was masked by admin's "No documents submitted"). The
# corpus excludes dotted i18n KEY literals, since a key never renders. Suppress via
# maestro/tools/flow-xcheck-suppressions.json.
# It MUST stay above the lint stage, which exits 0 early when no JS/TS is staged (flow commits
# stage YAML only).
# (b2) SCREEN AFFINITY — NON-BLOCKING (added 2026-10-04) — every flow-selected testID is
# attributed to its owner screen via testid-map.json and owners outside the reachability set of
# scripts/audit-nav-integrity.cjs (spawned at RUN time with --json, so no snapshot goes stale)
# are listed. ADVISORY because `reachable` is a FLOOR: UNRESOLVED sites are not edges and
# `_layout.tsx` files get no inbound edge, so 57 of the map's 218 screens sit outside it while
# demonstrably live. MEASURED: 0 of 58 id-bearing flows flagged. If the audit cannot run, the
# tier says so loudly and still exits 0 — it must never print the word "skipped" (the ci.yml
# precommit-gates job fails on skipped/skipping lines in hook output).
# Screen-affinity in the full sense — whether the element is on the screen the flow is standing
# on right now — remains a RUNTIME property no static pass can gate on. The regex-era
# reachability attempts were rejected on evidence (99 of 234 screens flagged, most live); the AST
# rebuild resolves their three causes but the set is still a floor, which is why the severity is
# advisory. Curated affinity evidence lives in maestro/tools/flow-testid-map.json (its DEAD
# section); the orphaned-i18n audit + gate (scripts/audit-i18n-orphans.cjs, below) is consumed by
# stage 3 ONLY as dead-copy corpus provenance — keys it classifies ORPHANED may not rescue a claim
# (§Stage 3, dead-copy) — while its own findings gate via `npm run check:i18n-orphans`.
# Stage 3's tiers are pinned directly by tests/meta/flow-xcheck.test.ts: the SHIPPED tool is copied
# into a throwaway tree (it resolves every input from __dirname, so no overrides exist) and run
# against one deliberately broken fixture per tier — missing selector, map drift (id renamed, and
# attributed file deleted), dead copy, block-style dead copy (the extractor's blind spot until
# 2026-10-05), orphan-masked copy (an assertion rescued only by an orphaned
# key's value), new locale-only literal, missing baseline, missing orphan classification — each
# asserting exit 2, plus a clean tree at exit 0 (both advisory tiers clean), the advisory masked and
# screen-affinity tiers at exit 0 (the sandbox stubs scripts/audit-nav-integrity.cjs AND
# scripts/audit-i18n-orphans.cjs, which cannot run there), the nav-audit-unavailable path at exit 0,
# and an unreadable map at exit 1. Every tier —
# blocking and advisory — is PAIRED with a fault-injected copy whose detector is neutralised,
# asserting the exit code or the tier's own finding flips — so a tier that has become a no-op fails
# the suite instead of passing quietly. Mutating the sandbox copy only; the repo's tool is asserted unchanged.
# CI runs the fixture suite via `npm run test:all` (ci.yml). Since 2026-10-04 the ci.yml
# `maestro-drift` job also runs THIS stage's tool (and stage 4's) against the real tree, so a commit
# that bypassed the local hook — web UI, fresh clone, --no-verify — is still caught. The ci.yml
# `precommit-gates` job (PR runs only) closes the index-scoped gap the other jobs cannot reach: it
# replays the PR as a staged changeset on a throwaway branch (`git reset --soft` to base), adds four
# benign probes so every stage gets real work, then runs the REAL hook and requires zero
# skipped/skipping lines — stages 5/6 are no longer hook-only. Stages 1/2/7 keep their repo-wide CI
# equivalents (check:vacuous, check:date-in-sql, lint).
# Screen reachability audit — scripts/audit-nav-integrity.cjs (NOT a hook; `--gate` exists but is
# not wired; stage 3 consumes its --json `screens`/`reachable` fields for the advisory affinity
# tier above): AST resolver over app/** + components/** that fixes what the rejected regex could
# not see — route constants in the NEAREST enclosing scope (module and function-local), the admin
# SPA's navigation TABLE (components/admin/AdminShell.tsx `NAV` -> router.push(item.route) through
# filter/map chains), app/index.tsx's forwarder wrapper (`redirect(href)` -> router.replace(href)),
# and <Stack.Screen name> relative to its layout dir. Three buckets, none a guess: RESOLVED /
# DANGLING (a concrete target matching NO route file — provable, exit 2 under --gate) / UNRESOLVED
# (runtime-dependent; LISTED, never counted dead — the honesty budget whose absence caused the old
# tool's 99 false positives). A fourth, separate bucket — TABLE DANGLING — validates every nav-key
# string/template literal that is a direct element of an array-table row (the drawer's
# CUSTOMER_ITEMS/DRIVER_ITEMS/ADMIN_ITEMS shape) even when the consumer chain stays UNRESOLVED
# (the `route as never` forwarder), deduped against site findings; both buckets gate. Router-receiver
# validation keeps String.replace/Array.push out of the site set (coverage bound printed: AST sites
# vs textual candidates, 0 suspicious drops). Measured 2026-10-05 (final, after the 9 no-inbound
# admin screens were surfaced in the AdminShell NAV — §4 of docs/testing plan/reports/
# DEAD-SCREEN-AUDIT-2026-10-04.md): 229 route files, 295 sites, RESOLVED 616, DANGLING 2,
# UNRESOLVED 4, 137 data-table targets checked (0 dangling); reachability 168/229, 7 no inbound
# edge, 0 admin screens absent from NAV.
# Pinned by tests/meta/audit-nav-integrity.test.ts (28 tests: fixture trees + fault injection per
# tier; the sandbox junctions the repo node_modules because the tool requires typescript from its
# <root>). Known gap: literal pushes in lib/ (e.g. lib/notificationRouter.ts) are outside the scan
# scope (app/** + components/** only) — the sweep covers the static data-table class, not lib
# literals. Known DANGLING targets (unfixed, product call): components/RiderHeader.tsx ->
# /(auth)/sign-in (app/(auth)/login.tsx is the real file) and
# app/(main)/(fleet)/(tabs)/dashboard/index.tsx -> /(main)/(fleet)/integrations (no such screen).
# Run: node scripts/audit-nav-integrity.cjs [--json] [--gate]
# i18n orphan audit + gate — scripts/audit-i18n-orphans.cjs. Audit mode classifies every locale
# key as ORPHANED (no reference of any kind), SHIELDED (reachable only through dynamic evidence,
# listed with its reasons + site), MISSING (called, absent from en — with file:line) or PARITY
# (en/bn divergence), over app/** + components/** (minus app/api, __tests__, *.test.*, *.d.ts).
# Gate mode (`--gate`, wired as `npm run check:i18n-orphans`, a step in the CI `test` job) blocks
# only keys orphaned AFTER the gate existed: the backlog that predates it is grandfathered in
# scripts/i18n-orphan-baseline.json — a RATCHET that should only shrink (delete each entry once
# its key is deleted from both locales or referenced again; `node scripts/purge-orphan-keys.cjs
# --new` deletes exactly the gate's new orphans from both locales and prunes the same keys in one
# step); stale entries are reported, not blocked; a missing/malformed baseline exits 2 loudly,
# never degrading to an empty one.
# Evidence tiers: static t() calls; `t(`ns.${x}`)` prefixes; identifiers resolved through
# file-local const chains, IMPORTED module tables (./x, `@/x`), and ITERATION-CALLBACK parameters
# (ARR.map((p) => t(p.key)) binds p to ARR's elements). Every dynamic site carries an `evidence`
# list (local / import:<spec> / callback:<method>) naming what resolved it. A per-file fallback
# still catches genuinely unresolved calls — render-prop destructuring, useState-derived keys,
# same-file helper parameters, call results — via key-shaped literals in that file.
# Measured 2026-10-04 after the resolution extension and the same-day purge of the deleted-screen
# sets: 334 runtime files, 1,419 static + 45 dynamic calls; 10 unresolved (was 21), 130 orphans
# (all baselined), 133 shielded (dynamic-table 86, file-fallback 41, template-prefix 6), 0
# missing, 0 parity drift. The purge removed the full 106-key set of the screens deleted
# 2026-10-03 (confirm_ride 58, find_ride 36, apply_promos 11, ride.request 1) from both locales
# and pruned the baseline 236 → 130 via scripts/purge-orphan-keys.cjs; the same-day trio
# deletion (top-up / top-up-details / add-payment) purged its 17 new keys the same way —
# baseline stayed at 130, locales 1,364 → 1,347. Pinned by
# tests/meta/audit-i18n-orphans.test.ts (38 tests: fixture trees + a fault injection per tier +
# gate fault pairs + real-tree baseline/resolution checks) and tests/meta/purge-orphan-keys.test.ts
# (18 tests: purge + its fault pairs).
# Run: node scripts/audit-i18n-orphans.cjs [--json | --gate [--json]]
# After ANY app/ change: node maestro/tools/testid-manifest.cjs   (regenerate the map first)
# Deleting a screen: preview the damage with `node scripts/audit-deletion-impact.cjs` (every
# no-inbound screen + the testIDs and locale keys that die with it); then §Deleting a screen of
# docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md (testID map regen, `--gate`,
# `node scripts/purge-orphan-keys.cjs --new`, flow-xcheck — all in the same change; terse
# checklist is Workflow 9 of the local .claude/WORKFLOWS.md).
```

## Architecture Map

- **Fleet Management (universal fleet model, 2026-08):** every driver owns exactly one fleet (`drivers.fleet_id` NOT NULL; solo drivers get an implicit solo NATIVE fleet at registration or via `scripts/fleet-backfill.ts`). `vehicles.fleet_id` NOT NULL. The strict 1:1 driver↔vehicle unique index is DROPPED (`docs/vehicle-model-decision.md` resolved); `fleet_vehicle_assignments` is the authoritative assignment source (append-only, single active row per vehicle/driver), and `vehicles.driver_id` / `drivers.vehicle_id` / `drivers.vehicle_type` are denormalized active-pointer caches written ONLY through `lib/fleetAssignment.ts` in the same transaction. Dispatch (`utils-server/dispatch.ts`) untouched. Fleet tables: `fleets`, `fleet_members`, `fleet_vehicle_assignments`, `fleet_subscription_plans`, `fleet_subscriptions`, `fleet_billing_transactions`, `fleet_alerts`, `audit_logs` — fleet roles live in `fleet_members`, NOT `users.role`; all fleet money fields are integer paisa. **Fleet authorization (Phase 2):** `requireFleetMember(fleetId, allowedRoles?)` in `lib/auth.ts` scopes any fleet route to one fleet (active `fleet_members` row + optional role gate; 403 on cross-fleet). Client "Current Mode" switching is local-only via `store/useFleetStore.ts` (`activeMode`).

### Route Structure (Expo Router)
- `app/(auth)/` — Auth screens (phone-entry → otp-verify → register). **Supabase phone OTP**.
- `app/(main)/(customer)/` — Rider screens (keep folder name `(customer)`, rider is a display label)
- `app/(main)/(rider)/` — Driver screens (folder name `(rider)` is legacy — contains driver flows, do not rename)
- `app/admin/` — Web-only admin panel (dashboard, verification, packages, zones, configuration) — no parentheses, plain segment not a route group
- `app/api/` — Expo API routes (file-based backend, `[public]` prefix = no JWT required)
- `components/` — Shared UI components, flat (no `src/` prefix, no `components/common/` subfolder); has `components/admin/` and `components/auth/` subfolders only
- `theme/goRide.ts` — Single-file design token source (colors, typography, spacing, radii, shadows). Dark mode via NativeWind `dark:` variants + `tailwind.config.js` aliases — no `ThemeProvider`/theme Context

> **Expo API route params**: Dynamic segment params are passed **directly** as the second argument (`{ id }`), not wrapped in `{ params: { id } }` like Next.js. See Critical Coding Rules below.

### 🧪 Testing / Maestro Work — Mandatory Pre-Reads

**Before generating, editing, or evaluating ANY Maestro YAML flow file**, you MUST read — in full, no skipping:
1. **`.claude/rules/testing-agent.md`** — the 4 non-negotiable rules (feature scope source, folder layout source, the 6 pre-implementation gates as hard blockers, and "subflows before flows").
2. **`plans/maestro-architecture.md`** — the complete enterprise QA blueprint (157 features, 16 business capabilities, 6 state machines, 29 subflows, 20 journeys, 24 edge cases, 195 planned flows, 12 testability gaps). It carries a top-of-file MANDATORY READ banner.

If you cannot confirm the six Section 20 gates are complete, **do not generate flows** — refuse and report which gates are open (per Rule 3 of `testing-agent.md`).

### Auth System (Supabase — Implemented)
- **Client**: `lib/supabase.ts` — client-side Supabase client (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- **Server**: `lib/supabaseServer.ts` — server-side admin client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
- **Middleware**: `lib/auth.ts` — `verifySupabaseToken(request)` and `requireRole(request, role)` using `supabaseAdmin.auth.getUser(jwt)`
- **Flow**: `signInWithOtp({ phone })` → SMS OTP → `verifyOtp({ phone, token, type: 'sms' })` → verify-token API → register API
- **WebSocket auth**: `utils-server/index.ts` uses `supabaseAdmin.auth.getUser()` for auth:hello and auth:refresh

### Key Libraries (implemented)
- **UI**: NativeWind (TailwindCSS), Lottie, react-native-paper, GoRide design tokens in `theme/goRide.ts`
- **State**: Zustand stores in `store/` (7 stores: useDriverStore, useRiderStore, useChatStore, useDriverStatusStore, usePackageStore, useCallLedgerStore, useDriverFlowStore)
- **Map**: `@maplibre/maplibre-react-native` + Barikoi API (`barikoiapis`) via `utils/mapUtils.ts`
- **Database**: Supabase PostgreSQL + Drizzle ORM (`src/db/schema.ts`) — ~97 tables, ~32 enums
- **Auth**: Supabase Auth phone OTP (`lib/auth.ts`, `lib/supabase.ts`, `lib/supabaseServer.ts`)
- **Storage**: Cloudflare R2 via pre-signed PUT URLs (`lib/imageToURL.ts` → `app/api/storage/upload-url+api.ts`, public CDN `EXPO_PUBLIC_R2_DOMAIN`); legacy Supabase Storage (`driver-documents` bucket) rows still display and validate. Supabase remains DB + auth only.
- **Payments**: PortPos via WebView (`lib/portpos.ts`, `components/PaymentWebView.tsx`). Old `lib/bkash.ts` and `lib/nagad.ts` kept as inert fallback.
- **WebSocket**: `ws` library in `utils-server/` (dispatch.ts, dispatchChain.ts, leadBilling.ts, h3Index.ts, scheduler.ts, compensationWorker.ts, coldDrop.ts, trace.ts, firmQuote.ts, barikoiRoute.ts, polyline.ts, offPlatform.ts)
- **Geo**: H3 hex grid (`lib/h3.ts`) at resolution 9. Import only via `lib/h3.ts` and `utils-server/h3Index.ts`.
- **SMS**: Supabase Auth handles OTP delivery natively. Android SMS_RETRIEVER_API via `react-native-otp-verify`.
- **Validation**: Zod at every API route boundary (`lib/vehicleTypes.ts` exports `VEHICLE_TYPE_ZOD_ENUM`)
- **Logging**: `lib/logger.ts` — use `logger.info`, `logger.error`, etc. No `console.log`.

### Backend Services (implemented)
1. **Expo API Routes** (`app/api/`) — Business logic, DB queries, rate limiting. Supabase JWT required (unless marked `[public]` or using `requireRole`).
2. **Utils Server** (`utils-server/`) — WebSocket dispatch, sequential chains with debit-on-offer lead billing (leadBilling.ts), H3 index, scheduler, compensation worker. Own package.json/manifest as an npm workspace member (single root lockfile; deps hoisted to root).

### Auth Flow (implemented)
```
phone-entry → supabase.auth.signInWithOtp({ phone }) → SMS OTP
otp-verify → supabase.auth.verifyOtp({ phone, token, type: 'sms' }) → session
verify-token → GET /api/auth/verify-token → { exists, role } or { exists: false }
register → POST /api/register → create user + optional driver record → role home
```

### Dispatch Flow (Phase D — sequential dispatch, debit-on-offer)
```
Rider requests ride → POST /api/ride/request → zone check + fare calc
  → WebSocket server: H3 cell lookup → buildCandidateList (scored, ordered)
  → Sequential chain (dispatchChain.ts): one offer at a time, NO chain cap
  → Per offer: leadBilling debit (dispatch_offers + call_ledger in ONE tx)
    → lead:billed to driver → ride:offer (drop ZONE + heat tag + pickup fee estimate)
    → settle via offer:accept / offer:reject / TTL expiry / socket close
  → Ordering tiers: new-driver protection → cold-drop boost (L2) → return-lead affinity (L3) → commute bonus (1.1×)
  → Auto-accept at offer step (rating ≥ 4.8, radius gate, first-wins)
  → Pool exhausted → no_drivers/alternatives (existing flow)
```

### Database Schema (~97 tables, ~32 enums, implemented)
See `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` § Database Schema or `docs/Plan/05-DATA-MODEL.md` for the full, authoritative table/enum inventory — do not manually re-list all ~97 tables here; this avoids the list drifting out of sync (this section previously understated the count as "22 tables" for that reason).

### Seed Scripts (`scripts/`)
`seed-system-config.js`, `seed-pricing.js`, `seed-packages.js`, `seed-platform-config.js`, `seed-admin.js`

### Deploy Order (dependency-aware)
```
1. DB migrations (drizzle-kit push)
2. utils-server (depends on current schema)
3. EAS build + submit (last — references updated API)
```
`INSTANCE_COUNT=1`. Not independently rollback-safe (fare framework changes + dispatch code are one release).

## Development Phases (current state)

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Foundation — GlideX Cleanup | ✅ Done | Clerk/Stripe removed |
| 2 | Database Schema | ✅ Done | All tables, enums, migrations |
| 3 | Supabase Auth Integration | ✅ Done | Replaced Firebase HMAC plan |
| 4 | Auth Layer | ✅ Done | Screens, middleware, verify-token |
| 5 | Payment System | ✅ Done | PortPos implemented |
| 6 | Dispatch Engine | ✅ Done | WebSocket, H3, sequential chains (dispatchChain.ts), leadBilling, scheduler |
| 7 | Driver Flows | ✅ Done | Onboarding, home, offers, ledger |
| 8 | Rider Flows | ✅ Done | Request, pricing, tracking, cancel |
| 9 | Admin Panel (basic) | ✅ Done | Approval queue, packages, zones (subset) |
| 10 | In-App Chat | ✅ Done | Rider-driver messaging |
| 11 | Commission & Waiting Time | — | Post-MVP decision gate |
| F7–F14 | Feature bundles (offer sheet, promos, incentives, preferences, SOS, wallets, referrals, vehicle models, face match, vehicle media) | ✅ Done | Underlying tables and APIs shipped |
| **F15** | **Admin Dashboard Consolidation** | ✅ **Done** | Full web-only admin panel: 10 API items + 14 UI items built and tsc-clean. Includes `packages.vehicle_type` scoping (F15-API-10). See `docs/Plan/14-DEV-CHECKLIST.yaml` phase F15. |
| **F16** | **Ride Fare Framework v1** | ✅ **Done** | Surge removed; sequential dispatch + debit-on-offer live; heat engine (zone_heat, Lever 0/1/2/3); pickup fee 3-state lifecycle (measurement live, charge gated by `pickup_fee_enabled`); fraud protocol (dawdle, off-platform, cancel-rate, heat manipulation); ~50 fare framework config keys; 4 new admin screens (fare-config, heat-monitor, pickup-analytics, trust-safety); new scheduler jobs 37–41. |

**Note:** Phase 3 was originally "Firebase Cloud Functions" in planning documents, but was **replaced by Supabase Auth**. The `functions/` directory does not exist. All auth logic is in Expo API routes (`app/api/auth/`) and client screens (`app/(auth)/`).

## Handoff Gates (H-00 to H-17)

See `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md` for full gate definitions.

## Glossary (key domain terms)

See `docs/Plan/19-GLOSSARY.md` for complete glossary. Key terms:
- **Call** — a single unit from a driver's subscription; consumed on fetch:confirm
- **Call Wallet** — driver-visible balance/expiry card
- **Call Ledger** — immutable append-only log of all call events
- **Package** — admin-defined subscription product (calls + duration + price)
- **Subscription** — driver's active instance of a purchased package
- **Offer** — a ride request sent to a specific driver via WebSocket (sequential chain: one outstanding offer per ride)
- **Deduction** — call_ledger event subtracting 1 call (`reason='offer_sent'`); leadBilling.ts only
- **Fetch Confirm** — telemetry ack on first interaction with the offer card (no money coupling — billing happened at offer time)
- **Chain** — the sequential offer sequence for one ride (no cap on length; every offered driver is billed 1 lead)
- **Pickup Fee** — driver compensation for travel to pickup; 3-state lifecycle: range (estimate) → firm (accept) → trued (completion). Gated by `pickup_fee_enabled` config. Not commissioned, not discountable.
- **Heat Score** — zone-level demand/supply signal (0–1 blend of trailing baseline + live EWMA); tags: hot/neutral/cold. Replaces surge.
- **Firm Quote** — pickup fee locked at accept time using Barikoi route distance; true-up at completion adjusts within 1.25× cap (downward uncapped).
- **Dawdle Guard** — fraud detection for inflated realized/firm pickup distance ratios; rolling 30 charged pickups, zone-relative thresholds.
- **Pro-rata Credit** — compensating credit for low utilisation due to platform demand shortage
- **Zone** — polygon defining operational area (MVP: Dhaka)
- **Daily Cap** — hidden max calls/day for unlimited packages (default: 200)
- **H3 Cell** — Uber H3 hex grid at resolution 9 (~174m diameter)
- **Idempotency Key** — UUID on payment initiation to prevent double-charge
- **panelty** — BDT paisa (integer). All money is integer paisa until display.
- **Utilisation** — calls_used / package.call_count for pro-rata eligibility
- **Platform Commission** — per-ride percentage (default 0%); stored as driver liability

## Critical Coding Rules

See AGENTS.md for the complete rules reference. Key rules:

- **Money**: All amounts in integer paisa (BDT), never floats. Divide by 100 only at UI display.
- **Vehicle types**: 9 lowercase: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_compact`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`
- **call_ledger writes**: `utils-server/leadBilling.ts` (offer-time deduction rows, `reason='offer_sent'` — Phase D debit-on-offer; heartbeat.ts is deleted) and `lib/activateSubscription.ts` (initial_load, credit, expiry_writeoff). Refund rows no longer exist (AC-7 deleted, ruling 8 — every offer is billed regardless of outcome)
- **dispatch_offers writes**: `utils-server/leadBilling.ts` is the sole writer of new rows (`delivered`, in one tx with the deduction); terminal-outcome updates in `utils-server/index.ts` (accept/reject/expired stamps, `fetch_confirmed_at` telemetry stamps) and `utils-server/scheduler.ts` job 20 (stale-offer crash-recovery expiry only, skip younger than `dispatch_offer_ttl_seconds + 5s`). `dispatch.ts` no longer writes (no 'filtered' rows — filtering audit is not persisted)
- **platform_config writers**: admin-only via `PATCH /api/admin/config` PLUS one job-writer: `heat_backtest_correlation` via scheduler job 37 (weekly backtest)
- **payment_events writes**: row creation + PortPos invoice initiation ONLY via `lib/paymentEvents.ts` (`initiatePortposPayment` — used by rider/wallet/topup, rider/passes, driver/wallet/topup, package/purchase); status transitions (`paid`/`failed`) in `lib/activateSubscription.ts`, `app/api/payment/portpos/callback+api.ts`, and `lib/paymentRepair.ts` (`repairPaymentEvent` — shared transactional repair invoked by the callback and `utils-server/compensationWorker.ts`)
- **PortPos callback security**: the public callback must call `portposClient.verifyIPN()` (secret-bearing) and Zod-validate the invoice response before crediting wallets / activating subscriptions
- **Idempotency-Key convention** (decision `01M23628A1566SK1D5XXV1NT5G`): all state-changing POSTs SHOULD accept `Idempotency-Key`; the `(route, key)` barrier lives DB-backed in `idempotency_keys` (table, migration 0056), helper `lib/idempotency.ts` with `IDEMPOTENCY_ROUTES` route ids. Duplicate claim ⇒ replay the original outcome (`Idempotency-Replayed: true`), in-flight ⇒ `409 idempotency_key_in_progress`, 23505 race loser ⇒ read-and-return winner. Store the outcome on EVERY terminal path of an executed claim (typed failures replay too). Wired: rider/driver wallet topup, rider passes (optional header), package purchase (required). Exempt: SOS insert, /internal/*, PortPos callback. Full rules in AGENTS.md § Idempotency-Key Convention
- **Single instance**: `INSTANCE_COUNT=1` required for WebSocket dispatch (no split-brain)
- **No client secrets**: Payment credentials never in `EXPO_PUBLIC_*` vars
- **No Clerk/Stripe**: Removed entirely — any reference is a bug
- **No Firebase**: Supabase replaced all Firebase auth. Any Firebase reference is a bug.
- **Timestamps**: Always UTC `timestamptz`, convert to Asia/Dhaka only at display
- **Zod validation**: Every API route validates input before DB/service calls
- **Body parsing**: Use `parseJsonBody(request, schema)` from `lib/parseBody.ts` for POST/PUT/PATCH bodies. Never call `await request.json()` directly.
- **Expo route params**: Expo passes dynamic segment params directly as the 2nd arg: `GET(request, { id }: { id: string })`. NEVER use the Next.js `{ params }: { params: { id } }` convention — `params` will be undefined and destructuring crashes (caused BUG-1, BUG-2; fixed in `9fdfd0c0`).
- **UUID validation**: All URL path params used in DB queries must be validated with `z.string().uuid()` before the query. Invalid UUIDs return `400 invalid_uuid`.
- **Drizzle NULL checks**: Use `isNull(col)` / `isNotNull(col)`. NEVER `eq(col, null)` — it compiles to `col = NULL` which is always false in SQL. Caused BUG-3 (fixed in `fe5c5860`).
- **server.js body buffering**: The production server entry point (`server.js`) must buffer the request body stream for non-GET/HEAD methods before constructing the Web `Request`. Without this, POST/PUT/PATCH bodies arrive empty (fixed in `88f7a68d`).
- **Error format**: Always `{ error: 'machine_code', message: '...' }` with appropriate status
- **H3**: Import `h3-js` only via `lib/h3.ts` and `utils-server/h3Index.ts`
- **platform_config**: Never cache — read from DB at request time
- **Drizzle transactions**: Required for all money writes (call_ledger, subscriptions, payment_events)
- **Supabase JWT**: Required on every protected API route via `verifySupabaseToken()` or `requireRole()`
- **No console.log**: Use `lib/logger.ts` (`logger.info`, `logger.error`)
- **Vehicle type filter**: Dispatch must filter by vehicle_type BEFORE H3 scoring, using lowercase enum values
- **Packages vehicle-type scope**: `packages.vehicle_type` (nullable) gates visibility and purchase — NULL = universal, non-null = only matching `drivers.vehicle_type`. Enforced in `GET /api/package/list` (filtered) and `POST /api/package/purchase` (403 `vehicle_type_mismatch`)
- **Package name uniqueness**: `packages.name` is unique among LIVE rows (`packages_name_live_uq`, partial `WHERE deleted_at IS NULL`, migration 0057). `ensureLaunchFreePackage` keeps its advisory lock; the index is the schema backstop. Admin create/rename onto a taken name returns `409 package_name_taken`
- **Daily cap check**: Primary gate in dispatch candidate pool; re-checked as defense-in-depth inside the leadBilling debit transaction
- **Chain exclusion**: Query `dispatch_offers` for previously-offered driver_ids when building the candidate list (billed leads are never re-offered)
- **All tables**: uuid PKs, created_at/updated_at timestamptz. Append-only tables (call_ledger, dispatch_offers, used_challenges, rate_limits) exempt from updated_at.
- **Soft deletes**: No hard deletes. `deleted_at` columns exist on users, packages, promoCodes, documents, incentiveDefinitions, riderAddresses; rides use status transitions (`cancelled`/`expired`) and drivers use `status` (`suspended`/`rejected`) — those tables have no `deleted_at` column
- **Commit format**: Conventional Commits with scope (auth, dispatch, payment, ledger, admin, schema, driver, rider)
- **ESLint**: This repo uses the **legacy `.eslintrc.json`** config (NOT flat config). Always lint via `npm run lint` — the script sets `ESLINT_USE_FLAT_CONFIG=false` explicitly, so do not run bare `npx eslint .`. Unused vars with `_` prefix are allowed (`argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`).
- **TypeScript**: `tsconfig.json` excludes `functions/` and `utils-server/`. Those have their own configs.

## Known Issues & Tech Debt

See `docs/Plan/18-KNOWN-ISSUES.md` before fixing bugs. Key issues:
- **TD-01:** SMS receiver killed by OEM battery optimisation on 30-60% of Android devices. Manual OTP entry is fallback.
- **TD-11:** In-process maps prevent >1 replica. `INSTANCE_COUNT=1` always.
- **TD-15:** utils-server loses all in-memory state on crash. Startup recovery added.
- **TD-31:** After Oct 30 2026, new tables need explicit GRANT statements for supabase-js/PostgREST access. Server-side Drizzle unaffected.

## Testing

- **Before ANY device/emulator session: read `TEST-SETUP.md` (repo root) and run `node scripts/dev-env-sync.js`** — the laptop LAN IP differs between broadband WiFi and hotspot; a stale `EXPO_PUBLIC_DEV_LAN_IP` breaks all device API calls (env is inlined at bundle time; there is no runtime fallback in `lib/config.ts`).
- `npx jest --testPathPattern="name"` — single test
- At phase gates run: `npx jest --watchAll=false` (full suite)

### AI Execution & Testing Protocol (speed rules)

Testing must be fast. Follow this loop:

1. **While iterating, run ONLY impacted test files.** Map each file you changed to its test file(s) and run them targeted: `npx jest --testPathPattern="<impacted>" --bail --silent`. NEVER run the full suite per-task — the ~2000-test full run is a phase-gate activity only.
2. **`--bail` in the inner loop.** Stop at first failure, fix, re-run targeted. Do not re-run large suites just to enumerate every failure before fixing.
3. **A task is complete only when impacted tests pass.** Paste the jest summary line (e.g. `Tests: 42 passed, 42 total`) as evidence in the response. No evidence = not complete.
4. **`--bail`/targeted runs never substitute for the full gate.** At phase gates the order is unchanged: `npm run lint` → `npx tsc --noEmit` → `npm run check:vacuous` → `npx jest --watchAll=false` (full-suite floor).

- **Concurrency advisory-lock proofs** (`tests/concurrency/`) are opt-in and need a real Postgres: `npm run test:concurrency` (= `RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false`, cross-platform via cross-env). A default suite run SKIPS them (pinned by `tests/meta/concurrency-gate.test.ts`); CI runs the lane on every PR in the `concurrency-locks` job of `.github/workflows/ci.yml` (disposable `postgres:16` service container, schema via `drizzle-kit push --force`, `DATABASE_SSL=disable`). For LOCAL runs, provision the disposable project with `node scripts/concurrency-scratch-project.mjs` (needs `SUPABASE_ACCESS_TOKEN`) and run with the `SCRATCH_DATABASE_URL` it writes to `.env.scratch.local` — the harnesses prefer `SCRATCH_DATABASE_URL` and refuse to run without it (`tests/concurrency/scratch-db-url.ts`, proven by `tests/meta/concurrency-gate.test.ts`), so a forgotten override can never run scratch databases on the shared dev project.
- **Dispatch invariants (Phase D — sequential dispatch, debit-on-offer)** that must always pass: (1) exactly one outstanding offer per ride at any time, (2) single deduction per `(ride_id, driver_id)`, (3) `calls_remaining = 0` drivers never in candidate pool, (4) daily cap exceeded drivers never in candidate pool, (5) no driver receives the same offer twice, (6) every offered driver has a `call_ledger` deduction row regardless of outcome, (7) declined/expired offer → next candidate offered, (8) rider cancel mid-chain → chain aborts, no further offers, no refunds, (9) re-dispatch → previously billed drivers not re-billed, (10) billing atomicity — `dispatch_offers` row + deduction commit in ONE transaction.
- **Payment invariants**: (1) same idempotency key → exactly one `payment_events` row, (2) duplicate callback activates subscription exactly once, (3) failed activation → `compensation_queue` entry within 30 seconds.
- Test templates: `docs/Plan/22-TEST-TEMPLATES.md`.

### ExecBro live device verification — use when available

For UI-flow changes (screens, navigation, floating buttons, sheets, theme toggles), code-trace + tsc/lint is the floor, not the ceiling. If the `execbro` MCP server is connected AND Metro (`npx expo start`) plus an emulator/simulator are running:

1. `scan_metro` to connect to the app
2. Verify on-device: `android_screenshot`/`ios_screenshot` + `tap` for interactions, `get_screen_state` for structure, `get_logs` for runtime errors, `get_network_requests` for API calls
3. State what was device-verified in the session report — screenshots beat assumptions

If execbro is NOT connected or no device/Metro is running: say so to Zia in the final report ("device verification skipped — no execbro/device available") and finish with code-trace + lint/tsc (+ Maestro where flows exist). Never block delivery waiting for a device.

## Graph Maintenance

After modifying any code files, run:
- `code-review-graph update` — always (fast, <2s)
- `graphify update .` — after large batches of changes only

### Codebase Memory MCP

`codebase-memory-mcp` is available as an additional tool for code understanding and structural analysis. It can be used alongside `code-review-graph` and `graphify` — do not treat it as a replacement for either.

Use it when:
- You need fast structural queries across the codebase (`search_graph`, `trace_path`, `get_architecture`, `detect_changes`, etc.)
- You want to explore relationships or trace call paths without running a full graph rebuild
- You are investigating unfamiliar areas and need an index-assisted overview

It complements the existing graph tools; run it in addition to them when it adds value to the current task.

## File Naming Conventions

- `lib/`: camelCase (`fareCalc.ts`, `activateSubscription.ts`)
- `app/api/`: kebab-case with `+api.ts` (`purchase+api.ts`)
- `components/`: PascalCase (`CallWalletCard.tsx`)
- `store/`: `use{Name}Store.ts` (`usePackageStore.ts`)
- WebSocket events: `{domain}:{action}` kebab-case (`ride:offer`, `fetch:confirm`, `location:update`)

## GoRide Design Tokens

See `theme/goRide.ts` for full tokens. Key tokens:
- Primary accent: `#0CC25F`, pressed: `#0A9B4C`
- Error/danger: `#E31D1C`, Info/auxiliary: `#2E42A5`
- Background light: `#F7FCFF`, dark: `#181A20`
- Font heading: Urbanist, body: Inter

## MCP Tool Selection Policy (Strict Priority Order)

Follow this EXACT order. Do NOT skip to a lower-priority tool if a higher-priority one can achieve the goal.

---

### 1. Sequential Thinking (ALWAYS FIRST)
- **Trigger**: Any task with 3+ steps, architectural decisions, refactoring, or uncertainty.
- **Action**: Break the problem into a step-by-step plan before touching any other tool.
- **Rule**: NEVER execute code changes without first logging a plan here for complex tasks.

---

### 2. Context7 (External Knowledge)
- **Trigger**: Any question about third-party libraries, frameworks, or packages.
- **Action**: Fetch the latest API docs BEFORE writing code that uses that library.
- **Rule**: If Context7 has the docs, do NOT use Fetch or Search as a fallback.

---

### 3. Memory (Context Persistence)
- **Trigger**: Storing decisions, architecture choices, bug fixes, or patterns for future sessions.
- **Action**: Call `write_memory` after completing a significant task.
- **Rule**: Check `read_memory` at the start of a session if the user says "remember" or mentions a previous decision.

---

### 4. Serena (Semantic Code Operations) — PRIMARY for code
- **Trigger**: ANY operation on existing project code (reading, finding, editing, refactoring).
- **Preferred Tools**: `find_symbol`, `find_referencing_symbols`, `replace_symbol_body`, `insert_after_symbol`.
- **Rule**: NEVER use Filesystem or Git to read or edit existing code files if Serena can handle it.

---

### 5. Playwright (UI & Browser)
- **Trigger**: Visual testing, UI verification, E2E tests, or any task requiring a live browser.
- **Rule**: Only use AFTER the code is written and the dev server is running.

---

### 6. Git (Local Version Control)
- **Trigger**: Committing changes, checking status, viewing diffs, creating branches.
- **Rule**: Use Git for local VCS operations. Use GitHub MCP (if added later) for PRs/Issues.

---

### 7. Fetch (Web Scraping / Fallback Docs)
- **Trigger**: ONLY when Context7 does NOT have the documentation you need.
- **Rule**: Ask the user for permission before scraping large pages.

---

### 8. Filesystem (Raw File I/O) — LAST RESORT
- **Trigger**: ONLY for non-code files (README, .env, package.json, .yaml, .toml) OR creating entirely new files from scratch.
- **RULE**: NEVER use Filesystem to modify existing code files (.py, .js, .ts, .java, .go, .rs, .cpp, etc.). That is Serena's job.