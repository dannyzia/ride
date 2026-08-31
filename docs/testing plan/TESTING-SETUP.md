# Testing Bring-up — Permanent Recipe

<!-- AI-READER HEADER — every artifact written for AI consumption in this repo starts with this block. -->
**Purpose:** the canonical dev bring-up sequence + the failure-mode catalogue. Read this before running any test.
**Owner:** Testing model (per `AGENTS.md § Model Chain`); Zia for env-level steps (router, IP, firewall).
**Status:** ACTIVE — last full validation 2026-08-28.
**Source of truth:** this file is the source of truth for the bring-up procedure.
**Related (concrete paths):**
- `.kilo/plans/1787750800000-fare-v6-implementation.md` — canonical fare-framework plan; §REV-5 RBAC + §UI/UX specs for admin fare-config
- `.kilo/plans/1787757350000-handoff-fare-v6-stage0-build.md` — fare-framework handoff; ROUND 5/6/12 status on the things this doc touches
- `scripts/dev-bring-up.ps1` — deterministic chain; run after a code change
- `01 Kill Servers.bat` · `02 Utils-server.bat` · `03 Metro.bat` · `04 Emulator Andoid.bat` · `05 Emulator Pixel6A.bat` · `06 Connect with Metro.bat` · `07 Location Correction.bat`
**Last verified:** 2026-08-28 by Zia (testing-program bring-up round). Verify by running the chain end-to-end on a clean boot.
**How to update:** append a new bullet to §8 ("Don't repeat the … debugging spiral") for every new failure mode. Move the file to the `docs/testing plan/` folder was completed 2026-08-28.

---

## 0. The principle (the thing that fixes the drift forever)

The dev build was historically baked with hard-coded LAN IPs (`192.168.0.196:8081`, `ws://...:3001`). Every time DHCP reassigned the laptop a new IP, the phone builds broke. **The permanent fix is to bake `localhost` into the dev build and rely on `adb reverse` to map the phone's loopback to the laptop.** IP drift then becomes irrelevant.

For production, `EXPO_PUBLIC_*` vars are baked at build time and have to point at the real server hostname — that's a separate build profile (`eas build --profile production`).

---

## 1. The chain (one screen, every step, the only correct order)

| # | Action | What success looks like | What to do if it fails |
|---|---|---|---|
| 0 | `01 Kill Servers.bat` | `Done.` | — |
| 1 | Start **utils-server**: `cd utils-server && npm run dev` | `[scheduler] started (45 jobs)` + `[ws] dispatch server listening on 0.0.0.0:3001` | If `[startup] fatal ... statement timeout`: it was a transient Supabase condition. Retry. If reproducible: see §4. |
| 2 | Start **Metro**: `03 Metro.bat` | First line: `v20.x.x` (if `C:\node20` is present) OR a system-Node note. Then the standard Metro bundle output. | If `npx expo start` watcher fails (`getSha1 undefined` on Node 24): the script now checks `C:\node20\node.exe` automatically. Fall through to system Node first. |
| 3 | `06 Connect with Metro.bat` | `Connecting 24261JEGR10296 to Metro (8081) and utils-server (3001) ... Connecting 9a76528e ... ` | If `No authorized devices found`: USB debugging off on the phone, or the adb authorization popup was missed. Toggle the phone's USB, accept the popup, retry. |
| 4 | Phone → dev-launcher | Either it auto-finds Metro on `http://localhost:8081` (via the reverse tunnel), or you tap `Enter URL manually` and type `http://localhost:8081`. | If "Cannot connect to Metro": re-run step 3 (reverse mappings get cleared by adb daemon / phone reboot). |
| 5 | App loads past dev-launcher | Login (or Home) screen visible. **No red error screen.** | See §2. |

Adb reverse is the load-bearing piece — it's why the baked `localhost:8081` works. The phone's `localhost:8081` → laptop's `localhost:8081` (where Metro listens). Same for 3001 (utils-server).

---

## 2. The single most common failure and its cause

Symptom: dev-launcher says "Bundling…" then a red `RangeError: Unknown encoding: utf-16le` plus a wall of "Route X is missing the required default export" warnings. Same on every phone.

Cause: a Node-only library (`ws`, anything pulling `stream`, etc.) is in the **client** dependency graph. Hermes is the React Native JS engine; it does not have `stream`, `Buffer`, `fs`, etc. Metro normally catches these via `platforms/node` exclusion, but if a file from `app/`, `lib/`, `store/`, `components/`, or `src/` transitively imports it, it ends up in the Android bundle.

How to verify (the **real** smoke, not the bundle URL):

```bash
adb -s <device> shell am start -W -a android.intent.action.VIEW \
  -d "exp+ride-bd://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.ride.bd
adb -s <device> logcat -d -t 300 | grep -E "ws|stream|hermes" | head -50
```

Green: no `stream` line, no `ws` warnings, no `utf-16le`. Red: the audit failed — run the diagnostic in §3.

The "HTTP 200 bundle URL" smoke is **not** sufficient: a broken bundle can still be served as 200 and only fail at module-evaluation time on the device. (Proven again 2026-08-29: bundle was 200 and the app still RedBoxed — see §3 Class 2.)

**Two distinct mechanisms share this symptom** — (a) Node-builtins in the client graph (`ws`/`stream`, caught by the grep below) and (b) `h3-js`'s module-scope `new TextDecoder("utf-16le")` under Expo's winter polyfill (§3 Class 2, NOT caught by that grep). Both produce the identical `utf-16le` + "missing default export" wall.

---

## 3. The `ws` audit — ws/stream class RESOLVED; utf-16le class REOPENED 2026-08-29 (second, distinct root cause)

**Class 1 (`ws`/`stream` Node-builtins) — RESOLVED.** Re-audited 2026-08-29 by Orchestrator: the only remaining client-reachable references are **type-only** imports (`import type { AdminRole }` in `app/admin/fare-config.tsx:21` and `components/admin/AdminShell.tsx:22`) — TypeScript types are erased at compile time and never reach the bundle. `lib/presignUrl.ts` imports `supabaseServer` at runtime but has **zero importers** (dead file — deletion candidate). Commit `ac41ffa` removed the `ws` import from `supabaseServer.ts`.

**Class 2 (`utf-16le` TextDecoder via `h3-js`) — OPEN, root cause proven by on-device reproduction 2026-08-29 15:44 (Test-Engineer session, fresh Metro + fresh bundle, after `ac41ffa`/`8f55f0e`):** `node_modules/h3-js/dist/browser/h3-js.js` **line 260** runs `new TextDecoder("utf-16le")` at module scope (its UTF8 twin is line 185, `"utf8"` only). Expo's winter `TextDecoder` polyfill (`expo/src/winter/TextDecoder.ts`) on Hermes supports `utf-8` but **not** `utf-16le` → `RangeError: Unknown encoding: utf-16le` at module evaluation. Import chain: `components/Map.tsx` ← 6 client files → `lib/h3.ts:1` (`import { latLngToCell, gridDisk, cellToBoundary } from 'h3-js'`) → `h3-js` → throw. Result: every route whose graph includes `Map.tsx` fails evaluation → expo-router logs "missing the required default export" ×8 (`(customer)/(tabs)/home`, `confirm-ride`, `find-ride`, `finding-driver`, `ride-detail/[ride_id]`, `(rider)/find-customer`, `finish-ride`, `hotspot-map`); app shows a RedBox and never renders. The `ws` grep below does **not** catch this class — add a TextDecoder/utf-16le grep. Fix direction (owner's call, not tested): alias `h3-js` to a build without the UTF16 decoder, polyfill `TextDecoder` with `utf-16le`, or break the eager `Map.tsx → lib/h3.ts` import chain (lazy require).

Run from the repo root:

```bash
# 1. Find every client-reachable file that imports anything which transitively reaches `ws`
grep -r --include="*.ts" --include="*.tsx" -E "from ['\"](\.\./)*\.\./?(supabase|supabaseServer|auth|adminRbac)" app/ lib/ store/ components/ src/

# 2. The most common culprit: @supabase/supabase-js bundles realtime (which uses ws) for the client too.
#    Client should use ONLY the URL/anon-keyed HTTP client, not the full SDK.
#    Server-only deps must live behind a server boundary (utils-server/ is separate per tsconfig).

# 3. The fix is one of:
#    a. Split the supabase client: client uses a narrowed entry, server uses the full SDK.
#    b. Metro config: add a `resolver.resolveRequest` that redirects any `ws` import on
#       platforms: ['android','ios'] to a `metro-shims/ws.js` that exports {}.
#    c. Add a guard test that fails CI if any client-reachable file imports `ws` or
#       `@supabase/supabase-js` without a documented exception.
```

The fix once: split files, add a CI guard, document the boundary. Then this class of failure stops recurring.

---

## 4. Utils-server statement-timeout at startup

If `[startup] fatal ... PostgresError: canceling statement due to statement timeout` reappears:

```sql
-- Run from the Supabase SQL editor or any node+pg session
SELECT pid, state, wait_event_type, left(query, 200)
FROM pg_stat_activity WHERE state <> 'idle';
SHOW statement_timeout;
```

If `wait_event_type='Lock'`: a prior session is holding a transaction. Kill the long-running pids (only if you know they belong to a dead session).

If `statement_timeout < '60s'`: the DB role has a tight timeout. utils-server's `refreshH3Index()` does a small query, so it should fit. If recurring, file a hardening task: wrap startup in a retry (3 attempts, short backoff) before `process.exit(1)`.

---

## 5. The dev build: keep it on `localhost`

**Implemented 2026-08-29.** The resolution lives in `lib/config.ts` (single consumer of these vars on the client): if `EXPO_PUBLIC_DEV_LAN_IP` is set it wins (LAN-IP mode); otherwise production domains pass through; otherwise emulators auto-use `10.0.2.2` and physical devices use `localhost`.

`.env.local` now has `EXPO_PUBLIC_DEV_LAN_IP` **commented out** and the URLs on `localhost`:

```dotenv
EXPO_PUBLIC_SERVER_URL=http://localhost:8081
EXPO_PUBLIC_WEB_SOCKET_SERVER_URL=ws://localhost:3001
```

`adb reverse` (06 bat) maps every attached device's loopback to the laptop, so one config serves physical phones AND emulators. To revisit LAN-IP mode deliberately, uncomment the DEV_LAN_IP line and restart Metro — it is the single switch.

Env changes take effect only after a **Metro restart** (Metro inlines `EXPO_PUBLIC_*` at bundle time): 01 → 02 → 03 → 06, then reload the app. No dev-build rebuild needed (the values ship in the JS bundle, not native code).

Two dev-only side effects of localhost URLs (both acceptable for ride testing):
- Several **API routes** read `EXPO_PUBLIC_SERVER_URL` server-side for PortPos redirect/IPN and `/track/<id>` links (`app/api/package/purchase+api.ts:259`, `app/api/payment/portpos/callback+api.ts:35`, `app/api/ride/request+api.ts:583`, wallet/passes/sos routes). PortPos callbacks cannot reach a dev laptop over localhost anyway — payment-callback E2E in dev needs a tunnel/LAN session; unrelated to Segments 1–4.
- Share/tracking links generated in dev will contain localhost — cosmetic only.

For prod, `eas build --profile production` uses the production `.env` (or EAS secrets), which points at the real `*.onrender.com` URL.

---

## 6. Devices used for testing

| Role | Device | Serial |
|---|---|---|
| Rider | Pixel 6a | `24261JEGR10296` |
| Driver | POCO X3 | `9a76528e` |

Test accounts (existing, dev env):

| Role | Phone | Password |
|---|---|---|
| Rider | `1613249520` | `test1234` |
| Driver | `1700000001` | `test1234` |

**Login is password, not OTP, in this dev env.** OTP `123456` is only for brand-new account registration.

---

## 7. The test sequence (small segments, backend-first, then frontend)

| Segment | Phases | Goal | Time |
|---|---|---|---|
| 1 — Dispatch | A→D | login + driver online + rider request + offer accepted | ~10 min |
| 2 — Ride in motion | E→G | match+PIN + arrive+start + drop-off | ~10 min |
| 3 — Silent invariants | I1–I4 | tax_ledger + accounting balance (I2=0 is the load-bearing one) | ~5 min |
| 4 — Frontend pass | all phases, visual scoring | design tokens, layouts, fonts | ~25 min |

Prompts for segments 1–4 live in `docs/testing plan/SEGMENT-TESTS.md` (canonical, one copy-paste block per segment). The deep phase recipes are in `docs/testing plan/master-testing-prompt.md`; the full visual pass is `docs/testing plan/TEST-ENGINEER-PROMPT.md`.

---

## 8. Don't repeat the 2026-08-29 debugging spiral

Order of failure modes we hit that day, in the order we hit them:

1. `expo export` crash on native module in web build → fixed by `utils/maplibreLoader.web.ts` null stub
2. utils-server startup statement timeout → transient, retried green
3. Metro on Node 24 watcher crash → portable Node 20 + system-Node fallback
4. `ws` import chain → partially fixed (admin layout → adminRbac → auth), not fully fixed
5. utf-16le + missing-default-export → cascade of #4
6. WiFi IP drift → router reservation + correct MAC
7. netsh DNS loss → reverted to DHCP
8. `adb reverse` lost on reboot → re-run 06
9. Stale test-prompt facts causing false FAILs → 2026-08-29: TEST-ENGINEER-PROMPT had the pre-palette green #0A9B4C (real: #0CC25F per `theme/goRide.ts`), wrong dark bg and border tokens, and an emulator-only device table. All fixed; token source of truth is `theme/goRide.ts`.
10. Dangling cross-ref: §7 pointed at `.kilo/plans/` for segment prompts (nothing there) → now points at `docs/testing plan/SEGMENT-TESTS.md`.
11. Agent-spawned dev servers die within minutes while testing from the agent session (2026-08-29, 4× Metro + 1× utils-server): two stacked causes — (a) the harness session churn kills processes spawned/tracked by the agent (tracked `npx expo start` wrappers vanished from the registry twice), and (b) **RAM starvation**: Metro needs ~2 GB with transform workers; the box was at 0.8 GB free of 16 GB (Opera ~3.5 GB across windows), and Windows RADAR fired `RADAR_PRE_LEAK_64` on the host. Fix that works: launch the canonical bats (`02`/`03`) via `Start-Process` so they live in their own consoles parented outside the session — utils-server survived there all session; Metro additionally needs `EXPO_OFFLINE=1` (see 12).
12. `npx expo start` hangs at startup in an `npm info` update-check storm (18+ hung `npm info` processes observed 2026-08-29; Metro never binds 8081 or dies). Fix: `set EXPO_OFFLINE=1` (and optionally `CI=1`) before launching. Metro then binds 8081 in ~5 s.

If a new one appears, add it to this list and a fix to the doc. That's how this stays short.
