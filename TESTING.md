# TESTING.md

**Purpose:**     Canonical test layout + the one run command for the Ride repo. Read this before writing or running any test.
**Owner:**       Orchestrator (kept current per `plans/test-consolidation-and-full-coverage-plan.md`)
**Status:**      ACTIVE
**Source of truth:** this file (test locations); `plans/test-consolidation-and-full-coverage-plan.md` (the plan that produced it)
**Related (concrete paths):**
  - `docs/testing plan/SEGMENT-TESTS.md` — canonical vision-agent / on-device testing entry point (S1–S4 segments)
  - `docs/testing plan/master-testing-prompt.md` — deep A→I phase recipes behind S1/S2
  - `docs/testing plan/TEST-ENGINEER-PROMPT.md` — S4 visual-quality pass
  - `docs/testing plan/manual-testing-full-flow.md` — human operator walkthrough
  - `plans/test-coverage-gap-ledger.md` — Track B full-coverage gap ledger (live artifact)
  - `TEST-SETUP.md` — device/network bring-up runbook (run `node scripts/dev-env-sync.js` before any device session)
**Last verified:** 2026-09-07, by Orchestrator (full `npx jest --watchAll=false` run, **1898/1898 tests green across 148 suites** in 27.8s; supersedes the 2026-09-06 figure of 1891/1891 — delta is the 10-test `utils-server/__tests__/notify-batching.test.ts` added by the implementation agent's `0263f90` round, plus a handful of other small test additions landed between the two runs; Track B P0 + P1 COMPLETE, P2 slices landing incrementally — see `.kilo/plans/active-lanes.md` for the live slice state)
**How to update:** any new test home must be listed here the same commit it appears; if a location dies, delete its row.

## Canonical test locations

| Location | Covers | Config |
|---|---|---|
| `lib/__tests__/` | Business logic (fare, tax, accounting, payment, sos, discount, wallet, …) | root `jest-expo` |
| `app/__tests__/admin/` | Admin panel gates + admin screen logic (module-adjacent to `app/admin/`) | root `jest-expo` |
| `app/__tests__/screens/` | Screen-level handler logic (module-adjacent to `app/(main)/…`) | root `jest-expo` |
| `__tests__/` | Root misc (semver, uuid validation, admin fare framework) | root `jest-expo` |
| `tests/api/` | API-route verticals (`ride`, `admin`, `driver`, `fleet`, `fleets`, `rental`, `shop`, `delivery`, `emergency`, `sos`, `scheduler`, `package`, `rider`, `user`) with mocked DB | root `jest-expo` |
| `tests/module-isolation.test.ts` | Marketplace-isolation grep guard (§H.8: marketplace dirs must not import ride-hailing core) | root `jest-expo` |
| `utils-server/__tests__/` | Dispatch server (sequential dispatch, lead billing, fraud monitors, WS/activation, heat, firm quote, …) | root `jest-expo` (see divergence note) |

There is exactly **one** Jest config in this repo: the `jest` field in root `package.json` (`jest-expo` preset). `utils-server/` has **no** Jest config of its own — its suites are collected by the root run (verified via `npx jest --listTests`, 2026-09-05).

## The one run command

```bash
npm run test:all        # = jest --watchAll=false --ci   (runs everything, both packages)
```

Single suite during development: `npx jest --testPathPattern="<name>"`.

## Divergence from the plan (recorded per protocol)

`plans/test-consolidation-and-full-coverage-plan.md` §7.1 locked `test:all` as a chain ending in `cd utils-server && npx jest`. That chain is **not implementable on disk**: `utils-server/package.json` carries no jest dependency and no config (checked 2026-09-05), and the root config already collects all 15 `utils-server/__tests__` suites. The locked decision's substance — one command runs everything, no forgotten second package — is satisfied by the single root run above. If utils-server ever gets its own jest setup, reintroduce the chain here.

## Formerly red — resolved, with an uncommitted dependency (flag to Zia)

- `tests/api/rental/race-condition.test.ts` ran 3-failures-red earlier on 2026-09-05, then went green (15/15) once the rental lane's uncommitted idempotency guard in `app/api/rental/assignments/[id]/pick+api.ts` (`isNull(assigned_driver_user_id)` in the release UPDATE WHERE) landed in the working tree. **The committed test depends on that uncommitted source fix** — HEAD without it is presumed red. The rental lane owns `pick+api.ts` + `utils-server/scheduler.ts` (similar race guards) and must commit them; the test-consolidation lane did not touch either file.

## Superseded / archived

- `docs/testing plan/_archive/ai-test-engineer-plan.md` — superseded by Track B of the consolidation plan (banner inside).
- `docs/testing plan/maestro-full-flow.md` — deleted 2026-09-05 per its own tombstone instruction.
- Vision-agent hierarchy: `SEGMENT-TESTS.md` is the entry point; the other three docs above keep their distinct roles.
