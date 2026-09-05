# TEST-SETUP.md — Device/Emulator Testing Environment Runbook

**Purpose:**     Mandatory pre-flight for ANY testing agent (or human) starting a device, emulator, or on-device verification session on this repo.
**Owner:**       Zia (network facts) / Orchestrator ( upkeep)
**Status:**       ACTIVE
**Source of truth:** this file IS the source of truth for the dev testing environment.
**Related (concrete paths):**
  - `scripts/dev-env-sync.js` — auto-syncs `.env.local` IPs to the current LAN IP
  - `lib/config.ts` — consumes `EXPO_PUBLIC_DEV_LAN_IP` (inlined at BUNDLE time — no runtime fallback)
  - `.env.local` — dev env values Metro inlines into the JS bundle
  - `AGENTS.md` § Essential Commands / § Testing — command quick reference
**Last verified:** 2026-09-04, by orchestrator (skeptic session), live on device 9a76528e
**How to update:** whenever a new failure mode is found during a device session, add it to §5 the same day.

---

## 1. The one fact that breaks everything: the laptop IP changes

Zia's laptop moves between two networks and the LAN IP is DIFFERENT on each:

| Network mode | Typical IP range | Observed example |
|---|---|---|
| Broadband WiFi (home) | `192.168.0.x` | `192.168.0.206` |
| Phone hotspot | `172.x.x.x` (varies) | `172.27.88.148` |

**Why it matters:** `EXPO_PUBLIC_DEV_LAN_IP` (plus `DEV_LAN_IP`, `EXPO_PUBLIC_SERVER_URL`,
`EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`) are read by `lib/config.ts` and **inlined into the JS
bundle when Metro builds it**. There is no runtime fallback — whichever IP is in `.env.local`
when Metro bundles is the only one the app knows. A stale IP = every device API call dies =
app hangs at splash with a "Retry" button, or a black DevLauncher screen.

**You cannot hardcode both IPs.** The correct "default + fallback" is detection at server
start: run the sync script every time, before Metro.

## 2. Pre-flight (run in this order, every session)

```powershell
# 0. Which network am I on? (sanity — printed IP must be reachable FROM the phone)
node scripts/dev-env-sync.js          # patches .env.local to the CURRENT LAN IP
node scripts/dev-env-sync.js --check  # optional: CI-style drift gate (exit 1 on drift)

# 1. utils-server (WebSocket dispatch, port 3001)
cd utils-server; npm run dev          # expect: "[ws] dispatch server listening on 0.0.0.0:3001"

# 2. Metro (port 8081) — MUST start AFTER env sync (env inlined at bundle time)
cd ..; npx expo start --port 8081

# 3. Device
adb devices                           # expect the phone, e.g. "9a76528e  device"
adb shell ip addr show wlan0          # phone IP must be on the SAME subnet as the laptop

# 4. Launch + connect
adb shell am force-stop com.ride.bd
adb shell monkey -p com.ride.bd 1     # (or execbro android_launch_app)
# execbro: scan_metro → expect "Connected to com.ride.bd"
```

**Pass criteria:** app gets past the splash to a real screen (login, or home map) within
~15s of bundle completion, and `netstat` shows ESTABLISHED connections from the phone IP
to `:8081`.

## 3. Verification backlog (what device sessions still owe)

| Item | Blocker | Procedure |
|---|---|---|
| **R5a deep link** — real `ride://rider/wallet` | Installed APK was built BEFORE the `ride` scheme landed → AndroidManifest has no intent-filter (`am start` → "unable to resolve"). **Needs a fresh dev build** (`npx expo run:android`) — scheme is in `app.config.js`. | After rebuild: `adb shell am start -a android.intent.action.VIEW -d "ride://rider/wallet"` → wallet screen renders |
| **R3.4 nearby-driver markers** | Needs a RIDER login; sessions so far booted into the DRIVER home | Rider home map shows live driver markers; markers update/disappear as drivers move |
| **R3.3 flag drill** | Needs a `matched` ride | `PATCH /api/admin/config` set `auto_redispatch_enabled='true'` → driver cancels → ride returns to `dispatching`, rider push "finding a new driver", `redispatch_attempts` +1; after 3 attempts → `expired`. **Always flip the flag back to `'false'` afterward.** |

## 4. Server facts (do not rediscover)

- Metro: port `8081` (API routes ride through it in dev — `EXPO_PUBLIC_SERVER_URL=http://<LAN-IP>:8081`)
- utils-server: port `3001` (`ws://<LAN-IP>:3001`), `INSTANCE_COUNT=1`
- Supabase auth is CLOUD (`swzgkhwjvikyfaqnbrix.supabase.co`) — token generation/refresh does NOT depend on the laptop IP. Only the app's own API/WS calls do.
- App package: `com.ride.bd` (dev build with DevLauncher)

## 5. Failure modes already hit (2026-09-04 session)

| Symptom | Root cause | Fix |
|---|---|---|
| Splash + "↻ Retry" button | `.env.local` had `localhost` — on-device that's the PHONE, not the laptop | `dev-env-sync.js` + restart Metro + relaunch app |
| Fully black screen after force-stop+relaunch | `EXPO_PUBLIC_DEV_LAN_IP` still pointed at the OLD network's IP (172.27.88.148 while on broadband) — DevLauncher can't fetch a bundle | same: sync → restart Metro → relaunch |
| `am start … ride://…` → "unable to resolve Intent" | APK predates the `ride` scheme (build-time intent-filter) | rebuild dev client (`npx expo run:android`), reinstall |
| Metro "Bundler cache is empty, rebuilding… (a minute)" | started with `--clear` | wait ~80s for 2654 modules; don't relaunch the app mid-build |
| execbro "stale CDP target" | app process dead/JS bridge gone | force-stop app, `scan_metro` again |
| jest picks up `admin-test-results/admin-panel.spec.ts` | Maestro output dir swept by testMatch | already ignored (jest `testPathIgnorePatterns` + `.gitignore`) — if it reappears, check both |
