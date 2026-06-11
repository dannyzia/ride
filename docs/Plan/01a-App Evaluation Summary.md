## App Evaluation Summary

### What the PRD Demands

The PRD describes a **subscription-based ride lead distribution platform** — a fundamentally different business model from Uber/Pathao. Drivers pay upfront for call packages; the platform is **not** a commission marketplace. Key technical needs:

- Dual mobile apps (Driver + Rider), Android-first (Bangladesh market)
- Firebase Auth with HMAC-signed phone OTP (custom `startVerification` / `checkAuth` flow + RTDB)
- Real-time dispatch via WebSocket / FCM with heartbeat-based call deduction
- H3 geospatial indexing for driver matching
- bKash/Nagad mobile money integration
- Subscription/package wallet system (call ledger, idempotent payments)
- Admin panel (approval queue, KYC, package management, zone config)
- Document upload + manual admin review
- In-app chat, mutual ratings, trip lifecycle
- Bangladesh data localization
- Android-only for MVP (iOS is post-MVP)---

## 1. Recommended Base: `GlideX`

**[`Ride/`](D:\My Projects\Current Project\Ride)** is the clear choice. Here is why it wins on every decision axis:

**Tech stack alignment.** React Native (Expo SDK 53) + TypeScript gives you a single language for rider app, driver app, and API routes — the [`app/api/`](D:\My Projects\Current Project\Ride\app\api) folder already hosts server-side functions inline. Your team writes one language end-to-end.

**Firebase is already wired in.** The PRD's HMAC phone auth flow writes to Firebase RTDB and uses Cloud Functions. The codebase already imports the `firebase` SDK — the auth swap is surgical (remove Clerk, replace with your `startVerification`/`checkAuth` pattern).

**Driver/rider split is already the architecture.** The route groups [`app/(main)/(rider)/`](D:\My Projects\Current Project\Ride\app\(main)\(rider)) and [`app/(main)/(customer)/`](D:\My Projects\Current Project\Ride\app\(main)\(customer)) mirror your user model exactly. The driver side already has `find-customer`, `finish-ride`, `verification` — directly renameable to your flow.

**WebSocket infrastructure exists.** The [`socket/`](D:\My Projects\Current Project\Ride\socket) directory and Zustand stores (`useWSStore`, `useRideOfferStore`) are the scaffolding for your heartbeat-gated call deduction logic.

**Drizzle + PostgreSQL schema is extensible.** The existing [`src/db/schema.ts`](D:\My Projects\Current Project\Ride\src\db) covers `users`, `drivers`, `rides` — you extend it with `packages`, `call_ledger`, `subscriptions`, `documents`.

**EAS build pipeline is production-ready.** Android APK delivery to Dhaka drivers via EAS is a one-command operation.

**What you strip out of GlideX:** Clerk auth (→ your Firebase HMAC flow), Stripe (→ bKash/Nagad), email notifications (→ SMS fallback per PRD), the customer-side Stripe payment sheet.

---

## 2. Inspiration Sources (do not modify these)

**[`ride-hailing-main/`](D:\My Projects\Future Projects\Ride\ride-hailing-main\ride-hailing-main) — Go microservices backend**
Study its Go implementations for: the `Payments` service wallet and idempotency key pattern (directly maps to your call-deduction ledger), the `Fraud` service (your collusion detection and device-binding logic), the `Admin` service approval queue, and the `Scheduler` service (your scheduled ride + pro-rata credit timer). This is the best reference for backend service boundaries even though you will not use Go.

**[`realtime_dispatch_system-main/`](D:\My Projects\Future Projects\Ride\realtime_dispatch_system-main\realtime_dispatch_system-main) — Java/Rust dispatch engine**
Study its geo-index Rust service for the H3 spatial indexing pattern your PRD requires (requirement 19), the supply-demand heatmap caching approach (requirement 20), and the weighted driver scoring formula (requirement 21). The Flink stream processing patterns map to your 30-second H3 cache refresh cycle.

**[`SE-RideSharingService-architecture-main/`](D:\My Projects\Future Projects\Ride\SE-RideSharingService-architecture-main\SE-RideSharingService-architecture-main) — Architecture documentation**
Pure reference — no code to run. Use its layered architecture diagrams, stakeholder analysis, and database schema diagram as input when populating your [`02-ARCHITECTURE.md`](D:\My Projects\Current Project\Ride\docs\Plan\02-ARCHITECTURE.md) and [`05-DATA-MODEL.md`](D:\My Projects\Current Project\Ride\docs\Plan\05-DATA-MODEL.md).

---

## 3. Additional Observations

**The business model is the hardest engineering problem, not the UI.** Every existing app is a commission marketplace. None has a call-wallet, call-deduction ledger, or subscription package system. This logic — idempotent package purchase, heartbeat-gated deduction, auto-refund on non-interaction, pro-rata credit — must be built net-new regardless of which base you pick.

**bKash/Nagad has no open-source precedent in these repos.** All nine code repos use Stripe. You will need to integrate with the bKash Merchant API and Nagad Merchant API directly, following their sandbox → production flow. Plan for this as a standalone integration spike before connecting it to the package purchase flow.

**The HMAC phone auth is a custom protocol.** The PRD's `startVerification` / `checkAuth` / RTDB write pattern does not exist in any of these apps. The OTP screen ([`app/(main)/(rider)/enter-otp/`](D:\My Projects\Current Project\Ride\app\(main)\(rider)\enter-otp)) gives you the UI scaffold, but the Cloud Function backend and SMS receiver module are a greenfield build.

**Admin panel is absent from GlideX entirely.** The PRD needs an approval queue, KYC document review, package management, and zone setup. The `opensource-uberclone-main` (Laravel) has the most complete admin panel UI of all the repos — treat it as a visual reference for admin screen layout even though its stack is PHP/web. You will build the admin panel as a separate web app (React + the same Neon/Drizzle backend) or as a protected route group in the Expo web build.

**`QuickRide` has the cleanest in-app chat implementation** (Socket.IO, message persistence with timestamps, access control enforced server-side) — worth reading its [`Backend/models/`](D:\My Projects\Future Projects\Ride\QuickRide-main\QuickRide-main) and socket event structure when building requirement 29.