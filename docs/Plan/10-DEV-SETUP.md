<!--
AI INSTRUCTIONS
===============
This is the complete local dev setup for Ride, based on GlideX modified.
Execute steps in order. Do not skip.
Read: 11-ENV-VARS.md for all variable values.
Read: 03-TECH-STACK.md for exact package versions.
This is an executable guide — no `<!-- AI: fill -->` placeholders remain.
-->

# Local Dev Setup: Ride
> Modifying GlideX base. All steps assume you start from the Ride codebase at `D:\My Projects\Current Project\Ride`.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20.x LTS | https://nodejs.org |
| npm | 10.x (bundled with Node 20) | — |
| Expo CLI | latest | `npm install -g expo-cli` |
| EAS CLI | latest | `npm install -g eas-cli` |
| Supabase CLI | latest | `npm install -g supabase` |
| Android Studio | Hedgehog (2023.1.1) or later | https://developer.android.com/studio |
| Android SDK | API 33+ | Via Android Studio SDK Manager |
| Java (JDK) | 17 | https://adoptium.net |
| Git | any recent | — |

---

## Steps

### 1. Start from Ride

```bash
# The project is at:
# D:\My Projects\Current Project\Ride

# Work inside that directory.
cd "D:\My Projects\Current Project\Ride"
```

### 2. Remove packages that are being replaced

```bash
npm uninstall @clerk/clerk-expo @clerk/express stripe @stripe/stripe-react-native resend
```

Verify: `package.json` must contain none of: `@clerk/*`, `stripe`, `@stripe/*`, `resend`.

### 3. Install new packages — Expo app

```bash
npm install h3-js@^4.1.0 @react-native-community/netinfo@^11.3.1 react-native-otp-verify@^1.x zod@^3.23.8 @supabase/supabase-js@^2.45.0
```

`react-native-webview`, `zustand` are already in GlideX — do not reinstall. `firebase` is removed — replaced by `@supabase/supabase-js`.

### 4. Install new packages — utils-server

```bash
cd utils-server
npm install ws@^8.18.0 h3-js@^4.1.0 @supabase/supabase-js@^2.45.0 drizzle-orm@^0.42.0
# @neondatabase/serverless already present — do not reinstall
cd ..
```

### 5. Set up Supabase project

#### 5a. Create Supabase project
- Go to https://supabase.com/dashboard
- Create a new project named `ride-bd-dev`
- Region: **ap-southeast-1** (Singapore) — closest to Bangladesh
- Set a strong database password (save it — needed for connection string)

#### 5b. Configure dprelay as external SMS provider
- In Supabase Dashboard → Authentication → Phone → Custom SMS Provider
- Set dprelay API endpoint and API key
- This enables Supabase Auth to send OTP SMS via dprelay for phone verification

#### 5c. Get connection string
- Supabase Dashboard → Settings → Database → Connection string → URI
- Copy to `DATABASE_URL` in your `.env.local`
- This is the connection string Drizzle ORM uses to connect to PostgreSQL

#### 5d. Get API keys
- Supabase Dashboard → Settings → API
- Copy `Project URL` → `SUPABASE_URL`
- Copy `anon public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never in client)

#### 5e. Install Supabase CLI for local dev (optional — for local Supabase instance)
```bash
supabase init
supabase start
```
This starts a local Supabase instance with PostgreSQL, Auth, and Storage for development.

### 6. Configure environment variables

```bash
# In project root (Expo app):
cp .env.example .env.local

# In utils-server/:
cp utils-server/.env.example utils-server/.env
```

Open `.env.local` and fill in required values (see `11-ENV-VARS.md` for full reference):

**Minimum to fill for local dev:**
- `EXPO_PUBLIC_SERVER_URL` — `http://localhost:8081` (Expo dev server)
- `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL` — `ws://localhost:3001`
- `EXPO_PUBLIC_SUPABASE_URL` — from Supabase Dashboard → Settings → API
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Dashboard → Settings → API
- `DATABASE_URL` — Supabase PostgreSQL connection string (from Step 5c)
- `SUPABASE_URL` — same as EXPO_PUBLIC_SUPABASE_URL
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Settings → API (server-side only)

**bKash sandbox (needed for payment testing):**
- Register at https://developer.bka.sh (sandbox access)
- `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`
- Set `BKASH_BASE_URL=https://tokenized.sandbox.bka.sh`

**Nagad sandbox:**
- Register at https://sandbox.mynagad.com
- `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_PRIVATE_KEY`, `NAGAD_MERCHANT_PUBLIC_KEY`
- Set `NAGAD_BASE_URL=https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0`

### 7. Run database migrations

> **⚠️ Warning:** `drizzle-kit push` is for local development ONLY. Use `drizzle-kit migrate` for staging and production.

```bash
# From project root
npx drizzle-kit push
```

This applies the full schema (GlideX base tables + all Ride additions from `src/db/schema.ts`).

Verify: connect to Supabase dashboard (Table Editor) or use `supabase db` commands to confirm tables exist: `users`, `drivers`, `rides`, `vehicles`, `packages`, `subscriptions`, `credit_vouchers`, `call_ledger`, `dispatch_offers`, `owner_consents`, `used_challenges`, `rate_limits`, `payment_events`, `documents`, `zones`, `chat_messages`, `pricing`, `driver_online_sessions`, `compensation_queue`, `system_config`, `platform_config`, `vehicle_type_changes`.

### 8. Start the WebSocket server (utils-server)

```bash
cd utils-server
npm run dev
```

Server starts at: `ws://localhost:3001`
Logs should show: `[dispatch] WebSocket server ready` and `[h3] index loaded (0 drivers)`.

### 9. Start the Expo dev server

```bash
# From project root
npx expo run:android
```

> **⚠️ Barikoi Maps requires `npx expo run:android` instead of Expo Go** because `@maplibre/maplibre-react-native` uses native code. See the Barikoi troubleshooting guide for details.

For Android physical device: ensure the device is on the same WiFi as your laptop, or use `npx expo start --tunnel`.

### 10. Seed admin user (required to test admin panel)

```bash
node scripts/seed-admin.js
```

This creates a user with `role='admin'` and the phone number defined in `SEED_ADMIN_PHONE` env var.
After running: log in via the app with that phone number to access admin routes.

### 11. Seed system configuration

```bash
node scripts/seed-system-config.js
```

Creates initial `system_config` rows (`dispatch_paused=false`, `min_app_version=1.0.0`, `brta_fare_ceiling_bdt`). These are default seed values; runtime values are admin-configurable via `PATCH /api/admin/config`.
Seeds operational config. Should run before first utils-server launch.

### 12. Seed platform configuration (required for dispatch and fare validation)

```bash
node scripts/seed-platform-config.js
```

Seeds the `platform_config` table with default values for `driver_min_ratio`, `driver_max_ratio`, and BRTA ceiling thresholds (`brta_max_base_bdt`, `brta_max_per_km_bdt`).
All values are admin-configurable at runtime via the admin panel.
Required before drivers can set their `min_per_km_bdt` rate.

### 13. Seed pricing data (required for fare calculation)

```bash
node scripts/seed-pricing.js
```

Inserts 8 pricing rows (one per vehicle type) into the `pricing` table with initial fare values.
All fare values (base_fare_bdt, per_km_bdt, per_min_bdt, etc.) are admin-configurable at runtime via the admin panel.
Required before any ride requests can calculate fares.

### 14. Seed packages data (required for driver subscription purchase)

```bash
node scripts/seed-packages.js
```

Inserts initial micro-trial and starter packages into the `packages` table.
All package attributes (daily_cap, call_count, duration_days, price_bdt) are admin-configurable at runtime via the admin panel.
Required before drivers can purchase subscriptions in the app.

## Verify setup

- [ ] Expo app loads on Android with no red-screen errors
- [ ] Health check passes: `curl http://localhost:8081/api/ping` → `{"status":"ok"}`
- [ ] WebSocket server responds: `wscat -c ws://localhost:3001` → connection established
- [ ] DB migration applied: 22 tables visible in Supabase dashboard (Table Editor) (users, drivers, rides, vehicles, packages, subscriptions, credit_vouchers, call_ledger, dispatch_offers, owner_consents, used_challenges, rate_limits, payment_events, documents, zones, chat_messages, pricing, driver_online_sessions, compensation_queue, system_config, platform_config, vehicle_type_changes)
  - Note: GlideX may have additional tables (e.g., legacy notification or ratings tables). The 22 listed tables are the Ride-specific ones. Total table count may be higher if GlideX base tables are retained.
- [ ] Admin user exists: can log in with seed phone number

---

## Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'h3-js'` | New packages not installed | Run `npm install` in project root |
| Android SMS receiver not triggering | OEM battery optimisation | Manually disable battery optimisation for the app in Android settings, OR use manual OTP entry fallback |
| `drizzle-kit push` fails with "column already exists" | GlideX schema partially applied | Run `npx drizzle-kit push --force` to overwrite the schema (dev only). If still failing, check for migration conflicts in `drizzle/` folder. As a last resort for dev: drop only the conflicting table via Neon console (not `drizzle-kit drop` which drops everything). |
| bKash callback not received locally | bKash cannot reach localhost | Use `ngrok http 8081` and set `BKASH_CALLBACK_URL` to the ngrok URL |
| WebSocket disconnects every 30s in dev | Expo dev server hot-reload interfering | Run utils-server with `--watch` off during WebSocket testing: `node utils-server/index.js` |
