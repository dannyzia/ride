# API Route Audit Report

**Source of Truth:** `docs/Screens Plan/01-04 - Master Plan.md`  
**Audit Date:** 2026-08-15  
**Scope:** `app/api/**/*.ts` and `app/api/**/*.tsx` (Expo API routes only)

---

## 1. Complete Inventory of API Route Files

All files follow the **kebab-case + `+api.ts` suffix** naming convention (Expo file-based routing).

### Top-level files
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `faqs+api.ts` | GET | `/api/faqs` |
| `health+api.ts` | GET | `/api/health` |
| `ping+api.ts` | GET | `/api/ping` |
| `register+api.ts` | POST | `/api/register` |

### ride/
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `get-all+api.ts` | GET | `/api/ride/get-all` |
| `estimate+api.ts` | POST | `/api/ride/estimate` |
| `request+api.ts` | POST | `/api/ride/request` |
| `nearby-drivers+api.ts` | POST | `/api/ride/nearby-drivers` |
| `schedule+api.ts` | POST | `/api/ride/schedule` |
| `[id]/index+api.ts` | GET | `/api/ride/{id}` |
| `[id]/track+api.ts` | GET | `/api/ride/{id}/track` |
| `[id]/tip+api.ts` | POST | `/api/ride/{id}/tip` |
| `[id]/stops+api.ts` | GET, POST | `/api/ride/{id}/stops` |
| `[id]/start+api.ts` | POST | `/api/ride/{id}/start` |
| `[id]/wait-start+api.ts` | POST | `/api/ride/{id}/wait-start` |
| `[id]/wait-end+api.ts` | POST | `/api/ride/{id}/wait-end` |
| `[id]/messages+api.ts` | GET | `/api/ride/{id}/messages` |
| `[id]/message+api.ts` | POST | `/api/ride/{id}/message` |
| `[id]/extra-charge+api.ts` | GET, POST, PATCH | `/api/ride/{id}/extra-charge` |
| `[id]/extra-charge/approve+api.ts` | POST | `/api/ride/{id}/extra-charge/approve` |
| `[id]/details+api.ts` | GET | `/api/ride/{id}/details` |
| `[id]/complete+api.ts` | POST | `/api/ride/{id}/complete` |
| `[id]/cancel+api.ts` | POST | `/api/ride/{id}/cancel` |
| `[id]/cancel-preview+api.ts` | GET | `/api/ride/{id}/cancel-preview` |
| `[id]/arrive+api.ts` | POST | `/api/ride/{id}/arrive` |
| `[id]/no-show+api.ts` | POST | `/api/ride/{id}/no-show` |
| `[id]/alternatives+api.ts` | GET | `/api/ride/{id}/alternatives` |
| `[id]/rate+api.ts` | POST | `/api/ride/{id}/rate` |

### rider/
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `wallet+api.ts` | GET | `/api/rider/wallet` |
| `wallet/topup+api.ts` | POST | `/api/rider/wallet/topup` |
| `addresses+api.ts` | GET, POST, DELETE | `/api/rider/addresses` |
| `fare-disputes+api.ts` | POST, GET | `/api/rider/fare-disputes` |
| `lost-items+api.ts` | POST, GET | `/api/rider/lost-items` |
| `passes+api.ts` | GET, POST | `/api/rider/passes` |
| `points+api.ts` | GET, POST | `/api/rider/points` |
| `notifications+api.ts` | GET | `/api/rider/notifications` |
| `fee-deductions+api.ts` | GET | `/api/rider/fee-deductions` |
| `block+api.ts` | POST, DELETE, GET | `/api/rider/block` |
| `ride/active+api.ts` | GET | `/api/rider/ride/active` |

### driver/
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `me+api.ts` | GET, PATCH | `/api/driver/me` |
| `status+api.ts` | POST | `/api/driver/status` |
| `break/start+api.ts` | POST | `/api/driver/break/start` |
| `break/end+api.ts` | POST | `/api/driver/break/end` |
| `daily-stats+api.ts` | GET | `/api/driver/daily-stats` |
| `documents+api.ts` | GET, POST | `/api/driver/documents` |
| `payout-method+api.ts` | POST | `/api/driver/payout-method` |
| `vehicles+api.ts` | GET, POST | `/api/driver/vehicles` |
| `vehicle-type-change+api.ts` | POST | `/api/driver/vehicle-type-change` |
| `vehicle-models+api.ts` | GET | `/api/driver/vehicle-models` |
| `performance+api.ts` | GET | `/api/driver/performance` |
| `incentives+api.ts` | GET | `/api/driver/incentives` |
| `heatmap+api.ts` | GET | `/api/driver/heatmap` |
| `dues+api.ts` | GET | `/api/driver/dues` |
| `wallet+api.ts` | GET | `/api/driver/wallet` |
| `wallet/topup+api.ts` | POST | `/api/driver/wallet/topup` |
| `call-ledger+api.ts` | GET | `/api/driver/call-ledger` |
| `commission-statement+api.ts` | GET | `/api/driver/commission-statement` |
| `cancellation-credits+api.ts` | GET | `/api/driver/cancellation-credits` |
| `calculate-price+api.ts` | GET | `/api/driver/calculate-price` |
| `consent+api.ts` | POST | `/api/driver/consent` |
| `commute+api.ts` | POST, GET, DELETE | `/api/driver/commute` |
| `earnings/breakdown+api.ts` | GET | `/api/driver/earnings/breakdown` |
| `gamification/index+api.ts` | GET | `/api/driver/gamification` |
| `get+api.ts` | GET | `/api/driver/get` |
| `lost-items+api.ts` | GET, PATCH | `/api/driver/lost-items` |
| `missed-requests+api.ts` | GET | `/api/driver/missed-requests` |
| `points+api.ts` | GET, POST | `/api/driver/points` |
| `preferences+api.ts` | GET, POST | `/api/driver/preferences` |
| `pricing-reference+api.ts` | GET | `/api/driver/pricing-reference` |
| `ratings+api.ts` | GET | `/api/driver/ratings` |
| `schedule+api.ts` | GET, PUT | `/api/driver/schedule` |
| `slider-config+api.ts` | GET | `/api/driver/slider-config` |
| `sos-alert+api.ts` | POST | `/api/driver/sos-alert` |

### promo/
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `redeem+api.ts` | POST | `/api/promo/redeem` |
| `list+api.ts` | GET | `/api/promo/list` |

### sos/
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `contacts+api.ts` | GET | `/api/sos/contacts` |

### Other directories (partial list — scope-limited to plan-adjacent routes)
| File | Exported Method(s) | Path Pattern |
|------|-------------------|--------------|
| `rider/passes+api.ts` | GET, POST | `/api/rider/passes` |
| `admin/rider-passes+api.ts` | GET, POST, PATCH, DELETE | `/api/admin/rider-passes` |
| `admin/sos-alerts+api.ts` | GET | `/api/admin/sos-alerts` |
| `admin/sos-contacts+api.ts` | GET, PATCH | `/api/admin/sos-contacts` |

---

## 2. Cross-Reference Against Master Plan

### Section 10.1 Required Routes

| # | Required Route | Status | Codebase Path | Notes |
|---|---------------|--------|---------------|-------|
| 1 | `GET /api/ride/get-all` | **EXISTS** | `ride/get-all+api.ts` | — |
| 2 | `GET /api/ride/{id}` | **EXISTS** | `ride/[id]/index+api.ts` | — |
| 3 | `POST /api/ride/request` | **EXISTS** | `ride/request+api.ts` | — |
| 4 | `POST /api/ride/{id}/cancel` | **EXISTS** | `ride/[id]/cancel+api.ts` | — |
| 5 | `POST /api/ride/{id}/rate` | **EXISTS** | `ride/[id]/rate+api.ts` | — |
| 6 | `POST /api/ride/nearby-drivers` | **EXISTS** | `ride/nearby-drivers+api.ts` | — |
| 7 | `GET /api/rider/wallet` | **EXISTS** | `rider/wallet+api.ts` | — |
| 8 | `GET /api/driver/me` | **EXISTS** | `driver/me+api.ts` | — |
| 9 | `POST /api/driver/status` | **EXISTS** | `driver/status+api.ts` | — |
| 10 | `POST /api/driver/break/start` | **EXISTS** | `driver/break/start+api.ts` | — |
| 11 | `GET /api/driver/daily-stats` | **EXISTS** | `driver/daily-stats+api.ts` | — |
| 12 | `POST /api/driver/documents` | **EXISTS** | `driver/documents+api.ts` | — |
| 13 | `GET /api/driver/documents` | **EXISTS** | `driver/documents+api.ts` | Same file as #12 |
| 14 | `POST /api/driver/payout-method` | **EXISTS** | `driver/payout-method+api.ts` | — |
| 15 | `POST /api/promo/redeem` | **EXISTS** | `promo/redeem+api.ts` | — |
| 16 | `POST /api/sos/alert` | **MISSING** | — | See §3.1 |

### Section 11.1–11.2 Additional Required Routes

| # | Required Route | Status | Codebase Path | Notes |
|---|---------------|--------|---------------|-------|
| 17 | `GET /api/ride/:id/cancel-preview` | **EXISTS** | `ride/[id]/cancel-preview+api.ts` | — |
| 18 | `GET /api/promo/list` | **EXISTS** | `promo/list+api.ts` | — |
| 19 | `POST /api/rider/fare-disputes` | **EXISTS** | `rider/fare-disputes+api.ts` | — |
| 20 | `POST /api/rider/lost-items` | **EXISTS** | `rider/lost-items+api.ts` | — |
| 21 | `GET /api/rider/lost-items` | **EXISTS** | `rider/lost-items+api.ts` | Same file as #20 |
| 22 | `GET /api/admin/rider-passes` | **EXISTS** | `admin/rider-passes+api.ts` | — |
| 23 | `GET /api/driver/hotspots` | **MISSING** | — | See §3.2 |
| 24 | `GET /api/driver/performance` | **EXISTS** | `driver/performance+api.ts` | — |
| 25 | `POST /api/ride/:id/no-show` | **EXISTS** | `ride/[id]/no-show+api.ts` | — |
| 26 | `GET /api/driver/subscription-plans` | **MISSING** | — | See §3.3 |
| 27 | `GET /api/driver/due-amounts` | **MISMATCH** | `driver/dues+api.ts` | Path is `/api/driver/dues`, not `/api/driver/due-amounts` |
| 28 | `GET /api/driver/vehicles` | **EXISTS** | `driver/vehicles+api.ts` | — |
| 29 | `GET /api/driver/incentives` | **EXISTS** | `driver/incentives+api.ts` | — |
| 30 | `GET /api/driver/insurance` | **MISSING** | — | See §3.4 |
| 31 | `POST /api/ride/schedule` | **EXISTS** | `ride/schedule+api.ts` | — |

---

## 3. Missing Routes Analysis

### 3.1 POST /api/sos/alert — **MISSING**

- **Plan expectation:** `POST /api/sos/alert` (Section 10.1)
- **Actual code:** `POST /api/driver/sos-alert` (`driver/sos-alert+api.ts`)
- **Impact:** The plan specifies a top-level `sos/` namespace, but the endpoint is nested under `driver/`. Any rider-facing SOS screen (R16 Emergency SOS per Section 5.2) that calls `/api/sos/alert` would hit a 404.
- **Fix options:**
  1. Rename/move `driver/sos-alert+api.ts` to `sos/alert+api.ts` and adjust the auth check to accept both rider and driver roles.
  2. Create a new `sos/alert+api.ts` that wraps the existing driver logic and adds rider support.

### 3.2 GET /api/driver/hotspots — **MISSING**

- **Plan expectation:** `GET /api/driver/hotspots` (Section 11.2, screen D27 Hotspot Map)
- **Actual code:** `GET /api/driver/heatmap` (`driver/heatmap+api.ts`)
- **Impact:** Screen D27 references `/api/driver/hotspots`, but the server only exposes `/api/driver/heatmap`. The data shape also differs: `heatmap` returns `demandForecasts` rows, while the plan implies a hotspot/demand heatmap overlay.
- **Fix options:**
  1. Rename `driver/heatmap+api.ts` to `driver/hotspots+api.ts` and verify the response shape matches what D27 expects.
  2. Create an alias `driver/hotspots+api.ts` that delegates to `heatmap+api.ts`.

### 3.3 GET /api/driver/subscription-plans — **MISSING**

- **Plan expectation:** `GET /api/driver/subscription-plans` (Section 11.2, screens D37–D40)
- **Actual code:** No file found under `app/api/driver/` for subscription plans.
- **Impact:** Driver subscription plan screens (Subscription Plans, Checkout, Confirmation, Details, Renewal, Active Subscription) have no backend endpoint to fetch available plans.
- **Fix options:**
  1. Create `driver/subscription-plans+api.ts` with a GET handler that queries `packages` / `subscriptions` for available driver call packages.

### 3.4 GET /api/driver/insurance — **MISSING**

- **Plan expectation:** `GET /api/driver/insurance` (Section 11.2, screen D29 Insurance)
- **Actual code:** No file found under `app/api/driver/` for insurance.
- **Impact:** Driver insurance screen (D29) has no backend endpoint.
- **Fix options:**
  1. Create `driver/insurance+api.ts` with a GET handler. Determine if this returns insurance product listings or the driver's active insurance policy.

### 3.5 GET /api/driver/due-amounts — **PATH MISMATCH**

- **Plan expectation:** `GET /api/driver/due-amounts` (Section 11.2, screen D21 Due Amounts)
- **Actual code:** `GET /api/driver/dues` (`driver/dues+api.ts`)
- **Impact:** Screen D21 references `/api/driver/due-amounts`, but the server returns data at `/api/driver/dues`. This is a path mismatch, not a missing feature.
- **Fix options:**
  1. Rename `driver/dues+api.ts` to `driver/due-amounts+api.ts` to match the plan.
  2. Create a symlink/alias file.

---

## 4. Naming Convention Compliance

| Convention | Status | Details |
|-----------|--------|---------|
| **kebab-case file names** | **PASS** | All files use lowercase kebab-case (e.g., `cancel-preview+api.ts`) |
| **`+api.ts` suffix** | **PASS** | All route files end with `+api.ts` |
| **Dynamic segment `[id]`** | **PASS** | Parameterized routes use Expo convention: `export async function GET(request, { id })` |
| **Resource grouping** | **PASS** | Routes are grouped by resource (`ride/`, `rider/`, `driver/`, `promo/`, `sos/`) |
| **No `.tsx` route files** | **PASS** | No `.tsx` files found in `app/api/` |

**One convention deviation:**
- `driver/sos-alert+api.ts` uses a hyphen in the filename (`sos-alert`), which is valid kebab-case, but the plan expects the path segment `sos/alert` (two segments). The current implementation collapses it into one segment.

---

## 5. Summary

| Category | Count | Details |
|----------|-------|---------|
| **Required routes in plan** | 31 | From Sections 10.1 and 11.1–11.2 |
| **Routes that EXIST** | 26 | Fully implemented and matching plan paths |
| **Routes that are MISSING** | 4 | `sos/alert`, `driver/hotspots`, `driver/subscription-plans`, `driver/insurance` |
| **Routes with PATH MISMATCH** | 1 | `driver/dues` vs plan's `driver/due-amounts` |
| **Extra routes not in plan** | ~40+ | Implemented beyond the plan scope (ride lifecycle extras, driver secondary flows, admin CRUD, payment callbacks, user settings, etc.) |

### Immediate Actions Required

1. **Create `sos/alert+api.ts`** — Rider + driver SOS alert endpoint at the plan-specified path.
2. **Rename `driver/heatmap+api.ts` → `driver/hotspots+api.ts`** — Match D27 screen reference.
3. **Create `driver/subscription-plans+api.ts`** — Driver subscription plan listings for D37–D40.
4. **Create `driver/insurance+api.ts`** — Driver insurance data for D29.
5. **Rename `driver/dues+api.ts` → `driver/due-amounts+api.ts`** — Match D21 screen reference.
