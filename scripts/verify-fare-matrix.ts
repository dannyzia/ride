// ══════════════════════════════════════════════════════════════════════
// verify-fare-matrix.ts — two modes (plans/map-report-rebuild-prompt-r2.md §4):
//
//   default     Engine check: feeds the owner-matrix rates into the REAL
//               engine (lib/fareCalc.ts calculateFare) and diffs floor /
//               reference total / gap against the owner vectors (engine
//               rounding convention: each distance charge rounded to paisa).
//               The perKm and base rows are "derivation" lines — they are
//               computed from the same formula as the expected values and
//               cannot fail; they are printed but not counted.
//               Exit 0 = all engine checks match; exit 1 = mismatch.
//
//   --live      App-today check: reads the live pricing rows from the repo
//               seed (scripts/seed-pricing.js — never queries production),
//               runs the same engine on the app's own rates, and prints a
//               per-tier table: owner matrix vs app today (floor fare,
//               reference-trip fare, gap vs Uber).
//               Exit 0 = every tier within 1% of the matrix;
//               exit 2 = informational — live pricing differs from the
//               matrix (this is expected until the two are reconciled).
//
// Run:  npx tsx scripts/verify-fare-matrix.ts [--live]
// ══════════════════════════════════════════════════════════════════════
import * as fs from "fs";
import * as path from "path";
import { calculateFare, type PricingRow } from "../lib/fareCalc";

const FLOOR_KM = 2;   // owner matrix global floor length
const FLOOR_MIN = 10; // owner matrix global floor minutes
const DIFF_PCT_TOLERANCE = 1; // r2 §3: banner threshold

interface TierSpec {
  key: string;
  fuel: number;
  mileage: number;
  mv: number;
  perMin: number;
  refKm: number;
  refMin: number;
  uber: number;
  expected: { perKm: number; base: number; floor: number; total: number; gap: number };
}

// Owner rate matrix (plans/map-report-rebuild-prompt.md §3) with expected
// vectors in the ENGINE'S rounding convention (r2 task 1): each distance
// charge is rounded to whole paisa. bike_basic's floor is therefore 51.12,
// not the 51.11 of the original pure-float table (diff reported, not hidden).
const OWNER_MATRIX: TierSpec[] = [
  { key: "bike_basic", fuel: 140, mileage: 45, mv: 2.5, perMin: 2.0, refKm: 4, refMin: 30, uber: 108, expected: { perKm: 7.78, base: 15.56, floor: 51.12, total: 106.67, gap: 1.25 } },
  { key: "bike_standard", fuel: 140, mileage: 40, mv: 2.5, perMin: 2.0, refKm: 4, refMin: 30, uber: 108, expected: { perKm: 8.75, base: 17.5, floor: 55.0, total: 112.5, gap: -4.0 } },
  { key: "bike_plus", fuel: 140, mileage: 25, mv: 2.5, perMin: 2.0, refKm: 4, refMin: 30, uber: 113, expected: { perKm: 14.0, base: 28.0, floor: 76.0, total: 144.0, gap: -21.53 } },
  { key: "cng", fuel: 43, mileage: 18, mv: 5.0, perMin: 2.5, refKm: 5, refMin: 45, uber: 159, expected: { perKm: 11.94, base: 23.89, floor: 72.78, total: 196.11, gap: -18.92 } },
  { key: "car_economy", fuel: 140, mileage: 15, mv: 1.5, perMin: 3.0, refKm: 5, refMin: 45, uber: 242.5, expected: { perKm: 14.0, base: 28.0, floor: 86.0, total: 233.0, gap: 4.08 } },
  { key: "car_comfort", fuel: 140, mileage: 12, mv: 1.5, perMin: 3.0, refKm: 8, refMin: 60, uber: 390, expected: { perKm: 17.5, base: 35.0, floor: 100.0, total: 355.0, gap: 9.86 } },
  { key: "car_premium", fuel: 140, mileage: 10, mv: 1.5, perMin: 3.0, refKm: 8, refMin: 60, uber: 436, expected: { perKm: 21.0, base: 42.0, floor: 114.0, total: 390.0, gap: 11.79 } },
  { key: "car_xl", fuel: 140, mileage: 8, mv: 1.5, perMin: 3.0, refKm: 8, refMin: 60, uber: 490, expected: { perKm: 26.25, base: 52.5, floor: 135.0, total: 442.5, gap: 10.73 } },
];

// Matrix has no rates for these tiers; the app seeds scooter and leaves
// car_compact as a product-input sentinel. Reported in --live output only.
const APP_ONLY_TIERS = ["scooter", "car_compact"];

const r2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Owner-matrix rates -> PricingRow in the engine's paisa convention. */
function matrixRow(t: TierSpec): PricingRow {
  const perKmTaka = (t.fuel / t.mileage) * t.mv;
  return {
    base_fare_bdt: FLOOR_KM * perKmTaka * 100,
    per_km_bdt: perKmTaka * 100,
    per_min_bdt: t.perMin * 100,
    floor_length_km: FLOOR_KM,
    floor_min: FLOOR_MIN,
  };
}

function engineFare(row: PricingRow, km: number, min: number): number {
  return calculateFare(row, km, min).total_bdt / 100;
}

/* ─────────────── default mode: engine vs owner vectors ─────────────── */
function runEngineCheck(): number {
  console.log("Engine check — real engine (lib/fareCalc.ts calculateFare) vs owner vectors");
  console.log("Rounding convention: each distance charge rounded to whole paisa (r2 task 1)\n");
  let pass = 0;
  let fail = 0;
  for (const t of OWNER_MATRIX) {
    const row = matrixRow(t);
    const floorFare = engineFare(row, 0, 0); // 0 km -> engine returns the floor
    const refFare = engineFare(row, t.refKm, t.refMin);
    const gap = ((t.uber - refFare) / refFare) * 100;

    const got = { floor: r2(floorFare), total: r2(refFare), gap: r2(gap) };
    const engineChecks: Array<[string, number, number]> = [
      ["floor", got.floor, t.expected.floor],
      ["total", got.total, t.expected.total],
      ["gap%", got.gap, t.expected.gap],
    ];
    const bad = engineChecks.filter(([, g, e]) => !close(g, e));

    // Derivation lines (self-referential: expected values come from the same
    // formula; printed for transparency, never counted toward pass/fail).
    const derPerKm = r2((t.fuel / t.mileage) * t.mv);
    const derBase = r2(FLOOR_KM * ((t.fuel / t.mileage) * t.mv));
    const derOk = close(derPerKm, t.expected.perKm) && close(derBase, t.expected.base);
    const derTag = derOk ? "derivation ok" : "DERIVATION MISMATCH";
    console.log(`  derivation: perKm ${derPerKm} / base ${derBase} — ${derTag} (self-referential, not a test)`);

    if (bad.length === 0) {
      pass++;
      console.log(`PASS  ${t.key.padEnd(14)} floor ${got.floor}  total ${got.total}  gap ${got.gap}%`);
    } else {
      fail++;
      console.log(`FAIL  ${t.key.padEnd(14)} ` + bad.map(([n, g, e]) => `${n}: engine ${g} vs vector ${e} (diff ${(g - e).toFixed(4)})`).join(" | "));
    }
  }
  console.log(`\n${pass} tier(s) matched, ${fail} tier(s) mismatched (engine checks only).`);
  if (fail > 0) {
    console.log("Mismatch not reconciled — see lib/fareCalc.ts rounding convention notes.");
    return 1;
  }
  return 0;
}

/* ─────────────── --live mode: matrix vs app today ─────────────── */
interface AppRow {
  base: number; // taka
  perKm: number; // taka
  perMin: number; // taka
  floorKm: number;
  floorMin: number;
}

/** Parse the PRICING array out of scripts/seed-pricing.js without executing it. */
function loadAppRowsFromSeed(): Record<string, AppRow> {
  const file = path.join(__dirname, "..", "scripts", "seed-pricing.js");
  const text = fs.readFileSync(file, "utf8");
  const rows: Record<string, AppRow> = {};
  const re = /vehicle_type:\s*"([a-z_]+)"[\s\S]{0,400}?base_fare_bdt:\s*(\d+)[\s\S]{0,400}?per_km_bdt:\s*(\d+)[\s\S]{0,400}?per_min_bdt:\s*(\d+)[\s\S]{0,400}?floor_length_km:\s*([\d.]+)[\s\S]{0,400}?floor_min:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    rows[m[1]] = {
      base: Number(m[2]) / 100,
      perKm: Number(m[3]) / 100,
      perMin: Number(m[4]) / 100,
      floorKm: Number(m[5]),
      floorMin: Number(m[6]),
    };
  }
  if (Object.keys(rows).length === 0) {
    throw new Error(`No pricing rows parsed from ${file} — parser out of date with the seed file.`);
  }
  return rows;
}

function runLiveCheck(): number {
  console.log("App-today check — owner matrix vs live pricing rows");
  console.log("Source: scripts/seed-pricing.js (repo seed, commit 3e94ea5, 2026-10-20) — production DB never queried.\n");
  const appRows = loadAppRowsFromSeed();
  const pad = (s: string, n: number) => s.padEnd(n);

  console.log(
    pad("tier", 16) + pad("matrix floor", 13) + pad("app floor", 11) +
    pad("matrix ref", 12) + pad("app ref", 10) + pad("app gap", 10) + "diff floor / diff ref"
  );

  let diffs = 0;
  let checked = 0;
  for (const t of OWNER_MATRIX) {
    const app = appRows[t.key];
    if (!app) {
      console.log(pad(t.key, 16) + "no app seed row");
      continue;
    }
    const appRow: PricingRow = {
      base_fare_bdt: app.base * 100,
      per_km_bdt: app.perKm * 100,
      per_min_bdt: app.perMin * 100,
      floor_length_km: app.floorKm,
      floor_min: app.floorMin,
    };
    const mRow = matrixRow(t);
    const appFloor = engineFare(appRow, 0, 0);
    const appRef = engineFare(appRow, t.refKm, t.refMin);
    const mFloor = engineFare(mRow, 0, 0);
    const mRef = engineFare(mRow, t.refKm, t.refMin);
    const appGap = ((t.uber - appRef) / appRef) * 100;
    const dFloor = ((mFloor - appFloor) / appFloor) * 100;
    const dRef = ((mRef - appRef) / appRef) * 100;
    checked++;
    const flag = Math.abs(dFloor) > DIFF_PCT_TOLERANCE || Math.abs(dRef) > DIFF_PCT_TOLERANCE;
    if (flag) diffs++;
    console.log(
      pad(t.key, 16) + pad(r2(mFloor).toFixed(2), 13) + pad(r2(appFloor).toFixed(2), 11) +
      pad(r2(mRef).toFixed(2), 12) + pad(r2(appRef).toFixed(2), 10) +
      pad(r2(appGap).toFixed(2) + "%", 10) +
      `${r2(dFloor).toFixed(2)}% / ${r2(dRef).toFixed(2)}%${flag ? "  >1% — MATRIX AND APP DISAGREE" : ""}`
    );
  }

  for (const key of APP_ONLY_TIERS) {
    const app = appRows[key];
    if (!app) {
      console.log(pad(key, 16) + "not in matrix and not seeded");
    } else {
      const appRow: PricingRow = {
        base_fare_bdt: app.base * 100,
        per_km_bdt: app.perKm * 100,
        per_min_bdt: app.perMin * 100,
        floor_length_km: app.floorKm,
        floor_min: app.floorMin,
      };
      const appFloor = engineFare(appRow, 0, 0);
      console.log(pad(key, 16) + `app-only tier (no owner matrix rates): floor ${r2(appFloor).toFixed(2)}, perKm ${app.perKm}, perMin ${app.perMin}`);
    }
  }
  console.log("\ncar_compact: product-input sentinel in both seeders (all-zero rates, 'do not seed'); a dev-DB");
  console.log("row with car_economy-identical values exists but has no repo source — provenance unknown.");

  if (diffs > 0) {
    console.log(`\n${diffs}/${checked} matrix tier(s) differ from app pricing by more than ${DIFF_PCT_TOLERANCE}% — informational exit (r2 §4). The matrix is the owner design model, not the live pricing table.`);
    return 2;
  }
  console.log(`\nAll ${checked} tier(s) within ${DIFF_PCT_TOLERANCE}% of app pricing.`);
  return 0;
}

/* ─────────────── main ─────────────── */
const live = process.argv.includes("--live");
process.exit(live ? runLiveCheck() : runEngineCheck());
