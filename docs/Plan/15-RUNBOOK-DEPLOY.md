<!--
AI INSTRUCTIONS
===============
This runbook covers deployment of two separate components: Expo app (EAS build), utils-server (Node.js process).
GlideX had a simpler single-component deploy. Ride has two separate deploy targets.
Execute steps in order. Do not skip any pre-deploy checklist item.
Human must authorize production deploys — AI runs the steps.
-->

# Deployment Runbook: Ride

> Two separate components to deploy: **Expo app (EAS)**, **utils-server (Node.js)**.
> Each has its own deploy process. Order matters — see dependency notes per environment.

---

## Environments

| Name | Expo app | utils-server | Branch | Auto-deploy |
|------|----------|-------------|--------|-------------|
| local | `npx expo start` | `npm run dev` in `utils-server/` | any | — |
| staging | EAS `preview` profile | Railway/Fly.io staging service | develop | on merge |
| production | EAS `production` profile | Railway/Fly.io production service | main | **NO — manual only** |

---

## Staging deploy
Automatic on merge to `develop`:
1. EAS build triggers via CI → distributes to internal testers via Expo Go or internal APK.
2. utils-server Railway service auto-deploys from `develop`.

Verify staging: call `GET https://staging-api.ride.bd/api/ping` → `{"status":"ok"}`.

---

## Production deploy

### Deploy order (dependency-aware)
```
1. DB migrations              ← run BEFORE utils-server starts
2. utils-server               ← depends on DB schema being current
3. EAS build + submit         ← new app build referencing new API
```

> **Why this order:** DB migrations run first so the schema is ready before the updated utils-server starts. utils-server then comes up against the new schema. EAS build ships last so the app references a fully updated API. If EAS build ships before the API is ready, users get errors.

---

### Pre-deploy checklist
All items must be checked before starting. If any fail: **stop and fix first**.

- [ ] All CI tests pass on the commit being deployed (`develop` → `main` PR is green)
- [ ] Staging has been smoke-tested with the exact EAS build being promoted
- [ ] All Drizzle migrations are backward-compatible (old utils-server can run against new schema)
- [ ] `BKASH_BASE_URL` is set to production URL (not sandbox) in production env
- [ ] `NAGAD_BASE_URL` is set to production URL in production env
- [ ] `BKASH_CALLBACK_URL` and `NAGAD_CALLBACK_URL` point to production API URLs
- [ ] `WEBSOCKET_INTERNAL_SECRET` matches between Expo API server and utils-server in production
- [ ] No Drizzle schema changes require a breaking migration (i.e., no column drops without prior deprecation)
- [ ] If any migration drops+recreates the pricing table, re-run `seed-pricing.js` before starting utils-server

---

### Step 1: Run DB migrations

```bash
# Run against production Supabase PostgreSQL
DATABASE_URL="<production-url>" npx drizzle-kit migrate

# Seed system_config table with initial values
DATABASE_URL="<production-url>" node scripts/seed-system-config.js

# Seed pricing table with initial vehicle type fare values (8 rows)
DATABASE_URL="<production-url>" node scripts/seed-pricing.js

# Seed packages table with micro-trial and starter packages
DATABASE_URL="<production-url>" node scripts/seed-packages.js

# Seed platform config with default operational parameters
DATABASE_URL="<production-url>" node scripts/seed-platform-config.js
```

> Never run `drizzle-kit push` in production — only `migrate` (uses generated migration files).
> **All seed values above are admin-configurable at runtime** — pricing fares via `POST /api/admin/pricing`, platform_config via `PATCH /api/admin/config`, packages via admin panel, system_config via admin config endpoint. These are production defaults only.

Monitor Supabase dashboard for any lock waits or migration timeouts. If migration hangs > 30s (configurable timeout): investigate before continuing.

---

### Step 2: Deploy utils-server

```bash
# Railway (or equivalent PaaS):
railway up --service utils-server --environment production

# Or if using Docker:
docker build -t ride-utils-server ./utils-server
docker push registry.example.com/ride-utils-server:latest
# Deploy via your PaaS dashboard
```

Verify: WebSocket server health: `wscat -c wss://ws.ride.bd` → connection accepted without error.

**Health check endpoint (utils-server):**
`curl https://ws.ride.bd/health` → `200 {"status":"ok","drivers_connected":42,"h3_index_age_ms":5000}`

Configure Railway/Fly.io: HTTP health check at the configurable interval (default: every 10s), restart on configurable consecutive failure count (default: 3).

---

### Step 3: Build and submit Expo app (Android)

```bash
# Build
eas build --platform android --profile production

# Submit to Google Play internal testing
eas submit --platform android --latest
```

Google Play internal testing → staged rollout → full rollout (manual per release policy).

> Note: App updates propagate to users gradually via Play Store. Old app versions will continue hitting the production API — ensure API changes are backward-compatible for at least one prior app version.

**Post-build actions:** After EAS build submits, update `system_config`:
```bash
# Set the APK download URL (from EAS build output or Google Play)
curl -X POST https://api.ride.bd/api/admin/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "apk_download_url", "value": "https://..."}'

# Update the latest version string
curl -X POST https://api.ride.bd/api/admin/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "latest_version", "value": "x.y.z"}'
```

---

### Post-deploy verification

```bash
# 1. API health
curl https://api.ride.bd/api/ping  # → {"status":"ok"}

# 2. WebSocket health
wscat -c wss://ws.ride.bd  # → connection accepted
```

Smoke test (manual — requires test accounts):
1. Log in as driver → verify phone auth completes (Supabase OTP flow works in production)
2. Driver purchases a micro-trial package → verify bKash WebView opens, payment completes, subscription activates
3. Rider makes a ride request → verify dispatch broadcast reaches online driver
4. Accept ride → verify `rides.status = 'matched'`, call deducted
5. Verify pricing rows: `SELECT count(*) FROM pricing WHERE is_active=true` → should return 8 (one per vehicle type)

---

### Rollback procedure

| Component | Rollback method |
|-----------|-----------------|
| Expo app | Play Store → Releases → Roll back to previous release |
| utils-server | PaaS dashboard → redeploy previous deployment |
| DB migration | **No automatic rollback.** Write a compensating migration. Alert team. Document in 16-INCIDENT-RESPONSE.md. |

---

### Post-deploy monitoring window
Monitor for the configurable post-deploy window (default: 30 minutes):

- [ ] API error rate < 2% (see 17-MONITORING.md)
- [ ] Call deduction error rate = 0% (check `call_ledger` for anomalous events)
- [ ] bKash/Nagad callback processing: check `payment_events` for stuck `callback_pending` status
- [ ] WebSocket connection count (utils-server logs) ≥ baseline for time of day
- [ ] No P1/P2 alerts in monitoring channel
- [ ] utils-server health check responding: `GET /health` returns 200
- [ ] `system_config` table has initial rows: `dispatch_paused=false`, `min_app_version=1.0.0`, `brta_fare_ceiling_bdt` set

---

## Infrastructure Constraints

### utils-server single-instance constraint (HARD)
utils-server MUST run as exactly 1 replica in production at all times. Two concurrent instances will cause split-brain dispatch: same ride offered to different drivers by different instances, with 50% offer loss and potential for duplicate `dispatch_offers` inserts.

**Enforcement:**
- Railway: set `replicas = 1` in `railway.json`. Confirm this is NOT overridden by auto-scaling rules.
- utils-server startup check validates `INSTANCE_COUNT` env var is `'1'`; throws if not.
- Pre-deploy checklist includes confirming Railway reports exactly 1 running replica.
- Migration path to multi-instance: Redis shared state for `connectedDrivers` + `offerLocks`. Track in 18-KNOWN-ISSUES.md TD-11.

---

## Disaster Recovery

### PostgreSQL (Supabase) backup and restore
**RPO target:** < 1 hour. **RTO target:** < 4 hours.

- **Point-in-time recovery (PITR):** Supabase provides automatic daily backups on Pro plan. PITR available on Pro and above. Free tier has daily snapshots.
- **Daily logical backup:** Configure `pg_dump` via a scheduled GitHub Action or cron job, writing to S3 (ap-southeast-1 or BD-hosted). Retain backups for the configurable retention period (default: 30 days).
- **Data localisation:** Backup destination S3 bucket must be in Bangladesh or ap-southeast-1 per PRD req 43.
- **Restore procedure:**
  1. Go to Supabase Dashboard → Database → Backups.
  2. Select the desired backup or point in time for restore.
  3. Supabase restores the database. Update `DATABASE_URL` in all services if the connection string changes.
  4. Run `npx drizzle-kit migrate` to confirm schema is current.
  5. Verify data integrity: row counts on `call_ledger`, `payment_events`, `subscriptions`.
  6. Re-deploy services if connection string changed.

---

## Canary Deploy Strategy (utils-server)
For utils-server deploys that touch call deduction logic or dispatch:
1. Deploy new version to a staging environment with a copy of production DB schema.
2. Run a configurable number of simulated dispatch cycles (default: 10) and verify `call_ledger` entries are correct.
3. Deploy to production only after step 2 passes.
4. Monitor `callback_processing_failures_total` and call deduction ratio for 30 minutes post-deploy.
5. If either metric degrades: rollback immediately via PaaS dashboard.
