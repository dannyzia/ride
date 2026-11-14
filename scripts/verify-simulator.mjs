#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
// verify-simulator.mjs — extracts the pure model block (<script id="model">)
// from docs/reports/ride-financial-simulator.html, runs it in a vm context,
// and checks it against plans/simulator-redesign-r3-prompt.md §8 and the
// r1/r2 fare vectors. Exits non-zero on failure.
//
// Run:  node scripts/verify-simulator.mjs
// ══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, '..', 'docs', 'reports', 'ride-financial-simulator.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const match = html.match(/<script id="model">\s*\n'use strict';([\s\S]*?)<\/script>/);
if (!match) {
  console.error('FAIL: <script id="model"> block not found in ' + htmlPath);
  process.exit(1);
}
const sandbox = { console };
vm.createContext(sandbox);
const api = vm.runInContext(match[1] + '\n;({ CONFIG, simulate, consistencyChecks, deriveFare, fareAt, perDriverEcon, adjustRevenue });', sandbox, { filename: 'model-block.js' });

let failures = 0;
const check = (name, pass, detail) => {
  if (pass) console.log('PASS  ' + name + (detail ? '  ' + detail : ''));
  else { failures++; console.log('FAIL  ' + name + (detail ? '  ' + detail : '')); }
};
const within1 = (a, b) => Math.abs(a - b) <= 1;

/* ── §8 monthly vector: 100 paying drivers, all bike_basic, month 1 ── */
console.log('§8 monthly vector (100 drivers, bike_basic 474, 9 rides/day, 26 days, 4.84 cpr, 20K allowance):');
const cfg = JSON.parse(JSON.stringify(api.CONFIG));
cfg.horizon = 1;
cfg.drivers = { checkpoints: { 1: 100 } };
cfg.churnPct = 0;
cfg.productivity = { startPct: 100, rampMonths: 0 };
for (const k of Object.keys(cfg.tiers)) cfg.tiers[k].mixPct = k === 'bike_basic' ? 100 : 0;
cfg.monetization = 'package';
cfg.activeCallsMode = 'trace';
const s1 = api.simulate(cfg).months[0];
check('rides = 23,400', within1(s1.rides, 23400), String(s1.rides));
check('revenue = 47,400', within1(s1.revenue, 47400), String(s1.revenue));
check('calls = 113,256', within1(s1.calls, 113256), String(s1.calls));
check('f = 0.1766', Math.abs(s1.f - 0.1766) <= 0.0001, String(s1.f));
check('partner revenue share = 27,885', within1(s1.partnerShare, 27885), String(s1.partnerShare));
check('owner revenue share = 19,515', within1(s1.ownerShare, 19515), String(s1.ownerShare));
check('plan = Pay-As-You-Go', s1.plan === 'PAYG', s1.plan);
check('total map cost = 11,326', within1(s1.mapCost, 11326), String(s1.mapCost));
check('partner map cost = 9,326', within1(s1.partnerMap, 9326), String(s1.partnerMap));
check('owner map cost = 2,000', within1(s1.ownerMap, 2000), String(s1.ownerMap));
check('partner net before people/marketing = 18,560', within1(s1.partnerShare - s1.partnerMap, 18560), String(s1.partnerShare - s1.partnerMap));

/* ── fare vectors (r1 §3 / r2 engine rounding) ── */
console.log('\nFare vectors (engine rounding, r2 convention):');
for (const v of api.CONFIG.vectors) {
  const d = api.deriveFare(v.key, api.CONFIG);
  const t = api.CONFIG.tiers[v.key];
  if (!d) { failures++; console.log('FAIL  ' + v.key + ': no derivation'); continue; }
  const tot = api.fareAt(d, t.refKm, t.refMin);
  const gap = ((t.uber - tot) / tot) * 100;
  check(v.key + ' floor ' + v.exp.floor, Math.abs(d.floor - v.exp.floor) <= 0.005, 'got ' + d.floor);
  check(v.key + ' ref total ' + v.exp.total, Math.abs(tot - v.exp.total) <= 0.005, 'got ' + tot);
  check(v.key + ' gap ' + v.exp.gap + '%', Math.abs(gap - v.exp.gap) <= 0.005, 'got ' + gap.toFixed(2));
}

/* ── Unit-tab per-driver economics must agree with simulate() (architect finding: the Unit tab once showed the platform's net, not the partner's) ── */
console.log('\nPer-driver partner net (shared by the Unit tab) vs simulate():');
for (const mode of ['trace', 'conservative']) {
  for (const n of [100, 500, 1000]) {
    const c = JSON.parse(JSON.stringify(api.CONFIG));
    c.horizon = 1; c.drivers = { checkpoints: { 1: n } }; c.churnPct = 0;
    c.productivity = { startPct: 100, rampMonths: 0 };
    for (const k of Object.keys(c.tiers)) c.tiers[k].mixPct = k === 'bike_basic' ? 100 : 0;
    c.activeCallsMode = mode;
    const x = api.simulate(c).months[0];
    const e = api.perDriverEcon(c, 'bike_basic', { f: x.f, cpr: c.callsPerRide[mode], effCall: x.mapCost / x.calls });
    const simNet = (x.partnerShare - x.partnerMap) / n;
    check('per-driver net = simulate, ' + mode + ', ' + n + ' drivers', Math.abs(e.net - simNet) < 0.01, 'unit ' + e.net.toFixed(2) + ' vs simulate ' + simNet.toFixed(2));
    check('per-driver net is below the package (split + map applied), ' + mode + ', ' + n, e.net < c.tiers.bike_basic.package * 0.9, 'net ' + e.net.toFixed(2) + ' vs package ' + c.tiers.bike_basic.package);
  }
}

/* ── internal consistency checks exposed by the model ── */
const checks = api.consistencyChecks();
const cPass = checks.filter(c => c.pass).length;
check('internal consistency: ' + cPass + '/' + checks.length, cPass === checks.length);

/* ── r2 scale ladder re-derived under the pro-rata rule (informational) ── */
console.log('\nr2 scale ladder re-derived under the PRO-RATA allowance rule (informational — states the differences):');
console.log('r2 (gross convention, no allowance deduction) vs this page (pro-rata partner map):');
for (const mode of ['trace', 'conservative']) {
  for (const n of [500, 1000]) {
    const c = JSON.parse(JSON.stringify(api.CONFIG));
    c.horizon = 1;
    c.drivers = { checkpoints: { 1: n } };
    c.churnPct = 0;
    c.productivity = { startPct: 100, rampMonths: 0 };
    c.activeCallsMode = mode;
    const x = api.simulate(c).months[0];
    const r2Left = x.partnerShare - x.mapCost;
    const proLeft = x.partnerShare - x.partnerMap;
    console.log(
      '  ' + mode.padEnd(13) + String(n).padStart(5) + ' drivers: map gross ' + Math.round(x.mapCost).toLocaleString('en-US') +
      ' | r2 left ' + Math.round(r2Left).toLocaleString('en-US') + ' | pro-rata left ' + Math.round(proLeft).toLocaleString('en-US') +
      ' | difference (owner map) ' + Math.round(x.ownerMap).toLocaleString('en-US')
    );
  }
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASS' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
