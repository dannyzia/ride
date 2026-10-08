#!/usr/bin/env node
/** post-commit-i18n-purge-verification.cjs — one-shot verification for the i18n orphan purge done this session. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname);
const AUDIT = path.join(ROOT, 'audit-i18n-orphans.cjs');
const PURGE = path.join(ROOT, 'purge-orphan-keys.cjs');
const BASELINE = path.join(ROOT, 'i18n-orphan-baseline.json');

// Purge set of the deleted-screen namespaces (2026-10-04).
const PURGE_SET = new Set([
  'confirm_ride.*', 'confirm_ride.title', 'confirm_ride.a11y_consent_sms', 'confirm_ride.a11y_disable_schedule_later', 'confirm_ride.a11y_enable_schedule_later', 'confirm_ride.add_stop', 'confirm_ride.amount_off', 'confirm_ride.available_discounts', 'confirm_ride.base_fare', 'confirm_ride.book_for_other', 'confirm_ride.consent_checkbox', 'confirm_ride.consent_message', 'confirm_ride.consent_required', 'confirm_ride.could_not_find_driver', 'confirm_ride.distance', 'confirm_ride.dropoff', 'confirm_ride.duration', 'confirm_ride.network_error', 'confirm_ride.pickup', 'confirm_ride.pickup_fee', 'confirm_ride.schedule_for_later', 'confirm_ride.schedule_ride', 'confirm_ride.tip', 'confirm_ride.total', 'confirm_ride.vehicle_bike_basic', 'confirm_ride.vehicle_bike_plus', 'confirm_ride.vehicle_bike_standard', 'confirm_ride.vehicle_car_comfort', 'confirm_ride.vehicle_car_compact', 'confirm_ride.vehicle_car_economy', 'confirm_ride.vehicle_car_premium', 'confirm_ride.vehicle_car_xl',
  'find_ride.*', 'find_ride.title', 'find_ride.search', 'find_ride.no_results', 'find_ride.book_ride', 'find_ride.pickup', 'find_ride.dropoff', 'find_ride.directions', 'find_ride.price', 'find_ride.offers', 'find_ride.share', 'find_ride.cancel', 'find_ride.confirm', 'find_ride.cancel_confirm', 'find_ride.submit', 'find_ride.request_ride', 'find_ride.ride_date', 'find_ride.ride_time', 'find_ride.ride_type', 'find_ride.vehicle_type', 'find_ride.rates', 'find_ride.fare', 'find_ride.discount', 'find_ride.promo', 'find_ride.apply',
  'apply_promos.*', 'apply_promos.title', 'apply_promos.code', 'apply_promos.apply', 'apply_promos.success', 'apply_promos.failed', 'apply_promos.used', 'apply_promos.expired', 'apply_promos.max_uses', 'apply_promos.min_spend', 'apply_promos.valid_until', 'apply_promos.discount_percent', 'apply_promos.discount_amount', 'apply_promos.remaining', 'apply_promos.total', 'apply_promos.usage', 'apply_promos.tier', 'apply_promos.eligible', 'apply_promos.disabled', 'apply_promos.enter', 'apply_promos.enter_code', 'apply_promos.supported', 'apply_promos.unsupported', 'apply_promos.lead', 'apply_promos.leads', 'apply_promos.ride', 'apply_promos.rides', 'apply_promos.save', 'apply_promos.cancel', 'apply_promos.close', 'apply_promos.ok', 'apply_promos.submit', 'apply_promos.apply', 'apply_promos.unavailable', 'apply_promos.wrong', 'apply_promos.error',
  'ride.request.*', 'ride.request.title', 'ride.request.ride', 'ride.request.rides', 'ride.request.request', 'ride.request.request_ride', 'ride.request.cancel', 'ride.request.confirm', 'ride.request.reject', 'ride.request.accept', 'ride.request.close', 'ride.request.send', 'ride.request.loading', 'ride.request.error', 'ride.request.no_rides', 'ride.request.no_matches', 'ride.request.no_drivers', 'ride.request.no_drivers_available', 'ride.request.waiting', 'ride.request.estimated', 'ride.request.pickup', 'ride.request.dropoff', 'ride.request.plate', 'ride.request.pickup', 'ride.request.dropoff', 'ride.request.vehicle', 'ride.request.type', 'ride.request.capacity', 'ride.request.rate', 'ride.request.fare', 'ride.request.price', 'ride.request.offers', 'ride.request.reviews', 'ride.request.rate', 'ride.request.comment', 'ride.request.note', 'ride.request.notes', 'ride.request.special', 'ride.request.requests', 'ride.request.seen', 'ride.request.new', 'ride.request.order', 'ride.request.status', 'ride.request.completed', 'ride.request.cancelled', 'ride.request.finished', 'ride.request.paused', 'ride.request.ride', 'ride.request.rides', 'ride.request.request', 'ride.request.request_ride',
]);

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function main() {
  console.log('post-commit-i18n-purge-verification');
  console.log('===================================')

  // 1. Confirm git is clean for the three files in scope.
  const gitStatus = execFileSync('git', ['status', '--porcelain', '.', '--', BASELINE, 'i18n/locales/en/common.json', 'i18n/locales/bn/common.json'], { encoding: 'utf8' }).trim();
  if (gitStatus) {
    console.error('❌ git status is NOT clean for the purge files:');
    console.error(gitStatus);
    process.exit(1);
  }
  console.log('✅ git status clean for baseline + both locales');

  // 2. Confirm the baseline still has 96 keys and none of the purge set.
  const baseline = readJson(BASELINE);
  const baselineKeys = new Set(baseline.keys);
  const baselineCount = baselineKeys.size;
  const offending = [...baselineKeys].filter(k => PURGE_SET.has(k));
  if (offending.length) {
    console.error('❌ baseline contains purge-set keys:', offending);
    process.exit(1);
  }
  if (baselineCount !== 96) {
    console.error(`❌ baseline has ${baselineCount} keys, expected 96`);
    process.exit(1);
  }
  console.log(`✅ baseline has ${baselineCount} keys, none in purge set`);

  // 3. Search both locales for the purge set.
  function scanLocale(lng) {
    const file = path.join(ROOT, 'i18n', 'locales', lng, 'common.json');
    const json = readJson(file);
    const hits = [];
    function walk(obj, prefix) {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (PURGE_SET.has(key)) {
          hits.push(key);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          walk(v, key);
        }
      }
    }
    walk(json, '');
    return hits;
  }

  const enHits = scanLocale('en');
  const bnHits = scanLocale('bn');
  const allHits = new Set([...enHits, ...bnHits]);
  if (allHits.size) {
    console.error('❌ purge-set keys still present in locales:');
    for (const h of allHits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log(`✅ locales have zero keys from the purge set (en: ${enHits.length} hits, bn: ${bnHits.length} hits)`);

  // 4. Run both tools and assert exit 0.
  for (const [cmd, args] of [
    ['audit-i18n-orphans.cjs', ['--gate']],
    ['audit-i18n-orphans.cjs', ['--gate', '--json']],
    ['purge-orphan-keys.cjs', ['--new']],
  ]) {
    let out;
    try {
      out = execFileSync('node', [cmd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      console.error(`❌ ${cmd} ${args.join(' ')} failed: ${err.message}`);
      console.error('stdout:', err.stdout ? err.stdout.toString() : '');
      console.error('stderr:', err.stderr ? err.stderr.toString() : '');
      process.exit(1);
    }
    if (cmd === 'purge-orphan-keys.cjs' && args[0] === '--new') {
      if (out.includes('new orphans')) {
        console.error('❌ purge --new reported new orphans');
        console.error(out);
        process.exit(1);
      }
    } else {
      const ok = out.includes('clean') || out.includes('passed') || out.includes('no new orphans');
      if (!ok) {
        console.error(`❌ ${cmd} ${args.join(' ')} did not report a clean gate: ${out.slice(0, 400)}`);
        process.exit(1);
      }
    }
  }
  console.log('✅ gate + gate --json + purge --new all exit 0');

  // 5. Confirm locals and baseline stay in sync by parity for the purge set.
  const enJson = readJson(path.join(ROOT, 'i18n', 'locales', 'en', 'common.json'));
  const bnJson = readJson(path.join(ROOT, 'i18n', 'locales', 'bn', 'common.json'));
  function flatten(obj, prefix = '', out = new Set()) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out.add(key);
    }
    return out;
  }
  const enAll = flatten(enJson);
  const bnAll = flatten(bnJson);
  for (const key of PURGE_SET) {
    const inEn = enAll.has(key);
    const inBn = bnAll.has(key);
    if (inEn !== inBn) {
      console.error(`❌ parity broken on purge key ${key}: en=${inEn} bn=${inBn}`);
      process.exit(1);
    }
    if (inEn) {
      console.error(`❌ purge key still present: ${key}`);
      process.exit(1);
    }
  }
  console.log('✅ en/bn parity holds for the purge set (both absent)');

  console.log('');
  console.log('DONE — all checks passed');
}

main();
