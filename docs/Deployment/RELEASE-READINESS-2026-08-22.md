# Final Release Readiness Report — Ride (Plans 06–11 completion)

**Date:** 2026-08-22
**Scope:** Resolution of the three remaining post-audit blockers (C5 vehicle model, legal copy, P0-B payout gate) + full validation pass.
**Prepared by:** Engineering (Kilo session). Product sign-off points are called out explicitly.

---

## 1. Summary of fixes in this session

| # | Change | Files |
|---|---|---|
| C5-a | Vehicle-model decision document (Option A temporary, Option B migration path) | `docs/vehicle-model-decision.md` (new) |
| C5-b | Removed dead multi-vehicle activation endpoint | `app/api/driver/vehicle-activate+api.ts` (deleted) |
| C5-c | Vehicle management simplified to single-vehicle display; "Activate" button, activation state and online-switch modal removed; one-vehicle notice ("You can only register one vehicle. Contact support to change it.") replaces the Add button once a vehicle exists | `app/(main)/(rider)/vehicle-management/index.tsx` |
| C5-d | Select-active-vehicle simplified to read-only single-vehicle confirmation with Continue/Add actions; all `vehicle-activate`/`vehicle-type-change` client calls removed | `app/(main)/(rider)/select-active-vehicle.tsx` |
| C5-e | Schema C5 TODO comment updated to record the applied decision (no schema/migration change; unique index `vehicles_driver_id_idx` kept) | `src/db/schema.ts:386` |
| Legal-a | `lib/legalContent.ts` replaced with a generic professional bilingual (en/bn) template — 10 ToS sections, 6 privacy sections, valid dates and `@ride.com.bd` contacts — marked `// @TODO: Replace with approved legal copy` | `lib/legalContent.ts` |
| Legal-b | All four legal screens now render exclusively from `lib/legalContent.ts` via one shared component (previously each hard-coded divergent copy with "Pending owner review" banners and stale `@goride.com` addresses). Bilingual rendering follows the persisted i18n language. | `components/LegalDocumentScreen.tsx` (new); 4 screens under `(customer)/(tabs)/settings/{terms-of-service,privacy-policy}` and `(rider)/settings/{terms-of-service,privacy-policy}` |
| Legal-c | Build-time guard: Jest suite fails on placeholder markers (`@PLACEHOLDER`, "Pending owner review", `goride.com`, `example.com`, TODO/TBD/Lorem) and validates dates/contacts/bilingual completeness | `lib/__tests__/legalContent.test.ts` (new) |
| Legal-d | README release-gate note on required legal text | `README.md` |
| P0-B-a | Removed dead `payout` transaction label; gate comment added | `app/(main)/(rider)/(tabs)/wallet/index.tsx:50` |
| P0-B-b | Product-gate document with verification evidence and the full list of missing decisions | `docs/payout-product-gate.md` (new) |
| Extra | Fixed pre-existing ESLint **error** (`react-hooks/rules-of-hooks`: `useMemo` after early return) blocking the lint gate — hook hoisted above the GPS early-return, no behavior change | `components/Map.tsx:143` |

Previous sessions (uncommitted working tree): C1–C4, H1–H9 fixes across profile, packages, verification, `_layout`, `DriverStatusGuard`, `trips+api`, `commission-statement+api`.

---

## 2. Blocker status

### C5 — Vehicle model contradiction → **RESOLVED (temporary safe default) + documented path forward**
- Applied **Option A: one vehicle per driver**, matching the hard `vehicles_driver_id_idx` unique index and dispatch's single `drivers.vehicle_type` filtering.
- The contradictory multi-vehicle UI and dead endpoint are gone; users get an explicit message instead of a silently-overwritten vehicle.
- **Path forward:** `docs/vehicle-model-decision.md` §3 contains the full Option B migration plan (drop index via drizzle migration, plain INSERT, reinstate activation, restore UI). **Product ruling still required** before multi-vehicle work starts.
- Accepted residual risk (documented): a crafted direct POST to `/api/driver/vehicles` can still overwrite the caller's own vehicle row (upsert retained for idempotent onboarding retries). Server-side `409` guard recommended post-decision.

### Legal copy → **RESOLVED as template + hard gate on placeholders; approval still pending**
- All four screens now consume one source (`lib/legalContent.ts`); professional bilingual template with effective date 2026-08-01, revision 2026-08-22, `support@ride.com.bd` / `privacy@ride.com.bd` contacts.
- Placeholder markers cannot ship: `legalContent.test.ts` fails the suite (and thus the phase-gate `npx jest --watchAll=false`) if any marker reappears.
- README documents what Product/Legal must supply (approved en+bn text, dates, contact address).
- **Path forward:** swap template content for approved copy; keep the guard green. Not a code change.

### P0-B — Instant Pay / payout history → **VERIFIED GATED (no remnants) + documented**
- Verified by source sweep (§3 of `docs/payout-product-gate.md`): no Withdraw/Instant-Pay/cash-out UI anywhere; no API route writes payouts/withdrawals; no store state; dead `TXN_TYPE_LABELS.payout` label removed; wallet screen carries the gate comment; informational "Withdrawals are not yet available" note retained for users.
- Schema enum values (`payout` txn type, `source_tax_payout`/`driver_instant_pay` tax codes) are forward-compatible DB definitions with no writer — kept intentionally and documented.
- **Path forward:** the five required Product decisions (funding source, payout rail, fees/limits/tax, idempotency/reversal/dispute, history semantics) plus the sanctioned implementation path are listed in `docs/payout-product-gate.md` §3–4.

---

## 3. Validation evidence

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** (0 errors; run twice — before and after Map.tsx fix) |
| Lint | `npm run lint` | **PASS** — 0 errors, 55 warnings (all pre-existing tolerated `react-hooks/exhaustive-deps`-class warnings; the prior blocking `components/Map.tsx` rules-of-hooks **error** was fixed this session) |
| Tests | `npx jest --watchAll=false` | **PASS** — 37 suites, **332/332 tests** (includes the new legal-content guard; pre-existing force-exit teardown warning on one worker, not a failure) |
| console.log sweep | source files in `app/ lib/ utils-server/ src/` (492 files, node_modules excluded) | **0 matches** |
| Removed-tech sweep | clerk / stripe / firebase over same scope | **0 matches** |
| Dangling refs | `vehicle-activate` | Only explanatory comments in the decision doc/screens; no code references, no route |
| Legal wiring | all 4 screens | All import `LegalDocumentScreen` → `lib/legalContent.ts` |
| Graph maintenance | `code-review-graph update` | OK (1832 nodes, 366 flows) |

### Manual smoke test — static vs runtime status

Runtime device/emulator testing was **not possible in this environment**. Status per critical path:

| Path | Static evidence | Runtime QA |
|---|---|---|
| Package purchase (auth + confirmation) | Existing `/api/package/*` + `PaymentWebView` flow untouched this session; full test suite green | Required on staging |
| Wallet top-up (PaymentWebView) | Wallet screen wiring verified in source (`handleTopUp` → `/api/driver/wallet/topup` → `payment_url` → `PaymentWebView`); paymentEvents/portposCallback/paymentRepair tests pass | Required on staging |
| Language persistence (Bangla restart) | `i18n/i18n.ts` AsyncStorage persistence verified in source; legal screens now render bn when language = bn | Required on staging |
| Trip history pagination (no duplicates) | H4 keyset cursor (`cursor` + `cursor_id` tiebreaker, limit ≤ 50) verified in `trips+api.ts` | Required on staging |
| Document expiry warnings (expired red badge) | Verified in rewritten `vehicle-management` (expired = red `close-circle`, ≤30d = amber `warning`) | Required on staging |
| Commission calendar weeks | H8 Monday-anchored Dhaka weeks, `week_offset` 0–52 verified in `commission-statement+api.ts` | Required on staging |
| Sign-out (all stores cleared) | `authCleanup.test.ts` passes | Required on staging |
| Vehicle activation (online confirmation) | **Behavior changed by C5 decision:** activation UI/endpoint removed; screen is now single-vehicle display + one-vehicle notice. Verify new flow instead | Required on staging |
| Notification deep links | `_layout.tsx` handling from prior session; not modified this session | Required on staging (as before) |

---

## 4. Deployment checklist (staging)

1. **No migrations required this session** (unique index kept; no schema DDL). Prior uncommitted work also contains no pending migration — confirm with `npx drizzle-kit generate` diff before deploy; run `npx drizzle-kit push` only if a delta appears.
2. Set/verify environment variables per `docs/Plan/11-ENV-VARS.md` (`DATABASE_URL`, `SUPABASE_*`, `PORTPOS_*`, `BARIKOI_API_KEY`, `WEBSOCKET_INTERNAL_SECRET`, `UTILS_SERVER_PORT`, `EXPO_PUBLIC_*`).
3. Deploy order per AGENTS.md: DB push (if any) → `utils-server` (INSTANCE_COUNT=1) → EAS build + submit.
4. Run the staging smoke matrix in §3 (runtime column) — especially the changed vehicle-management/select-active-vehicle flows and the four legal screens in both languages.
5. Legal: obtain approved copy and swap into `lib/legalContent.ts` (guard suite must stay green) — **before production**, not required for staging.
6. Product decisions to schedule (not staging blockers): C5 Option A/B ruling (`docs/vehicle-model-decision.md`), P0-B payout model (`docs/payout-product-gate.md`).
7. Commit the working tree (all C1–C4/H1–H9 + this session's work is currently uncommitted) using the conventional scopes (`fix(driver)`, `docs(...)`, etc.).

---

## 5. Go/No-Go recommendation

**GO for staging. NO-GO for production until two conditions are met.**

Rationale:
- All three blockers are either resolved or safely contained with verifiable guards: C5 has a coherent single-vehicle implementation plus a decision doc; legal copy ships a professional template with a build-time placeholder guard; P0-B is verifiably absent with a documented gate.
- Full validation suite passes: typecheck, lint (0 errors), 332/332 tests, source sweeps clean.

**Production blockers (policy, not engineering):**
1. Approved legal copy (Terms + Privacy, en & bn) must replace the template in `lib/legalContent.ts`.
2. Product ruling on C5 (one vs. many vehicles) — the temporary default is safe, but shipping it to production is a product commitment to support-assisted vehicle changes.

P0-B is explicitly not a production blocker: the feature is intentionally and verifiably absent.
