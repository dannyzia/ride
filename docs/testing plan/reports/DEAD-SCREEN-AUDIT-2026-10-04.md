**Purpose:**     Classify every route file with no inbound navigation edge (the reachability audit's `unreachable` bucket) as dead / live-via-unresolved-table / external-entry, and list broken live entry points still targeting deleted screens. Read before deleting or rewiring any screen.
**Owner:**       Testing/QA tooling (whoever maintains `scripts/audit-nav-integrity.cjs`)
**Status:**      ACTIVE
**Source of truth:** `scripts/audit-nav-integrity.cjs` (measured state). This file is a dated snapshot + classification.
**Related (concrete paths):**
  - `scripts/audit-nav-integrity.cjs` — the resolver that produced the 19-file no-inbound list
  - `scripts/audit-deletion-impact.cjs` — the one-command join of that list with the i18n orphan audit: per no-inbound screen, the testIDs and locale keys that die with it
  - `tests/meta/audit-nav-integrity.test.ts` — fault-injection suite pinning the resolver's tiers
  - `components/GlobalActionButtons.tsx` — app-wide drawer; the broken-ref source
  - `lib/notificationRouter.ts` — push-tap + deep-link router (live, imported by `app/_layout.tsx:22`)
  - `app/(main)/(rider)/settings/index.tsx` — static SETTINGS table (why 3 "orphans" are live)
  - `maestro/flows/` — flows select none of the dead screens' testIDs
**Last verified:** 2026-10-05, by coding agent (Buffy): §5 repoint applied, then the audit tool gained the static data-table sweep (follow-up #5), then all 9 no-inbound admin screens were surfaced in the AdminShell NAV (§4). Re-verified with reference greps + `node scripts/audit-nav-integrity.cjs` (DANGLING stays the 2 pre-existing targets; 137 table literals checked, 0 dangling; adminUnlisted 0, no-inbound 7). Rest of the file from the 2026-10-04 audit run over `app/`, `components/`, `lib/`, `store/`, `utils-server/`, `maestro/`.
**How to update:** Re-run `node scripts/audit-nav-integrity.cjs` and the literal scan (see § Method), then re-classify; delete entries as screens are removed/wired.

---

# Dead-screen audit — 2026-10-04

Follow-up to the deletion of `find-ride/`, `confirm-ride/`, `apply-promos/` (commit `c7a46be`). Question: which of the 19 no-inbound files are the same kind of dead screen?

**Measured state:** 232 route files · 298 navigation sites · RESOLVED 610 · DANGLING 2 · UNRESOLVED 4 · no-inbound 19 · admin-unlisted 9.

## Verdict

| Class | Count | Action |
|---|---|---|
| Truly dead (no ref of any kind) | **0** (was 3) | DONE 2026-10-04 — the trio was deleted (§1) |
| Live via statically-unresolved table | 4 | None — do not delete |
| External-entry (URL / redirect / share link) | 3 | None — live by design |
| Admin screens, no inbound edge | **0** (was 9) | DONE 2026-10-05 — all surfaced in NAV (§4) |
| Broken live entry points to deleted screens (not in the 19) | **4 refs / 2 files** | FIXED 2026-10-05 (§5) |

## 1. Truly dead (3) — deleted 2026-10-04

No static ref, no table ref, no notification/deep-link ref, no URL-generation ref, no Maestro flow ref — the same standard that cleared the three deleted screens. Their i18n namespaces are used **only inside themselves** (grep for `t('top_up.` / `t('top_up_details.` / `t('add_payment.` returns nothing outside), so deletion orphans those keys.

- **`app/(main)/(customer)/(tabs)/activity/top-up/index.tsx`** — wallet-history screen; superseded by the live path `(tabs)/wallet` → `settings/top-up` (`app/(main)/(customer)/(tabs)/wallet/index.tsx:242` pushes the live flow; this screen pushes the same target itself). testIDs `customer.activity.top-up.*` not selected by any flow.
- **`app/(main)/(customer)/(tabs)/activity/top-up-details/index.tsx`** — static placeholder: hardcoded label rows, receipt `onPress` is an empty `() => {}`. No data wiring exists.
- **`app/(main)/(customer)/(tabs)/settings/add-payment/index.tsx`** — "coming soon" stub (`add_payment.coming_soon`). No refs anywhere.

Deletion cost: 3 screens + 3 i18n namespaces ×2 locales. **No flow edits** (unlike the previous deletion, which produced 3 blocking assertion lines) — no flow selects these testIDs (`grep` over `maestro/flows/` returns none).

The previous deletion's cleanup is now the reference procedure: on 2026-10-04 its 106 stranded keys (confirm_ride 58, find_ride 36, apply_promos 11, ride.request 1) were purged from both locales and from the baseline (236 → 130 entries; locales 1,470 → 1,364 flat keys each) with `node scripts/purge-orphan-keys.cjs confirm_ride find_ride apply_promos ride.request`. For the §1 trio: delete the screens, then run `node scripts/purge-orphan-keys.cjs --new` in the same change — `--gate` lists `top_up.*` / `top_up_details.*` / `add_payment.*` as the new orphans and `--new` removes exactly those keys from both locales and prunes the baseline. Full procedure: §Deleting a screen — same-change cleanup below.

**Applied to this trio on 2026-10-04.** All three files were deleted (no nav/notification refs existed anywhere), the gate listed the predicted 17 new orphans (`top_up.*` 3, `wallet.transaction_types.*` 5, `top_up_details.*` 6, `add_payment.*` 3), `node scripts/purge-orphan-keys.cjs --new` removed exactly them from both locales (1,364 → 1,347 keys each; the baseline stayed at 130 — these were new orphans, not backlog), and the regenerated testID map dropped its 8 ids (1,109 → 1,101). No flow edits were needed. One follow-on: purging `wallet.transaction_types.payout` unmasked a pre-existing hard-coded "Payout" in the driver-onboarding flow (STEP_TITLES[5], `app/(main)/(rider)/onboarding/index.tsx:130`), which now has a dated entry in `maestro/tools/flow-locale-baseline.json` until that screen is localized.

## 2. Live via statically-unresolved tables — NOT dead (4)

These appear in `unreachable` only because the audit tool refuses to guess targets consumed through runtime collections (reported as UNRESOLVED, per design: "runtime-dependent; NOT counted as dead").

- **`app/(main)/(rider)/d/(tabs)/hotspot/index.tsx`** — reached from the app-wide drawer's `DRIVER_ITEMS` entry `/(main)/(rider)/d/hotspot` (`components/GlobalActionButtons.tsx:84`); the drawer is mounted at `app/(main)/_layout.tsx:16` and `app/admin/_layout.tsx:176`; `router.push` with group-elided paths is device-verified to resolve (`GlobalActionButtons.tsx` navigation comment above `navigateTo`). Side note: this is a **second** hotspot screen — the live `hotspot-map` (pushed from earning menu) is a different file. Both are live; consolidation is a product call.
- **`app/(main)/(rider)/settings/account-security/index.tsx`**, **`.../appearance/index.tsx`**, **`.../auto-accept/index.tsx`** — targets of the rider settings hub's static `SETTINGS` table (`app/(main)/(rider)/settings/index.tsx:26,27,29`), pushed via `router.push(item.route as never)` (`:107`).

## 3. External-entry — live by design (3)

Entered by URL, not by an in-app navigation edge; the audit's own footer names two of them.

- **`app/track/[rideId].tsx`** — tracking links are generated for SMS/share: `app/api/ride/request+api.ts:666`, `app/api/ride/schedule+api.ts:339`, `lib/safety.ts:196`, `app/(main)/(customer)/ride-tracking/[ride_id].tsx:366`.
- **`app/payment/success.tsx`** and **`app/payment/failure.tsx`** — PortPos redirect targets: `app/api/payment/portpos/callback+api.ts:36-37`, `app/api/rider/passes+api.ts:111`, `app/api/rider/wallet/topup+api.ts:78`.

## 4. Admin screens with no inbound edge (9) — product decision, not dead code — RESOLVED 2026-10-05

All 9 are absent from the admin SPA's navigation table (`components/admin/AdminShell.tsx` `NAV`), have no literal reference anywhere in `app/` or `components/` (only their own API routes mention them), and no Maestro flow references them. They are expo-router routes, so they remain reachable by direct URL on admin web — built features awaiting entries, not orphancode.

`app/admin/`: `cancellation-policies.tsx`, `documents.tsx`, `live-ops.tsx`, `premium-allowlist.tsx`, `rider-intro-configs.tsx`, `riders.tsx`, `sos-alerts.tsx`, `sos-contacts.tsx`, `support.tsx`.

Decision needed: surface in NAV vs archive. (Each has a live API route — e.g. `app/api/admin/riders+api.ts`, `.../sos-alerts+api.ts` — so they are functional if reached.)

**Resolved 2026-10-05 — all 9 surfaced in the AdminShell NAV; none archived.** Every screen is the only UI for a backend feature that is demonstrably live, so archiving would have stranded working APIs; the panel gained 9 entries. Audit after: `adminUnlisted` 9 → 0, no-inbound screens 16 → 7 (the 4 live-via-table + 3 external-entry below), RESOLVED 607 → 616 on the unchanged route tree.

| Screen | Why it was kept (evidence) | NAV placement (role) |
|---|---|---|
| `cancellation-policies.tsx` | `evaluateCancellation` (`lib/cancellation.ts`) is called by `app/api/ride/[id]/cancel`, `cancel-preview` and `no-show`; the policy table is the live fee-rule source and this is its only editor | Config · "Cancellation Policies" (catalog.write) |
| `documents.tsx` | per-document approve/reject is the only UI for `app/api/admin/documents/{pending,approve,reject}` + presigned-url; the dashboard already counts `pending_documents`; `queue.tsx` shows documents read-only | Operations · "Documents" (verification.write) |
| `live-ops.tsx` | `/api/admin/live-stats` is a real DB query; distinct from Dashboard (single load, no dispatch-state counters) and Monitoring (forensics tabs) | Operations · "Live Ops" (admin.read) |
| `premium-allowlist.tsx` | `lib/premiumAllowlist.ts` feeds `resolveVehicleType` → `app/api/driver/vehicles+api.ts`; an F15-UI item | Programs · "Premium Allowlist" (catalog.write) |
| `rider-intro-configs.tsx` | `getIntroDiscount` (`lib/introIncentive.ts`) is consumed by `lib/discountEngine.ts` → `ride/estimate` + `ride/request` | Programs · "Intro Discounts" (catalog.write) |
| `riders.tsx` | only rider directory in the panel (`/api/admin/riders`, admin.read) | Operations · "Riders" (admin.read) |
| `sos-alerts.tsx` | real-time safety feed (admin socket + 60s intensity) with ack via `sos-alerts/[id]/ack` | Operations · "SOS Alerts" (safety.write) |
| `sos-contacts.tsx` | canonical manager for `system_config.sos_contacts` — `platform-config.tsx` explicitly excludes that key as "managed on a different screen"; the driver app reads `app/api/sos/contacts` | Operations · "SOS Contacts" (safety.write) |
| `support.tsx` | tickets are created by four live report-issue flows via `app/api/support/ticket`; admin list/reply/assign all live | Operations · "Support Tickets" (finance.write as implemented — see noted issue) |

Noted issues (owner call, not changed here):
- All four tickets APIs (`app/api/admin/tickets*`) gate on `finance.write`, while `lib/adminRbac.ts` documents tickets under `support.write` (owner/admin/ops_manager). The NAV roles mirror the APIs as built so the entry never 403s; aligning the APIs with the matrix would add ops_manager access to tickets.
- `app/admin/premium-allowlist.tsx` predates AdminShell (custom header + back arrow, light theme) — it works from the NAV, but a retrofit to the shell chrome is a follow-up.
- `app/admin/riders.tsx` is read-only; `riders/[id]/refund` and `/suspend` remain API-only.

## 5. Broken live entry points to the deleted screens (found by the literal scan) — FIXED 2026-10-05

The audit tool cannot see these (targets sit in module-const tables consumed via `router.push(route as never)` → its UNRESOLVED bucket), but the literal-resolution scan proved they were dead targets. All four were repointed to live routes on 2026-10-05; a re-run of the literal grep confirms no `customer)/find-ride` or `customer)/apply-promos` route string remains in `app/`, `components/`, `lib/`, `store/` (only two stale code comments survive — the comment-rot list below).

| Ref | Broken target | Repointed to (2026-10-05) | Syndrome |
|---|---|---|---|
| `components/GlobalActionButtons.tsx:62` | `/(main)/(customer)/find-ride` | `/(main)/(customer)/(tabs)/home` | customer drawer "Book Ride" entry — the booking sheet lives on home (find-ride absorbed) |
| `components/GlobalActionButtons.tsx:70` | `/(main)/(customer)/apply-promos` | `/(main)/(customer)/(tabs)/settings/loyalty` | customer drawer "Promos" entry — loyalty is the live customer offers/redeem surface |
| `lib/notificationRouter.ts:177` | `/(main)/(customer)/apply-promos` | `/(main)/(customer)/(tabs)/settings/loyalty` | `promo:available` push tap |
| `lib/notificationRouter.ts:304-305` | `/(main)/(customer)/find-ride` | `/(main)/(customer)/(tabs)/home` | `ride://rider/find-ride` deep link — the pattern is kept as a legacy alias so old shared links still land on home |

Known redundancy left in place (product call): the drawer's `Book Ride` and `Home` rows now target the same route — collapsing rows is a UI cleanup, not a broken ref.

This class is now gated rather than hand-found: `scripts/audit-nav-integrity.cjs` validates every nav-key literal that is a direct element of an array-table row (the drawer's `CUSTOMER_ITEMS` shape) even when the consumer chain stays UNRESOLVED, reports misses as TABLE DANGLING, and exits 2 on them under `--gate` (2026-10-05, follow-up #5). The `lib/`-side literals (`notificationRouter`) remain outside the tool's scan scope — see the known gap recorded in the tool's block in `AGENTS.md`.

Also open (pre-existing, from the audit's DANGLING bucket):
- `components/RiderHeader.tsx:25` → `/(auth)/sign-in` (real file: `app/(auth)/login.tsx`).
- `app/(main)/(fleet)/(tabs)/dashboard/index.tsx:170` → `/(main)/(fleet)/integrations` (no such screen).

Comment rot (no runtime effect): `lib/driverLocationFix.ts:20` and `app/(main)/(customer)/finding-driver/index.tsx:84` reference the deleted `find-ride`/`confirm-ride` paths.

## Deleting a screen — same-change cleanup

Deleting a screen strands two kinds of artifact: its testIDs (the map and any flow selecting
them) and its locale keys (the gate fails on the new orphans). Both leave in the SAME change —
a later, separate purge commit is not this procedure.

1. **Prove it is dead.** Zero inbound `router.push/replace/href`, and no `Tabs.Screen`/`Stack.Screen`
   registration in any `_layout.tsx` — `node scripts/audit-nav-integrity.cjs`; classification per §1–5.
   Preview the cost: `node scripts/audit-deletion-impact.cjs --screen <path>` lists the screen's
   testIDs and the locale keys that die with it (the two audits joined, nothing inferred).
2. **Delete** the screen file(s) and every nav/notification ref still targeting its route.
3. **Regenerate the testID map:** `node maestro/tools/testid-manifest.cjs` (stage
   `maestro/tools/testid-map.json`; pre-commit stage 5 diffs its attribution against the staged `app/`).
4. **Fix the flows:** repoint or delete flows (and comment refs) selecting the dead screen's testIDs;
   update its entry in `maestro/tools/flow-testid-map.json` (date + why + absorbed-by). Pre-commit
   stage 6 blocks a flow selector whose testID this commit removes.
5. **Purge the stranded locale keys:** `node scripts/audit-i18n-orphans.cjs --gate` fails with the
   screen's now-orphaned keys; `node scripts/purge-orphan-keys.cjs --new` deletes exactly those keys
   from both locales and prunes `scripts/i18n-orphan-baseline.json` in one step. `--dry-run` previews;
   a wholly dead namespace can be selected by name (`node scripts/purge-orphan-keys.cjs <namespace>...`),
   which refuses if any matched key is still live.
6. **Verify:** `node maestro/tools/flow-xcheck.cjs`; `node scripts/audit-i18n-orphans.cjs --gate`
   (must exit 0); `npm run lint && npx tsc --noEmit`.
7. **Commit as one change:** deletion + testID map + flows + both locales + baseline.

Worked example (2026-10-04): the 106 keys stranded by the 2026-10-03 deletions (`confirm_ride` 58,
`find_ride` 36, `apply_promos` 11, `ride.request` 1) were purged with
`node scripts/purge-orphan-keys.cjs confirm_ride find_ride apply_promos ride.request` — baseline
236 → 130 entries, locales 1,470 → 1,364 flat keys each, gate green. The terse checklist lives as
Workflow 9 in the local `.claude/WORKFLOWS.md`.

## Method & limits

- Main measurement: `node scripts/audit-nav-integrity.cjs` — AST resolver over `app/**` + `components/**`, route constants in nearest scope, admin NAV table, entry forwarder; three buckets (RESOLVED / DANGLING / UNRESOLVED) + coverage bound.
- Complement scan (run 2026-10-04, temp script, since deleted — **folded into the tool 2026-10-05 as the static data-table sweep**, so the §5 drawer class now gates): every quoted string starting with `/` in `app/`, `components/`, `store/`, `lib/` normalized (route groups stripped, query stripped) and checked against the normalized URL paths of all route files. Result: 26 distinct unresolved misses — 20 non-route noise (URL path fragments like `/week` price suffixes, Supabase storage object paths, test fixtures), 4 real broken refs (§5), plus the 2 known DANGLING targets.
- "Dead" here means: no static ref, no runtime-table ref, no notification/deep-link ref, no URL-generation ref, no flow ref. Native apps are always URL-scheme-addressable in principle; this audit applies the same in-product standard used when `find-ride`/`confirm-ride`/`apply-promos` were deleted.
- The 9 admin screens: were URL-addressable-only on web; surfaced in the AdminShell NAV on 2026-10-05 (§4).

## Recommended follow-ups (owner call)

1. ~~Delete the dead trio (§1)~~ — **done 2026-10-04**: the 17 stranded keys were purged in the same change, no flows were touched (§1 postscript).
2. ~~Fix or remove the 4 broken refs (§5)~~ — **done 2026-10-05**: all 4 repointed to live routes (`(tabs)/home` for Book Ride + the `rider/find-ride` deep-link alias; `(tabs)/settings/loyalty` for Promos + `promo:available`). Nav audit unchanged (DANGLING stays the 2 pre-existing targets); no runtime ref to either deleted route remains.
3. Resolve the 2 long-standing DANGLING targets (`RiderHeader` `/sign-in`, fleet dashboard `/integrations`).
4. ~~Decide the 9 admin screens: add NAV entries or archive.~~ — **done 2026-10-05**: all 9 surfaced in the `AdminShell` NAV, none archived (each is the only UI for a live backend feature — per-screen evidence in §4). Audit after: `adminUnlisted` 9 → 0, no-inbound 16 → 7, RESOLVED 607 → 616.
5. ~~Optional hardening: teach `audit-nav-integrity.cjs` the literal-table resolution used in §5~~ — **done 2026-10-05**: the static data-table sweep validates every nav-key literal that is a direct element of an array-table row (reported as TABLE DANGLING, deduped against navigation-site findings, exit 2 under `--gate`; 128 literals checked on the real tree before the §4 NAV additions, 137 after, 0 dangling) and is pinned by 6 new tests in `tests/meta/audit-nav-integrity.test.ts` (28 total, with an anchor/fault pair). Deliberate remaining gap: literal pushes in `lib/` (e.g. `lib/notificationRouter.ts`) stay outside the scan scope.
6. Retrofit `app/admin/premium-allowlist.tsx` to the AdminShell chrome (it predates the shell — custom header/back arrow, light theme) now that it has a NAV entry.
7. Align the four tickets admin APIs with `lib/adminRbac.ts`'s documented `support.write` (they currently gate on `finance.write`) — owner call; would add ops_manager access to tickets.
