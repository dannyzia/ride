# scripts/ — operational scripts

Node-run scripts for the Ride repo. TS scripts run under Node 24 type-stripping or `npx tsx`.

## A8 local rig (`load-gen-marketplace.ts`)

Measures the four marketplace scan jobs (54, 55, 56) + the three rental sweeps (46, 47, 48) against the DEV database under synthetic load, for the scheduler budget re-derivation (ADR Phase 2 input).

### Run

From the repo root:

```sh
npx tsx --require ./scripts/a8-rig-preload.cjs scripts/load-gen-marketplace.ts
```

`a8-rig-preload.cjs` stubs `utils-server/index.ts` for the rig process only (its module scope runs startup: H3 refresh, compensation worker, scheduler, WS listen — none of which the rig must trigger).

### Env overrides

| Var | Default | Meaning |
|---|---|---|
| `A8_REQUESTS` | 200 | synthetic `rental_requests` (status `broadcasting`, `soft_deadline_at` in the past so jobs 54/46 do real transitions) |
| `A8_DELIVERIES` | 100 | synthetic `delivery_requests` (status `pending`) |
| `A8_EMERGENCIES` | 50 | synthetic `emergency_requests` (status `broadcasting`, expires in 2 min) |
| `A8_ITERATIONS` | 5 | measurement iterations (each runs all 6 jobs once) |
| `A8_CLEANUP` | `1` | `1` = delete synthetic rows after measuring (tagged `A8-RIG-*`) |

### Outputs

- `scripts/load-gen-marketplace-report.json` — p50/p95/p99/max per job + run config.
- Stdout summary table.

### Side effects (read before running against a shared dev DB)

- Job 54 sends REAL push notifications to active fleet members per broadcasting request (N11 idempotency keys dedupe re-pushes per request/user).
- Orphaned rows (rig crash mid-run): purge with `npx tsx --require ./scripts/a8-rig-preload.cjs scripts/a8-rig-cleanup.ts "A8-RIG-%"`.

### Companion scripts

- `a8-rig-preload.cjs` — Module._load stub for `utils-server/index.ts` (rig process only).
- `a8-rig-cleanup.ts` — targeted purge of `A8-RIG-%` rows (subquery deletes — a literal IN list stack-overflows at ~2k ids).
- `_load-env.ts` — loads `DATABASE_URL` from `.env.local` before `src/db` is imported.
