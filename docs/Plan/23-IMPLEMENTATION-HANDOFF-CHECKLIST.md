# Strict Implementation Handoff Checklist (Execution Order)

Purpose: execute the existing Ride plan as a GlideX modification with hard phase gates and zero reordering.

Scope rule:

- Follow docs/Plan/14-DEV-CHECKLIST.yaml critical path first.
- Use docs/Plan/20-DEVELOPER-CHANGE-LIST.md as file-level implementation detail.
- Preserve business logic invariants from docs/Plan/02-ARCHITECTURE.md and docs/Plan/06-API.md.

Blocking rule:

- Do not begin the next step until the current step has evidence attached.
- If any failure condition from docs/Plan/14-DEV-CHECKLIST.yaml fires, stop and resolve before proceeding.

## Ordered Execution Checklist

1. [x] H-00 Baseline and branch freeze

Action: create implementation branch from current mainline and capture baseline commit hash.
Evidence: branch name, baseline hash, and owner recorded in handoff ticket.

1. [x] H-01 Environment and tooling gate

Action: complete local setup from docs/Plan/10-DEV-SETUP.md and env mapping from docs/Plan/11-ENV-VARS.md.
Evidence: successful local startup of Expo app, utils-server, and Firebase emulators.

1. [x] H-02 Phase 1 completion gate (Foundation - GlideX cleanup)

Action: complete all Phase 1 items in docs/Plan/14-DEV-CHECKLIST.yaml.
Evidence: type-check passes, no Clerk references, no Stripe references, and no secret leakage checks triggered.

1. [x] H-03 Phase 2 completion gate (Database schema)

Action: complete all Phase 2 items and apply schema changes via Drizzle workflow.
Evidence: migrations applied successfully, required tables and enums present, and seed scripts execute without errors.

1. [~] H-04 Phase 3 completion gate (Supabase Auth configuration)

Action: configure Supabase Auth phone OTP; create lib/supabase.ts and lib/supabaseServer.ts.
Evidence: Both files exist and compile. Manual Supabase dashboard config (enable phone auth, set OTP expiry) not yet completed. Smoke test (P3-05) pending.

1. [~] H-05 Phase 4 completion gate (Auth layer)

Action: complete app-side Supabase phone OTP auth and role enforcement.
Evidence: Auth screens (phone-entry, otp-verify, register), API routes (verify-token, register, logout), and auth middleware (lib/auth.ts) all exist. All API routes are either auth-protected or marked [public]. TypeScript compiles (npx tsc --noEmit). P4-10 E2E manual smoke test pending.

1. [~] H-06 Phase 5 completion gate (Payment system)

Action: complete PortPos unified payment pipeline with idempotent activation.
Evidence: lib/portpos.ts, lib/activateSubscription.ts, components/PaymentWebView.tsx, package API routes (list/purchase/active), PortPos callback handler (GET+POST), inert bkash/nagad stubs, and utils-server/compensationWorker.ts all exist. TypeScript compiles for both app and utils-server.
Requires: sandbox smoke test with PortPos (P5-13) and ngrok for local callback routing.

1. [~] H-07 Phase 6 completion gate (Dispatch engine)

Action: complete WebSocket dispatch, heartbeat-gated deduction, scheduler jobs.
Evidence: utils-server/index.ts, dispatch.ts, heartbeat.ts, scheduler.ts, h3Index.ts, compensationWorker.ts all exist. lib/h3.ts, lib/fareCalc.ts, lib/zone.ts all exist. app/api/ride/request+api.ts exists. TypeScript compiles for both app and utils-server.
Required closeout: startup recovery for stale dispatching rides (TODO in 20-DEVELOPER-CHANGE-LIST.md).
Requires: dispatch integration testing and restart simulation.

1. [~] H-08 Phase 7 completion gate (Driver flows)

Action: complete onboarding, home, offers, active ride, ledger, driver min-rate flow.
Evidence: Driver screens exist (onboarding/, home/, index.tsx, call-ledger.tsx, packages.tsx, verification/, find-customer/, finish-ride/, chat/, enter-otp/, incentives.tsx). All compile.
Requires: manual scenario suite for driver lifecycle E2E.

1. [~] H-09 Phase 8 completion gate (Rider flows)

Action: complete request flow, pricing, pending/matched/in-progress states, cancellation.
Evidence: Rider screens exist (book-ride, confirm-ride, find-ride, show-ride, (tabs), autocomplete, final-page, chat). All compile.
Requires: manual scenario suite for rider lifecycle E2E.

1. [~] H-10 Phase 9 completion gate (Admin panel and quality)

Action: complete admin verification panel and quality integrations.
Evidence: Admin screens exist (index, packages, verification, zones, configuration, _layout). Admin API routes exist (documents/approve/reject/pending, driver/downgrade, config, packages, incentives, preferences, promos, sos-contacts). All requireRole('admin') protected.
Requires: admin approval workflow manual testing.

1. [~] H-11 Phase 10 completion gate (In-app chat)

Action: complete rider-driver chat API, transport, persistence, and UI.
Evidence: chat_messages table, chat API routes, rider and driver chat screens, store/useChatStore.ts all exist.
Requires: chat E2E testing.

1. [ ] H-12 Phase 11 decision gate (Commission and waiting time) — FUTURE

Action: decide implementation timing.
Path A (MVP freeze): defer with explicit ticket, owner, and date.
Path B (include now): implement all Phase 11 items and run full regression.
Evidence: signed decision in handoff record.

1. [x] H-13 Phase 12 completion gate (GoRide design integration)

Action: complete theme tokenization and UI migration without hardcoded styles.
Evidence: GoRide assets integrated, no hardcoded color sweep violations, and UX contracts match docs/Plan/07-USER-FLOWS.md, docs/Plan/08-UI-SPEC.md, docs/Plan/09-UX-SPEC.md.

1. [ ] H-14 API and event contract lock — FUTURE

Action: run endpoint and WebSocket contract verification against docs/Plan/06-API.md.
Required checks: canonical GET /api/payment/methods is used everywhere; POST /api/ride/:id/call-session implemented and tested; call:state WebSocket lifecycle emitted and consumed.
Evidence: contract verification report attached.

1. [ ] H-15 Test execution lock — FUTURE

Action: convert docs/Plan/22-TEST-TEMPLATES.md scenarios into executable suites and run them.
Required targeted scenarios: chat supports text plus image attachments; voice or video overlay returns to ride context after end; fare detail toggle does not reset selected stars; thanks confirmation requires explicit acknowledgement before exit.
Evidence: green test run with artifact links.

1. [ ] H-16 Operational readiness lock — FUTURE

Action: complete docs/Plan/15-RUNBOOK-DEPLOY.md, docs/Plan/16-INCIDENT-RESPONSE.md, and docs/Plan/17-MONITORING.md checks.
Evidence: health checks operational, alert routing confirmed, and rollback steps tested in dry run.

1. [ ] H-17 Final handoff sign-off — FUTURE

Action: produce implementation dossier and transfer ownership.
Dossier must include: phase completion matrix, unresolved risks and mitigations, known issues from docs/Plan/18-KNOWN-ISSUES.md, and production go or no-go recommendation.
Evidence: sign-off from engineering, product, and QA owners.

## Minimal Handoff Artifacts (Required)

- [ ] A1 Phase-by-phase status report (12 phases)
- [ ] A2 Validation command outputs (type, lint, invariant sweeps)
- [ ] A3 API and WebSocket contract diff report
- [ ] A4 Test evidence pack (unit, integration, e2e)
- [ ] A5 Deployment readiness and rollback checklist
- [ ] A6 Open-risks register with owners and due dates

## Notes for Current Plan State

- The plan is implementation-ready; this checklist is execution governance, not a scope expansion.
- One configurable value remains intentionally open: brta_fare_ceiling_bdt set by admin policy.
- Keep GlideX modification framing intact: migration and replacement, not greenfield rebuild.
