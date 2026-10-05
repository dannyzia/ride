# AGENTS.md — Ride

## Cross-Reference with CLAUDE.md

**Read CLAUDE.md for implementation context.** This file (AGENTS.md) provides:
- Critical rules (money, ownership, auth, dispatch)
- Essential commands and validation order
- Architecture map and package boundaries
- Environment variables reference
- Known issues to check before fixing bugs
- Deploy order

**When updating AGENTS.md:** You must also update CLAUDE.md if you change:
- Critical rules or conventions
- Architecture boundaries or package structure
- Environment variables reference
- Known issues list
- Any content that duplicates CLAUDE.md information

**When updating CLAUDE.md:** You must also update AGENTS.md if you change:
- Critical rules that should appear in the quick reference
- Implementation status or phase completion
- Architecture boundaries
- Essential commands or workflows

**The two files stay in sync.** AGENTS.md is the "quick reference" for day-to-day work. CLAUDE.md is the "deep dive" for implementation context. If you change one, review the other for consistency.

## What This Is

Ride is a subscription-based ride lead distribution platform for Bangladesh, rebuilt from the GlideX open-source codebase. Drivers buy call packages; riders request rides; the WebSocket dispatch engine matches them using H3 hexagonal geo-indexing.

### Current Implementation Status (as of 2026-08)

All core features are **fully implemented**:
- **Auth**: Supabase phone OTP (not Firebase/HMAC). `app/(auth)/phone-entry`, `otp-verify`, `register`. API routes in `app/api/auth/`. **No Firebase Cloud Functions exist.**
- **Payments**: PortPos unified gateway (not bKash/Nagad directly). `lib/portpos.ts` active. `lib/bkash.ts` and `lib/nagad.ts` are inert stubs (throw errors).
- **Dispatch**: WebSocket server in `utils-server/` with H3 indexing, sequential dispatch (one outstanding offer per ride), debit-on-offer lead billing (`leadBilling.ts`).
- **Database**: ~97 tables, ~32 enums in `src/db/schema.ts` (vehicleTypeEnum with 9 lowercase values, bodyTypeEnum, rideStatusEnum, pickupFeeStateEnum, etc.). Fare Framework v1 added: `zone_heat`, `zone_heat_history`, `pickup_distance_samples`, `fraud_flags`, `zone_recalibration_queue`, `cancel_surveys`. See `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` § Database Schema for the full inventory — do not manually re-list all tables here or elsewhere; reference that doc.
- **Admin panel**: `app/admin/` with web-only routes for verification, packages, zones, configuration. **Phase F15** consolidated all admin entities (driver queue, lifecycle, incentives, promos, preferences, referral campaigns, point offers, vehicle models, sample media, platform config, monitoring) into one coherent dashboard. All 10 API items + 14 UI items built and tsc-clean. See `docs/Plan/14-DEV-CHECKLIST.yaml` phase F15. **Phase F16** (Ride Fare Framework v1) added 4 admin screens: `fare-config`, `heat-monitor`, `pickup-analytics`, `trust-safety`.
- **Chat**: In-app messaging with `store/useChatStore.ts` and `app/api/chat/`.
- **Driver flows**: Onboarding, home, offers, ledger. 7 Zustand stores in `store/`.

**Verification:** No Clerk, Stripe, or Firebase references remain in the codebase (checked 2026-06).

This repo is an **npm workspace** (since 2026-09-09, commit `b346ec4`): ONE root lockfile (`package-lock.json`), ONE `npm ci` at the repo root installs both packages. The two packages remain independently **typed**:
- **Root** (`package.json`): Expo app — React Native mobile client + Expo API routes (`app/api/`).
- **`utils-server/`** (`utils-server/package.json`): WebSocket dispatch server (`index.ts`, `dispatch.ts`, `dispatchChain.ts`, `leadBilling.ts`, `h3Index.ts`, `scheduler.ts`, `compensationWorker.ts`, `coldDrop.ts`, `trace.ts`, `firmQuote.ts`, `barikoiRoute.ts`, `polyline.ts`, `offPlatform.ts`). Separate `tsconfig.json` and own manifest — but a workspace **member**, not a nested install.

**Why a workspace (do not undo):** drizzle-orm's `SQL` class carries a private field, so two physical copies of the same version (root + a nested `utils-server/node_modules`) are nominal-incompatible types and break root `tsc` — even at identical versions. The workspace hoists every dependency to a single physical copy at the root. The old `utils-server/package-lock.json` is DELETED: never recreate it, never run `npm install`/`npm ci` inside `utils-server/` — install from the root only.

`tsconfig.json` excludes `utils-server/` and `functions/`. ESLint ignores `utils-server/` and `_reference/`.

## Source of Truth (read in this order)

**Start with these:**
1. `docs/Plan/14-DEV-CHECKLIST.yaml` — Canonical implementation spec. Parse at session start. `failure_conditions` are hard blockers.
2. `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md` — Strict execution order H-00 through H-17.
3. `docs/Plan/20-DEVELOPER-CHANGE-LIST.md` — File-by-file code shapes per phase.
4. `AGENTS.md` (this file) — Critical rules, essential commands, architecture map, env vars reference, known issues.

**Then:**
5. `docs/Plan/06-API.md` — API and WebSocket contracts.
6. `docs/Plan/05-DATA-MODEL.md` — Database schema deltas.
7. `docs/Plan/13-CONVENTIONS.md` — Coding conventions and critical rules.
8. `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` — Canonical backend spec: full schema (~97 tables, ~32 enums), auth flow, PortPos payment integration, dispatch engine architecture. Treat this as authoritative over any older doc that states a different table count.

**For frontend/backend AI-agent coding sessions:**
- `App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide-Wireframes.md` — Canonical 182-screen UI spec (Rider + Driver), with a standard-header convention note and per-screen build/modify guidance.
- `App Design/GoRide - Ride-Hailing App UI Kit (Preview)/implementationPrompt.md` — Three-part coding prompt: PART 0 is a terse BANNED/MANDATORY/TEMPLATE "Strict Agent Mode" for smaller coding agents (e.g. Raptor Mini) that struggle with long prose; PART 1/2 are the full prose Frontend/Backend prompts. All three reference the wireframe file and this AGENTS.md; keep screen-number priority tables and design-token values in sync if `GoRide-Wireframes.md` or `theme/goRide.ts`/`tailwind.config.js` ever change.

**For implementation methodology and what changed from GlideX:**
- `CLAUDE.md` — Implementation methodology, execution rules, development phases status, auth/dispatch flows, glossary.

**Additional reference files (lower priority, load as needed):**
`.claude/RULES.md`, `.claude/SECURITY.md`, `.claude/STYLEGUIDE.md`, `.claude/TESTING.md`, `.claude/WORKFLOWS.md`, `.claude/REVIEW-CHECKLIST.md`, `.claude/CONTEXT/phase-context.md`, `.claude/MEMORY/decisions.md`, plus other docs in `docs/Plan/`.

## Model Chain & Orchestration

Four roles: **Owner (Zia)** — final rulings, kickoff/field decisions · **Architect** — design brain, NO codebase access; its output is proposals/rulings, never verified state · **Orchestrator** — execution + gatekeeping; the only role that confirms on-disk state; verdict-first reporting to the owner (done / acceptable / rejected + messages to other models — no prose explanations) · **Planning/Coding models** — plan and build against the codebase.

Protocol (non-negotiable):
1. **Verify state assertions.** Any "X is done/closed/exists" claim from a party that cannot see the files is checked against disk before it becomes a ledger fact.
2. **Rulings beat artifacts.** Owner-chain rulings (Zia/Architect) win over artifact text. On divergence: the ruling wins, the divergence is recorded in-file — never silently reconciled.
3. **The file is the single source of truth.** If chat memory and the artifact file disagree, the file wins. Re-read before editing; re-grep after editing before calling anything closed.
4. **Handoffs are artifacts** (`.kilo/plans/*.md`), not chat history. Implementers start from disk state, with round-verification notes appended at the bottom.
5. **Orchestrator reports are verdict-first.** One-line verdict + short messages to the models concerned. Detail lives in the artifact files.

## Agent Coordination with Rhizome

Rhizome MCP is the required coordination system for this repository. The tools are accessed via the `rhizome` MCP server (resources are listed under `list_mcp_resources` → `server: rhizome`; the workflow guides are at `rhizome://guides/{agent-workflow,issue-lifecycle,multi-agent-handoff}` — read them before your first issue of the session).

### Workflow (summary; the guides are authoritative)

1. **Orient**: call `open_project` with the absolute repo root. Retain the `project_ref` and pass it on every project-scoped call. Call `get_project` for project instructions, limits, and the latest event ID.
2. **Find work**: use `get_planning_graph` for dependency-aware selection or `list_issues` with `is_claimable: true` for a narrow ready queue. `search` is for historical knowledge, not current state.
3. **Load context**: call `get_work_context` before claiming. Request the sections you need (parent epic, relations, recent comments, decision content, attempt history, artifacts, project instructions, or changes since the previous attempt).
4. **Claim before execution**: call `claim_issue` only for a claimable `ready` or `review` issue. The returned `attempt_id` and lease token are private — keep them until the attempt ends. For long work, `renew_attempt` before expiry. A lost or expired lease must not be treated as ownership.
5. **Reserve shared resources**: before editing any shared or high-risk file (the high-risk list below), pass `resources` to `claim_issue` to acquire atomically, or call `reserve_resources` later. Conflicts fail the whole call with `RESOURCE_RESERVATION_CONFLICT` naming the conflicting reservation. Reservations coordinate cooperating agents; they do not lock the filesystem. Released by `release_resources`, by `finish_attempt`, and by lease expiry.
6. **Execute durably**: use `save_attempt_note` for restartable checkpoints, important findings, warnings, and concrete next steps. Attach durable artifacts (commits, branches, files, URLs, logs). Use comments for collaboration and decisions for durable architectural or product choices. Use `update_issue` / `archive_issue` with the current issue version; on conflict, refetch and reconcile.
7. **Finish every attempt**: call `finish_attempt` exactly once when work completes, fails, becomes blocked, or is handed off. Review attempts set `review_outcome` (`approved` → issue `done`; `changes_requested` → issue `ready`; `blocked` → issue `blocked`). Never leave an attempt active just because the agent is stopping.

### Issue types and statuses

Types: `epic`, `task`, `bug`. Use parent relationships for decomposition and `blocks` relations for execution order. `related_to` adds context without scheduling; `duplicates` identifies equivalent work.

Stored statuses: `open`, `ready`, `blocked`, `review`, `done`, `cancelled`. **`in_progress` is an effective status derived from an active leased attempt** — never write it as an issue status. If a lease expires, the effective status falls back to the stored state so work cannot remain permanently stuck.

Mutations use optimistic concurrency: read the issue, retain its `version`, submit that as `expected_version`. On conflict, refetch and reconcile all intervening changes — do not retry a stale patch blindly. Use `validate_plan` for bounded multi-issue plans before atomic application.

### Task ownership

A claimed Rhizome task represents the agent's current work.

- Do not work on another agent's claimed task without an explicit handoff (the receiving agent calls `open_project` + `get_work_context` to load checkpoint + artifacts + decisions; never reuse another agent's `attempt_id` or lease token).
- Do not claim a task that has unresolved dependencies.
- Do not create a second task for work already represented in Rhizome.
- Do not re-plan a feature that another orchestrator owns.
- If work crosses ownership boundaries, create a dependency or handoff task instead.
- Do not assume that another agent has completed work unless its Rhizome task or checkpoint says so.

### High-risk resource list (reserve before editing)

`package.json`, `app.config.js`, Drizzle schema files, Drizzle migrations, `utils-server/leadBilling.ts`, `lib/activateSubscription.ts`, authentication middleware, payment routes, shared API types, WebSocket event definitions, Supabase configuration. Reservations coordinate cooperating agents; they do not lock the filesystem against processes that bypass this server.

### Required completion checkpoint

Before calling `finish_attempt` with `review` (implementation attempt) or `approved` (review attempt), the most recent `save_attempt_note` must contain:

- Summary of what was implemented
- Files added, changed, or deleted
- Database schema or migration changes
- API contract changes
- Environment variable changes
- Tests and commands executed
- Test results
- Known limitations
- Unfinished work
- Follow-up tasks
- Any decisions that another agent needs to know (and a `record_decision` call for durable ones)

Use this format:

```text
Implemented:
- ...

Files changed:
- ...

Database changes:
- ...

API changes:
- ...

Environment changes:
- ...

Tests run:
- ...

Known limitations:
- ...

Follow-up work:
- ...

Handoff notes:
- ...
```

§`.kilo/plans/rhizome-upstream-reports.md` for the install command, data-root config, and the Kilo client-side rendering caveat (older clients drop `structuredContent`). The three rhizome guides at `rhizome://guides/*` are the authoritative API reference.

## Essential Commands

```bash
# Device-testing env (run BEFORE expo start — laptop IP differs WiFi vs hotspot; see TEST-SETUP.md)
node scripts/dev-env-sync.js                # Sync .env.local dev IPs to current LAN IP

# Install (workspace root ONLY — single lockfile covers root + utils-server)
npm ci                                       # Clean install for both packages; NEVER npm install inside utils-server/

# Expo app
npx expo start                              # Dev server
npx expo run:android                        # Native build (required after plugin changes)
npx tsc --noEmit                            # Type check (must pass)
npm run lint                                # Lint (must pass; unused _-prefixed vars allowed). Uses legacy .eslintrc.json — do NOT run bare `npx eslint .`
npx jest --testPathPattern="name"           # Single test

# Concurrency lane (opt-in, REAL Postgres) — run BEFORE billing/schema changes
npm run test:concurrency                    # tests/concurrency with RUN_CONCURRENCY_TESTS=1. DB PREREQUISITE: SCRATCH_DATABASE_URL
                                            #   from `node scripts/concurrency-scratch-project.mjs` (never the shared dev project) — see Testing

# Database
npx drizzle-kit generate                    # Generate migration SQL from schema
npx drizzle-kit push                        # Push to remote Supabase DB

# utils-server (separate process)
cd utils-server && npm run dev              # Start WebSocket server with tsx watch

# Validation order: lint → typecheck → test (all must pass)

# Commit-time checks (run all)
# On Windows (PowerShell):
Get-ChildItem app/, lib/, utils-server/, src/ -Recurse -Include "*.ts", "*.tsx" | Select-String "console\.log"
# On Linux/Mac:
grep -r "console\.log" app/ lib/ utils-server/ src/       # must return nothing
grep -ri "clerk\|stripe\|firebase" app/ lib/ utils-server/ src/   # must return nothing

# Automated pre-commit gate — scripts/git-hooks/pre-commit (install: node scripts/install-hooks.js)
# 7 stages, any failure BLOCKS the commit, in order:
#   1 vacuous-assertions  2 date-in-sql  3 Maestro flow selector
#   4 testID codemod idempotence (B-1)  5 testID map freshness  6 testID flow currency  7 eslint (staged files only)
# ON-DEMAND HARNESS (opt-in, ~3min pre-commit / ~5min pre-push): node scripts/pre-commit-harness.cjs [--gate 5] [--list]
#   [--json] [--keep] [--base <ref>] [--no-copy] [--push]. Runs the REAL hook in a disposable git worktree
#   (node_modules linked so stage 7's CWD-relative eslint path resolves) and asserts every gate
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
# reference 91 of the map's 1107 ids; the other 1016 rot with NO signal (verified: renaming an
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
# ids this commit REMOVES with the set flows actually select (91 of ~1108 ids), so it blocks ONLY real
# orphans — renaming an id no flow uses stays green. It stands down when any flow is staged, because
# stage 3 then verifies every selector authoritatively. Both maps come from git (`HEAD:` vs `:`), so it
# asks "what does THIS commit delete". MEASURED, do not "simplify" this back: writing the selector
# regex with the POSIX class `[[:space:]]` is VALID in the `git grep -E` pattern but NOT in JavaScript
# (it means "one of [ : s p a c e then a literal ]"), which yields ZERO selectors and turns this into
# a gate that silently passes every commit forever. `tests/meta/testid-flow-currency.test.ts` pins the
# live count at exactly 91 for that reason.
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

## Architecture Map

- **Fleet Management (universal fleet model, 2026-08):** every driver owns exactly one fleet (`drivers.fleet_id` NOT NULL; solo drivers get an implicit solo NATIVE fleet at registration — `app/api/register+api.ts` — or via `scripts/fleet-backfill.ts`). `vehicles.fleet_id` NOT NULL. The strict 1:1 driver↔vehicle unique index is DROPPED (`docs/vehicle-model-decision.md` resolved); `fleet_vehicle_assignments` is the authoritative assignment source (append-only, single active row per vehicle/driver via partial unique indexes), and `vehicles.driver_id` / `drivers.vehicle_id` / `drivers.vehicle_type` are DENORMALIZED active-pointer caches written ONLY through `lib/fleetAssignment.ts` in the same transaction. Dispatch (`utils-server/dispatch.ts`) is untouched — it filters on `drivers.vehicle_type` as before. Fleet tables: `fleets`, `fleet_members`, `fleet_vehicle_assignments`, `fleet_subscription_plans`, `fleet_subscriptions`, `fleet_billing_transactions`, `fleet_alerts`, `audit_logs` (fleet roles live in `fleet_members`, NOT `users.role`; money = integer paisa).

- `app/(auth)/` — Auth screens (phone-entry → otp-verify → register)
- `app/(main)/(customer)/` — Rider screens (keep folder name `(customer)`, rider is a display label)
- `app/(main)/(rider)/` — Driver screens (folder name `(rider)` is legacy — contains driver flows, do not rename)
- `app/admin/` — Web-only admin panel (no parentheses — plain segment, not a route group)
- `app/api/` — Expo API routes (file-based backend, `[public]` prefix = no JWT required)
- `components/` — Shared UI components, flat (no `src/` prefix, no `components/common/` subfolder); has `components/admin/` and `components/auth/` subfolders only
- `theme/goRide.ts` — Single-file design token source (colors, typography, spacing, radii, shadows). Dark mode is handled by NativeWind `dark:` variants + `tailwind.config.js` aliases — there is no `ThemeProvider`/theme Context
- `lib/` — Shared utilities (auth, DB, map, payment, validation)
- `store/` — Zustand state stores (7 stores: useDriverStore, useRiderStore, useChatStore, useDriverStatusStore, usePackageStore, useCallLedgerStore, useDriverFlowStore)
- `src/db/schema.ts` — Drizzle schema (~97 tables, ~32 enums exported)
- `utils-server/` — WebSocket dispatch server (separate package)
- `scripts/` — Seed scripts (system-config, pricing, packages, platform-config, admin)

**Two backend services:**
1. Expo API routes (`app/api/`) — request/response, DB queries, JWT-gated.
2. Utils server (`utils-server/`) — stateful WebSocket dispatch, sequential chains with debit-on-offer lead billing, H3 index, scheduler, compensation worker. `INSTANCE_COUNT=1` required (no split-brain).

## Critical Rules

### Money
**Always integer paisa (BDT).** Never floats. Never strings. Divide by 100 only at UI display. Every `*_bdt` column and API field is integer paisa. Commission calculated on post-minimum-floor fare, never on raw total.

### Write Ownership (violating these is a critical bug)
- `call_ledger` deduction rows (`event_type='deduction'`, `reason='offer_sent'`) → ONLY `utils-server/leadBilling.ts` (`debitLeadForOffer` — Phase D debit-on-offer; `heartbeat.ts` is DELETED). Refund rows no longer exist: AC-7 accept-race refunds and the unconsumed-deduction sweep are deleted (ruling 8 — every offered driver is billed regardless of outcome)
- `call_ledger` all other event types (`initial_load`, `credit`, `expiry_writeoff`) → ONLY `lib/activateSubscription.ts`
- `dispatch_offers` new rows (outcome `delivered`) → ONLY `utils-server/leadBilling.ts` (inserted in the SAME transaction as the call_ledger deduction). Terminal-outcome updates and `fetch_confirmed_at` telemetry stamps → `utils-server/index.ts` (offer:accept `accepted`, offer:reject `rejected`, chain `expired` stamps, fetch:confirm stamps) and `utils-server/scheduler.ts` job 20 (stale-offer crash-recovery `expired` flips, threshold `dispatch_offer_ttl_seconds + 5s`). `utils-server/dispatch.ts` no longer writes dispatch_offers (no 'filtered' audit rows — pool exclusions are not persisted). Sequential dispatch = one outstanding offer per ride, debit at offer time (`utils-server/dispatchChain.ts` holds the in-memory chain state)
- `payment_events` row creation + PortPos invoice initiation → ONLY `lib/paymentEvents.ts` (`initiatePortposPayment`, `createZeroAmountPaymentEvent`), called by `app/api/rider/wallet/topup+api.ts`, `app/api/rider/passes+api.ts`, `app/api/driver/wallet/topup+api.ts`, `app/api/package/purchase+api.ts`
- `payment_events` status transitions (`paid`/`failed`, `confirmed_at`, `subscription_id`) → `lib/activateSubscription.ts`, `app/api/payment/portpos/callback+api.ts`, and `lib/paymentRepair.ts` (`repairPaymentEvent` — shared transactional repair invoked by the callback itself and by `utils-server/compensationWorker.ts`; audited Z-2/Z-3)
- `platform_config` gains one job-writer: `heat_backtest_correlation` via scheduler job 37 (weekly backtest). All other `platform_config` writes are admin-only via `PATCH /api/admin/config`.
- No other file writes these tables directly.

### Payments (PortPos callback security)
- `app/api/payment/portpos/callback+api.ts` is a public endpoint that credits wallets / activates subscriptions. It MUST call `portposClient.verifyIPN(invoiceId, amountTaka)` (secret-bearing) and Zod-validate the PortPos response BEFORE touching any state. Never remove the signature check.
- The callback compares the invoice amount against the locally-stored `payment_events.amount_bdt` in integer paisa (never float taka).

### Idempotency-Key Convention (decision `01M23628A1566SK1D5XXV1NT5G`)
- All state-changing POSTs SHOULD accept an `Idempotency-Key` header; the `(route, key)` pair is the barrier, stored DB-backed in `idempotency_keys` (never in-memory — TD-15). Storage + helper: `lib/idempotency.ts`; canonical route ids: `IDEMPOTENCY_ROUTES`.
- Replay semantics: a duplicate claim returns the ORIGINAL outcome (stored status/body, `Idempotency-Replayed: true` header) and never re-executes the handler; a still-in-flight key returns `409 idempotency_key_in_progress`; the 23505 race loser reads and returns the winner's recorded outcome. Failures must call `storeIdempotencyOutcome` so client retries replay the typed failure instead of re-entering the flow; a claim left in-flight by a crash 409s until a fresh key is used.
- Wired routes (required on `package/purchase`, optional elsewhere; absent key → fresh server key = legacy behavior): `app/api/rider/wallet/topup+api.ts`, `app/api/driver/wallet/topup+api.ts`, `app/api/rider/passes+api.ts`, `app/api/package/purchase+api.ts`. Extend `IDEMPOTENCY_ROUTES` when wiring a new route.
- Exempt (documented in `lib/idempotency.ts`): SOS insert (unconditional per R3.1 design), internal scheduler endpoints, PortPos callbacks (verifyIPN + in-tx paid-guard). Interim per-surface deterministic keys (`cancel_fee_${rideId}`, `payment_events.idempotency_key`, leadBilling 23505 barriers) remain authoritative for unwired routes.

### Auth
Supabase phone OTP. Client uses `lib/supabase.ts` (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Server uses `lib/supabaseServer.ts` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Protected API routes call `verifySupabaseToken(request)` or `requireRole(request, role)` from `lib/auth.ts`. **No exceptions.** No `x-user-id` header substitution.

**Fleet authorization (Phase 2):** fleet staff roles (`OWNER|MANAGER|DISPATCHER|ACCOUNTANT|VIEWER`) live EXCLUSIVELY in `fleet_members` — never `users.role` (which stays immutable/singular). Use `requireFleetMember(fleetId, allowedRoles?)` from `lib/auth.ts` to scope any fleet route to a specific fleet: it verifies the Supabase token, looks up the users row, asserts an ACTIVE `fleet_members` row for `(user, fleetId)` (and an allowed role when constrained), then throws 403 on any miss. Because `fleetId` is bound into the curried guard, URL-param tampering for cross-fleet access is structurally impossible. E.g. `app/api/fleets/[id]+api.ts`. Client switches its "Current Mode" entirely in local state via `store/useFleetStore.ts` (`activeMode`) — never a logout, never a `users.role` mutation.

### Vehicle Types
9 lowercase values: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_compact`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`. Import Zod enum from `lib/vehicleTypes.ts` — never define inline. Old values (`MOTORCYCLE`, `CNG_AUTO_RICKSHAW`, `CAR`, `MICROBUS`) are removed. `car_compact` sits between `cng` and `car_economy` in tier order.

### Packages
Call packages may be scoped to a specific vehicle type via `packages.vehicle_type` (nullable). NULL = universal (every driver sees it and can buy it); non-null = only drivers whose `drivers.vehicle_type` matches see it in `GET /api/package/list` and can purchase it. `POST /api/package/purchase` returns `403 vehicle_type_mismatch` if a driver tries to buy a package scoped to a different vehicle type. Mirrors the `incentive_definitions.vehicle_type_filter` pattern. Admin sets the scope via the Packages screen or `POST /api/admin/packages`.
`packages.name` is UNIQUE among LIVE rows only (`packages_name_live_uq`, a partial index `WHERE deleted_at IS NULL`, migration `src/db/migrations/0057_packages_name_live_unique.sql`). It is scoped to live rows on purpose: packages are soft-deleted, so a plain `UNIQUE(name)` would permanently reserve a retired name. `ensureLaunchFreePackage` still takes `pg_advisory_xact_lock` — the lock serializes, the index is the schema backstop for any writer that forgets the lock. Admin create/rename onto a taken name returns `409 package_name_taken`.

### H3
`h3-js` is imported ONLY in `lib/h3.ts` and `utils-server/h3Index.ts`. All other files use the wrappers. Resolution 9 (~174m diameter).

### Removed Technologies
No Clerk/Stripe/Firebase. Any reference is a bug.

### platform_config
Never cache. Read from DB at every request. Admin changes via `PATCH /api/admin/config` must take effect without restart.

### Timestamps
Always UTC `timestamptz`. Convert to `Asia/Dhaka` only at display. Use `lib/time.ts` → `nextBdtMidnightUtc()` for Dhaka midnight calculations (e.g., `daily_reset_at`).

### Copy Truth Rule (owner ruling 2026-08-28)
No UI text, config description, or admin guidance may reference behavior that isn't live — including planned, fenced, or scheduled behavior. If it's not on disk, the text either omits it or says "ships with Stage 1." Applies to rider-facing copy, driver surfaces, admin guidance, and config field descriptions. Copy is verified against disk state before shipping, same as code claims.

### File Cross-Reference Convention (AI-to-AI program, owner ruling 2026-08-28)

This program is almost entirely AI ↔ AI with Zia as the bus (copy-paste operator). Files written for model consumption are the norm, not the exception. Every such artifact MUST open with an AI-reader header block:

```
**Purpose:**     <one line: what this file is, when to read it>
**Owner:**       <Architect / Coding / Testing model / Zia — which role keeps it current>
**Status:**      <ACTIVE / IN-PROGRESS / PENDING / SUPERSEDED>
**Source of truth:** <path, if this file ISN'T the source>
**Related (concrete paths):**
  - <path 1> — <one-line what it is>
  - <path 2> — <one-line what it is>
**Last verified:** <ISO date, by which role, how>
**How to update:** <one-line rule for keeping this file fresh>
```

**Cross-references must be concrete.** When an artifact references another, use `§<section> of <full path>` — never "see the plan," "the docs say," or any loose pointer a model has to re-discover. Cross-refs that don't resolve are failures; the model on the other end won't be able to follow the chain.

**This applies to:** `.kilo/plans/*.md` files (plan + handoff), `docs/testing plan/*.md` (testing plans + reports), the canonical docs (`Ride Fare Framework v6.md`, TLDR), the build script, the bring-up script, AGENTS.md itself. The "decision log" / "round notes" pattern in the handoff file is the working example.

### Validation & Errors
- Zod at every API route boundary before any DB/service call. Use `parsed.data` after `safeParse`, never raw request body.
- POST/PUT/PATCH bodies: use `parseJsonBody(request, schema)` from `lib/parseBody.ts` — it handles body reading + Zod validation and returns a `{ ok, response }` discriminated union. Never call `await request.json()` directly.
- URL path params (dynamic segments): validate with `z.string().uuid()` before any DB query. Invalid UUIDs return `400 invalid_uuid`.
- Error format: `{ error: 'machine_code', message: 'Human description' }`. Never expose stack traces or Drizzle internals.
- Bodyless POST endpoints (e.g. `auth/logout`, `auth/verify-token`, `driver/break/start|end`, `user/request-data`) take no request body — the only input boundary is the auth token, so `parseJsonBody` is NOT required there. Any POST that reads a body MUST validate it.

### Expo API Routes (NOT Next.js)
Expo's `@expo/server` adapter passes dynamic route params **directly** as the second argument — flat, NOT wrapped in `{ params }`. This differs from Next.js.

**Correct (Expo):**
```ts
// file: app/api/admin/ride/[id]/chat+api.ts
export async function GET(request: Request, { id }: { id: string }) {
  // id is available directly
}
```

**WRONG (Next.js convention — crashes in Expo):**
```ts
// ❌ params will be undefined, destructuring throws TypeError
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params; // 💥 TypeError: Cannot destructure property 'id' of undefined
}
```

This caused BUG-1 and BUG-2 in the admin panel — the handlers crashed before UUID validation could run. All 7 dynamic-segment admin routes were fixed in commit `9fdfd0c0`.

**Server entry point** (`server.js`): must buffer the request body stream for non-GET/HEAD methods before constructing the Web `Request`. Without this, POST/PUT/PATCH bodies arrive empty and `request.json()` throws `SyntaxError: Unexpected end of JSON input`.

### Logging
No `console.log`. Use `lib/logger.ts` (`logger.info`, `logger.error`, etc.).

### Drizzle
- **Property names are snake_case throughout** (e.g., `base_amount_bdt`, `tax_rate_id`, `ride_id`). The JS property name in `pgTable()` definitions matches the DB column name. This applies to ALL tables — existing and new. Do NOT use camelCase property names (e.g., `baseAmountBdt`) even though Drizzle supports it. Libs and API routes reference the same snake_case names. This was confirmed during the P4 Tax Engine audit — the REFERENCE.md camelCase recommendation was wrong for this codebase.
- Transactions required for all writes touching `call_ledger`, `subscriptions`, `payment_events`, `tax_ledgers`, `accounting_entries`, or `accounting_entry_lines`.
- Use `typeof schema.$inferSelect` / `typeof schema.$inferInsert` — never manually redeclare DB row types.
- Driver `min_per_km_bdt` validation: use `validateDriverMinKm()` from `lib/validateMinPerKm.ts` — never inline.
- **NULL checks**: use `isNull(col)` / `isNotNull(col)`. NEVER `eq(col, null)` — it compiles to `col = NULL` which is always false in SQL (NULL is not equality-comparable). This caused the critical BUG-3 (packages GET returned `[]` despite rows existing).
- **Money columns**: ALL `*_bdt` columns are `integer` (paisa). The ONLY exception is `rate_percent` columns (e.g., `tax_rates.rate_percent`) which are `numeric(5,2)` because they store a percentage (5.00), not money.
- **Self-referencing FKs**: use the `(): any => tableName.id` pattern to avoid TypeScript circular reference errors. (Historical example: `accountingAccounts.parentId` — the column has since been made snake_case; the pattern rule stands.)

### Dispatch Logic
- Sequential chain: one outstanding offer per ride at any time (`utils-server/dispatchChain.ts` holds in-memory chain state). No chain-length cap.
- Bill-on-offer: lead debited at offer time (not fetch:confirm). Every offered driver is billed regardless of outcome (accept/reject/expire). `fetch:confirm` is telemetry-only.
- Ordering tiers (applied to score, stable sort desc): (1) new-driver protection tier (`new_driver_priority_leads` within `new_driver_priority_days`), (2) cold-drop boost Lever 2 (temporary multiplier decaying over ~15 min), (3) return-lead affinity Lever 3 (pickup zone matches recent cold drop zone), (4) existing commute bonus (1.1×).
- Auto-accept relocated to offer step (rating ≥ 4.8, radius gate, first-wins). Auto-accept drivers billed the same 1 lead.
- Pool filters unchanged: vehicle type (BEFORE H3 scoring), calls_remaining > 0 / unlimited, daily cap, chain-exclusion (previously billed drivers skipped), suspension/online, commute, min_per_km, blocklist, female-preference, cooldown.
- Daily cap check belongs in dispatch candidate pool construction (`dispatch.ts`); `leadBilling.ts` re-checks it as defense-in-depth inside the debit transaction.
- `dispatch_offers` has a unique index on `(ride_id, driver_id)` preventing the same driver receiving the same ride twice. `call_ledger` has a SEPARATE partial unique index on `(ride_id, driver_id) WHERE event_type='deduction'`. Do not confuse the two.
- Surge is fully removed. No surge tables, columns, code, or UI references remain.

### Client Secrets
Payment credentials (`PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-side only. Never in `EXPO_PUBLIC_*` vars.

### TypeScript Rules
- No `any`, no `@ts-ignore`, no `@ts-expect-error` without explanatory comment. **Exception**: Drizzle type casts (`as any`) are permitted for enum comparisons and FK-column insert inference gaps — see `docs/Plan/13-CONVENTIONS.md` § Drizzle type casts.
- `interface` for DB row shapes and API response shapes. `type` for unions.
- Exhaustive switch statements on enums/unions: `default: assertNever(value)` (import from `@/lib/utils`).
- WebSocket message types defined in `utils-server/types.ts`.

### Database Tables
All tables: uuid PKs, created_at/updated_at timestamptz. Append-only tables (`call_ledger`, `dispatch_offers`, `used_challenges`, `rate_limits`) are exempt from `updated_at`. Soft deletes (`deleted_at` column, no hard deletes) exist on: users, packages, promoCodes, documents, incentiveDefinitions, riderAddresses. Rides use status transitions (`cancelled`/`expired`) instead of `deleted_at`; drivers use `status` (`suspended`/`rejected`) instead of `deleted_at`.

### File Naming
- `lib/`: camelCase (`fareCalc.ts`, `activateSubscription.ts`)
- `app/api/`: kebab-case with `+api.ts` (`purchase+api.ts`)
- `components/`: PascalCase (`CallWalletCard.tsx`)
- `store/`: `use{Name}Store.ts` (`usePackageStore.ts`)
- WebSocket events: `{domain}:{action}` kebab-case (`ride:offer`, `fetch:confirm`, `location:update`)

### ESLint
Legacy `.eslintrc.json` config (NOT flat config). Always lint via `npm run lint` (script sets `ESLINT_USE_FLAT_CONFIG=false`). Unused vars with `_` prefix allowed. Config ignores `_reference/` and `utils-server/`.

### Agent Coding Conduct (Karpathy guidelines — all agents, any tool)

Bias caution over speed; use judgment for trivial tasks. Applies to every agent editing this repo regardless of tool.

1. **Think before coding** — state assumptions explicitly; if multiple interpretations exist, present them, don't pick silently; push back when a simpler approach exists; stop and ask when confused.
2. **Simplicity first** — no features beyond what was asked; no speculative abstractions or configurability; no error handling for impossible scenarios; if 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what the task requires; don't "improve" adjacent code, comments, or formatting; match existing style; remove only orphans your own change created (mention pre-existing dead code — don't delete). Every changed line must trace to the request.
4. **Goal-driven execution** — convert tasks into verifiable goals ("fix the bug" → write a reproducing test, make it pass); loop until verified per the validation order (lint → tsc → jest).

Source: `multica-ai/andrej-karpathy-skills`. Mirrored in CLAUDE.md § Agent Coding Conduct (keep in sync).

## Environment Variables

Two `.env` files:
- `.env.local` — Expo app (API routes)
- `utils-server/.env` — WebSocket server

Required Expo app server vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `PORTPOS_BASE_URL`, `PORTPOS_CALLBACK_URL`, `BARIKOI_API_KEY`, `UTILS_SERVER_PORT` (default `3001`), `WEBSOCKET_INTERNAL_SECRET` (min 32 chars), `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (REQUIRED — no default; missing/empty R2 vars fail fast with `500 server_misconfigured`). R2 secrets are server-only; `EXPO_PUBLIC_R2_DOMAIN` is the only client-safe R2 var.

Optional: `DATABASE_SSL=disable` turns TLS off for the app pool when `DATABASE_URL` targets a disposable Postgres that serves no TLS — used by the `concurrency-locks` CI job's `postgres:16` service container. Leave unset everywhere else: the default is required TLS (`ssl: "require"` in `src/db/index.ts`).

Required utils-server vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBSOCKET_INTERNAL_SECRET`, `INSTANCE_COUNT` (must be `"1"`), `BARIKOI_API_KEY` (required for firm-quote routing in `barikoiRoute.ts`).

Required client vars (safe for `EXPO_PUBLIC_`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BARIKOI_API_KEY`, `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`, `EXPO_PUBLIC_SUPPORT_PHONE`.

Full reference: `docs/Plan/11-ENV-VARS.md`.

## Testing

- **Before ANY device/emulator session: read `TEST-SETUP.md` (repo root) and run `node scripts/dev-env-sync.js`** — the laptop LAN IP differs between broadband WiFi and hotspot; a stale `EXPO_PUBLIC_DEV_LAN_IP` breaks all device API calls (env is inlined at bundle time; there is no runtime fallback).
- `npx jest --testPathPattern="name"` — single test
- At phase gates run: `npx jest --watchAll=false` (full suite)

### AI Execution & Testing Protocol (speed rules)

Testing must be fast. Follow this loop:

1. **While iterating, run ONLY impacted test files.** Map each file you changed to its test file(s) and run them targeted: `npx jest --testPathPattern="<impacted>" --bail --silent`. NEVER run the full suite per-task — the ~2000-test full run is a phase-gate activity only.
2. **`--bail` in the inner loop.** Stop at first failure, fix, re-run targeted. Do not re-run large suites just to enumerate every failure before fixing.
3. **A task is complete only when impacted tests pass.** Paste the jest summary line (e.g. `Tests: 42 passed, 42 total`) as evidence in the response. No evidence = not complete.
4. **`--bail`/targeted runs never substitute for the full gate.** At phase gates the order is unchanged: `npm run lint` → `npx tsc --noEmit` → `npm run check:vacuous` → `npx jest --watchAll=false` (full-suite floor).

- **Concurrency advisory-lock proofs** (`tests/concurrency/`) are opt-in and need a real Postgres: `npm run test:concurrency` (= `RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false`, cross-platform via cross-env). A default suite run SKIPS them (pinned by `tests/meta/concurrency-gate.test.ts`); CI runs the lane on every PR in the `concurrency-locks` job of `.github/workflows/ci.yml` (disposable `postgres:16` service container, schema via `drizzle-kit push --force`, `DATABASE_SSL=disable`). For LOCAL runs, provision the disposable project with `node scripts/concurrency-scratch-project.mjs` (needs `SUPABASE_ACCESS_TOKEN`) and run with the `SCRATCH_DATABASE_URL` it writes to `.env.scratch.local` — the harnesses prefer `SCRATCH_DATABASE_URL` and refuse to run without it (`tests/concurrency/scratch-db-url.ts`, proven by `tests/meta/concurrency-gate.test.ts`), so a forgotten override can never run scratch databases on the shared dev project.
- **Dispatch invariants (Phase D — sequential dispatch, debit-on-offer)** that must always pass: (1) exactly one outstanding offer per ride at any time, (2) single deduction per `(ride_id, driver_id)`, (3) `calls_remaining = 0` drivers never in candidate pool, (4) daily cap exceeded drivers never in candidate pool, (5) no driver receives the same offer twice, (6) every offered driver has a `call_ledger` deduction row regardless of outcome (accept/reject/expire/auto-accept), (7) declined/expired offer → next candidate offered, (8) rider cancel mid-chain → chain aborts, no further offers, no refunds, (9) re-dispatch → previously billed drivers not re-billed, (10) billing atomicity — `dispatch_offers` row + deduction commit in ONE transaction.
- **Payment invariants**: (1) same idempotency key → exactly one `payment_events` row, (2) duplicate callback activates subscription exactly once, (3) failed activation → `compensation_queue` entry within 30 seconds.
- Test templates: `docs/Plan/22-TEST-TEMPLATES.md`.

### ExecBro live device verification — use when available

For UI-flow changes (screens, navigation, floating buttons, sheets, theme toggles), code-trace + tsc/lint is the floor, not the ceiling. If the `execbro` MCP server is connected AND Metro (`npx expo start`) plus an emulator/simulator are running:

1. `scan_metro` to connect to the app
2. Verify on-device: `android_screenshot`/`ios_screenshot` + `tap` for interactions, `get_screen_state` for structure, `get_logs` for runtime errors, `get_network_requests` for API calls
3. State what was device-verified in the session report — screenshots beat assumptions

If execbro is NOT connected or no device/Metro is running: say so to Zia in the final report ("device verification skipped — no execbro/device available") and finish with code-trace + lint/tsc (+ Maestro where flows exist). Never block delivery waiting for a device.

### Maestro / UI-flow testing — mandatory pre-reads
Before generating, editing, or evaluating ANY Maestro YAML flow file, read in full:
1. `.claude/rules/testing-agent.md` — 4 non-negotiable rules: (1) Section 4 Feature Coverage Matrix is the only feature source of truth, NOT `FEATURES.md`; (2) Section 17 folder paths are authoritative; (3) the 6 Section 20 pre-implementation gates are hard blockers — refuse to generate and report open gates if unmet; (4) generate all 29 subflows before any module/E2E flow.
2. `plans/maestro-architecture.md` — complete enterprise QA blueprint (157 features, 195 planned flows, 12 testability gaps). Carries a top-of-file MANDATORY READ banner.

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

## Known Issues (`docs/Plan/18-KNOWN-ISSUES.md` — check before fixing bugs)

- **TD-01:** SMS receiver killed by OEM battery optimization on 30-60% of Android devices. Manual OTP entry is the fallback.
- **TD-11:** In-process maps prevent >1 replica. `INSTANCE_COUNT=1` always.
- **TD-15:** utils-server loses all in-memory state on crash. Startup recovery exists.
- **TD-31:** After Oct 30 2026, new tables need explicit GRANT statements for supabase-js/PostgREST access. Server-side Drizzle unaffected.
- **FOLLOWUP-A:** `vehicle_class_letter` hardcoded to `KA`. Multi-class support is a separate feature.
- **FOLLOWUP-B:** `registration_area` hardcoded to `DHAKA_METRO`. Multi-city support is a separate feature.

## Git Conventions

- Commit format: `type(scope): description` (Conventional Commits)
- Scopes: `auth`, `dispatch`, `payment`, `ledger`, `admin`, `schema`, `driver`, `rider`
- Branch names: `type/short-description` (e.g., `feat/hmac-auth`, `fix/call-deduction-race`)
- Protected branches: `main`, `develop` — no force push, PR required.

## Deploy Order

1. `npx drizzle-kit push` (DB migrations)
2. `utils-server` (depends on current schema)
3. EAS build + submit (last — references updated API)

`INSTANCE_COUNT=1`. Not independently rollback-safe (fare framework changes + dispatch code are one release).

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
