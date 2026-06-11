# Plan: Consolidate Ride Backend on Supabase

## Overview
Replace all Neon (PostgreSQL) + Firebase (Auth, Storage, RTDB, Cloud Functions, FCM) references with Supabase equivalents across all planning documents. Preserve all business logic exactly as-is.

---

## Documents to Modify (17 files)

### 1. `01-PRD.md` — Phone Auth + Storage
**Changes:**
- Rewrite Phone Authentication requirements (items 1–5): Replace Firebase HMAC/RTDB/Cloud Functions flow with Supabase Auth phone OTP + dprelay as external SMS gateway
- Remove all Cloud Function, RTDB, and HMAC references
- Replace "Firebase Storage" with "Supabase Storage" in document upload references
- Update acceptance criteria AC-AUTH-1 through AC-AUTH-5 for Supabase flow
- Remove `challenge_jwt` and `firebase_custom_token` from AC-AUTH-2
- Update NFR: Remove "Authenticator Service: SMS reception to RTDB write" reliability metric
- Remove "Authenticator Service: HMAC signing secret never in client code" security requirement
- Update NFR: "Data region" from "Neon project region" to "Supabase project region (ap-southeast-1)"

### 2. `02-ARCHITECTURE.md` — Auth lifecycle + Component map
**Changes:**
- Update "What changes from GlideX" table: Auth row → "REPLACE → Supabase Auth phone OTP (dprelay SMS gateway)"
- Update "What changes from GlideX" table: Storage row → "Supabase Storage for driver documents"
- Update "What changes from GlideX" table: Notifications row → "Expo Push + optional Supabase Edge Function for wake-up"
- Update KEEP section: Remove "Firebase Storage integration — KEEP"; replace with Supabase Storage
- Update REPLACE section: Auth screens → "phone-entry → OTP verification using Supabase Auth"
- Update ADD section: Remove `functions/` entry entirely
- Remove "Proxy-to-Cloud-Function authentication mechanism" section entirely
- Rewrite "Auth lifecycle: HMAC phone OTP" → "Auth lifecycle: Supabase Phone OTP"
  - New flow: App → `supabase.auth.signInWithOtp({ phone })` → Supabase sends SMS via dprelay → App auto-reads OTP or manual entry → App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` → Supabase returns JWT → App calls `/api/auth/verify-token` (checks user record) → if new, calls `/api/register`
- Update security boundaries: Remove HMAC/RTDB entries; add Supabase JWT verification, Supabase Storage RLS
- Update security boundaries: "Data region" → Supabase ap-southeast-1
- Update known risks: Remove "HMAC secret leaked via client decompilation" (no longer applicable)
- Remove `lib/app-check.ts`, `lib/jwt.ts`, `lib/sms-retriever.ts` from ADD section
- Replace `lib/presignUrl.ts` → Supabase Storage presigned URLs
- Update `lib/auth.ts` → Supabase server-side token verification (`supabase.auth.getUser(jwt)`)

### 3. `03-TECH-STACK.md` — Packages
**Changes:**
- Remove `@neondatabase/serverless` from utils-server packages and KEEP section
- Add `@supabase/supabase-js` to both App and utils-server packages
- Add note: Drizzle ORM stays, connects to Supabase PostgreSQL via direct connection string
- Remove `firebase-admin` from utils-server (replaced by `@supabase/supabase-js` for auth verification)
- Remove Firebase Cloud Functions packages section entirely
- Update KEEP section: Replace `@neondatabase/serverless` note with Supabase client
- Remove `react-native-otp-verify` (Supabase handles OTP internally; Android SMS Retriever still works for auto-read but the app doesn't write to RTDB)
- Update environment targets: Replace "Neon dev branch" / "Neon staging branch" / "Neon main branch" with Supabase project references
- Remove `firebase-admin` from global coding rules
- Remove `HMAC_SIGNING_SECRET` rule
- Remove "local → Firebase emulator for RTDB + Functions" from environment targets

### 4. `04-ADR.md` — Architecture Decision Records
**Changes:**
- Update ADR-001: Mark as **Superseded by ADR-017**. Add note: "Clerk was removed; Firebase HMAC flow is now also removed. Replaced by Supabase Auth phone OTP with dprelay as external SMS gateway."
- Update ADR-013 (HMAC Anonymous UID Binding): Mark as **Superseded by ADR-017**. Supabase handles OTP verification internally; no RTDB receipt writes needed.
- Add new ADR-017: "Consolidate Backend on Supabase"
  - Context: Bootstrapped startup, Firebase free tier cut July 2025, Neon + Firebase = 4 services. Supabase provides DB + auth + storage + real-time on generous free tier with predictable $25/month Pro.
  - Decision: Migrate from Neon + Firebase to Supabase. Keep Barikoi (maps), bKash (payments), dprelay (SMS).
  - Consequences: Fewer services, lower cost, PostgreSQL portability. Must configure dprelay as external SMS provider in Supabase dashboard.

### 5. `05-DATA-MODEL.md` — Database notes
**Changes:**
- Add note at top: "Database is Supabase PostgreSQL, accessed via Drizzle ORM with a direct connection string from Supabase dashboard (Settings → Database → Connection string → URI). Supabase provides the PostgreSQL instance; Drizzle remains the ORM."
- Add RLS note: "Supabase Row Level Security (RLS) is available but not required for MVP. The existing middleware-based auth (`lib/auth.ts`) handles authorization. RLS may be added post-MVP for defense-in-depth."
- Rename `firebase_uid` column to `auth_uid` on users table: Change description to "Supabase Auth UID (sub claim from JWT)"
- Update `documents.storage_url`: Change "Firebase Storage path" to "Supabase Storage path"
- Update `documents.purge_at`: Change "scheduler purges Firebase Storage" to "scheduler purges Supabase Storage"
- Update `drivers.brta_certificate_url`: Change "Firebase Storage path" to "Supabase Storage path"
- Update `used_challenges` table: Add note that this table is retained for now but may be simplified post-MVP since Supabase Auth handles OTP replay protection
- Update `users` table modifications: Change "REMOVE clerk_id column — Clerk removed; replaced by Firebase" to "REMOVE clerk_id column — Clerk removed; replaced by Supabase Auth"

### 6. `06-API.md` — Auth + Storage endpoints
**Changes:**
- Update `POST /api/auth/start-verification`: Rewrite as thin proxy to Supabase's `signInWithOtp`. Remove `appCheckToken` field. Request body: `{ phone: string }`. Calls `supabase.auth.signInWithOtp({ phone })` server-side. Returns `{ success: true }` (Supabase sends SMS directly).
- Update `POST /api/auth/check-auth`: **Remove this endpoint entirely.** Supabase handles OTP verification client-side via `verifyOtp`. No polling needed.
- Update `POST /api/auth/verify-token`: Change from Firebase ID token to Supabase JWT. Server calls `supabase.auth.getUser(jwt)` to verify. Returns `{ user_id, role, exists }`.
- Update `POST /api/register`: Remove `challenge_jwt` field. Body becomes `{ name, role, vehicle_type? }`. Server extracts phone and uid from the Supabase JWT (already verified by middleware). Remove `used_challenges` jti check (Supabase handles replay). Transaction still creates users + drivers rows.
- Update `POST /api/driver/document/upload-confirm`: Change `storage_path` description from "Firebase Storage path" to "Supabase Storage path"
- Update document upload endpoint descriptions: Note that storage is Supabase Storage, bucket name `driver-documents`
- Update admin document review: Presigned URLs generated by Supabase Storage (`supabase.storage.from('driver-documents').createSignedUrl(...)`)

### 7. `07-USER-FLOWS.md` — Auth flow
**Changes:**
- Rewrite "Flow 1: HMAC Phone OTP Registration" → "Flow 1: Supabase Phone OTP Registration"
- Happy path:
  1. User enters phone number E.164. 
  2. App calls `supabase.auth.signInWithOtp({ phone })`. Supabase sends SMS via dprelay.
  3. App auto-reads OTP via Android SMS Retriever API OR shows manual entry after 20s.
  4. App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. Supabase returns JWT session.
  5. App calls `POST /api/auth/verify-token` with Supabase JWT to check if user record exists.
  6. If exists → navigate to home. If not → navigate to register screen.
  7. Register screen: enter name, role. Call `POST /api/register`. Navigate to home.
- Remove all RTDB write references
- Remove all Cloud Function references
- Remove all `challenge_jwt` and `firebase_custom_token` references
- Remove HMAC signing references
- Update alternate paths: Remove "Invalid signature (tampered client)" (no longer applicable)
- Update "Vehicle upload to Firebase fails" → "Vehicle upload to Supabase Storage fails"

### 8. `10-DEV-SETUP.md` — Setup instructions
**Changes:**
- Prerequisites: Remove "Firebase CLI". Add "Supabase CLI" (`npm install -g supabase`).
- Step 4 (Install utils-server packages): Replace `firebase-admin@^12.0.0` and `@neondatabase/serverless` with `@supabase/supabase-js`
- Step 5: Replace "Set up Firebase project" entirely with:
  - 5a. Create Supabase project at https://supabase.com/dashboard. Region: ap-southeast-1 (Singapore).
  - 5b. Configure dprelay as external SMS provider: Supabase Dashboard → Authentication → Phone → Custom SMS Provider. Set dprelay API endpoint and key.
  - 5c. Get connection string: Supabase Dashboard → Settings → Database → Connection string → URI. Copy to `DATABASE_URL`.
  - 5d. Get anon key and service role key: Supabase Dashboard → Settings → API. Copy `anon public` and `service_role` keys.
  - 5e. Install Supabase CLI for local dev: `supabase init && supabase start`
- Step 6: Remove "Set up Firebase Cloud Functions (HMAC auth)" entirely
- Step 7 (Env vars): Remove Firebase vars (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`, `FUNCTIONS_JWT_SECRET`, `EXPO_PUBLIC_FIREBASE_RTDB_URL`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`). Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Step 8 (DB migrations): Change "Verify: connect to Neon dashboard" to "Verify: connect to Supabase dashboard or use `supabase db` commands"
- Remove Firebase emulators from verify checklist
- Update common issues: Remove Firebase-specific troubleshooting

### 9. `11-ENV-VARS.md` — Environment variables
**Changes:**
- Server-side vars: Replace `DATABASE_URL` description from "Neon connection string (pooled)" to "Supabase PostgreSQL connection string (pooled, from Settings → Database)"
- Remove: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FUNCTIONS_JWT_SECRET`
- Add: `SUPABASE_URL` (required, Supabase project URL), `SUPABASE_SERVICE_ROLE_KEY` (required, server-side only, from Settings → API)
- Client-side vars: Remove `EXPO_PUBLIC_FIREBASE_RTDB_URL`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`
- Add: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- utils-server vars: Replace `DATABASE_URL` description. Remove `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Remove entire "Firebase Cloud Functions" env section (`functions/.runtimeconfig.json`)
- Update per-environment values: Replace "Neon dev/staging/main branch" with "Supabase local/dev/staging/production project"
- Remove `FIREBASE_PROJECT_ID` from per-environment table

### 10. `12-FOLDER-STRUCTURE.md` — File structure
**Changes:**
- Remove entire `functions/` directory section (Firebase Cloud Functions)
- Remove `lib/app-check.ts` (Firebase App Check)
- Remove `lib/jwt.ts` (challenge_jwt verification — no longer needed)
- Remove `lib/sms-retriever.ts` (SMS auto-read that writes to RTDB — Supabase handles OTP verification internally; Android SMS Retriever still works for auto-filling but doesn't need a custom module)
- Update `lib/auth.ts` → Rewrite to use Supabase server-side: `supabase.auth.getUser(jwt)` for verification
- Update `lib/presignUrl.ts` → Generate Supabase Storage signed URLs
- Update `app/api/auth/start-verification+api.ts` → Proxy to `supabase.auth.signInWithOtp`
- Remove `app/api/auth/check-auth+api.ts` (no polling needed)
- Update `app/api/auth/verify-token+api.ts` → Verify Supabase JWT
- Update `app/api/register+api.ts` → Remove challenge_jwt, use Supabase JWT claims
- Update `utils-server/package.json` → Replace `@neondatabase/serverless` and `firebase-admin` with `@supabase/supabase-js`
- Update placement rules: Remove "Cloud Function logic → `functions/src/`"
- Update placement rules: Add "Supabase client utilities → `lib/`"
- Remove `database.rules.json` from files to create

### 11. `14-DEV-CHECKLIST.yaml` — Development checklist
**Changes:**
- Phase 1: Remove P1-11 (Create Firebase Cloud Functions project scaffold)
- Phase 1 P1-10: Replace `firebase-admin@^12.0.0` with `@supabase/supabase-js` in utils-server install
- Phase 1 P1-11b: Update `lib/env.ts` validation: Remove `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FUNCTIONS_JWT_SECRET`. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Phase 2: No structural changes to schema (tables remain identical)
- Phase 3: Replace "Firebase Cloud Functions — HMAC Phone Auth" entirely with "Supabase Auth + dprelay Integration"
  - Remove all P3 items (P3-01 through P3-10)
  - New Phase 3 items: Supabase project setup, dprelay SMS configuration in Supabase dashboard, verify phone OTP flow works
- Phase 4: Update auth layer tasks
  - P4-01: Replace `lib/auth.ts` implementation to use `@supabase/supabase-js` instead of `firebase-admin`
  - P4-02: Remove `lib/app-check.ts` / `lib/hmac.ts` creation; replace with Supabase client initialization
  - P4-03: Update phone-entry.tsx to call `supabase.auth.signInWithOtp({ phone })`
  - P4-04: Update otp-polling.tsx to call `supabase.auth.verifyOtp()` instead of polling checkAuth; remove RTDB writes
  - P4-05: Update register.tsx — remove `signInWithCustomToken`; Supabase session already established via `verifyOtp`
  - P4-06: Update register+api.ts — remove `challenge_jwt`; extract uid/phone from Supabase JWT
  - P4-08: Update _layout.tsx — use `supabase.auth.onAuthStateChange` instead of Firebase `onAuthStateChanged`
  - P4-10: Update smoke test steps for Supabase flow

### 12. `15-RUNBOOK-DEPLOY.md` — Deployment runbook
**Changes:**
- Environments table: Remove "Functions" column; remove `firebase emulators:start` from local
- Remove "Deploy Firebase Cloud Functions" (Step 1) entirely
- Update deploy order: `1. DB migrations → 2. utils-server → 3. EAS build`
- Remove Step 1 (deploy functions) and its rollback
- Remove Firebase Functions health check from post-deploy verification
- Remove "Firebase Functions config has hmac.secret set" from pre-deploy checklist
- Update disaster recovery:
  - Replace "PostgreSQL (Neon) backup and restore" with "PostgreSQL (Supabase) backup and restore"
  - Note: Supabase offers automatic daily backups on Pro plan. PITR available on Pro and above.
  - Update restore procedure: Supabase Dashboard → Database → Backups → Restore to point in time
  - Remove "Create a new Neon branch from PITR" → Use Supabase backup/restore
- Remove "Firebase RTDB" disaster recovery section (no longer exists)
- Update canary deploy: Remove Firebase read-only reference

### 13. `19-GLOSSARY.md` — Glossary
**Changes:**
- Add entry for **Supabase**: Open-source Firebase alternative providing PostgreSQL database, Auth (phone OTP, email, social), Storage, and Realtime. Used as the canonical backend for Ride. Project hosted at `ap-southeast-1` (Singapore).
- Add entry for **dprelay**: SMS OTP provider configured as Supabase's external SMS gateway. Sends verification messages for phone authentication.
- Update **HMAC** entry: Mark as deprecated/superseded. Note: "Previously used in Firebase Cloud Function phone auth. Replaced by Supabase Auth built-in phone OTP in ADR-017."
- Update **RTDB** entry: Mark as deprecated. Note: "Previously used for verification_requests during phone auth. Removed in Supabase migration."
- Update **CF** entry: Mark as deprecated. Note: "Previously referred to Firebase Cloud Functions. No longer used after Supabase migration."
- Update **FCM** entry: Note that Expo Push is now the primary notification mechanism; FCM is secondary if needed.

### 14. `20-DEVELOPER-CHANGE-LIST.md` — Code changes
**Changes:**
- Phase 1: Remove `firebase-admin` and `jsonwebtoken` from package.json additions. Add `@supabase/supabase-js`
- Phase 1: Update `lib/env.ts` — Remove Firebase env vars. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Phase 2: Update seed scripts to use Supabase connection string (Drizzle connection stays the same; only `DATABASE_URL` value changes)
- Phase 3: Replace entire "Firebase Cloud Functions" section with "Supabase Auth Configuration"
  - Remove `functions/package.json`, `functions/tsconfig.json`, `functions/.runtimeconfig.json`, `functions/src/*`
  - Add Supabase client initialization: `lib/supabase.ts` (creates server-side Supabase client)
  - Remove `database.rules.json`
- Phase 4: Update auth layer
  - Replace `lib/auth.ts` to use Supabase `getUser(jwt)` instead of Firebase `verifyIdToken`
  - Remove `lib/jwt.ts` (no challenge_jwt)
  - Remove `lib/app-check.ts` (no App Check)
  - Update register endpoint to extract claims from Supabase JWT

### 15. `21-MIGRATION-SQL.md` — Migration notes
**Changes:**
- Add note at top: "Migrations are run via `drizzle-kit migrate` the same way, just against a Supabase PostgreSQL connection string (from Supabase Dashboard → Settings → Database → URI). The database is standard PostgreSQL; Drizzle migrations work identically."
- No changes to actual migration SQL — the SQL itself is PostgreSQL-standard and works the same on Supabase

### 16. `22-TEST-TEMPLATES.md` — Test templates
**Changes:**
- Add note: OTP-related test mocks should target Supabase auth calls (`supabase.auth.signInWithOtp`, `supabase.auth.verifyOtp`) instead of Firebase Cloud Function calls
- The fare calculation, dispatch, and slider validation tests are unchanged (pure business logic)

### 17. `02-ARCHITECTURE.md` — Push notifications
**Changes:**
- Update SMS fallback / push notification logic: Replace FCM with Expo Push Notifications as primary
- Note: Supabase Edge Functions can be used to send wake-up pushes when driver is offline, calling Expo's push API

---

## Files NOT Modified
- `08-UI-SPEC.md`, `09-UX-SPEC.md` — UI specs are layout/design, not infrastructure
- `13-CONVENTIONS.md` — Coding conventions unchanged
- `16-INCIDENT-RESPONSE.md` — Incident procedures are process, not infra-specific
- `17-MONITORING.md` — Monitoring targets are metric-based, not infra-specific
- `18-KNOWN-ISSUES.md` — Known issues will be updated separately post-migration
- `23-IMPLEMENTATION-HANDOFF-CHECKLIST.md` — Handoff checklist
- `01a-App Evaluation Summary.md` — Historical document
- `AUDIT-ROUND-2.md` — Audit document
- `plan-commission-and-waiting-time.md` — Commission/waiting business rules

---

## Decision Points (cannot resolve automatically)

1. **`used_challenges` table**: Supabase Auth handles OTP replay protection internally. The `used_challenges` table was for challenge_jwt replay prevention. With Supabase, this table is unnecessary. **Recommendation: Keep the table in schema for now (zero-cost) but mark as deprecated. Remove post-MVP.**

2. **`react-native-otp-verify` package**: This was for auto-reading SMS to write to RTDB. With Supabase, the app auto-reads the OTP and passes it to `verifyOtp`. The package may still be useful for auto-filling the OTP field but isn't strictly required (user can type manually). **Recommendation: Keep the package for UX convenience (auto-fill OTP field), but remove the RTDB write logic.**

3. **Expo Push vs FCM**: The task says to prefer Expo Push and only keep FCM if necessary for Android background delivery. This is a product decision. **Recommendation: Start with Expo Push only. Add FCM later if Android background delivery is unreliable.**

4. **Supabase Realtime**: The task explicitly says "Do not replace [the WebSocket server] with Supabase Realtime." The existing `utils-server` WebSocket server stays. **No action needed.**

5. **RLS (Row Level Security)**: Supabase supports RLS but the existing middleware-based auth (`lib/auth.ts`) handles authorization at the API layer. **Recommendation: Skip RLS for MVP. Add post-MVP for defense-in-depth.**

---

## Zero Hardcoding Verification

- All Supabase URLs and keys come from environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- No hardcoded anon keys in any document
- `DATABASE_URL` is the Supabase connection string from environment
- dprelay API key from `DPRELAY_API_KEY` env var
- bKash/Nagad credentials from env vars (unchanged)
- Google Maps keys from env vars (unchanged)

---
## Execution Order

Since these are all documentation changes (not code), the order doesn't have strict dependencies. However, for logical consistency:

1. `04-ADR.md` — Add ADR-017, mark ADR-001 and ADR-013 as superseded
2. `03-TECH-STACK.md` — Update packages
3. `11-ENV-VARS.md` — Update env vars (foundational)
4. `01-PRD.md` — Update requirements
5. `02-ARCHITECTURE.md` — Update architecture
6. `05-DATA-MODEL.md` — Update data model notes
7. `06-API.md` — Update API contract
8. `07-USER-FLOWS.md` — Update user flows
9. `10-DEV-SETUP.md` — Update setup instructions
10. `12-FOLDER-STRUCTURE.md` — Update file structure
11. `14-DEV-CHECKLIST.yaml` — Update checklist
12. `15-RUNBOOK-DEPLOY.md` — Update deploy runbook
13. `19-GLOSSARY.md` — Update glossary
14. `20-DEVELOPER-CHANGE-LIST.md` — Update code changes
15. `21-MIGRATION-SQL.md` — Add Supabase note
16. `22-TEST-TEMPLATES.md` — Update test mocks note
