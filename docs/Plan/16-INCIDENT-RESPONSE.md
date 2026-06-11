<!--
AI INSTRUCTIONS
===============
This incident response guide is specific to Ride's architecture: three components (Expo app, utils-server, Firebase Functions),
bKash/Nagad payment flows, HMAC auth, and call deduction ledger.
Generic incidents (API 500s, DB slowness) are handled with GlideX standard procedure.
Only Ride-specific failure modes are documented here.
-->

# Incident Response: Ride

---

## Severity levels

| Level | Definition | Response SLA | Escalate to |
|-------|-----------|-------------|-------------|
| P1 | Core service down: no riders can book, no drivers receive offers, or payment double-charging | Immediate (< 5 min) | Platform owner + developer on call |
| P2 | Major flow broken: HMAC auth failing for all users, call deductions not working, bKash callbacks not processing | < 30 min | Developer on call |
| P3 | Partial degradation: SMS fallback not triggering, some OEM devices failing OTP, admin queue inaccessible | < 2 hours | Development team channel |
| P4 | Minor issue / workaround exists: UI glitch, slow admin panel, single-driver call deduction discrepancy | Next business day | Issue tracker |

---

## Response steps (all incidents)

1. **Acknowledge**: Post "Investigating [symptom] — started [time]" in incident channel.
2. **Assess severity** using table above.
3. **Mitigate first** — stop the bleeding before finding root cause.
4. Post status updates every 15 minutes until resolved.
5. Write incident report within 24 hours (template at bottom).

---

## Ride-specific failure modes

### 🔴 P1: Call deduction double-charging (drivers losing calls without rides)

**Symptoms:** Drivers report calls disappearing without matching ride offers. `call_ledger` shows `event_type='deduction'` rows with no corresponding `ride_id` match, or multiple deductions per `ride_id`.

**Immediate mitigation:**
1. Pause dispatch via `POST /api/admin/dispatch-toggle` (runtime toggle, no restart needed). If runtime toggle unavailable, set `DISPATCH_PAUSED=true` env var + restart utils-server as fallback.
2. Check `call_ledger` for the last 30 minutes: `SELECT * FROM call_ledger WHERE created_at > now() - interval '30 min' ORDER BY created_at DESC`.
3. If double-deductions exist: manually INSERT compensating `refund` rows for affected drivers.
4. Alert affected drivers via admin panel push notification.

**Root causes to check:**
- Missing UNIQUE constraint on `(ride_id, driver_id)` in `call_ledger` (check migration was applied)
- Two utils-server instances running simultaneously (check deployment — only one instance should run)
- Race condition in `heartbeat.ts` transaction (check for unhandled concurrent writes)

**Resolution:** Fix constraint/race → re-enable dispatch → verify single deduction per offer in next 30 rides.

---

### 🔴 P1: bKash payment confirmed but driver never activated (stuck `callback_pending`)

**Symptoms:** `payment_events.status = 'callback_pending'` rows older than 10 minutes. Driver was charged but has no active subscription.

**Immediate mitigation:**
1. Query stuck events: `SELECT * FROM payment_events WHERE status = 'callback_pending' AND initiated_at < now() - interval '10 min'`.
2. For each: manually call `bKash.queryPayment(provider_txn_id)` to confirm payment.
3. If confirmed paid: use the admin recovery endpoint `POST /api/admin/payment-event/:id/recover` — this calls `activateSubscription()` safely. If the endpoint is unavailable, run the activation SQL manually in a transaction: (0) `UPDATE payment_events SET status='paid', confirmed_at=now() WHERE id=:payment_event_id` then INSERT subscriptions + INSERT call_ledger initial_load.
4. Push notification to affected driver: "Your package is now active. Sorry for the delay."

**Root causes to check:**
- `compensationWorker` not running (check utils-server logs for `[compensation]` entries)
- DB write failure during callback (check server error logs around callback timestamp)
- bKash callback URL misconfigured (check `BKASH_CALLBACK_URL` env var points to correct production URL)

---

### 🔴 P2: HMAC phone auth broken for all users (startVerification returning 401 or 500)

**Symptoms:** No users can log in. `startVerification` Cloud Function returning errors.

**Immediate mitigation:**
1. Check Firebase Functions logs: `firebase functions:log --project ride-bd --limit 50`
2. If `hmac.secret` is missing from config: `firebase functions:config:get` → if empty, re-set: `firebase functions:config:set hmac.secret="..."` → `firebase deploy --only functions`
3. If timestamp validation is failing: check that client devices have correct time (NTP sync issue). This is rare but possible.

**Root causes to check:**
- Functions config cleared by accident (common after Functions re-deploy without config backup)
- HMAC secret rotated on Functions but not updated in client (client uses HMAC-signed requests — if signing method changed, all requests fail)
- Firebase Functions cold start taking > 5s causing client timeout (check Function execution time metrics)

---

### 🔴 P2: WebSocket server not receiving driver connections (no dispatch happening)

**Symptoms:** Drivers go online (toggle) but no ride offers arrive. `utils-server` logs show 0 connected drivers.

**Immediate mitigation:**
1. Check utils-server health: `wscat -c wss://ws.ride.bd` — if connection refused, server is down.
2. Restart utils-server: `railway restart --service utils-server` (or equivalent).
3. If restart fails: check `FIREBASE_PRIVATE_KEY` env var in utils-server — newlines in private key must be literal `\n` not escaped.

**Root causes to check:**
- utils-server OOM crash (H3 index growing unbounded — check memory usage)
- `WEBSOCKET_PORT` mismatch between load balancer and server
- `WEBSOCKET_INTERNAL_SECRET` mismatch between Expo API and utils-server (new ride notifications silently rejected)

---

### 🟡 P3: SMS receiver not auto-detecting OTP on specific Android OEMs

**Symptoms:** Users on Samsung/Xiaomi/Oppo devices cannot auto-verify; must use manual entry.

**Immediate mitigation:** None needed — manual OTP entry fallback is already built into the OTP polling screen (triggers after 20s).

**Long-term fix:**
- Identify affected OEM via user reports. Add OEM to the "known battery-optimisation offenders" list in 18-KNOWN-ISSUES.md.
- Consider: prompt those OEMs' users immediately to disable battery optimisation at first launch (add OEM detection + targeted prompt in `app/(auth)/phone-entry.tsx`).

---

### 🟡 P3: Pro-rata credit job not running (subscriptions expiring without credit)

**Symptoms:** Drivers complain credits not received when subscription expired with < 50% utilisation.

**Immediate mitigation:**
1. Check `utils-server/scheduler.ts` logs for `[pro-rata]` entries around expiry timestamps.
2. Manually run the check for affected subscriptions: `node scripts/check-temporary-expiry.js --mode pro-rata --date YYYY-MM-DD`.
3. Manually INSERT credit rows in `call_ledger` for confirmed cases.

**Root causes to check:**
- Scheduler cron not running after utils-server restart (verify cron initialises on startup in `scheduler.ts`)
- Platform-shortage detection logic too strict (driver marked "offline" when actually online due to heartbeat gap)

---

### 🟡 P3: Vehicle type cooling-off scheduler not applying changes

**Symptoms:** Drivers report vehicle type change was approved but never took effect after 7-day cooling-off. `vehicle_type_changes` rows stuck in `status='cooling_off'` past `effective_at`.

**Immediate mitigation:**
1. Check `utils-server/scheduler.ts` logs for `[cooling-off]` entries.
2. Query stuck rows: `SELECT * FROM vehicle_type_changes WHERE status='cooling_off' AND effective_at < now()`.
3. For each: manually apply the change (UPDATE `drivers.vehicle_type`, `vehicles.vehicle_type`), set `vehicle_type_changes.status='approved'` (the final state after cooling-off — NOT 'applied', which does not exist in the enum).

**Root causes to check:**
- Scheduler cron for cooling-off sweep not running (verify in `scheduler.ts` startup)
- utils-server restarted and in-memory timers lost

---

### 🟡 P3: All ride requests returning `no_drivers` (alternatives flow triggering excessively)

**Symptoms:** `ride:alternatives` events exceeding 30% of all ride requests. Riders seeing alternative vehicle type suggestions for most requests. `rides.status='no_drivers'` rate is high.

**Immediate mitigation:**
1. Check driver online count per vehicle type: `SELECT vehicle_type, count(*) FROM drivers WHERE is_online=true GROUP BY vehicle_type`.
2. If a specific type has 0 online drivers, check if drivers of that type were incorrectly downgraded (query `vehicle_type_changes` for recent admin downgrades).
3. If `min_per_km_bdt` filtering is too aggressive: `SELECT count(*) FROM drivers WHERE min_per_km_bdt IS NOT NULL AND min_per_km_bdt > 0`. If most drivers set high minimums, consider temporarily resetting via admin action.

**Root causes to check:**
- Insufficient driver coverage for specific vehicle types (supply problem, not technical)
- `min_per_km_bdt` values set too high by drivers, filtering out too many offers
- Dispatch H3 index stale (utils-server not updating driver positions)

---

## Common failure modes (quick reference)

| Symptom | Likely cause | First action |
|---------|-------------|-------------|
| API 500s spiking | Bad deploy or slow DB query | Check recent deploy; check Neon slow query log |
| HMAC auth returning 401 for all users | Functions config cleared | `firebase functions:config:get` → re-set `hmac.secret` |
| bKash callback 404 | Wrong callback URL | Check `BKASH_CALLBACK_URL` in production env |
| No drivers receiving offers | utils-server down or WebSocket secret mismatch | Restart utils-server; check `WEBSOCKET_INTERNAL_SECRET` |
| Calls deducted with no ride | Double-deduction race | Pause dispatch; inspect `call_ledger`; add compensating refunds |
| payment_events stuck in `callback_pending` | `compensationWorker` not running | Check utils-server logs; manually trigger activation for stuck rows |
| Admin queue not loading | Firebase presigned URL expired | Reload page; presigned URLs are time-limited (15 min) |
| Vehicle type changes stuck in `cooling_off` | Cooling-off scheduler not running | Check scheduler logs; manually apply stale `vehicle_type_changes` rows |
| All rides returning `no_drivers` | No online drivers for requested type, or min_per_km filtering too aggressive | Check driver online count per type; check min_per_km_bdt values |
| `ride:alternatives` events > 30% | Insufficient driver coverage for requested types | Check driver supply per type; consider pricing adjustments |

---

## Incident report format

Write one within 24 hours for every P1 or P2. File in `docs/incidents/YYYY-MM-DD-short-title.md`.

```markdown
## Incident: [Short title] — YYYY-MM-DD
**Severity:** P1 / P2 / P3
**Duration:** HH:MM – HH:MM BDT
**Impact:** How many drivers/riders affected and how.
**Root cause:** What actually went wrong (be specific — code path, env var, race condition).
**Timeline:**
- HH:MM BDT — [what was observed]
- HH:MM BDT — [what was checked / action taken]
- HH:MM BDT — [resolution]
**Fix applied:** Exact change made (code, config, migration).
**Prevention:** What will prevent recurrence (test, alert, constraint, process change).
**Follow-up tasks:** Link to issue tracker items.
```
