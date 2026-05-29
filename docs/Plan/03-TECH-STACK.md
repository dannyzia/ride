<!--
AI INSTRUCTIONS
===============
Base: Ride package.json (D:\My Projects\Current Project\Ride\package.json) — that is the starting dependency list.
This file lists ONLY the changes to that baseline: packages to remove, packages to add, and rule overrides.
Do not re-list every GlideX dependency here. Treat GlideX package.json as the implicit baseline.
Read 04-ADR.md for the reasoning behind every substitution.
Supabase is the canonical backend (PostgreSQL + Auth + Storage). Drizzle ORM stays for DB access.
-->

# Tech Stack: Ride
> Delta from GlideX baseline. GlideX package.json is the starting point.

---

## Project identity (update these in package.json and app.config.js)

```
name:        ride
slug:        ride-bd
version:     1.0.0
android.package: com.ride.bd
ios.bundleIdentifier: com.ride.bd   ← post-MVP; iOS out of scope for MVP
```

> **Plugin requirement:** Confirm `@maplibre/maplibre-react-native` is listed in the `plugins` array of `app.config.js` — without it, map tiles will not render.

---

| Package | Reason |
|---------|--------|
| `@clerk/clerk-expo` | Replaced by Supabase Auth phone OTP |
| `@clerk/express` | Replaced by Supabase Auth token verification |
| `@stripe/stripe-react-native` | Replaced by PortPos WebView flow |
| `stripe` | Replaced by PortPos API calls |
| `resend` | Email notifications out of scope for MVP |

---

## Packages to ADD

### App (add to GlideX package.json dependencies)

| Package | Version | Purpose | Why not alternative |
|---------|---------|---------|---------------------|
| `@supabase/supabase-js` | `^2.45.0` | Supabase client for Auth (phone OTP), Storage (driver documents) | Firebase SDK was used for RTDB/FCM/Storage — now replaced by Supabase |
| `h3-js` | `^4.1.0` | H3 hexagonal geo-indexing on client (nearby driver display) | `geohash`: less precise ring expansion; H3 is PRD-specified |
| `@react-native-community/netinfo` | `^11.3.1` | Network type detection for low-bandwidth mode (2G/EDGE → strip map tiles) | Already common in Expo ecosystem |
| `react-native-otp-verify` | `^1.x` | Android SMS auto-receive via SMS_RETRIEVER_API for auto-filling OTP field (Android only). Supabase handles OTP verification internally. | `expo-sms`: send-only, cannot read inbound SMS. Kept for UX convenience (auto-fill); user can type manually without it. |
| `react-native-webview` | `13.13.5` | Already in GlideX — KEEP. Used for PortPos payment WebView | — |
| `zustand` | `^5.0.3` | Already in GlideX — KEEP. Add `usePackageStore`, `useCallLedgerStore` | — |
| `zod` | `^3.23.8` | Runtime input validation on API routes | `yup`: worse TypeScript inference; `joi`: larger bundle |
| `@turf/kinks` | `^6.5.0` | Server-side polygon self-intersection check for zone validation. Used in `POST /api/admin/zone` only. | Individual package avoids importing the full `@turf/turf` bundle; tree-shaking is effective at the package level. |
| `@turf/area` | `^6.5.0` | Server-side polygon area calculation for basic sanity checks on zone size. Used in `POST /api/admin/zone` only. | Individual package; same rationale as `@turf/kinks`. |
| `react-native-gifted-chat` | `^2.6.2` | In-app chat UI for rider-driver messaging (PRD req 29). Provides message bubbles, input bar, avatars, timestamps, load-earlier. | `react-native-chat-ui`: less mature, fewer features. `commt-react-native`: includes its own backend — unnecessary coupling. We only need UI; WebSocket + DB handle transport. |
| `@types/geojson` | `^7946.0.14` | TypeScript types for GeoJSON (required by Barikoi SDK for typed geometry) | Dev dependency only |

### Utils-server (add to utils-server/package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | `^8.18.0` | WebSocket server (replaces Express-only utils-server) |
| `h3-js` | `^4.1.0` | H3 geo-indexing server-side for dispatch |
| `@supabase/supabase-js` | `^2.45.0` | Supabase server client for Auth token verification, Storage signed URLs |
| `@neondatabase/serverless` | `^1.0.0` | DB driver — same as app; connects to Supabase PostgreSQL via connection string |
| `drizzle-orm` | `^0.42.0` | Shared schema access for call_ledger atomic writes |

---

## Packages to KEEP unchanged from GlideX

All remaining GlideX dependencies are kept as-is. Key ones the AI must not accidentally remove:

- `expo` ^53.0.0, `react-native` 0.79.2 — core; do not upgrade mid-project
- `expo-router` ~5.0.5 — routing; all new screens follow existing file conventions
- `nativewind` ^4.1.23, `tailwindcss` 3.4.17 — styling; all new screens use NativeWind classes
- `@neondatabase/serverless` ^1.0.0 — DB driver; connects to Supabase PostgreSQL via connection string from env. Do not switch to `pg` or `postgres.js`
- `drizzle-orm` ^0.42.0, `drizzle-kit` ^0.31.0 — ORM; all schema changes via Drizzle migrations
- `react-native-maps` 1.20.1 — maps; keep as-is
- `expo-location` ~18.1.4 — location; keep as-is
- `expo-notifications` ~0.31.1 — push; keep as-is; extend for FCM data messages
- `expo-secure-store` ~14.2.3 — secure storage; use for Firebase auth token persistence
- `expo-image-picker` ~16.1.4 — keep; used for driver document photo upload
- `lottie-react-native` ^7.2.2 — keep; used in loading states
- `@gorhom/bottom-sheet` ^5.1.2 — keep; used in ride offer cards

---

## Global coding rules (overrides and additions to GlideX conventions)

- Language: TypeScript strict mode. No `any`. No `// @ts-ignore`.
- All new API routes: validate with Zod at the route boundary before any DB or service call.
- All DB writes that affect money (call_ledger, packages): inside a Drizzle transaction. Never a bare `db.insert()`.
- No Clerk imports anywhere. If you see `@clerk/*` in an existing file, remove it.
- No Stripe imports anywhere. If you see `stripe` or `@stripe/*` in an existing file, remove it.
- Payment credentials (BKASH_*, NAGAD_*, PORTPOS_*): server-side env vars only. Must not appear in `EXPO_PUBLIC_*` variables.
- Call **deduction** logic: only in `utils-server/heartbeat.ts`. No other file writes `event_type='deduction'` rows to `call_ledger`. **Non-deduction writes** (`initial_load`, `credit`, `expiry_writeoff`) use `lib/activateSubscription.ts` which is callable from both Expo API routes and utils-server. The unified rule: deduction rows → `heartbeat.ts` only; all other event types → `activateSubscription.ts` only; no file writes `call_ledger` directly outside these two modules.
- All timestamps: UTC. Store as PostgreSQL `timestamptz`. Never store local time.
- No `console.log` in committed code. Use the project logger (`lib/logger.ts` — add this file).
- All UI styling must use GoRide design tokens extracted from GoRide.css through `theme/goRide.ts`; hardcoded color/font/spacing literals in components are not allowed.

---

## Environment targets

| Environment | Purpose | Notes |
|-------------|---------|-------|
| local | Development | `.env.local` (Expo), `.env` (utils-server). PortPos sandbox credentials. Supabase local dev (`supabase start`). |
| staging | Pre-release | EAS build profile `preview`. Supabase staging project. bKash sandbox. |
| production | Live — Bangladesh | EAS build profile `production`. Manual deploy only. Supabase ap-southeast-1 (Singapore) project. |

---

## What is off-limits

- No Stripe, Clerk, or Resend usage anywhere in the codebase.
- No direct PostgreSQL writes from the Expo client (all writes via API routes).
- No call_ledger writes outside `utils-server/heartbeat.ts`.
- No hardcoded coordinates, zone polygons, or fare rates — all come from DB (`zones` and `pricing` tables).
- No fare calculation on the client — always call `lib/fareCalc.ts` server-side; client displays the returned breakdown.
- No raw SQL string interpolation — use Drizzle ORM parameterised queries only.
- No synchronous calls to bKash/Nagad APIs inside the request/response cycle without timeout handling (max 10s timeout, fail gracefully).
