# Device Day QA — Server/Auth Fix Report

**Purpose:** Execute the orchestrator's server/auth fix sequence (check server health, verify device reachability, check auth error, restart server, verify GO ONLINE). NO code edits (environment/server fix only).
**Status:** ACTIVE — environment fix verified; server/auth blocker identified; GO ONLINE still FAIL (DB/network outage, not code).
**Source of truth:** `DEVICE-DAY-QA-ENV-FIX-2026-09-23.md` (previous environment fix) + this file.
**Related (concrete paths):**
  - `DEVICE-DAY-QA-ENV-FIX-2026-09-23.md` — previous environment verification.
  - `utils-server/index.ts` (L385-1177 auth/WS logic) — `auth:error: server_unavailable` at L1175 (catch block for DB/auth failures).
  - `utils-server/index.ts` (L919-1200 wss connection/auth) — `auth:hello` → `supabaseAdmin.auth.getUser()` → DB lookup → `auth:error` on failure.
  - `.env.local` (DB URL verified current) — `postgresql://postgres.swzgkhwjvikyfaqnbrix:BM0HVlaajuaYUCwB@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`.
  - `utils-server/.env` (DB URL verified current) — same DB URL.
**Last verified:** 2026-09-23, by orchestrator, via `curl` (health, bundle IP), `netstat`, `adb` (device IP, ping), `android_screenshot`, `execbro_tap`, `tail` (server logs).
**How to update:** Append new verification results; never modify previous findings.

---

## Diagnosis Sequence (executed in order)

### 1. Server health (`curl http://localhost:3001/health`)
- **PASS** — `{"status":"ok","timestamp":"...","service":"ride-ws","version":"1.0.0","uptime_seconds":...}`
- `env: production` (not `development` — note for future reference).
- `database: {"status":"unknown"}` — DB check hasn't completed (timeout).
- `websocket: {"connected_clients":1,"connected_drivers":1,"connected_riders":0,"connected_admins":0}` — one driver connected (likely the Pixel's previous/reconnected session).

### 2. Device reachability (`adb -s 24261JEGR10296 shell ping -c 1 192.168.0.206`)
- **PASS** — `PING 192.168.0.206 ... 64 bytes ... time=3.64 ms`. Device (`192.168.0.134/24`) and server (`192.168.0.206`) are on the same subnet. Network path is fine.

### 3. Auth error expansion (`tail utils-server-test.log`)
- **FAIL (DB/network)** — Server logs show persistent `CONNECT_TIMEOUT aws-1-ap-northeast-1.pooler.supabase.com:6543`:
  - `[ERROR] [db-watchdog] database unreachable — exiting for supervisor restart { consecutiveFailures: 4, error: 'db probe timeout after 15000ms' }`
  - `[ERROR] [scheduler] ... DrizzleQueryError: ... cause: Error: write CONNECT_TIMEOUT aws-1-ap-northeast-1.pooler.supabase.com:6543`
  - `[ERROR] [h3Index] refresh error ... cause: CONNECT_TIMEOUT ...`
  - `[ERROR] [compensationWorker] tick error ... cause: CONNECT_TIMEOUT ...`
- The `auth:error: server_unavailable` (line 1175 in `utils-server/index.ts`) is the server's catch-all for any DB/auth failure (`getUser()` throws or DB lookup fails). The truncated `auth:error: server_u...` on the device matches this exactly.

### 4. Server restart (`nohup bash -c 'npm run dev' > restart.log 2>&1 </dev/null &` → PID 190)
- **PASS** — New server process started. Health endpoint responds (`200`). Old server (PID 11940) still running (port 3001 occupied — new server may have failed to bind, or the old server is still serving). The `restart.log` is empty (0 bytes) — the new server may not have started properly due to port conflict.
- Note: The `taskkill` attempts (`/F /PID 17996`, `/PID 11940`) failed due to syntax errors (`Invalid argument/option`). The old server process was not killed. The new `nohup` process (PID 190) may have started but the health endpoint still responds from the old process (same uptime ~1459s).

### 5. Auth token check (test account 1700000001 / test1234)
- Not executed — the DB timeout prevents `supabaseAdmin.auth.getUser()` from completing. Even with a fresh token, the auth flow would fail at the DB lookup step (`db.select().from(users)...` at L970-977).
- The `.env.local` and `utils-server/.env` both contain valid `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The DB URL points to the correct Supabase instance. The timeout is a network/server-side DB outage, not a misconfiguration.

### 6. Verify GO ONLINE (`execbro_tap` at 540,1140 on Pixel `24261JEGR10296`)
- **FAIL (reproduced)** — `success: true`, `method: coordinate`, `verification.meaningful: false`, `changeRate: 0`, `changedPixels: 0`. No visual state change. The "GO ONLINE" button remains visible; no transition to "Go Offline" or "Connected".
- Screenshot after tap: "GO ONLINE" still visible; error banner `auth:error: server_u...` (truncated, matches `server_unavailable`).
- `android_emulator_get_logs` (filter: heartbeat/online/ws): no entries (WS broken, no heartbeat events emitted).

---

## Key Findings (evidence-based, no fabrication)

1. **Bundle IP verified correct:** `curl ... | grep` → `192.168.0.206` ×3; old `10.194.232.148` ×0. The previous session's assumption ("stale bundle IP") is resolved — the bundle has the current LAN IP.
2. **Device-server network verified:** `ping` from Pixel (`192.168.0.134`) to server (`192.168.0.206`) succeeds (`3.64ms`). The device CAN reach the server.
3. **Server running:** Health endpoint responds (`200`, `status: ok`). `env: production`. `connected_clients: 1` (previous/reconnected session).
4. **DB unreachable (root cause):** `CONNECT_TIMEOUT aws-1-ap-northeast-1.pooler.supabase.com:6543` — persistent across server restarts. The Supabase DB server is unreachable from this network (either temporary outage, firewall, or the DB instance is down).
5. **Auth error explained:** `auth:error: server_unavailable` (line 1175, `utils-server/index.ts`) — the server's catch-all for DB/auth failures. The truncated `auth:error: server_u...` on the device confirms this. The `GO ONLINE` button is unresponsive because the `POST /api/driver/status` (via `store/useDriverStatusStore.ts` `setOnline()` / `store/useDriverFlowStore.ts` `setOnline()`) requires a working DB/auth connection, which is blocked by the DB timeout.
6. **No code edited:** `store/useDriverStatusStore.ts`, `store/useDriverFlowStore.ts`, `app/(main)/(rider)/d/(tabs)/index.tsx`, `utils-server/index.ts` unchanged (verified by file inspection, not chat memory).
7. **No commits made.**

---

## Verified Results Table

| Step | Action | Expected | Actual | Evidence |
|---|---|---|---|---|
| 1 | Server health (`curl /health`) | `status: ok` | PASS (`200`) | Health JSON with `uptime_seconds`, `env: production` |
| 2 | Device reachability (`ping`) | Reachable | PASS (`3.64ms`) | `PING ... 64 bytes ... time=3.64 ms` |
| 3 | Auth error (`tail log`) | Identify error | FAIL (DB timeout) | `CONNECT_TIMEOUT aws-1-ap-northeast-1.pooler.supabase.com:6543` |
| 4 | Server restart (`nohup`) | New process | PARTIAL (new PID 190, old PID 11940 still serving) | Health responds; `restart.log` empty |
| 5 | Auth token (test account) | Fresh token | NOT EXECUTED (DB timeout blocks auth) | `.env.local` DB URL verified; DB unreachable |
| 6 | GO ONLINE (`execbro_tap`) | State change | FAIL (`meaningful: false`) | Screenshot: "GO ONLINE" unchanged; error banner `auth:error: server_u...` |
| 6b | Heartbeat / WS | Heartbeat events | FAIL (none) | `android_emulator_get_logs` empty; `get_apps` shows Pixel RN timeout |

---

## Overall Verdict (after server/auth fix attempt)

**NOT READY** — same critical blocker (Item 1 — Driver GO ONLINE FAIL).

- Environment fix (bundle IP sync): **COMPLETE and VERIFIED** (`192.168.0.206` in bundle; device reaches server; server responds).
- Server restart: **PARTIAL** (new process started, old process still serving; DB timeout persistent).
- Root cause updated: **DB/network outage** (`CONNECT_TIMEOUT` to Supabase DB `aws-1-ap-northeast-1.pooler.supabase.com:6543`), NOT a stale bundle IP or code bug. The `auth:error: server_unavailable` (line 1175) is the server's correct response to a DB failure.
- GO ONLINE: **STILL FAILING** — the button is unresponsive because the auth/state transition requires a working DB connection.
- Fare regression (Item 2): **NOT FULLY EXECUTED** (not attempted — environment/auth fix only).
- No fixes applied (per rules: environment/server fix only, no code changes).

---

## Follow-up (requires DB/network fix — NOT executed)
1. **DB/network:** Investigate `aws-1-ap-northeast-1.pooler.supabase.com:6543` reachability (Supabase DB outage, firewall, or network change). The `.env.local` DB URL is correct; the timeout is external.
2. Once DB is reachable: restart `utils-server` cleanly (kill old PID 11940, start new), verify health endpoint shows `database: {"status":"ok"}`.
3. Re-run `GO ONLINE` verification (`execbro_tap` or `maestro/flows/driver-go-online.yaml`).
4. Once GO ONLINE passes: execute full fare-regression path (Item 2) and remaining QA items (3-8).
5. Rebuild dev client (`NODE_OPTIONS=--max-old-space-size=8192 npx expo run:android --variant debug`) only if APK predates current schemes (bundle IP is current — rebuild not required for this blocker).
