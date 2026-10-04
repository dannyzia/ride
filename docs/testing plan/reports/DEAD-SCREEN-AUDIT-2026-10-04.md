**Purpose:**     Classify every route file with no inbound navigation edge (the reachability audit's `unreachable` bucket) as dead / live-via-unresolved-table / external-entry, and list broken live entry points still targeting deleted screens. Read before deleting or rewiring any screen.
**Owner:**       Testing/QA tooling (whoever maintains `scripts/audit-nav-integrity.cjs`)
**Status:**      ACTIVE
**Source of truth:** `scripts/audit-nav-integrity.cjs` (measured state). This file is a dated snapshot + classification.
**Related (concrete paths):**
  - `scripts/audit-nav-integrity.cjs` — the resolver that produced the 19-file no-inbound list
  - `tests/meta/audit-nav-integrity.test.ts` — fault-injection suite pinning the resolver's tiers
  - `components/GlobalActionButtons.tsx` — app-wide drawer; the broken-ref source
  - `lib/notificationRouter.ts` — push-tap + deep-link router (live, imported by `app/_layout.tsx:22`)
  - `app/(main)/(rider)/settings/index.tsx` — static SETTINGS table (why 3 "orphans" are live)
  - `maestro/flows/` — flows select none of the dead screens' testIDs
**Last verified:** 2026-10-04, by coding agent (Buffy): audit run + literal-resolution scan + reference greps over `app/`, `components/`, `lib/`, `store/`, `utils-server/`, `maestro/`.
**How to update:** Re-run `node scripts/audit-nav-integrity.cjs` and the literal scan (see § Method), then re-classify; delete entries as screens are removed/wired.

---

# Dead-screen audit — 2026-10-04

Follow-up to the deletion of `find-ride/`, `confirm-ride/`, `apply-promos/` (commit `c7a46be`). Question: which of the 19 no-inbound files are the same kind of dead screen?

**Measured state:** 232 route files · 298 navigation sites · RESOLVED 610 · DANGLING 2 · UNRESOLVED 4 · no-inbound 19 · admin-unlisted 9.

## Verdict

| Class | Count | Action |
|---|---|---|
| Truly dead (no ref of any kind) | **3** | Owner call: delete or wire |
| Live via statically-unresolved table | 4 | None — do not delete |
| External-entry (URL / redirect / share link) | 3 | None — live by design |
| Admin screens, no inbound edge | 9 | Product call: surface in NAV or archive |
| Broken live entry points to deleted screens (not in the 19) | **4 refs / 2 files** | Fix or remove |

## 1. Truly dead (3)

No static ref, no table ref, no notification/deep-link ref, no URL-generation ref, no Maestro flow ref — the same standard that cleared the three deleted screens. Their i18n namespaces are used **only inside themselves** (grep for `t('top_up.` / `t('top_up_details.` / `t('add_payment.` returns nothing outside), so deletion orphans those keys.

- **`app/(main)/(customer)/(tabs)/activity/top-up/index.tsx`** — wallet-history screen; superseded by the live path `(tabs)/wallet` → `settings/top-up` (`app/(main)/(customer)/(tabs)/wallet/index.tsx:242` pushes the live flow; this screen pushes the same target itself). testIDs `customer.activity.top-up.*` not selected by any flow.
- **`app/(main)/(customer)/(tabs)/activity/top-up-details/index.tsx`** — static placeholder: hardcoded label rows, receipt `onPress` is an empty `() => {}`. No data wiring exists.
- **`app/(main)/(customer)/(tabs)/settings/add-payment/index.tsx`** — "coming soon" stub (`add_payment.coming_soon`). No refs anywhere.

Deletion cost: 3 screens + 3 i18n namespaces ×2 locales. **No flow edits** (unlike the previous deletion, which produced 3 blocking assertion lines) — no flow selects these testIDs (`grep` over `maestro/flows/` returns none).

## 2. Live via statically-unresolved tables — NOT dead (4)

These appear in `unreachable` only because the audit tool refuses to guess targets consumed through runtime collections (reported as UNRESOLVED, per design: "runtime-dependent; NOT counted as dead").

- **`app/(main)/(rider)/d/(tabs)/hotspot/index.tsx`** — reached from the app-wide drawer's `DRIVER_ITEMS` entry `/(main)/(rider)/d/hotspot` (`components/GlobalActionButtons.tsx:84`); the drawer is mounted at `app/(main)/_layout.tsx:16` and `app/admin/_layout.tsx:176`; `router.push` with group-elided paths is device-verified to resolve (`GlobalActionButtons.tsx` navigation comment above `navigateTo`). Side note: this is a **second** hotspot screen — the live `hotspot-map` (pushed from earning menu) is a different file. Both are live; consolidation is a product call.
- **`app/(main)/(rider)/settings/account-security/index.tsx`**, **`.../appearance/index.tsx`**, **`.../auto-accept/index.tsx`** — targets of the rider settings hub's static `SETTINGS` table (`app/(main)/(rider)/settings/index.tsx:26,27,29`), pushed via `router.push(item.route as never)` (`:107`).

## 3. External-entry — live by design (3)

Entered by URL, not by an in-app navigation edge; the audit's own footer names two of them.

- **`app/track/[rideId].tsx`** — tracking links are generated for SMS/share: `app/api/ride/request+api.ts:666`, `app/api/ride/schedule+api.ts:339`, `lib/safety.ts:196`, `app/(main)/(customer)/ride-tracking/[ride_id].tsx:366`.
- **`app/payment/success.tsx`** and **`app/payment/failure.tsx`** — PortPos redirect targets: `app/api/payment/portpos/callback+api.ts:36-37`, `app/api/rider/passes+api.ts:111`, `app/api/rider/wallet/topup+api.ts:78`.

## 4. Admin screens with no inbound edge (9) — product decision, not dead code

All 9 are absent from the admin SPA's navigation table (`components/admin/AdminShell.tsx` `NAV`), have no literal reference anywhere in `app/` or `components/` (only their own API routes mention them), and no Maestro flow references them. They are expo-router routes, so they remain reachable by direct URL on admin web — built features awaiting entries, not orphancode.

`app/admin/`: `cancellation-policies.tsx`, `documents.tsx`, `live-ops.tsx`, `premium-allowlist.tsx`, `rider-intro-configs.tsx`, `riders.tsx`, `sos-alerts.tsx`, `sos-contacts.tsx`, `support.tsx`.

Decision needed: surface in NAV vs archive. (Each has a live API route — e.g. `app/api/admin/riders+api.ts`, `.../sos-alerts+api.ts` — so they are functional if reached.)

## 5. Broken live entry points to the deleted screens (found by the literal scan)

The audit tool cannot see these (targets sit in module-const tables consumed via `router.push(route as never)` → its UNRESOLVED bucket), but the literal-resolution scan proves they are dead targets. **Tapping them today navigates to a deleted route.**

| Ref | Target | Syndrome |
|---|---|---|
| `components/GlobalActionButtons.tsx:62` | `/(main)/(customer)/find-ride` | customer drawer "Book Ride" entry |
| `components/GlobalActionButtons.tsx:70` | `/(main)/(customer)/apply-promos` | customer drawer "Promos" entry |
| `lib/notificationRouter.ts:177` | `/(main)/(customer)/apply-promos` | `promo:available` push tap lands nowhere |
| `lib/notificationRouter.ts:304-305` | `/(main)/(customer)/find-ride` | `ride://rider/find-ride` deep link lands nowhere |

Also open (pre-existing, from the audit's DANGLING bucket):
- `components/RiderHeader.tsx:25` → `/(auth)/sign-in` (real file: `app/(auth)/login.tsx`).
- `app/(main)/(fleet)/(tabs)/dashboard/index.tsx:170` → `/(main)/(fleet)/integrations` (no such screen).

Comment rot (no runtime effect): `lib/driverLocationFix.ts:20` and `app/(main)/(customer)/finding-driver/index.tsx:84` reference the deleted `find-ride`/`confirm-ride` paths.

## Method & limits

- Main measurement: `node scripts/audit-nav-integrity.cjs` — AST resolver over `app/**` + `components/**`, route constants in nearest scope, admin NAV table, entry forwarder; three buckets (RESOLVED / DANGLING / UNRESOLVED) + coverage bound.
- Complement scan (run 2026-10-04, temp script, since deleted): every quoted string starting with `/` in `app/`, `components/`, `store/`, `lib/` normalized (route groups stripped, query stripped) and checked against the normalized URL paths of all route files. Result: 26 distinct unresolved misses — 20 non-route noise (URL path fragments like `/week` price suffixes, Supabase storage object paths, test fixtures), 4 real broken refs (§5), plus the 2 known DANGLING targets.
- "Dead" here means: no static ref, no runtime-table ref, no notification/deep-link ref, no URL-generation ref, no flow ref. Native apps are always URL-scheme-addressable in principle; this audit applies the same in-product standard used when `find-ride`/`confirm-ride`/`apply-promos` were deleted.
- The 9 admin screens: URL-addressable on web; "no inbound edge" ≠ "crash if reached".

## Recommended follow-ups (owner call)

1. Delete the dead trio (§1) — cheap: no flows, no refs.
2. Fix or remove the 4 broken refs (§5): repoint drawer/notification entries to live equivalents (`services-hub`/`home` for Book Ride; `(tabs)/profile` or a live promos surface). Do not leave entries pointing at deleted routes.
3. Resolve the 2 long-standing DANGLING targets (`RiderHeader` `/sign-in`, fleet dashboard `/integrations`).
4. Decide the 9 admin screens: add NAV entries or archive.
5. Optional hardening: teach `audit-nav-integrity.cjs` the literal-table resolution used in §5, so this class of bug is gated rather than re-found by hand. The complement scan is small enough to fold in.
