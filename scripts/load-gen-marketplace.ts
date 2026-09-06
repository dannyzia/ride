/**
 * A8 local rig — marketplace workload generator + scan-job p99 measurement.
 *
 * Round: .kilo/plans/round-a5-freshness-a8-rig.md §3.
 *
 * Seeds synthetic marketplace rows into the DEV database (tagged `A8-RIG` for
 * cleanup), then times scheduler jobs 54, 55, 56, 46, 47, 48 over N
 * iterations, and writes scripts/load-gen-marketplace-report.json.
 *
 * Run (from repo root):
 *   npx tsx --tsconfig utils-server/tsconfig.json scripts/load-gen-marketplace.ts
 *
 * Env overrides:
 *   A8_REQUESTS=200  A8_DELIVERIES=100  A8_EMERGENCIES=50  A8_ITERATIONS=5
 *   A8_CLEANUP=1 (default: remove synthetic rows after measuring)
 *
 * Deviation from the round spec (documented in the rig report): synthetic
 * rental_requests are seeded with soft_deadline_at slightly in the PAST, not
 * the future — an all-future seed would leave every scan job a no-op and the
 * p99 would measure empty index scans only. Real state transitions (jobs 54 +
 * 46) are the expensive path the budget must cover.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const TAG = "A8-RIG";
const N = parseInt(process.env.A8_REQUESTS ?? "200", 10);
const M = parseInt(process.env.A8_DELIVERIES ?? "100", 10);
const K = parseInt(process.env.A8_EMERGENCIES ?? "50", 10);
const ITERATIONS = parseInt(process.env.A8_ITERATIONS ?? "5", 10);
const CLEANUP = process.env.A8_CLEANUP !== "0";

// ── env: load DATABASE_URL before touching src/db ────────────────────────────
function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  for (const file of [".env.local", "utils-server/.env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/);
      if (m) {
        process.env.DATABASE_URL = m[1].trim();
        return;
      }
    }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main(): Promise<void> {
  loadEnv();
  const { db } = await import("../src/db/index.ts");
  const { rentalRequests, rentalBids, deliveryRequests, emergencyRequests, users, fleets } =
    await import("../src/db/schema");
  const { eq, like } = await import("drizzle-orm");

  // ── anchors: real FK rows ──────────────────────────────────────────────────
  const [rider] = await db.select({ id: users.id }).from(users).where(eq(users.role, "rider")).limit(1);
  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  const fleetRows = await db.select({ id: fleets.id }).from(fleets).limit(50);
  if (!rider || !anyUser) {
    throw new Error("No users in dev DB — cannot satisfy FK anchors. Seed a user first.");
  }
  if (fleetRows.length === 0) {
    throw new Error("No fleets in dev DB — rental_bids FK requires at least one fleet. Seed a fleet first.");
  }
  const fleetIds = fleetRows.map((f) => f.id);
  console.log(`[a8-rig] anchors: rider=${rider.id} fleets=${fleetIds.length}`);

  // ── seed ───────────────────────────────────────────────────────────────────
  const now = Date.now();
  const runTag = `${TAG}-${now}`;
  console.log(`[a8-rig] seeding N=${N} rental requests (bids x${Math.min(Math.floor(N / 2), fleetIds.length)} each), M=${M} delivery, K=${K} emergency...`);

  const requestIds: string[] = [];
  for (let i = 0; i < N; i++) {
    // soft_deadline_at slightly in the PAST so jobs 54/46 perform REAL state
    // transitions (see header note — deviation from the round's "future").
    const softDeadline = new Date(now - 60_000 - i * 1_000);
    const [row] = await db
      .insert(rentalRequests)
      .values({
        category: "car_rental" as const,
        rider_user_id: rider.id,
        status: "broadcasting" as const,
        pickup_address: `${runTag} pickup ${i}`,
        pickup_lat: "23.810300",
        pickup_lng: "90.412500",
        dropoff_address: `${runTag} dropoff ${i}`,
        dropoff_lat: "23.820300",
        dropoff_lng: "90.422500",
        requested_vehicle_type: "pickup" as const,
        bidding_window_seconds: 1200,
        soft_deadline_at: softDeadline,
      })
      .returning({ id: rentalRequests.id });
    requestIds.push(row.id);

    // N/2 bids per request, capped by fleet count (partial unique:
    // UNIQUE(request_id, fleet_id) WHERE status='active')
    const bidsForRequest = Math.min(Math.floor(N / 2), fleetIds.length);
    if (bidsForRequest > 0) {
      await db.insert(rentalBids).values(
        Array.from({ length: bidsForRequest }, (_, b) => ({
          request_id: row.id,
          submitted_by_user_id: anyUser.id,
          fleet_id: fleetIds[b % fleetIds.length],
          vehicle_type: "pickup" as const,
          quoted_price_bdt: 1000 + ((i * 7 + b * 13) % 5000),
          status: "active" as const,
        })),
      );
    }
  }

  await db.insert(deliveryRequests).values(
    Array.from({ length: M }, (_, i) => ({
      created_by_user_id: rider.id,
      status: "pending" as const,
      pickup_address: `${runTag} pickup ${i}`,
      pickup_lat: "23.810300",
      pickup_lng: "90.412500",
      dropoff_address: `${runTag} dropoff ${i}`,
      dropoff_lat: "23.820300",
      dropoff_lng: "90.422500",
      required_vehicle_type: "bike" as const,
      deadline_at: new Date(now + 30 * 60_000),
    })),
  );

  await db.insert(emergencyRequests).values(
    Array.from({ length: K }, (_, i) => ({
      caller_user_id: rider.id,
      pickup_address: `${runTag} pickup ${i}`,
      pickup_lat: "23.810300",
      pickup_lng: "90.412500",
      patient_condition: runTag,
      service_level: "BLS" as const,
      status: "broadcasting" as const,
      expires_at: new Date(now + 2 * 60_000),
    })),
  );
  console.log("[a8-rig] seed complete");

  // ── measure ────────────────────────────────────────────────────────────────
  const { activateRentalRequests, activateDeliveryRequests } = await import(
    "../utils-server/activationJobs"
  );
  const { activateEmergencyRequests } = await import("../utils-server/emergencyActivation");
  const { sweepExpiredEmergencies } = await import("../utils-server/emergencyChain");
  const {
    sweepDeadlines,
    sweepAssignmentSla,
    sweepConfirmationDeadlines,
  } = await import("../utils-server/rentalDispatchChain");

  const jobNames = [
    "54_activateRentalRequests",
    "55_activateDeliveryRequests",
    "56_activateEmergencyRequests",
    "46_sweepDeadlines",
    "47_sweepAssignmentSla",
    "48_sweepConfirmationDeadlines",
  ] as const;
  const durations: Record<string, number[]> = {};
  const jobFailures: Record<string, string[]> = {};
  for (const name of jobNames) durations[name] = [];

  const runners: Array<(tx: unknown) => Promise<number> | Promise<void>> = [
    (tx) => activateRentalRequests(tx as never),
    (tx) => activateDeliveryRequests(tx as never),
    (tx) => activateEmergencyRequests(tx as never),
    () => sweepDeadlines(),
    () => sweepAssignmentSla(),
    () => sweepConfirmationDeadlines(),
  ];

  for (let iter = 1; iter <= ITERATIONS; iter++) {
    for (let j = 0; j < runners.length; j++) {
      const t0 = performance.now();
      try {
        await runners[j](db);
        const ms = performance.now() - t0;
        durations[jobNames[j]].push(Math.round(ms * 100) / 100);
      } catch (e) {
        // A failing job must not kill the rig — record it and keep measuring
        // the others; the report surfaces the failure per job.
        const ms = performance.now() - t0;
        durations[jobNames[j]].push(Math.round(ms * 100) / 100);
        jobFailures[jobNames[j]] = jobFailures[jobNames[j]] ?? [];
        jobFailures[jobNames[j]].push(
          `iter ${iter}: ${e instanceof Error ? e.message : String(e)}`,
        );
        console.error(`[a8-rig] job ${jobNames[j]} failed (iter ${iter}):`, e);
      }
    }
    console.log(`[a8-rig] iteration ${iter}/${ITERATIONS} done`);
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const report: Record<string, { p50: number; p95: number; p99: number; max: number; runs: number[] }> = {};
  for (const name of jobNames) {
    const sorted = [...durations[name]].sort((a, b) => a - b);
    report[name] = {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1] ?? 0,
      runs: durations[name],
    };
  }

  const outPath = path.join(process.cwd(), "scripts", "load-gen-marketplace-report.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        config: { N, M, K, ITERATIONS, CLEANUP, tag: runTag },
        jobs: report,
        failures: jobFailures,
      },
      null,
      2,
    ),
  );

  console.log("\n[a8-rig] RESULTS (ms)");
  console.log("job".padEnd(34), "p50".padStart(9), "p95".padStart(9), "p99".padStart(9), "max".padStart(9));
  for (const name of jobNames) {
    const r = report[name];
    console.log(
      name.padEnd(34),
      String(r.p50).padStart(9),
      String(r.p95).padStart(9),
      String(r.p99).padStart(9),
      String(r.max).padStart(9),
    );
  }
  console.log(`\n[a8-rig] report written to ${outPath}`);

  // ── cleanup ────────────────────────────────────────────────────────────────
  if (CLEANUP) {
    // bids cascade on request delete; delivery/emergency have no dependents
    await db.delete(rentalRequests).where(like(rentalRequests.pickup_address, `${runTag}%`));
    await db.delete(deliveryRequests).where(like(deliveryRequests.pickup_address, `${runTag}%`));
    await db.delete(emergencyRequests).where(like(emergencyRequests.patient_condition, `${runTag}%`));
    console.log("[a8-rig] synthetic rows removed");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[a8-rig] FAILED:", e);
    process.exit(1);
  });
