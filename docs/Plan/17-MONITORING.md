<!--
AI INSTRUCTIONS
===============
This monitoring spec covers all three Ride components: Expo API server, utils-server (WebSocket/dispatch), Firebase Cloud Functions.
Standard web metrics (API error rate, P95 latency, DB connections) are inherited from GlideX monitoring baseline.
Only Ride-specific metrics and alerts are documented here — call deduction accuracy, payment pipeline health, dispatch performance.
Configure alerts for every metric in this table before going to production.
-->

# Monitoring & Alerts: Ride

> Three components to monitor separately: **Expo API server**, **utils-server (WebSocket)**, **Firebase Cloud Functions**.

---

## Dashboards

| Name | What it shows |
|------|---------------|
| API server overview | Request rate, error rate by route, P95 latency, DB connection pool |
| utils-server (dispatch) | Connected driver count, offer broadcast rate, call deduction rate, H3 index age |
| Firebase Functions | `startVerification` invocation rate, error rate, execution duration P95 |
| Payment pipeline | bKash/Nagad callback arrival rate, `callback_pending` age, compensation queue depth |
| Call ledger integrity | Deduction count vs. offer count ratio, refund rate, double-deduction alert |
| Admin queue | Pending driver count, oldest pending age, SLA breach count |

*Fill in dashboard URLs when infrastructure is provisioned.*

---

## Alert thresholds

### API server

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| API error rate | < 0.5% | > 2% for 5 min | P2 | Check recent deploy; see 16-INCIDENT-RESPONSE.md |
| P95 response time | < 500ms | > 2,000ms for 5 min | P2 | Check DB slow query log; check H3 index freshness |
| DB connection pool usage | < 70% | > 90% | P2 | Kill longest-running queries; investigate N+1 patterns |
| `POST /api/payment/bkash/callback` error rate | 0% | > 0% for 2 min | P2 | Check bKash signature header; check DB write in callback handler |
| `POST /api/payment/nagad/callback` error rate | 0% | > 0% for 2 min | P2 | Same as bKash |
| `POST /api/ride/request` 422 rate | < 5% | > 20% for 10 min | P3 | Possible zone config issue; check `zones.is_active` in DB |

### utils-server (WebSocket dispatch)

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| Connected driver count | > 0 during operational hours | 0 for 5 min (operational hours) | P1 | utils-server likely down; restart immediately |
| Offer broadcast latency | < 2s from ride create to first driver notification | > 5s P95 | P2 | H3 index may be stale; check `[h3]` logs for refresh errors |
| Call deduction rate / offer broadcast rate ratio | 0.8–1.0 (deductions ≈ offers that were fetched) | < 0.5 or > 1.0 for 30 min | P1 | < 0.5: deductions not firing (heartbeat bug). > 1.0: double-charging. See 16-INCIDENT-RESPONSE.md |
| Auto-refund rate | < 30% of offers (expected: drivers not always fetching) | > 80% for 30 min | P2 | FCM may not be delivering; check FCM error logs |
| H3 index age | < 35s (refreshes every 30s) | > 120s (2 missed refreshes) | P3 | utils-server DB connection issue; check `DATABASE_URL` in utils-server env |
| WebSocket memory usage | < 512MB | > 800MB | P2 | H3 index may be leaking; restart utils-server; investigate |
| Compensation queue depth | 0 | > 5 items for 15 min | P2 | Payment activation failing repeatedly; check DB connectivity and bKash API |
| `no_drivers` ride status rate | < 5% of ride requests | > 20% for 15 min | P3 | No drivers available for requested type. Check driver distribution across vehicle types; consider adjusting pricing. |
| Drivers filtered by min_per_km_bdt | < 10% of online drivers | > 30% for 30 min | P3 | Many drivers setting high minimums; may indicate pricing too low or driver communication issue. |

### Firebase Cloud Functions

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| `startVerification` error rate | < 1% | > 5% for 5 min | P2 | Check Functions logs; likely config issue (hmac.secret missing) |
| `startVerification` P95 execution time | < 2s | > 8s | P3 | Cold start issue; check Function memory allocation |
| `checkAuth` error rate | < 1% | > 5% for 5 min | P2 | RTDB connectivity issue; check Firebase console |
| RTDB `verification_requests` node size | < 1,000 entries | > 10,000 entries | P3 | Cleanup job not running; expired entries accumulating |

### Payment pipeline

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| `payment_events` rows in `callback_pending` > 10 min | 0 | > 0 | P2 | bKash/Nagad not sending callbacks; check callback URL; manually trigger queryPayment |
| `payment_events` rows in `callback_pending` > 60 min | 0 | > 0 | P1 | Compensation queue failed; manual activation required; see 16-INCIDENT-RESPONSE.md |
| `callback_processing_failures_total` counter | 0 | > 0 in 5 min | P2 | Callback received but DB activation failed. Check: DB connectivity, `compensationWorker` running, bKash signature validation. Counter is incremented in callback handler before returning 200. |
| Successful payment → subscription activation latency | < 30s | > 5 min | P2 | Callback processing slow or failing |
| bKash API response time | < 3s | > 10s | P3 | bKash service degraded; check bKash status page; alert users to try Nagad |

### Admin queue SLA

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| Oldest pending driver submission age | < 12h | > 24h | P2 | SLA breach; send escalation notification to senior admin |
| Legacy-operator pending submission age > 12h | > 0 | P2 | SLA breach for fast-track legacy operator. Notify admin immediately. |
| Queue depth | Any | > 50 pending | P3 | Unusual spike; notify admin team to allocate review time |

### Stale rides and stuck states

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| Rides in `driver_arriving` status for > 30 min | 0 | > 0 | P3 | Scheduler should auto-cancel; if not, check scheduler logs. Manual cancel via admin API if needed. |
| Rides in `dispatching` status for > 5 min | 0 | > 0 | P2 | utils-server may have crashed mid-dispatch; check startup recovery. Re-offer manually if needed. |
| `payment_events` stuck in `callback_pending` for > 30 min | 0 | > 0 | P2 | Auto-recovery scheduler should have caught this. Check scheduler logs. Send admin push notification. |
| `compensation_queue` rows with `status='failed'` | 0 | > 0 | P1 | Driver paid but activation permanently failed. Manual admin recovery required via `POST /api/admin/payment-event/:id/recover`. |
| Active pricing rows count | 8 (one per vehicle type) | < 8 for > 5 min | P2 | Pricing config missing. Run `seed-pricing.js` or re-activate via admin panel. |

### Vehicle type distribution

| Metric | Normal | Alert threshold | Severity | Action |
|--------|--------|-----------------|----------|--------|
| Rides per vehicle type (daily) | All 8 types receiving rides | Any type with 0 rides for 48h | P3 | No drivers or no demand for that type. Check driver count per type; consider merging underutilized types. |
| Admin vehicle type downgrades (daily) | < 5 | > 20 in 24h | P3 | Drivers mis-categorizing vehicles. Consider adding auto-suggestion or clearer type descriptions. |
| `ride:alternatives` events (daily) | < 10% of ride requests | > 30% for 24h | P3 | Insufficient driver coverage for requested types. Consider pricing adjustments or driver acquisition for under-served types. |
| Driver type change requests (weekly) | < 10 | > 50 in a week | P3 | Drivers frequently switching types. May indicate unclear type criteria or pricing imbalance. |

---

## What each alert means and what to do

### Connected driver count = 0 (operational hours)
- **First check:** `wscat -c wss://ws.ride.bd` — if refused: utils-server is down.
- **Action:** `railway restart --service utils-server` (or equivalent). Check startup logs.
- **If restart fails:** Check `FIREBASE_PRIVATE_KEY` env var formatting (newlines). Check `DATABASE_URL` connectivity.
- **Impact:** All drivers offline. No rides can be dispatched. P1.

### Call deduction ratio > 1.0 (double-charging)
- **First action:** Pause dispatch immediately (`DISPATCH_PAUSED=true` env var + restart utils-server).
- **Then:** Audit `call_ledger` for `(ride_id, driver_id)` pairs with > 1 `deduction` row.
- **Fix:** Insert compensating `refund` rows for duplicates. Find and fix the race condition.
- **See:** 16-INCIDENT-RESPONSE.md — "Call deduction double-charging" section.

### payment_events stuck in callback_pending
- **Check:** `SELECT id, driver_id, provider, amount_bdt, initiated_at FROM payment_events WHERE status = 'callback_pending' AND initiated_at < now() - interval '10 min'`
- **Action:** For each row, call provider verification API manually (bKash `queryPayment` or Nagad verify).
- **If confirmed paid:** Use the admin recovery endpoint `POST /api/admin/payment-event/:id/recover` — this calls `activateSubscription()` safely and idempotently. Only if the admin endpoint is completely unavailable should you run manual SQL (INSERT subscriptions + INSERT call_ledger initial_load + UPDATE payment_events subscription_id in a single transaction) as a last resort.
- **See:** 16-INCIDENT-RESPONSE.md — "bKash payment confirmed but driver never activated" section.

### startVerification error rate > 5%
- **Check:** `firebase functions:log --project ride-bd --limit 100 2>&1 | grep ERROR`
- **If `invalid signature`:** Client HMAC mismatch — check if app version changed signing method.
- **If `config not found`:** `firebase functions:config:get hmac` — if empty, re-set and redeploy.
- **If `RTDB write failed`:** Check Firebase RTDB console for quota or rules issues.

### H3 index age > 120s
- **Impact:** Dispatch uses stale driver locations. Wrong drivers get offers. Less critical than P2 but degrades quality.
- **Check:** utils-server logs for `[h3] refresh failed` lines.
- **Action:** Usually a transient DB connection blip. Confirm it self-recovers within 5 minutes before escalating.

---

## Ride-specific log patterns to watch

In utils-server logs, these patterns indicate problems:

| Log pattern | Meaning | Severity |
|-------------|---------|---------|
| `[heartbeat] DOUBLE DEDUCTION PREVENTED` | Unique constraint caught duplicate; should never happen | P1 — investigate immediately |
| `[heartbeat] deduction rollback` | Atomic transaction failed and rolled back | P2 — check DB connectivity |
| `[dispatch] offer expired, no fetch:confirm` | Normal (driver didn't fetch) — only alert if rate > 80% | P2 if sustained |
| `[compensation] retry failed` | Activation compensation retry failed | P2 — check DB + monitor queue depth |
| `[compensation] max retries exceeded` | Admin alert triggered | P1 — manual activation required |
| `[h3] index empty` | No drivers in H3 index | P1 if during operational hours |
| `[bkash] queryPayment success` | Auto-verification triggered (callback was late) | Info — log but not alert |
| `[dispatch] no_drivers: alternatives sent` | Requested type has no drivers; alternatives offered to rider | Info |
| `[dispatch] driver filtered: min_per_km_bdt` | Driver excluded from batch due to their minimum rate setting | Info — only alert if > 30% of candidates filtered |
| `[dispatch] no_drivers: no alternatives` | No drivers of any type available in area | P3 if sustained |
| `[fareCalc] fare exceeds BRTA ceiling` | Calculated fare exceeds government ceiling | P3 — admin must adjust pricing |
