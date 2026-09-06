<!--
AI INSTRUCTIONS
===============
These are ALL environment variables for the Ride project — Expo app and utils-server.
Never hardcode any of these. Never put a secret in an EXPO_PUBLIC_ variable.
Secrets: PortPos credentials, Supabase service role key → server-side only.
Generate .env.example from this table (blank all values; keep keys and comments).
Read: 03-TECH-STACK.md to understand which service each variable belongs to.
-->

# Environment Variables: Ride

## Rules
- `EXPO_PUBLIC_*` variables are bundled into the client app — **never** put secrets here.
- All payment credentials, the Supabase service role key → server-side only.
- Validate all required variables at app startup. Crash fast if missing — do not silently use undefined.
- `.env.local` (Expo app), `utils-server/.env` (WebSocket server).

---

## Expo app — server-side variables (API routes, Expo API handlers)

| Variable | Required | Default | Description | How to get |
|----------|----------|---------|-------------|------------|
| `DATABASE_URL` | yes | — | Supabase PostgreSQL connection string (pooled, from Supabase Dashboard → Settings → Database) | Supabase Dashboard → Settings → Database → Connection string → URI |
| `SUPABASE_URL` | yes | — | Supabase project URL (e.g. https://xxx.supabase.co) | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | Supabase service role key (server-side only, bypasses RLS) | Supabase Dashboard → Settings → API → service_role key |
| `PORTPOS_APP_KEY` | yes | — | PortPos merchant app key | PortPos panel → Generate App Key |
| `PORTPOS_SECRET_KEY` | yes | — | PortPos merchant secret key for auth token generation | PortPos panel → Generate Secret Key |
| `PORTPOS_BASE_URL` | yes | `https://api-sandbox.portpos.com` | PortPos API base URL | Prod: `https://api.portpos.com` |
| `PORTPOS_CALLBACK_URL` | yes | — | Full URL for PortPos payment callback (public). Validated by Zod schema but read from env at route-handler level. | Your deployed API URL + `/api/payment/portpos/callback` |
| `BARIKOI_API_KEY` | yes | — | Barikoi Maps API key. Used server-side for geocoding/routing (`lib/barikoi.ts` and `lib/routeSplit.ts`) and exposed to client via `app.config.js` → `extra.EXPO_PUBLIC_BARIKOI_API_KEY`. **Route API usage:** `lib/routeSplit.ts` calls `https://barikoi.xyz/v1/api/directions/v1/driving?geometries=polyline&overview=full` with this key to get road geometry for intercity route splitting. The encoded polyline response is decoded and processed with Turf.js. If this key is missing or the API is unreachable, `lib/routeSplit.ts` falls back to Haversine estimation with urban factors. | Barikoi developer portal |
| `GOOGLE_MAPS_SERVER_API_KEY` | no | `''` (empty → returns null) | Google Maps server-side API key for Directions API (fare distance) and Distance Matrix API (ETA). Never exposed to client. Fallback when Barikoi is unavailable. | Google Cloud console → APIs & Services → Credentials → Create server key |
| `UTILS_SERVER_PORT` | no | `"3001"` | Port for the WebSocket (utils) server. Expo API routes construct internal URLs using this port (`http://127.0.0.1:${UTILS_SERVER_PORT}/internal/...`). Replaces the former `WEBSOCKET_SERVER_INTERNAL_URL` and `WEBSOCKET_PORT` variables. | — |
| `WEBSOCKET_INTERNAL_SECRET` | yes | — | Shared secret for Expo API → utils-server internal calls. Min 32 characters (enforced by Zod). | `openssl rand -hex 32` |
| `LOG_LEVEL` | no | `info` | Logging verbosity: `debug` / `info` / `warn` / `error` | — |
| `SEED_ADMIN_PHONE` | no | — | Phone number to seed as admin user (local dev only) | Set any +880 number for local testing |
| `RIDER_RATE_LIMIT_PER_HOUR` | no | `5` | Max successful ride requests per rider per rolling 60 minutes. ⚠️ Currently hardcoded to `5` in `app/api/ride/request+api.ts` — env var not yet wired. | — |
| `MAX_ACTIVE_RIDES_PER_RIDER` | no | `1` | Max concurrent rides in non-terminal status per rider. ⚠️ Currently hardcoded to `1` in `app/api/ride/request+api.ts` — env var not yet wired. | — |

### Removed / inert variables

The following were replaced by PortPos (unified gateway) in Phase 5. Stub files remain for backward compatibility but all payment flows use PortPos. **Do not set these in production.**

| Variable | Status |
|----------|--------|
| `BKASH_APP_KEY` | **Inert** — `lib/bkash.ts` throws "use PortPos instead" |
| `BKASH_APP_SECRET` | **Inert** |
| `BKASH_USERNAME` | **Inert** |
| `BKASH_PASSWORD` | **Inert** |
| `BKASH_BASE_URL` | **Inert** |
| `BKASH_CALLBACK_URL` | **Inert** |
| `NAGAD_MERCHANT_ID` | **Inert** — `lib/nagad.ts` throws "use PortPos instead" |
| `NAGAD_MERCHANT_PRIVATE_KEY` | **Inert** |
| `NAGAD_MERCHANT_PUBLIC_KEY` | **Inert** |
| `NAGAD_BASE_URL` | **Inert** |
| `NAGAD_CALLBACK_URL` | **Inert** |
| `NAGAD_ENABLED` | **Inert** |

---

## Expo app — client-exposed variables (bundled into app, no secrets)

These are set via `app.config.js` → `extra` and read in client code via `Constants.expoConfig?.extra?.VAR_NAME`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXPO_PUBLIC_SERVER_URL` | yes | — | Base URL of Expo API server (for client HTTP calls) |
| `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL` | yes | — | WebSocket server URL for driver/rider connections |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | — | Supabase project URL (same as server-side). Falls back to `SUPABASE_URL` in `app.config.js`. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | — | Supabase anonymous key (public, safe to expose — enforces RLS if enabled) |
| `EXPO_PUBLIC_SUPPORT_PHONE` | no | — | Support phone number displayed on payment failure, suspension, and help screens (E.164 format) |
| `EXPO_PUBLIC_SENTRY_DSN` | no | `undefined` (Sentry disables itself) | Sentry error tracking DSN for crash reporting. If unset, Sentry init is skipped. |

### Client-exposed via `extra` (not `EXPO_PUBLIC_` prefix)

| `extra` key | Source env var | Description |
|-------------|---------------|-------------|
| `EXPO_PUBLIC_BARIKOI_API_KEY` | `BARIKOI_API_KEY` | Barikoi Maps API key for client-side map tiles, autocomplete, and geocoding. Note: `app.config.js` reads `process.env.BARIKOI_API_KEY` and exposes it as `extra.EXPO_PUBLIC_BARIKOI_API_KEY`. |

### Removed client variables

| Variable | Status |
|----------|--------|
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | **Removed** — project uses Barikoi/MapLibre (`@maplibre/maplibre-react-native`) for client-side maps, not Google Maps. |

---

## utils-server — WebSocket dispatch server (`utils-server/.env`)

Validated at startup by `validateUtilsServerEnv()` in `lib/env.ts`.

| Variable | Required | Default | Description | How to get |
|----------|----------|---------|-------------|------------|
| `DATABASE_URL` | yes | — | Same Supabase PostgreSQL connection string (for call_ledger writes) | Same as Expo app (Supabase Dashboard → Settings → Database → URI) |
| `SUPABASE_URL` | yes | — | Supabase project URL | Same as Expo app |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | Supabase service role key | Same as Expo app |
| `WEBSOCKET_INTERNAL_SECRET` | yes | — | Must match `WEBSOCKET_INTERNAL_SECRET` in Expo app | Same value as Expo app |
| `INSTANCE_COUNT` | yes | `"1"` | Must always be `"1"`. utils-server exits on startup if value is not `"1"`. Prevents accidental multi-replica deployments that cause split-brain dispatch. | Set in Render/Railway config |
| `UTILS_SERVER_PORT` | no | `"3001"` | Port the WebSocket server listens on. Must match `UTILS_SERVER_PORT` in Expo app. | — |
| `BARIKOI_API_KEY` | yes | — | Barikoi Maps API key (required for firm-quote routing in `barikoiRoute.ts`). | Barikoi developer portal |
| `H3_CACHE_TTL_SECONDS` | no | `"30"` | How often to refresh H3 driver index from DB (seconds) | — |
| `LOG_LEVEL` | no | `"info"` | Logging verbosity | — |

### Hardcoded tuning knobs (documented as env vars but not yet wired)

The following variables are documented as configurable but are currently **hardcoded** in source. They match the default values listed here. Wiring them to `process.env` is a pending TODO.

| Variable | Hardcoded value | File | Description |
|----------|----------------|------|-------------|
| `H3_RESOLUTION` | `9` | `lib/h3.ts` | H3 cell resolution for driver indexing (9 = ~174m) |
| `BATCH_SIZE` | `5` | `utils-server/index.ts` | Number of drivers per dispatch batch |
| `MAX_DISPATCH_BATCHES` | `3` | `utils-server/index.ts` | Max driver batches before ride expires |
| `H3_MAX_RING_EXPANSION` | `2` | `utils-server/dispatch.ts` | Max H3 ring expansion steps during dispatch |
| `OFFER_COUNTDOWN_MS` | — | — | Milliseconds driver has to accept/reject. ⚠️ Unimplemented. |
| `CALL_DEDUCTION_WINDOW_MS` | — | — | Milliseconds to wait for fetch:confirm before auto-refund. ⚠️ Unimplemented. |
| `CALL_DEDUCTION_GRACE_MS` | — | — | Extra ms added to deduction window for network latency. ⚠️ Unimplemented. |
| `RATE_LIMITS_CLEANUP_MINUTES` | — | — | How often to delete expired rate_limits rows. ⚠️ Unimplemented. |

### Dispatch pause (DB-only, no env fallback)

`DISPATCH_PAUSED` is documented as an env var startup fallback but the implementation only reads from the `system_config` table via `isDispatchPaused()` in `utils-server/dispatch.ts`. For runtime control, use `POST /api/admin/dispatch-toggle`.

### Marketplace bidding window (DB-only, no env fallback)

`food_delivery_bidding_window_seconds` — shop→delivery bridge bidding window in seconds. Default `600` (10 minutes). Read fresh from `platform_config` by `lib/shopDeliveryBridge.ts` via `getConfigInt` on every delivery-request creation; override at runtime via the admin config dashboard (`PATCH /api/admin/config`), no restart needed.

---

## Scripts — seed and utility variables (`scripts/`)

These are only needed when running seed scripts locally. Do not set in production.

| Variable | Required | Script | Description |
|----------|----------|--------|-------------|
| `SUPABASE_PAT` | yes (seed-admin only) | `scripts/seed-admin.js` | Supabase Personal Access Token for admin user management API |
| `SEED_ADMIN_PHONE` | yes (seed-admin only) | `scripts/seed-admin.js` | Phone number to create as admin user (+880 format) |
| `ACTIVE_ZONE_ID` | yes (seed-pricing only) | `scripts/seed-pricing.js` | UUID of the zone to seed pricing rows for |

---

## Build-time variables

| Variable | Set by | Description |
|----------|--------|-------------|
| `EXPO_TARGET` | `babel.config.js` | Set to `"web"` to enable web-specific Babel transforms. Defaults to undefined (native). |
| `EAS_BUILD_PROFILE` | EAS Build | Automatically set by EAS. Value: `development` or `production`. |

---

## Per-environment values

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `DATABASE_URL` | Supabase local project | Supabase staging project | Supabase production project (ap-southeast-1) |
| `SUPABASE_URL` | `http://localhost:54321` | `https://xxx-staging.supabase.co` | `https://xxx.supabase.co` |
| `PORTPOS_BASE_URL` | `https://api-sandbox.portpos.com` | `https://api-sandbox.portpos.com` | `https://api.portpos.com` |
| `UTILS_SERVER_PORT` | `3001` | `3001` | `3001` |
| `EXPO_PUBLIC_SERVER_URL` | `http://localhost:8081` | staging server URL | production URL |
| `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL` | `ws://localhost:3001` | staging WS URL | production WS URL |
| `LOG_LEVEL` | `debug` | `info` | `warn` |

---

## .env.example generation

Run to generate (blank all secrets, keep structure):
```bash
node scripts/generate-env-example.js
# Outputs: .env.example and utils-server/.env.example
```

Every key in this document must appear in `.env.example` with an empty or safe default value.
