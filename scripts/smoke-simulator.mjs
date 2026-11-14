#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
// smoke-simulator.mjs — drives docs/reports/ride-financial-simulator.html in
// headless Chromium: clicks every tab, scenario, mode, view and toolbar control,
// types into EVERY number input on every tab (including the launch-zone and
// e_three_wheeler fields, which once threw "Cannot set properties of null"),
// exercises Export and Import, and fails on any console error or uncaught
// exception. Static review cannot replace this run.
//
// Setup:  npm i -D playwright && npx playwright install chromium
// Run:    node scripts/smoke-simulator.mjs
// If file: URLs are blocked in your environment, serve the folder and run:
//         SIM_URL=http://localhost:8080/docs/reports/ride-financial-simulator.html node scripts/smoke-simulator.mjs
// ══════════════════════════════════════════════════════════════════════
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.SIM_URL || pathToFileURL(path.join(here, '..', 'docs', 'reports', 'ride-financial-simulator.html')).href;

const errors = [];
let steps = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const step = async (name, fn) => {
  steps++;
  try { await fn(); } catch (e) { errors.push('step "' + name + '" threw: ' + e.message); }
};

await page.goto(url);
await page.waitForSelector('#kpi-row .kpi');

const tabs = ['dashboard', 'assumptions', 'pricing', 'unit', 'ladder', 'sources'];
const openTab = async (t) => { await page.click('.tabstrip [data-tab="' + t + '"]'); await page.waitForTimeout(60); };

/* 1. every tab renders */
for (const t of tabs) await step('open tab ' + t, () => openTab(t));
await step('back to dashboard', () => openTab('dashboard'));

/* 2. every toolbar pill */
for (const sel of ['[data-scenario]', '[data-monetization]', '[data-view]']) {
  const n = await page.locator(sel).count();
  for (let i = 0; i < n; i++) await step('click ' + sel + ' #' + i, async () => { await page.locator(sel).nth(i).click(); await page.waitForTimeout(40); });
}
await step('commission mode + both mode with empty rate', async () => {
  await page.click('[data-monetization="commission"]'); await page.click('[data-monetization="both"]'); await page.click('[data-monetization="package"]');
});
await step('horizon 24 and 60', async () => { await page.fill('#in-horizon', '24'); await page.fill('#in-horizon', '60'); await page.fill('#in-horizon', '36'); });
await step('yearly toggle', async () => { await page.click('#monthly-box summary'); await page.click('#btn-yearly'); await page.click('#btn-yearly'); });
await step('presentation on/off', async () => { await page.click('#btn-present'); await page.click('#btn-present'); });
await step('presentation hides Sources tab', async () => {
  await page.click('#btn-present');
  const visible = await page.locator('.tabstrip [data-tab="sources"]').isVisible();
  if (visible) throw new Error('Sources tab still visible in Presentation mode');
  await page.click('#btn-present');
});
await step('dark on/off', async () => { await page.click('#btn-dark'); await page.click('#btn-dark'); });

/* 3. type into every number input on Assumptions, then Pricing (all three sets), Unit, Ladder */
const typeAll = async (label) => {
  const sel = 'section.active input[type=number]';
  const n = await page.locator(sel).count();
  for (let i = 0; i < n; i++) {
    await step(label + ' input #' + i, async () => {
      const loc = page.locator(sel).nth(i);
      await loc.fill('7');
      await loc.fill('');
      await loc.fill('12');
    });
  }
  return n;
};
await openTab('assumptions');
const nAssume = await typeAll('assumptions');
await step('assumptions call-mode pills', async () => {
  const n = await page.locator('#assumptions button.pill').count();
  for (let i = 0; i < n; i++) await page.locator('#assumptions button.pill').nth(i).click();
});
await step('VAT select', async () => { await page.selectOption('#assumptions select', 'yes'); await page.selectOption('#assumptions select', 'no'); await page.selectOption('#assumptions select', ''); });

await openTab('pricing');
for (const set of ['matrix', 'app', 'launch']) {
  await step('pricing set ' + set, async () => { await page.click('#pricing-set-pills [data-set="' + set + '"]'); await page.waitForTimeout(60); });
  await typeAll('pricing/' + set);
}
await step('launch set: fill one full tier then check it computes', async () => {
  await page.click('#pricing-set-pills [data-set="launch"]');
  const bind = (k) => page.locator('[data-bind="tiers.bike_basic.launch.' + k + '"]');
  const vals = { perKm: '8', base: '25', perMin: '2', floorKm: '2', floorMin: '10' };
  for (const k of Object.keys(vals)) await bind(k).fill(vals[k]);
  const row = await page.locator('#pricing-table tbody tr').first().innerText();
  if (/NaN/.test(row)) throw new Error('launch row shows NaN: ' + row);
});

await openTab('unit');
await step('unit waterfall tiers', async () => {
  const opts = await page.locator('#wf-tier option').allTextContents();
  for (const o of opts) await page.selectOption('#wf-tier', o);
});
await step('unit tab shows no literal HTML tags', async () => {
  const txt = await page.locator('section.active').innerText();
  if (/<\/?(span|div|b|i)\b/.test(txt)) throw new Error('literal tag text visible on Unit tab');
});
await openTab('ladder');

/* 4. the e_three_wheeler row can be completed and flows through */
await step('e_three_wheeler completes', async () => {
  await openTab('assumptions');
  const set = async (p, v) => page.locator('[data-bind="' + p + '"]').fill(v);
  await set('tiers.e_three_wheeler.package', '400'); await set('tiers.e_three_wheeler.bench', '15');
  await set('tiers.e_three_wheeler.mileage', '20'); await set('tiers.e_three_wheeler.mv', '1.5'); await set('tiers.e_three_wheeler.perMin', '1');
  await set('tiers.e_three_wheeler.refKm', '3'); await set('tiers.e_three_wheeler.refMin', '15'); await set('tiers.e_three_wheeler.uber', '80');
  await set('tiers.e_three_wheeler.mixPct', '10');
  await openTab('pricing');
  await page.locator('[data-bind="fuel.electricity"]').first().fill('10');
  await openTab('unit');
  const row = (await page.locator('#unit-table tbody tr').allInnerTexts()).filter(t => t.startsWith('e_three_wheeler'))[0] || '';
  if (!row || /NaN/.test(row)) throw new Error('e_three_wheeler row missing or NaN: ' + row);
});

/* 5. export, reset, import */
let exported = null;
await step('export JSON', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  exported = path.join(os.tmpdir(), 'ride-sim-smoke.json');
  await dl.saveAs(exported);
});
await step('reset', async () => { await page.click('#btn-reset'); await page.waitForTimeout(80); });
await step('import JSON', async () => { if (exported) await page.setInputFiles('#file-import', exported); await page.waitForTimeout(150); });
await step('import an old/partial export does not crash', async () => {
  const partial = path.join(os.tmpdir(), 'ride-sim-partial.json');
  fs.writeFileSync(partial, JSON.stringify({ tiers: { bike_basic: { package: 500 } } }));
  await page.setInputFiles('#file-import', partial);
  await page.waitForTimeout(150);
  for (const t of tabs) await openTab(t);
});

/* 6. mobile width: no horizontal page scroll */
await step('390px width: no horizontal scroll', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const t of tabs) {
    await openTab(t);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (over) throw new Error('horizontal page scroll on tab ' + t);
  }
});

await browser.close();
console.log('steps run: ' + steps + ' (assumption inputs typed: ' + nAssume + ')');
if (errors.length) {
  console.log('FAIL — ' + errors.length + ' problem(s):');
  for (const e of errors.slice(0, 40)) console.log('  - ' + e);
  process.exit(1);
}
console.log('PASS — no console errors, no uncaught exceptions, all steps completed.');
