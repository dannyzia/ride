<!--
AI INSTRUCTIONS
===============
These are ALL environment variables for the Ride project — Expo app and utils-server.
Never hardcode any of these. Never put a secret in an EXPO_PUBLIC_ variable.
Secrets: bKash credentials, Nagad credentials, Supabase service role key → server-side only.
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
| `BKASH_APP_KEY` | yes | — | bKash Merchant API app key | bKash developer portal |
| `BKASH_APP_SECRET` | yes | — | bKash Merchant API app secret | bKash developer portal |
| `BKASH_USERNAME` | yes | — | bKash merchant username | bKash developer portal |
| `BKASH_PASSWORD` | yes | — | bKash merchant password | bKash developer portal |
| `BKASH_BASE_URL` | yes | `https://tokenized.sandbox.bka.sh` | bKash API base URL | Sandbox: use default; Prod: `https://tokenized.pay.bka.sh` |
| `BKASH_CALLBACK_URL` | yes | — | Full URL for bKash payment callback (public) | Your deployed API URL + `/api/payment/bkash/callback` |
| `NAGAD_MERCHANT_ID` | yes | — | Nagad merchant ID | Nagad developer portal |
| `NAGAD_MERCHANT_PRIVATE_KEY` | yes | — | Nagad merchant RSA private key (PEM, base64) | Nagad developer portal |
| `NAGAD_MERCHANT_PUBLIC_KEY` | yes | — | Nagad public key for response verification | Nagad developer portal |
| `NAGAD_BASE_URL` | yes | `https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0` | Nagad API base URL | Prod: `https://api.mynagad.com/remote-payment-gateway-1.0` |
| `NAGAD_CALLBACK_URL` | yes | — | Full URL for Nagad payment callback | Your deployed API URL + `/api/payment/nagad/callback` |
| `PORTPOS_APP_KEY` | yes | — | PortPos merchant app key | PortPos panel → Generate App Key |
| `PORTPOS_SECRET_KEY` | yes | — | PortPos merchant secret key for auth token generation | PortPos panel → Generate Secret Key |
| `PORTPOS_BASE_URL` | yes | `https://api-sandbox.portpos.com` | PortPos API base URL | Prod: `https://api.portpos.com` |
| `GOOGLE_MAPS_SERVER_API_KEY` | yes | — | Google Maps server-side API key for Directions API (fare distance) and Distance Matrix API (ETA). Never exposed to client. Separate from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. | Google Cloud console → APIs & Services → Credentials → Create server key |
| `WEBSOCKET_SERVER_INTERNAL_URL` | no | `http://localhost:3001` | Internal URL for Expo API routes to notify utils-server of new rides | utils-server host + port |
| `WEBSOCKET_INTERNAL_SECRET` | yes | — | Shared secret for Expo API → utils-server internal calls | `openssl rand -hex 32` |
| `LOG_LEVEL` | no | `info` | Logging verbosity: `debug` / `info` / `warn` / `error` | — |
| `SEED_ADMIN_PHONE` | no | — | Phone number to seed as admin user (local dev only) | Set any +880 number for local testing |
| `RIDER_RATE_LIMIT_PER_HOUR` | no | `5` | Max successful ride requests per rider per rolling 60 minutes. Default: 5. Runtime values may come from DB config tables. | — |
| `MAX_ACTIVE_RIDES_PER_RIDER` | no | `1` | Max concurrent rides in non-terminal status per rider. Default: 1. Runtime values may come from DB config tables. | — |

---

## Expo app — client-exposed variables (bundled into app, no secrets)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EXPO_PUBLIC_SERVER_URL` | yes | — | Base URL of Expo API server (for client HTTP calls) |
| `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL` | yes | — | WebSocket server URL for driver/rider connections |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | — | Supabase project URL (same as server-side) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | — | Supabase anonymous key (public, safe to expose — enforces RLS if enabled) |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | yes | — | Google Maps API key (for react-native-maps) — restrict to Android app package in Google Cloud console. Client-side only: used for map tiles and Places Autocomplete. |
| `EXPO_PUBLIC_SUPPORT_PHONE` | yes | — | Support phone number displayed on payment failure, suspension, and help screens (E.164 format). | Set a Bangladesh phone number |

---

## utils-server — WebSocket dispatch server (`utils-server/.env`)

| Variable | Required | Default | Description | How to get |
|----------|----------|---------|-------------|------------|
| `DATABASE_URL` | yes | — | Same Supabase PostgreSQL connection string (for call_ledger writes) | Same as Expo app (Supabase Dashboard → Settings → Database → URI) |
| `SUPABASE_URL` | yes | — | Supabase project URL | Same as Expo app |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | Supabase service role key | Same as Expo app |
| `WEBSOCKET_PORT` | no | `3001` | Port the WebSocket server listens on | — |
| `WEBSOCKET_INTERNAL_SECRET` | yes | — | Must match `WEBSOCKET_INTERNAL_SECRET` in Expo app | Same value as Expo app |
| `H3_RESOLUTION` | no | `9` | H3 cell resolution for driver indexing (9 = ~174m) | — |
| `H3_CACHE_TTL_SECONDS` | no | `30` | How often to refresh H3 driver index from DB. Default: 30. Runtime dispatch uses this value; can be overridden. | — |
| `CALL_DEDUCTION_WINDOW_MS` | no | `5000` | Milliseconds to wait for fetch:confirm before auto-refund. Default: 5000. Runtime dispatch uses this value; can be overridden. | — |
| `CALL_DEDUCTION_GRACE_MS` | no | `1000` | Extra milliseconds added to CALL_DEDUCTION_WINDOW_MS to account for network latency before rejecting a fetch:confirm. Server accepts fetch:confirm up to (sent_at + WINDOW + GRACE). | — |
| `BATCH_SIZE` | no | `5` | Number of drivers per dispatch batch. Default: 5. Runtime dispatch uses this value; can be overridden. | — |
| `DISPATCH_PAUSED` | no | `false` | Emergency kill switch. Set to 'true' to halt all new ride offer broadcasts. ⚠️ Startup fallback only. Changing this env var requires a restart. For runtime control without restart, use `POST /api/admin/dispatch-toggle` (writes to system_config table, takes effect within one dispatch cycle). | Set manually in emergency |
| `INSTANCE_COUNT` | yes | `1` | Must always be '1'. utils-server throws on startup if value is not '1'. Prevents accidental multi-replica deployments that cause split-brain dispatch. | Set in Railway/Fly.io config |
| `OFFER_COUNTDOWN_MS` | no | `15000` | Milliseconds driver has to accept/reject. Default: 15000. Runtime dispatch uses this value; can be overridden. | — |
| `MAX_DISPATCH_BATCHES` | no | `3` | Max driver batches before ride expires. Default: 3. Runtime dispatch uses this value; can be overridden. | — |
| `RATE_LIMITS_CLEANUP_MINUTES` | no | `60` | How often to delete expired rate_limits rows from the database | — |
| `H3_MAX_RING_EXPANSION` | no | `2` | Max H3 ring expansion steps during dispatch | — |
| `LOG_LEVEL` | no | `info` | Logging verbosity | — |

---

## Per-environment values

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `DATABASE_URL` | Supabase local project | Supabase staging project | Supabase production project (ap-southeast-1) |
| `SUPABASE_URL` | `http://localhost:54321` | `https://xxx-staging.supabase.co` | `https://xxx.supabase.co` |
| `BKASH_BASE_URL` | `https://tokenized.sandbox.bka.sh` | `https://tokenized.sandbox.bka.sh` | `https://tokenized.pay.bka.sh` |
| `NAGAD_BASE_URL` | sandbox URL | sandbox URL | production URL |
| `PORTPOS_BASE_URL` | `https://api-sandbox.portpos.com` | `https://api-sandbox.portpos.com` | `https://api.portpos.com` |
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
