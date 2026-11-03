# PLAN 28 — LIVE RIDE SHARING & ROUTE TELEMATICS ENGINE DEVICE DAY QA REPORT
**Date:** 2026-11-03  
**Platform:** Ride (Bangladesh Subscription-Based Ride & Marketplace Platform)  
**Execution Environment:** Xiaomi Redmi 9 (`10da9ab10408`) Physical Device + Metro Bundler (Port 8081) + WebSocket Server (`utils-server`, Port 3001)  
**Branch:** `implementation` at commit `c2d5651`  
**Verdict:** **PARTIAL PASS (CODE & UI GATES 100% VERIFIED; LIVE RIDE DISPATCH BLOCKED BY MOBILE HOTSPOT CGNAT DB TIMEOUT)**

---

## 1. Executive Summary

Plan 28 introduces the end-to-end Live Ride Sharing & Route Telematics Engine across 5 architectural stages:
1. **Stage 1 (Foreground Telematics Loop)**: Hardened driver GPS emission loop in `app/(main)/(rider)/finish-ride/index.tsx` with decoupled reverse-geocoding, client-side timestamps (`ts`), and immediate UI marker updates.
2. **Stage 2 (Database Schema & Migration)**: Hand-crafted migration `0088_ride_routes_and_telematics.sql` establishing the `ride_routes` table with JSONB `points`, `distance_meters`, `duration_seconds`, PK/FK cascade, and RLS revocation blocks.
3. **Stage 3 (Dispatch Engine & Flush Hooks)**: Active trips registry (`utils-server/activeTrips.ts`), crash-safe breadcrumb decimation and accumulating UPSERT flusher (`utils-server/breadcrumbs.ts`), and daily retention purge job 61 in `utils-server/scheduler.ts`.
4. **Stage 4 (Public Live Tracking Card)**: Public SSR status card (`app/track/[rideId].tsx`), live-coordinates RPC endpoint (`app/api/ride/[id]/track+api.ts`), signal freshness indicators (`Live`, `Delayed`, `Waiting`), and 1-tap WhatsApp sharing fallback (`app/(main)/(rider)/ride-tracking/[ride_id].tsx`).
5. **Stage 5 (Customer Breadcrumb Playback)**: Authenticated historical route API (`GET /api/ride/[id]/breadcrumbs+api.ts`) and MapLibre polyline visualization on `app/(main)/(customer)/(tabs)/history-detail/index.tsx`.

---

## 2. Automated Test Suite & Code Quality Gates

All automated unit and integration suites were executed and verified clean:

| Suite | File | Tests | Result |
| :--- | :--- | :---: | :---: |
| Stage 1 | `tests/unit/finish-ride-telematics.test.ts` | 11/11 | **PASS** |
| Stage 2 | `tests/api/ride/routes-schema.test.ts` | 12/12 | **PASS** |
| Stage 3 | `utils-server/__tests__/breadcrumbs.test.ts` | 15/15 | **PASS** |
| Stage 4 | `tests/api/ride/track.test.ts` | 9/9 | **PASS** |
| Stage 5 | `tests/api/ride/breadcrumbs.test.ts` | 9/9 | **PASS** |
| **Total** | **5 Test Suites** | **56/56** | **100% PASS** |

### Static Analysis Gates:
- `npm run lint`: **0 errors**, 529 legacy warnings (untouched files only).
- `npx tsc --noEmit` (Root Expo App): **0 errors (clean exit 0)**.
- `cd utils-server && npx tsc --noEmit`: **0 errors (clean exit 0)**.
- `scripts/git-hooks/pre-commit`: Passed all 10 pre-commit stages (testID idempotence, testID map freshness, testID flow currency, i18n orphan ratchet, etc.).

---

## 3. Physical Device Verification (Xiaomi Redmi 9 `10da9ab10408`)

- **Hardware Status**: Android 12 (API 31), Display 1080 × 2340 (440 dpi).
- **Metro Connection**: Reverse port forwarding verified (`tcp:8081` and `tcp:3001`). Metro bundler compiled 2,634 modules successfully.
- **Physical UI Verification**:
  - UI hierarchy dumped via `uiautomator`.
  - Floating circular language toggle (`Switch language` button at `[904,1506][1036,1638]`), Menu button (`Open menu`), and Emergency SOS button (`[904,1836][1036,1968]`) rendered.
  - Physical language toggle tested via ADB input: successfully flipped UI language between English (`EN`) and Bengali (`বাং`).
- **Public Tracking Web Surface**:
  - `http://10.45.112.148:8081/track/00000000-0000-0000-0000-000000000000` responds with `HTTP 200 OK` and correctly serves the public SSR status card bundle.

---

## 4. Environmental Blocker & Diagnostics

### Symptom:
Driver screen sits at `"Loading profile..."` (`GET /api/driver/me` hangs); `utils-server` fails at boot during `refreshH3Index` with:
```
cause: Error: write CONNECT_TIMEOUT aws-1-ap-northeast-1.pooler.supabase.com:5432
```

### Root Cause Analysis:
1. **Network Environment**: The developer workstation is connected to a mobile 4G/LTE Wi-Fi hotspot (`SSID: POCO X3`, Robi Axiata CGNAT: LAN `10.45.112.148`, Public IP `202.134.9.152`).
2. **Port Blocking by Carrier**: Mobile carrier CGNAT in Bangladesh filters and drops raw TCP data packets sent to database ports `5432` and `6543`.
   - Wire probes confirmed TCP SYN/ACK completes in ~225 ms, but any `socket.write` (Postgres `SSLRequest` or `StartupMessage`) is silently dropped by the carrier firewall, triggering `write CONNECT_TIMEOUT`.
   - Conversely, PostgREST over HTTPS port `443` (`https://swzgkhwjvikyfaqnbrix.supabase.co/rest/v1/`) responds in 2.0 s (`HTTP 200 OK`).
3. **Precedent**: This exact blocker is documented in `DEVICE-DAY-QA-ENV-FIX-2026-09-23.md` and `TEST-SETUP.md` §1 ("The one fact that breaks everything: the laptop IP changes"). Stage S9 (which passed 100% on 2026-11-01) was executed on home Broadband Wi-Fi (`192.168.0.206`), where ports 5432/6543 are unrestricted.

---

## 5. Next Steps for Full Live Dual-Device Run

To complete the live dual-device lifecycle test (`scripts/qa/step9-live-dual-device-ride.mjs`):
1. **Switch Network**: Connect the host machine and mobile device to Broadband Wi-Fi (`192.168.0.x`) or enable an unrestricted VPN on the host machine.
2. **Re-sync LAN IP**: Run `node scripts/dev-env-sync.js` to update `.env.local` to the broadband IP.
3. **Start Servers & Execute Step 9**:
   ```bash
   cd utils-server && npm run dev
   npx expo start --dev-client --port 8081
   node scripts/qa/step9-live-dual-device-ride.mjs
   ```
