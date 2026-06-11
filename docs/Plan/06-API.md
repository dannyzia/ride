<!--
AI INSTRUCTIONS
===============
Base: GlideX app/api/ — existing routes: login, register, clerk-role, create-payment, ride/create, ride/get-all,
      driver/*, ping, send-email, unique-email, unique-number.
This file lists ONLY:
  - Routes to DELETE (remove file)
  - Routes to REPLACE (same path, different implementation)
  - Routes to ADD (new files)
  - Routes to KEEP with modifications noted
Do not re-document unchanged GlideX routes.
Auth: ALL routes require Supabase JWT in Authorization: Bearer header UNLESS marked [public]. Server verifies via supabase.auth.getUser(jwt).
Validation: ALL routes validate with Zod at the route boundary.
Error format: { "error": "machine_code", "message": "human description" }
Money values: always in BDT paisa (integer). Never floats. Convert to ৳ for display only in the client.

VEHICLE TYPE CHANGE NOTE (integrated 2025-05, case-normalised 2025-07):
All vehicle_type enum fields now use 8 lowercase values:
  'bike_basic' | 'bike_standard' | 'bike_plus' | 'cng' |
  'car_economy' | 'car_comfort' | 'car_premium' | 'car_xl'
The old 4-value enum ('MOTORCYCLE','CNG_AUTO_RICKSHAW','CAR','MICROBUS') is REMOVED.
The old UPPERCASE 8-value enum is REPLACED by these lowercase values.
Every Zod schema, response shape, and enum reference in this file uses the new lowercase 8-value list.
-->

# API Contract: Ride
> Delta from GlideX. Base URL: `EXPO_PUBLIC_SERVER_URL` (env var). Version: 1.

---

## Global vehicle_type enum

All endpoints that accept or return `vehicle_type` use exactly these 8 lowercase values:

```
'bike_basic' | 'bike_standard' | 'bike_plus' | 'cng' |
'car_economy' | 'car_comfort' | 'car_premium' | 'car_xl'
```

Import the Zod enum from `lib/vehicleTypes.ts: VEHICLE_TYPE_ZOD_ENUM`. Do not define inline.

---

## Routes to DELETE from GlideX

| File | Reason |
|------|--------|
| `app/api/login+api.ts` | Clerk login — replaced |
| `app/api/clerk-role+api.ts` | Clerk role sync — removed |
| `app/api/create-payment+api.ts` | Stripe — replaced |
| `app/api/send-email+api.ts` | Email notifications — out of scope MVP |
| `app/api/unique-email+api.ts` | Replace with phone uniqueness check |

---

## Routes to KEEP (no changes needed)

| File | Notes |
|------|-------|
| `app/api/ping+api.ts` | Health check — keep as-is |
| `app/api/unique-number+api.ts` | Phone uniqueness — `GET /api/unique-number?phone=+88...` -> `{ available: bool }`. [public]. Rate limit 30/IP/min. |

---

## Routes to REPLACE

### POST /api/register
**Replaces:** GlideX register (Clerk-based)
**Purpose:** Create user record after Supabase phone auth completes.
**Auth:** [public] — Supabase JWT already verified client-side; server extracts uid/phone from JWT

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | 2–100 chars |
| role | string | yes | Enum: 'rider', 'driver' |
| vehicle_type | string | no | vehicleTypeEnum (8 values). REQUIRED if role='driver'. |

**Note:** Clients MUST NOT include `auth_uid` or `phone` in the body — taken from Supabase JWT claims (verified by middleware) only. Body containing those fields → 400 `body_field_forbidden`.

**Transaction:** Wraps in a single DB transaction:
1. INSERT users (auth_uid from JWT sub claim, phone from JWT, name, role)
2. INSERT drivers (user_id, vehicle_type, status='pending') — only if role='driver'
3. No used_challenges check needed — Supabase Auth handles replay protection
On rollback: 500 `registration_failed`. Client may retry.

**Success: 201**
```json
{ "user_id": "uuid", "role": "rider|driver", "next": "onboarding|home" }
```

`next` determination: if `role='rider'` → always `'home'`. If `role='driver'` → always `'onboarding'` (driver must complete vehicle registration and profile regardless of prior partial state — the app handles step resumption internally).

**Errors**
| Code | Condition |
|------|-----------|
| 400 | Invalid body or body_field_forbidden |
| 409 | Phone already registered |
| 401 | Supabase JWT invalid or expired |

---

### GET /api/ride/get-all
**Replaces:** GlideX version (no auth, no role filter)
**Change:** Role-based filter. Rider sees own rides. Driver sees own rides. Admin sees all. Soft-deleted user joins: return "Deleted user" for name.

---

### POST /api/ride/request (was /api/ride/create)
**Replaces:** GlideX ride creation
**Rate limit:** At most 1 active ride per rider (returns 409 `ride_already_active`); then 5/hour (returns 429 `rider_rate_limited`). Active-ride check fires first.

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| pickup | object | yes | `{ lat: number, lng: number, address: string }` |
| dropoff | object | yes | `{ lat: number, lng: number, address: string }` |
| vehicle_type | string | yes | vehicleTypeEnum (8 values) |
| scheduled_at | string | no | ISO-8601; if present: 15–60 min in future |
| promo_code | string | no | Active promo code; validated at request time |
| payment_method_id | string | no | Rider payment method UUID; defaults to rider default method |
| allow_downgrade | boolean | no | Default `false`. If `true`, rider consents to receiving alternative vehicle type suggestions when requested type has no available drivers. |
| preferences | array | no | Array of preference UUIDs from `GET /api/reference/preferences`. Empty array if none selected. |

**Success: 201**
```json
{
  "ride_id": "uuid",
  "status": "pending",
  "fare_breakdown": {
    "base_fare_bdt": 3000,
    "distance_charge_bdt": 3840,
    "time_charge_bdt": 0,
    "total_bdt": 6840,
    "floor_fare_bdt": 5000,
    "distance_km": 3.2,
    "platform_commission_percent": 0.00,
    "platform_commission_bdt": 0,
    "driver_net_bdt": 6840
  },
  "vehicle_type": "bike_standard",
  "preference_surcharge_bdt": 500,
  "driver_fare_bdt": 7340,
  "promo": {
    "code": "SAVE20",
    "discount_type": "percent",
    "discount_bdt": 1468,
    "max_discount_bdt": 5000
  },
  "rider_payable_bdt": 5872,
  "platform_subsidy_bdt": 1468,
  "preferences": ["large_luggage"]
}
```

**Notes:** `driver_fare_bdt` = `fare_breakdown.total_bdt` + `preference_surcharge_bdt`. `fare_breakdown` also includes `platform_commission_percent`, `platform_commission_bdt`, and `driver_net_bdt` in the response shape. When no promo is applied, `promo` is `null`, `rider_payable_bdt` = `driver_fare_bdt`, and `platform_subsidy_bdt` = 0. When no preferences are selected, `preference_surcharge_bdt` = 0 and `preferences` is `[]`.

**Fare formula:**
```
distance_charge = round(per_km_bdt × distance_km)
time_charge     = ride_time_min × per_min_bdt   // 0 at request time; actual at completion
computed_total  = base_fare_bdt + distance_charge + time_charge
floor_fare      = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
final_fare      = max(computed_total, floor_fare)
```

**Errors**
| Code | Condition |
|------|----------|
| 409 | `ride_already_active` — rider has active ride |
| 422 | `outside_zone` — pickup not inside active zone polygon |
| 429 | `rider_rate_limited` — 5/hour bucket exceeded |
| 404 | No active zone or pricing config for requested vehicle_type |

**Alternatives: via WebSocket `ride:alternatives` event (not an HTTP response)**

> **Note:** The initial HTTP response for `POST /api/ride/request` is **always** `201` with `status:'pending'` and `ride_id`. The dispatch pipeline then runs asynchronously on the WebSocket server. If all 3 dispatch batches are exhausted AND `allow_downgrade=true` AND other vehicle types have available drivers, the server sends a **WebSocket `ride:alternatives` event** to the rider. The rider app shows the alternatives sheet (see 08-UI-SPEC.md). The rider can then call `POST /api/ride/request` again with a new vehicle type.
>
> The `GET /api/ride/alternatives` endpoint (see below) is available as a polling fallback for riders who may have missed the WebSocket event.

The WebSocket `ride:alternatives` event payload (see WebSocket events table):
```json
{
  "ride_id": "uuid",
  "requested_vehicle_type": "car_premium",
  "alternatives": [
    {
      "vehicle_type": "car_comfort",
      "fare_breakdown": { "base_fare_bdt": 4000, "distance_charge_bdt": 3200, "time_charge_bdt": 0, "total_bdt": 7200, "floor_fare_bdt": 18000, "distance_km": 2.0, "platform_commission_percent": 0.00, "platform_commission_bdt": 0, "driver_net_bdt": 7200 },
      "available_drivers": 3
    },
    {
      "vehicle_type": "car_economy",
      "fare_breakdown": { "base_fare_bdt": 3500, "distance_charge_bdt": 2600, "time_charge_bdt": 0, "total_bdt": 6100, "floor_fare_bdt": 15000, "distance_km": 2.0, "platform_commission_percent": 0.00, "platform_commission_bdt": 0, "driver_net_bdt": 6100 },
      "available_drivers": 5
    }
  ]
}
```

---

## Routes to ADD

### POST /api/auth/start-verification
**Auth:** [public]. Rate limit: 5/phone/10min (configurable constant).

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| phone | string | yes | E.164 (+8801XXXXXXXXX) |

Server-side proxy to `supabase.auth.signInWithOtp({ phone })`. Enforces additional rate limiting at the API layer before calling Supabase. dprelay (configured in Supabase dashboard) sends the OTP SMS.

**Success: 200** `{ "success": true }`

**Errors:** 400 (invalid phone), 429 (rate limited), 500 (Supabase error)

---

### POST /api/auth/verify-token
**Auth:** Required (Supabase JWT in Authorization header)
**Body:** None

Server calls `supabase.auth.getUser(jwt)` to verify the token and extract user claims.

**Success: 200**
```json
{ "user_id": "uuid", "role": "rider|driver|admin", "exists": true }
```
```json
{ "exists": false }
```

> **Discriminated union response:** Check the `exists` field first. If `false`, all other fields (`user_id`, `role`) are absent. If `true`, `user_id` and `role` are always present.

---

### POST /api/auth/logout
**Auth:** Required. Body: none.
**Success: 200** `{ "revoked": true }`

---

### GET /api/package/list
**Auth:** Required (driver). Trials listed first. Inactive excluded.

**Response: 200**
```json
{
  "packages": [
    { "id": "uuid", "name": "Starter 50", "call_count": 50, "duration_days": 30, "price_bdt": 50000, "is_trial": false, "daily_cap": null }
  ]
}
```
`daily_cap` is null for finite packages; for unlimited packages it reflects the `packages.daily_cap` admin-configured value.

> **Note:** `daily_cap` is `null` for finite packages (the DB value is ignored for non-unlimited packages). Only meaningful when `call_count = -1`.

---

### POST /api/package/purchase
**Auth:** Required (driver, status 'active' or 'temporary')
**Header:** `Idempotency-Key: <uuid>` — REQUIRED. Body field named `idempotency_key` rejected with 400.
**On header replay:** 200 OK with original `{ payment_url, payment_event_id }`.

**Body:** `{ "package_id": "uuid", "provider": "portpos" }`

**Success: 200** `{ "payment_url": "...", "payment_event_id": "uuid" }`

**Side effects:**
1. INSERT `payment_events` row with `status = 'initiated'`, `provider = 'portpos'`.
2. Call PortPos API `createInvoice()` with amount, reference (idempotency key), redirect URL, and IPN URL.
3. Return PortPos hosted checkout URL to the client.
4. The client opens a WebView with the PortPos checkout page — the user picks their payment method (bKash, Nagad, Rocket, or card) directly on PortPos's page.

**Errors:** 400 (missing header), 404 (package not found/inactive), 409 (trial_already_used), 422 (driver status not eligible)

---

### GET /api/payment/portpos/callback
**Auth:** [public] — handles both redirect (GET) and IPN (POST).
**GET** — Browser/WebView redirect after user completes payment on PortPos hosted checkout. Extracts `invoice` query param, verifies invoice status via `portposClient.getInvoice()`, calls `activateSubscription()` on success, redirects to success/failure URLs.
**POST** — PortPos IPN notification. Receives `{ invoice, amount, status, reference }` JSON body, validates via `portposClient.verifyIPN()`, activates subscription.

**Activation flow:** Calls `activateSubscription(db, payment_event_id)` from `lib/activateSubscription.ts`. On failure, INSERT compensation_queue row for automatic retry.

---

### Old bKash/Nagad callbacks (inert fallback)
`POST /api/payment/bkash/callback` and `POST /api/payment/nagad/callback` still exist as files but are no longer the primary payment path. They are kept as inert fallback for reference only. All new purchases go through PortPos.

---

### GET /api/package/active
**Auth:** Required (driver). Polled every 3s post-payment.

**Response: 200**
```json
{
  "subscription": {
    "id": "uuid", "package_id": "uuid", "package_name": "Starter 50",
    "calls_remaining": 42, "daily_calls_used": 3, "daily_reset_at": "ISO-8601",
    "status": "active", "purchased_at": "ISO-8601", "expires_at": "ISO-8601", "is_trial": false
  }
}
```
Returns `{ "subscription": null }` if none.

---

### POST /api/sos/alert
**Auth:** Required (rider or driver)

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| lat | number | yes | valid latitude |
| lng | number | yes | valid longitude |
| message | string | no | Custom SMS message composed by user in the SOS modal (0-160 chars) |

**Response: 200**
```json
{ "ok": true, "contacts_notified": ["police", "personal", "platform"] }
```

**Side effect:** INSERT into `sos_alerts` (`user_id`, `role`, `latitude`, `longitude`, `message`, `contacts_notified`). Triggers background dispatch of 3 SMS messages (police, personal contact, platform admin) and WebSocket event to admin dashboard.

### GET /api/user/sos-contact
**Auth:** Required (rider or driver)
**Purpose:** Fetch the user's current personal SOS emergency contact.
**Response: 200**
```json
{ "phone": "+8801XXXXXXXXX" }
```
**Response (no contact set): 200** `{ "phone": null }`

---

### PATCH /api/user/sos-contact
**Auth:** Required (rider or driver)
**Purpose:** Update personal SOS emergency contact.
**Body:** `{ "phone": "+8801XXXXXXXXX" }` // null to remove
**Success: 200** `{ "updated": true }`

---

### GET /api/call-ledger
**Auth:** Required (driver).
**Query:** `limit` (default 20, max 100), `offset` (default 0), `outcome` (accepted, expired, refunded, filtered), `vehicle_type`, `from_date` (ISO-8601), `to_date` (ISO-8601)

**Response: 200**
```json
{
  "summary": {
    "accepted": 42,
    "expired": 5,
    "refunded": 3,
    "filtered": 8
  },
  "transactions": [
    { "id": "uuid", "event_type": "deduction", "delta": -1, "balance_after": 41, "reason": "app_fetch", "ride_id": "uuid|null", "created_at": "ISO-8601" }
  ],
  "total": 150, "has_more": true
}
```

> **Note:** The response includes a summary card with counts for the requested period.

> **Unlimited subscriptions:** `balance_after = -1` is a sentinel value meaning "unlimited". The client must check for `-1` and display "Unlimited" (or the localised equivalent) instead of the numeric value.

---

### POST /api/driver/document/upload-confirm
**Auth:** Required (driver)

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| doc_type | string | yes | documentTypeEnum: 'license_front', 'license_back', 'reg_scan_front', 'reg_scan_back', 'fitness_scan', 'tax_token_scan', 'vehicle_photo_front', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_back', 'legacy_screenshot', 'owner_consent_scan', 'brta_certificate', 'helmet_photo', 'dashboard_photo', 'interior_photo', 'third_row_photo', 'driver_photo', 'vehicle_video', 'vehicle_photo_seats' |
| storage_path | string | yes | Supabase Storage path |
| file_size_bytes | integer | yes | > 50KB for legacy_screenshot |
| vehicle_id | uuid | no | Required for vehicle-level docs |

**Success: 201** `{ "document_id": "uuid", "status": "pending" }`

---

### GET /api/reference/vehicle-types
**Auth:** Required (any role)
**Purpose:** Returns the 8 vehicle types for driver onboarding and rider request screens.

**Response: 200**
```json
{
  "vehicle_types": [
    { "key": "bike_basic",    "label_en": "Bike Basic",    "label_bn": "বাইক বেসিক",     "seats": 1, "cc_range": "≤100",     "has_ac": null },
    { "key": "bike_standard", "label_en": "Bike Standard", "label_bn": "বাইক স্ট্যান্ডার্ড", "seats": 1, "cc_range": "101-150",  "has_ac": null },
    { "key": "bike_plus",     "label_en": "Bike Plus",     "label_bn": "বাইক প্লাস",      "seats": 1, "cc_range": ">150",      "has_ac": null },
    { "key": "cng",           "label_en": "CNG",           "label_bn": "সিএনজি",          "seats": 3, "cc_range": null,          "has_ac": false },
    { "key": "car_economy",   "label_en": "Car Economy",   "label_bn": "কার ইকোনমি",      "seats": 4, "cc_range": null,          "has_ac": null },
    { "key": "car_comfort",   "label_en": "Car Comfort",   "label_bn": "কার কমফোর্ট",     "seats": 4, "cc_range": null,          "has_ac": null },
    { "key": "car_premium",   "label_en": "Car Premium",   "label_bn": "কার প্রিমিয়াম",   "seats": 4, "cc_range": null,          "has_ac": true  },
    { "key": "car_xl",        "label_en": "Car XL",        "label_bn": "কার এক্সএল",      "seats": 7, "cc_range": null,          "has_ac": true  }
  ]
}
```
**Note:** Rider-facing request screen shows only the subset of types with active pricing in the current zone. Server filters accordingly. The `brta_certificate` doc_type is now available for upload via `POST /api/driver/document/upload-confirm`. The `'cc'` suffix is added by the client UI layer only; do not append it server-side. **`has_ac` semantics:** `true` = AC mandatory (car_premium, car_xl); `false` = no AC possible (cng, bikes); `null` = AC selectable by driver during registration (car_economy, car_comfort — Non-AC discouraged with warning but allowed).

---

### GET /api/reference/registration-areas
**Auth:** Required (any role)

**Response: 200**
```json
{
  "areas": [
    { "key": "DHAKA_METRO", "label_en": "Dhaka Metro", "label_bn": "ঢাকা মেট্রো" },
    { "key": "CHITTAGONG_METRO", "label_en": "Chittagong Metro", "label_bn": "চট্টগ্রাম মেট্রো" }
  ]
}
```

---

### GET /api/reference/vehicle-class-letters
**Auth:** Required (any role)

**Response: 200**
```json
{
  "class_letters": [
    { "key": "HA", "label_bn": "হ", "description_en": "Motorcycle (80–125cc)", "description_bn": "মোটরসাইকেল" },
    { "key": "LA", "label_bn": "ল", "description_en": "Motorcycle (126–165cc)", "description_bn": "মোটরসাইকেল" },
    { "key": "DAW", "label_bn": "দ", "description_en": "Private CNG / Auto Rickshaw", "description_bn": "সিএনজি" },
    { "key": "KA", "label_bn": "ক", "description_en": "Private car (≤1000cc)", "description_bn": "প্রাইভেট কার" }
  ]
}
```

---

### GET /api/reference/vehicle-models
**Auth:** Required (any role)
**Purpose:** Search known Bangladesh vehicle models for brand/model/year autocomplete during driver onboarding.

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| search | string | no | Search term (matched against brand, model). If empty, returns all active models. |
| brand | string | no | Filter by exact brand (case-insensitive). |
| limit | integer | no | Max results (default: 20, max: 100). |

**Response: 200**
```json
{
  "models": [
    {
      "id": "uuid",
      "brand": "Suzuki",
      "model": "Alto",
      "year_start": 2010,
      "year_end": 2025,
      "default_vehicle_type": "car_economy",
      "has_ac": false,
      "passenger_seats": 4,
      "engine_cc": 660
    }
  ]
}
```

---

### GET /api/reference/vehicle-suggest
**Auth:** Required (any role)
**Purpose:** Auto-classify a vehicle type from brand, model, and year. Returns the best-matching vehicle type from the `vehicle_models` table. Falls back to BRTA class letter + engine CC logic if no match.

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| brand | string | yes | Vehicle brand. |
| model | string | yes | Vehicle model. |
| year | integer | yes | Manufacturing year. |
| engine_cc | integer | no | Engine displacement in CC. Used for fallback classification. |
| vehicle_class_letter | string | no | BRTA class letter key. Used for fallback classification. |

**Response: 200**
```json
{
  "suggested_vehicle_type": "car_economy",
  "suggested_has_ac": false,
  "suggested_seats": 4,
  "source": "vehicle_models",
  "confidence": "exact"
}
```

| Field | Type | Description |
|-------|------|-------------|
| suggested_vehicle_type | string \| null | One of 8 vehicle type keys, or null if indeterminable. |
| suggested_has_ac | boolean \| null | Suggested AC status from model data. null for bikes/CNG. |
| suggested_seats | integer \| null | Suggested seat count from model data. |
| source | string | `"vehicle_models"` (database match) or `"brta_fallback"` (class letter + CC heuristic). |
| confidence | string | `"exact"` (model found in DB), `"partial"` (brand matched, model approximate), or `"fallback"` (no DB match, used BRTA heuristic). |

**Errors:** 400 (missing required params)

---

### POST /api/vehicle/register
**Auth:** Required (driver)

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| vehicle_type | string | yes | vehicleTypeEnum (8 values) |
| manufacturer | string | yes | 2–100 chars |
| model | string | yes | 2–100 chars |
| manufacturing_year | integer | yes | 4-digit year |
| registration_date | date | yes | ISO-8601 date of vehicle registration |
| cc_range | string | no | Required if vehicle_type IN ('bike_basic','bike_standard','bike_plus'). Values: '≤100', '101-150', '>150'. |
| has_ac | boolean | conditional | Required for car_economy, car_comfort, car_premium, car_xl. NULL for bike_* / cng types. |
| registration_area | string | yes | Key from registration-areas |
| vehicle_class_letter | string | yes | Key from vehicle-class-letters |
| registration_number | string | yes | Numeric portion only |
| reg_scan_front_document_id | uuid | yes | — |
| reg_scan_back_document_id | uuid | yes | — |
| fitness_expiry_date | date | yes | ISO-8601 |
| fitness_scan_document_id | uuid | yes | — |
| tax_token_expiry_date | date | yes | ISO-8601 |
| tax_token_scan_document_id | uuid | yes | — |
| brta_certificate_document_id | uuid | yes | Mandatory for all vehicles |
| vehicle_photo_front_document_id | uuid | yes | — |
| vehicle_photo_left_document_id | uuid | yes | — |
| vehicle_photo_right_document_id | uuid | yes | — |
| vehicle_photo_back_document_id | uuid | yes | — |
| vehicle_photo_dashboard_document_id | uuid | conditional | Required if `vehicle_type IN ('car_economy','car_comfort','car_premium','car_xl')` |
| vehicle_photo_seats_document_id | uuid | conditional | Required if `vehicle_type IN ('car_economy','car_comfort','car_premium','car_xl')` — interior front-seats photo |
| vehicle_video_document_id | uuid | yes | Walkaround video (15–30s, ≥720p, ≤50MB). doc_type='vehicle_video'. |
| helmet_photo_1_document_id | uuid | conditional | Required if `vehicle_type IN ('bike_basic','bike_standard','bike_plus')` |
| helmet_photo_2_document_id | uuid | conditional | Required if `vehicle_type IN ('bike_basic','bike_standard','bike_plus')` |
| third_row_photo_document_id | uuid | conditional | Required if `vehicle_type = 'car_xl'` |

**Validation:**
- `manufacturing_year` checked against vehicle_type minimum age from `lib/vehicleTypes.ts` (`min_age_years` — currently 1 year per BRTA rules): if `current_year - manufacturing_year < min_age_years` → 422 `vehicle_too_new`.
- `cc_range` validated against `vehicle_type`: bike_basic requires '≤100'; bike_standard requires '101-150'; bike_plus requires '>150'. Mismatch → 422 `cc_range_mismatch`.
- `checkDriverEligibility()` called from `lib/vehicleTypes.ts`: eligibility thresholds come from the `driver_req` code constants per vehicle type (currently ≥50 rides & rating ≥ 4.5 for car_premium, ≥25 rides & rating ≥ 4.3 for car_xl) → if not met → 422 `driver_eligibility_not_met`. If driver has fewer than the threshold number of rides, the gate is not applied (new drivers unrestricted).
- `capacity` is derived server-side from `vehicle_type`: bike_basic/bike_standard/bike_plus = 1, cng = 3, car_economy/car_comfort/car_premium = 4, car_xl = 7.
- Server must validate: for each required document type given the `vehicle_type`, at least one confirmed (`status='approved'`) document of that type exists for the driver in the `documents` table. Specifically:
  - All types: must have `doc_type='vehicle_video'` — at least 1 approved walkaround video.
  - Bike types (`bike_basic`, `bike_standard`, `bike_plus`): must have `doc_type IN ('helmet_photo')` — at least 2 approved documents.
  - Car types (`car_economy`, `car_comfort`, `car_premium`): must have `doc_type IN ('dashboard_photo', 'vehicle_photo_seats')` — at least 1 approved of each.
  - `car_xl`: must have `doc_type IN ('dashboard_photo', 'vehicle_photo_seats', 'third_row_photo')` — at least 1 approved of each.
  - Missing required documents → 422 `missing_required_documents`.
- `has_ac` validation: `car_economy` and `car_comfort` allow `true` or `false` (Non-AC discouraged with red warning in UI but not blocked). `car_premium` and `car_xl` require `has_ac = true` → if false → 422 `ac_required_for_type`. Bike types and CNG: `has_ac` must be NULL → 422 if set.

**Side effect:** After `INSERT vehicles`, the server must execute: `UPDATE drivers SET vehicle_registration_date = :registration_date, vehicle_id = :vehicle_id WHERE id = :driver_id`. This keeps `drivers.vehicle_registration_date` in sync with `vehicles.registration_date` (see invariant in 05-DATA-MODEL.md).

**Success: 201** `{ "vehicle_id": "uuid", "full_registration_number": "DHAKA-METRO-HA-12345" }`

**Errors:** 400 (invalid body), 409 (vehicle already registered), 422 (vehicle_too_new, cc_range_mismatch, driver_eligibility_not_met, missing_required_documents, ac_required_for_type)

---

### POST /api/driver/profile
**Auth:** Required (driver)

**Body:** `{ "address": "string (5–500)", "driving_license_number": "string (5–30)", "license_front_document_id": "uuid", "license_back_document_id": "uuid", "driver_photo_document_id": "uuid (mandatory — live selfie or passport photo for face-match)" }`

**Side effect:** After driver_photo upload is confirmed, the server asynchronously calls `lib/faceMatch.ts: compareFaces()` to compare the driver photo against the licence photo. Result is stored in `documents.face_match_score` and `documents.face_match_status`. This is non-blocking for the driver — the profile submission returns 200 immediately regardless of face-match outcome.

**Success: 200** `{ "driver_id": "uuid", "updated": true }`

---

### POST /api/driver/owner-consent/submit
**Auth:** Required (driver)

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| is_owner | boolean | yes | true = Path A (driver owns vehicle) |
| owner_name | string | no | Required if is_owner=false |
| owner_address | string | no | Required if is_owner=false |
| owner_phone | string | no | Required if is_owner=false |
| owner_consent_scan_document_id | uuid | no | Required if is_owner=false. Must be dated within 30 days. |
| legacy_screenshot_document_id | uuid | no | Optional (both paths) |

**Success: 200** `{ "consent_id": "uuid", "status": "submitted" }`

**Side effects:**
- If `legacy_screenshot_document_id` is provided and non-null, sets `drivers.is_legacy_operator = true` for the authenticated driver.

**Errors:** 400 (missing fields for Path B), 409 (consent already submitted)

---

### ~~POST /api/driver/owner-consent/initiate~~ DEPRECATED
### ~~POST /api/driver/owner-consent/verify~~ DEPRECATED

---

### POST /api/driver/status
**Auth:** Required (driver)

**Body:** `{ "is_online": boolean, "lat": number (required if true), "lng": number (required if true) }`

**Pre-conditions (online):** status IN ('active','temporary') + active subscription + calls_remaining > 0 OR (unlimited AND daily_calls_used < daily_cap)

**Success: 200** `{ "is_online": true }`
**Errors:** 422 (pre-conditions not met)

**Side effects — `driver_online_sessions` writes:**
- If `is_online=true`: INSERT `driver_online_sessions {driver_id, subscription_id=active_sub.id, went_online_at=now()}`.
- If `is_online=false`: UPDATE `driver_online_sessions SET went_offline_at=now(), duration_minutes=EXTRACT(EPOCH FROM (now()-went_online_at))/60 WHERE driver_id=? AND went_offline_at IS NULL`.

> **Subscription renewal while driver is online:** On subscription renewal while the driver is online, close the existing session row (set `went_offline_at=now()`), then open a new session row with the new `subscription_id`.

---

### POST /api/driver/vehicle-type-change
**Auth:** Required (driver role)
**Purpose:** Driver requests a vehicle type change (e.g., upgrade from Bike Standard to Bike Plus). Requires uploading new vehicle documents. Cooling-off period applies after admin approval (business rule; stored via `vehicle_type_changes.effective_at` logic).

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| requested_vehicle_type | string | yes | vehicleTypeEnum (8 values). Must differ from current type. |
| reason | string | yes | 10-500 chars. Why the driver wants to change. |
| supporting_document_ids | uuid[] | yes | At least 1 document ID from upload-confirm. New documents supporting the change. |

**Success: 201**
```json
{ "change_id": "uuid", "status": "pending", "message": "Your request will be reviewed within 24 hours." }
```

**Errors**
| Code | Condition |
|------|----------|
| 409 | Pending change request already exists for this driver |
| 422 | Requested type is the same as current type |

**Notes:** Creates `vehicle_type_changes` row with `status='pending'`, `change_reason='driver_request'`. Admin reviews via standard approval flow (24h operational target). On approval: `status='cooling_off'`, `effective_at = now() + cooling-off period` (business rule; currently 7 days). Scheduler applies change after cooling-off.

---

### GET /api/driver/me
**Auth:** Required (driver)
**Purpose:** Returns the authenticated driver's full profile.

**Response: 200**
```json
{
  "driver_id": "uuid",
  "user_id": "uuid",
  "name": "string",
  "phone": "+8801XXXXXXXXX",
  "vehicle_type": "bike_standard",
  "status": "active|temporary|pending|suspended|rejected",
  "acceptance_rate": 94.5,
  "completed_rides_count": 127,
  "rating": 4.7,
  "is_online": false,
  "min_per_km_bdt": 1400,
  "vehicle": {
    "vehicle_id": "uuid",
    "vehicle_type": "bike_standard",
    "manufacturer": "Honda",
    "model": "CB Shine SP",
    "manufacturing_year": 2020,
    "registration_number": "DHAKA_METRO-LA-12345",
    "fitness_expires_at": "2026-06-01",
    "tax_token_expires_at": "2026-09-01"
  },
  "preferences": [
    { "preference_id": "uuid", "name": "large_luggage", "display_label_en": "Large Luggage" }
  ]
}
```

> **Note:** `preferences` lists the driver's opted-in preference IDs and names. Used by Screen 19 (Driver Preference Opt-In) to pre-populate toggles. Empty array if driver has no preferences opted in.

---

### PATCH /api/driver/me
**Auth:** Required (driver role)
**Purpose:** Update driver preferences including minimum per-km rate.

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| min_per_km_bdt | integer | null | no | NULL = reset to system rate. If set: must be within bounds defined by `platform_config.driver_min_ratio` and `platform_config.driver_max_ratio` (currently 70%–150%) of active pricing row's per_km_bdt for driver's vehicle type. In paisa. |

**Success: 200**
```json
{ "min_per_km_bdt": 1500, "system_rate_bdt": 1800, "percent_of_system": 83 }
```

**Errors**
| Code | Condition |
|------|----------|
| 422 | Value outside configured min/max ratio range (see `platform_config`) |
| 422 | No active pricing found for driver's vehicle type |

---

### GET /api/driver/slider-config
**Purpose:** Returns the current system per-km rate and the slider bounds for the driver's vehicle type. Called when the driver opens the minimum rate card.
**Auth:** required (driver role)

**Success: 200**
```json
{
  "vehicle_type": "bike_standard",
  "system_per_km_bdt": 950,
  "min_ratio": 0.70,
  "max_ratio": 1.50,
  "lower_bound": 665,
  "upper_bound": 1425
}
```

| Field | Description |
|-------|-------------|
| `system_per_km_bdt` | The active `pricing.per_km_bdt` for the driver's vehicle type and zone (in paisa) |
| `min_ratio` | `platform_config.driver_min_ratio` (float) |
| `max_ratio` | `platform_config.driver_max_ratio` (float) |
| `lower_bound` | `floor(system_per_km_bdt × min_ratio)` — minimum allowed `min_per_km_bdt` |
| `upper_bound` | `ceil(system_per_km_bdt × max_ratio)` — maximum allowed `min_per_km_bdt` |

If the driver has not set a `min_per_km_bdt`, the slider defaults to `system_per_km_bdt` (100%).

---

### GET /api/driver/pricing-reference
**Auth:** Required (driver role)
**Purpose:** Returns active pricing row for the driver's vehicle type. Used by driver app to show system rate and slider bounds.

**Response: 200**
```json
{
  "vehicle_type": "car_comfort",
  "base_fare_bdt": 5000,
  "per_km_bdt": 1800,
  "per_min_bdt": 375,
  "floor_length_km": 4.0,
  "floor_min": 20,
  "min_per_km_floor_bdt": 1260,
  "min_per_km_ceiling_bdt": 2700
}
```
`min_per_km_floor_bdt` = `platform_config.driver_min_ratio` × per_km_bdt (currently 70%). `min_per_km_ceiling_bdt` = `platform_config.driver_max_ratio` × per_km_bdt (currently 150%).

---

### GET /api/driver/missed-requests
**Auth:** Required (driver)
**Query:** `limit` (default 20, max 50), `since` (ISO-8601, default 7 days ago)

**Response: 200**
```json
{
  "missed": [
    {
      "ride_id": "uuid|null",
      "sent_at": "ISO-8601",
      "outcome": "expired|refunded|filtered",
      "fetch_confirmed_at": "ISO-8601|null",
      "pickup_address": "string",
      "dropoff_address": "string",
      "vehicle_type": "bike_standard",
      "system_per_km_bdt": 1500,
      "driver_min_per_km_bdt": 1600,
      "call_deducted": false,
      "filtered_reason": "min_per_km_bdt_exceeded|null"
    }
  ],
  "filtered_count_7d": 3
}
```
**Note:** `outcome='filtered'` rows have `ride_id` populated (ride still happened but this driver was excluded), `call_deducted=false`, and `filtered_reason='min_per_km_bdt_exceeded'`. `filtered_count_7d` is the total filtered count in the past 7 days — shown as the "minimum rate preview" stat on the driver home screen.

---

### POST /api/driver/documents/submit
**Auth:** Required (driver, status = 'pending')
**Purpose:** Finalize document submission, move to admin review queue.
**Validation:** Server checks that all required document types for the driver's `vehicle_type` are present (status='pending' or 'approved'). Returns 422 `missing_required_documents` with a list of missing types if any are absent.
**Body:** None
**Success: 200** `{ "status": "pending", "message": "Documents submitted for review." }`

---

### POST /api/ride/:id/arrive
**Auth:** Required (matched driver). Precondition: `rides.status = 'driver_arriving'` AND `rides.driver_id` = requesting driver.
**Body:** `{}` (empty — location confirmed by GPS at app layer)
**Action:**
- Set `rides.status = 'driver_arrived'`, `rides.arrived_at = now()`
- Push WebSocket event to rider: `{ type: 'driver_arrived', rideId }`
**Success: 200** `{ "arrived_at": "ISO-8601" }`
**Errors:**
- 400 `ride_not_in_arriving_status` — ride is not in `driver_arriving` status
- 403 `not_your_ride` — requesting driver is not the matched driver
- 404 `ride_not_found`

> **Post-MVP:** Auto-geofence detection (driver within `geofence_arrival_radius_meters` for `geofence_arrival_dwell_seconds`, both from `system_config`) may call this endpoint automatically. MVP: manual button only.

**Side effect:** Starts a 60-second auto-start timer. If the driver does not tap "Start Ride" within 60 seconds, the scheduler (`utils-server/scheduler.ts`) automatically sets `started_at = arrived_at + 60s` and `status = 'in_progress'`.

---

### POST /api/ride/:id/start
**Auth:** Required (matched driver). Precondition: `rides.status = 'driver_arrived'`. Driver must tap 'I've Arrived' (`POST /api/ride/:id/arrive`) before 'Start Ride' is valid.
**Body:** None
**Success: 200** `{ "status": "in_progress", "started_at": "ISO-8601" }`
**Errors:** 400 `ride_not_in_arrived_status`, 403 (not the matched driver)

---

### POST /api/ride/:id/complete
**Auth:** Required (matched driver). Precondition: `rides.status = 'in_progress'`.
**Body:** None
**Server logic:**
1. Compute `timer_start = min(arrived_at + 60_000, started_at)` (60s free wait from `system_config.max_free_wait_seconds`; whichever comes first). If `arrived_at IS NULL`: `timer_start = started_at`. Then `ride_time_min = CEIL((now() - timer_start) / 60_000)`.
2. Call `calculateFare(pricing, distance_km, ride_time_min)` — recomputes fare with actual ride time, applies floor fare.
3. Compute `driver_fare_bdt = total_bdt + rides.preference_surcharge_bdt` (surcharges preserved from booking time).
4. Derive commission: `platform_fee = round(driver_fare_bdt × pricing.platform_commission_percent / 100)`.
5. Compute `driver_net = driver_fare_bdt − platform_fee`. Note: promo discount does NOT reduce driver earnings — `rider_payable_bdt` is for rider cash payment only.
6. **Recalculate promo discount if percentage type:** If `rides.promo_code_id IS NOT NULL`, re-read `promo_codes.discount_type`. If `'percent'`: `promo_discount_bdt = min(floor(driver_fare_bdt × discount_value / 100), promo_codes.max_discount_bdt)`. If `'flat'`: `promo_discount_bdt` stays unchanged from booking time. Update `rides.promo_discount_bdt`. Compute `rides.rider_payable_bdt = driver_fare_bdt − promo_discount_bdt`. Compute `rides.platform_subsidy_bdt = promo_discount_bdt`. If no promo: all three remain unchanged from booking time.
7. Write `rides.platform_commission_bdt`, `rides.promo_discount_bdt`, `rides.rider_payable_bdt`, `rides.platform_subsidy_bdt`, `rides.driver_fare_bdt`, `rides.completed_at = now()`, `rides.status = 'completed'`, update `fare_breakdown` jsonb with actual values.
8. Update `driver_incentives.current_progress` for active incentives with `target_metric='completed_rides'` within the same transaction. If progress ≥ target_value: set `completed_at=now()`, INSERT `credit_vouchers` row with `source='incentive_reward'`, `source_ref_id=driver_incentives.id`, set `reward_voucher_id`.
9. **Driver wallet receivable (promo):** If `rides.promo_code_id IS NOT NULL` AND `rides.platform_subsidy_bdt > 0`, INSERT `driver_wallet_transactions` row with `transaction_type='promo_receivable'`, `amount_bdt=platform_subsidy_bdt`, `reference_id=ride_id`, `balance_after = drivers.driver_wallet_balance_bdt + platform_subsidy_bdt`. UPDATE `drivers.driver_wallet_balance_bdt += platform_subsidy_bdt`.
10. **Driver wallet receivable (referral):** If referral was applied to this ride, INSERT `driver_wallet_transactions` row with `transaction_type='referral_receivable'`, `amount_bdt=referral_discount_bdt`, `reference_id=referral_id`, `balance_after` updated. UPDATE `drivers.driver_wallet_balance_bdt`.
11. **Point awards:** INSERT `point_transactions` for rider: `amount = FLOOR(rider_payable_bdt / 100)`, `source_type='ride'`, `reference_id=ride_id`. INSERT `point_transactions` for driver (only if `platform_commission_bdt > 0`): `amount = FLOOR(platform_commission_bdt / 100)`, `source_type='commission'`, `reference_id=ride_id`. UPDATE `points.balance` for both users.
12. **Referral reward (referee first ride):** If `rides.user_id` has a `referrals` row with `status='pending'` and this is the referee's first completed ride, UPDATE `referrals.status='rewarded'`, `referrals.rewarded_at=now()`. INSERT wallet/credit entries for both referrer and referee per campaign rules.
13. Push final fare summary to rider via WebSocket: `{ type: 'ride_completed', totalFareBdt, preferenceSurchargeBdt, driverFareBdt, promoDiscountBdt, riderPayableBdt, platformSubsidyBdt, rideTimeMin, commissionBdt, driverNetBdt, fareBreakdown }`.
**Success: 200**
```json
{
  "ride_id": "uuid",
  "status": "completed",
  "completed_at": "ISO-8601",
  "total_bdt": 18000,
  "preference_surcharge_bdt": 500,
  "driver_fare_bdt": 18500,
  "promo_discount_bdt": 0,
  "rider_payable_bdt": 18500,
  "platform_subsidy_bdt": 0,
  "ride_time_min": 32,
  "platform_commission_percent": 0.00,
  "platform_commission_bdt": 0,
  "driver_net_bdt": 18500,
  "fare_breakdown": {
    "base_fare_bdt": 2500,
    "distance_charge_bdt": 12000,
    "time_charge_bdt": 3500,
    "total_bdt": 18000,
    "floor_fare_bdt": 5800,
    "distance_km": 10.0,
    "platform_commission_percent": 0.00,
    "platform_commission_bdt": 0,
    "driver_net_bdt": 18000
  }
}
```
**Errors:** 409, 403

---

### POST /api/ride/:id/cancel
**Auth:** Required (rider or driver)
**Precondition:** status IN ('pending','dispatching','matched','driver_arriving','driver_arrived'). `matched` may appear briefly in the window between match and the following DB auto-transition to `driver_arriving`.
**Body:**
```json
{
  "reason_code": "change_in_plans|waiting_too_long|unable_to_contact_driver|driver_denied_destination|driver_denied_pickup|wrong_address_shown|price_not_reasonable|emergency_situation|booking_mistake|poor_weather|other",
  "reason": "string (human-readable message)",
  "other_details": "string (required when reason_code='other', max 240 chars)"
}
```
Rules:
- For rider-initiated cancel in `driver_arriving` or `driver_arrived`, `reason_code` is required.
- If `reason_code='other'`, `other_details` is required.
- For driver-initiated cancel, `reason_code` optional but recommended for analytics.
**Success: 200** `{ "status": "cancelled", "cancelled_by": "rider|driver" }`

---

### POST /api/ride/:id/rate
**Auth:** Required (ride participant). Precondition: status = 'completed'.
**Body:** `{ "rating": integer (1–5), "role": "rider|driver" }`
**Side effects (role='rider'):** Increments `drivers.rating_count`, `drivers.rating_sum`, updates `drivers.rating`.
**Side effects (role='driver'):** Increments `users.rating_count`, `users.rating_sum`, updates `users.rating`.
**Success: 200** `{ "rated": true }`
**Errors:** 409 (already rated — for role='rider': `rides.rider_rating IS NOT NULL`; for role='driver': `rides.driver_rating IS NOT NULL`), 403 (not participant)

> **Known limitation:** Cancelled rides (status = 'cancelled') are not rateable. Rating is only available after a completed ride. This is by design — cancelled rides do not produce a fare and the service was not rendered.

---

### GET /api/ride/:id/status
**Auth:** Required (rider or matched driver)

> **Note:** `status='matched'` is a transient DB state set and immediately overwritten; clients polling this endpoint should expect `driver_arriving` as the first post-dispatch-acceptance status.

**Response: 200**
```json
{
  "ride_id": "uuid",
  "status": "matched|driver_arriving|in_progress|completed|cancelled|expired|no_drivers",
  "driver": {
    "name": "string|null",
    "photo_url": "string|null",
    "rating": 4.7,
    "vehicle_type": "bike_standard|null",
    "vehicle_number": "DHAKA_METRO-LA-12345|null"
  },
  "eta_minutes": 4,
  "origin_address": "string",
  "destination_address": "string",
  "fare_breakdown": { "base_fare_bdt": 3000, "distance_charge_bdt": 4800, "time_charge_bdt": 0, "total_bdt": 7800, "floor_fare_bdt": 6200, "distance_km": 3.2, "platform_commission_percent": 0.00, "platform_commission_bdt": 0, "driver_net_bdt": 7800 },
  "preference_surcharge_bdt": 500,
  "driver_fare_bdt": 8300,
  "promo": { "code": "SAVE20", "discount_bdt": 1660 } | null,
  "rider_payable_bdt": 6640,
  "platform_subsidy_bdt": 1660,
  "preferences": ["large_luggage"],
  "cancel_reason": "string|null",
  "cancelled_by": "rider|driver|system|null",
  "rider_rating": "integer|null",
  "driver_rating": "integer|null"
}
```

---

### GET /api/ride/:id/contact
**Auth:** Required (rider or matched driver)
**Precondition:** status IN ('matched','driver_arriving','in_progress')

**Response: 200**
```json
{ "phone": "+8801XXXXXXXXX|null", "masked_phone": "+880 1X-XXXX-789", "name": "string" }
```

**Role behaviour:**

| Caller  | `phone`                     | `masked_phone`         |
|---------|-----------------------------|------------------------|
| Rider   | `driver_phone` (full)       | `null`                 |
| Driver  | `null`                      | `masked_rider_phone`   |

Masking pattern: show last 3 digits of the 10-digit national number; replace all other digits with X. Format: `+880 1X-XXXX-{d1}{d2}{d3}`.

---

### POST /api/ride/:id/call-session
**Auth:** Required (ride participant)
**Precondition:** status IN ('matched','driver_arriving','driver_arrived','in_progress')
**Purpose:** Bootstrap in-app voice/video call session.

**Body:**
```json
{
  "mode": "voice|video"
}
```

**Success: 200**
```json
{
  "session_id": "uuid",
  "mode": "voice|video",
  "provider": "webrtc",
  "channel": "ride_uuid_room",
  "token": "string",
  "expires_at": "ISO-8601"
}
```

**Errors**
| Code | Condition |
|------|----------|
| 403 | `call_not_allowed_for_status` |
| 409 | `active_call_exists` |

---

### POST /api/ride/:id/message
**Auth:** Required (ride participant). Status must be IN ('matched','driver_arriving','driver_arrived','in_progress').
**Body:**
```json
{
  "content": "string (0–1000 chars)",
  "attachments": [
    {
      "type": "image",
      "upload_id": "uuid"
    }
  ]
}
```

Rules:
- At least one of `content` or `attachments` is required.
- Max attachments per message: 4.

**Success: 201**
```json
{
  "id": "uuid",
  "sender_id": "uuid",
  "content": "string",
  "attachments": [
    {
      "type": "image",
      "url": "https://...",
      "width": 1080,
      "height": 720
    }
  ],
  "created_at": "ISO-8601"
}
```
**Errors:** 403 `chat_closed`, 422 `content_too_long`

---

### GET /api/ride/:id/messages
**Auth:** Required (ride participant). Query: `before` cursor (optional).
**Response: 200** `{ "messages": [{ "id": "uuid", "content": "string", "attachments": [] }], "has_more": boolean }`

---

### GET /api/activity
**Auth:** Required (rider)
**Purpose:** Fetch rider activity feed by lifecycle tab.

**Query parameters**
| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| tab | string | yes | `ongoing|scheduled|completed|canceled|topup` |
| limit | number | no | default 20, max 100 |
| cursor | string | no | opaque pagination cursor |

**Success: 200**
```json
{
  "tab": "scheduled",
  "items": [
    {
      "ride_id": "uuid",
      "title": "Larchmont Hotel",
      "vehicle_type": "car_economy",
      "amount_bdt": 1000,
      "payment_label": "GoRide Wallet",
      "status": "scheduled",
      "promo_code": "SAVE20|null",
      "scheduled_for": "ISO-8601|null",
      "created_at": "ISO-8601",
      "secondary_label": "Canceled & Refunded|null"
    }
  ],
  "next_cursor": "opaque|null"
}
```

---

### GET /api/ride/:id/details
**Auth:** Required (ride participant)
**Purpose:** Provide full Ride Details payload for scheduled/completed/canceled detail screens.

**Success: 200**
```json
{
  "ride_id": "uuid",
  "status": "scheduled|driver_arriving|completed|cancelled",
  "scheduled_for": "ISO-8601|null",
  "driver": {
    "name": "string|null",
    "rating": 4.7,
    "vehicle_summary": "Toyota Camry, Black",
    "vehicle_number": "DEF-9012|null"
  },
  "route": {
    "pickup_address": "string",
    "dropoff_address": "string"
  },
  "pricing": {
    "trip_fare_bdt": 1250,
    "preference_surcharge_bdt": 100,
    "driver_fare_bdt": 1350,
    "discount_bdt": 250,
    "tip_bdt": 0,
    "rider_payable_bdt": 1100,
    "platform_subsidy_bdt": 250,
    "total_paid_bdt": 1100,
    "original_total_bdt": 1350
  },
  "preferences": [
    { "name": "large_luggage", "display_label_en": "Large Luggage", "charge_bdt": 100 }
  ],
  "promo": {
    "code": "SAVE20",
    "discount_type": "flat",
    "discount_bdt": 250
  } | null,
  "payment": {
    "method_label": "GoRide Wallet",
    "refund_state": "none|refunded|partial_refund"
  },
  "references": {
    "transaction_id": "TRX1222240941",
    "booking_id": "BKG720469"
  }
}
```

---

### POST /api/ride/:id/share-receipt
**Auth:** Required (ride participant)
**Purpose:** Generate a shareable receipt artifact for native share sheet.

**Body:** `{ "format": "image|pdf" }`

**Success: 200**
```json
{
  "receipt_id": "uuid",
  "file_name": "IMG-TRX1221240956-BKG926084.jpg",
  "mime_type": "image/jpeg",
  "share_uri": "string"
}
```

**Errors**
| Code | Condition |
|------|----------|
| 404 | `ride_not_found` |
| 409 | `receipt_not_available` (ride has no final ledger state) |
| 422 | `unsupported_format` |

---

### GET /api/wallet/balance
**Auth:** Required (rider)
**Purpose:** Fetch current wallet balance for Account and Top Up screens.

**Success: 200** `{ "available_balance_bdt": 206950 }`

---

### GET /api/wallet/topup/history
**Auth:** Required (rider)
**Purpose:** Fetch top-up transactions (same dataset used by Activity `tab=topup`).

**Query params:** `limit` (optional), `cursor` (optional)

**Success: 200**
```json
{
  "items": [
    {
      "topup_id": "uuid",
      "amount_bdt": 25000,
      "payment_label": "Mastercard",
      "status": "completed|failed|pending",
      "created_at": "ISO-8601"
    }
  ],
  "next_cursor": "opaque|null"
}
```

---

### GET /api/wallet/topup/:id
**Auth:** Required (rider)
**Purpose:** Fetch detailed top-up transaction payload for Top Up Details screen.

**Success: 200**
```json
{
  "topup_id": "uuid",
  "amount_bdt": 25000,
  "wallet_label": "GoRide Wallet",
  "status": "completed|failed|pending",
  "payment": { "method_label": "Mastercard", "masked_ref": "....4679" },
  "transaction_id": "TRX1218242035",
  "created_at": "ISO-8601"
}
```

---

### POST /api/wallet/topup
**Auth:** Required (rider)
**Purpose:** Initialize wallet top-up payment.

**Body:** `{ "amount_bdt": number, "payment_method_id": "uuid" }`

**Success: 201**
```json
{
  "topup_id": "uuid",
  "status": "pending",
  "payment_redirect_url": "string|null",
  "client_secret": "string|null"
}
```

**Errors**
| Code | Condition |
|------|----------|
| 400 | `invalid_amount` (below min or above max policy) |
| 404 | `payment_method_not_found` |
| 422 | `payment_method_disabled` |

---

### POST /api/wallet/topup/:id/confirm
**Auth:** Required (rider)
**Purpose:** Confirm top-up completion and settle wallet credit.

**Body:** `{ "provider_ref": "string" }`

**Success: 200** `{ "status": "completed", "credited_amount_bdt": 25000, "available_balance_bdt": 231950 }`

---

### POST /api/wallet/topup/:id/share-receipt
**Auth:** Required (rider)
**Purpose:** Generate shareable receipt artifact for top-up transaction.

**Body:** `{ "format": "image|pdf" }`

**Success: 200**
```json
{
  "receipt_id": "uuid",
  "file_name": "IMG-TRX1218242035-TOPUP.jpg",
  "mime_type": "image/jpeg",
  "share_uri": "string"
}
```

---

### GET /api/rider/addresses
**Auth:** Required (rider)
**Purpose:** Fetch saved addresses for address book list.

**Success: 200**
```json
{
  "addresses": [
    {
      "address_id": "uuid",
      "label": "Home",
      "address_line": "85 4th Ave, New York, NY 10003, United States",
      "details": "Floor 2|null",
      "lat": 40.732,
      "lng": -73.99,
      "created_at": "ISO-8601"
    }
  ]
}
```

---

### POST /api/rider/addresses
**Auth:** Required (rider)
**Purpose:** Create a saved address.

**Body:**
```json
{
  "label": "Mom's House",
  "address_line": "100 Bleecker St, New York, NY 10012, United States",
  "details": "Floor 3, Apt 3A",
  "lat": 40.731,
  "lng": -73.997
}
```

**Success: 201** `{ "address_id": "uuid", "created": true }`

**Errors**
| Code | Condition |
|------|----------|
| 400 | `invalid_address_payload` |
| 422 | `address_limit_reached` |

---

### PUT /api/rider/addresses/:id
**Auth:** Required (rider)
**Purpose:** Edit an existing saved address.

**Body:** Partial of create payload fields.

**Success: 200** `{ "updated": true }`

---

### DELETE /api/rider/addresses/:id
**Auth:** Required (rider)
**Purpose:** Delete a saved address with reversible undo window.

**Success: 200**
```json
{
  "deleted": true,
  "undo_token": "opaque-string",
  "undo_expires_at": "ISO-8601"
}
```

---

### POST /api/rider/addresses/:id/undo-delete
**Auth:** Required (rider)
**Purpose:** Restore a recently deleted address using undo token.

**Body:** `{ "undo_token": "opaque-string" }`

**Success: 200** `{ "restored": true }`

**Errors**
| Code | Condition |
|------|----------|
| 404 | `undo_not_found` |
| 410 | `undo_expired` |

---

### GET /api/rider/profile
**Auth:** Required (rider)
**Purpose:** Fetch personal profile settings.

**Success: 200**
```json
{
  "full_name": "Andrew Ainsley",
  "email": "andrew.ainsley@yourdomain.com",
  "phone": "+16465554099",
  "gender": "male|female|other|prefer_not_to_say|null",
  "date_of_birth": "1995-12-27",
  "avatar_url": "string|null"
}
```

---

### PUT /api/rider/profile
**Auth:** Required (rider)
**Purpose:** Update personal profile fields.

**Body:** Partial of profile fields.

**Success: 200** `{ "updated": true }`

---

### GET /api/rider/preferences/notifications
**Auth:** Required (rider)
**Purpose:** Fetch notification toggle preferences. Reads from `users.notification_prefs` JSONB column.

**Success: 200**
```json
{
  "ride_offers": true,
  "promotions": false,
  "chat": true,
  "sounds": true
}
```
Returns `{}` if `users.notification_prefs` is NULL (no preferences set — client should use sensible defaults).

---

### PUT /api/rider/preferences/notifications
**Auth:** Required (rider)
**Purpose:** Update notification preference toggles. Writes full object to `users.notification_prefs` JSONB column.

**Zod schema:**
```
z.object({
  ride_offers: z.boolean().optional(),
  promotions: z.boolean().optional(),
  chat: z.boolean().optional(),
  sounds: z.boolean().optional()
})
```
Partial update: merges provided fields into existing JSONB. Fields not sent are preserved unchanged.

**Success: 200** `{ "updated": true }`

---

### GET /api/rider/preferences/security
**Auth:** Required (rider)
**Purpose:** Fetch account/security toggle state. Reads from `users.security_settings` JSONB column.

**Success: 200**
```json
{
  "two_factor_enabled": false,
  "biometric_enabled": false
}
```
Returns `{}` if `users.security_settings` is NULL.

---

### PUT /api/rider/preferences/security
**Auth:** Required (rider)
**Purpose:** Update security toggles. Writes to `users.security_settings` JSONB column.

**Zod schema:**
```
z.object({
  two_factor_enabled: z.boolean().optional(),
  biometric_enabled: z.boolean().optional()
})
```
Partial update: merges provided fields into existing JSONB.

**Success: 200** `{ "updated": true }`

---

### GET /api/rider/linked-accounts
**Auth:** Required (rider)
**Purpose:** Fetch linked provider status. Reads from `users.linked_accounts` JSONB column.

**Success: 200**
```json
{
  "providers": [
    { "provider": "google", "connected": true, "email": "user@gmail.com" },
    { "provider": "facebook", "connected": false }
  ]
```
Returns empty `providers` array if `users.linked_accounts` is NULL.

---

### POST /api/rider/linked-accounts/:provider/connect
**Auth:** Required (rider)
**Purpose:** Start provider OAuth connect flow. On callback success, updates `users.linked_accounts` JSONB with `{ provider: { id, email/name } }`.

**Path param:** `provider` — `'google'` | `'facebook'`

**Success: 200** `{ "auth_url": "string" }`

---

### POST /api/rider/linked-accounts/:provider/disconnect
**Auth:** Required (rider)
**Purpose:** Disconnect linked provider. Sets the provider key to `null` in `users.linked_accounts` JSONB.

**Path param:** `provider` — `'google'` | `'facebook'`

**Success: 200** `{ "disconnected": true }`

---

### GET /api/rider/data-controls
**Auth:** Required (rider)
**Purpose:** Fetch data usage and privacy controls. Reads from `users.data_controls` JSONB column.

**Success: 200**
```json
{
  "share_location": true,
  "share_analytics": false
}
```
Returns `{ "share_location": true, "share_analytics": false }` if `users.data_controls` is NULL (defaults).

---

### PUT /api/rider/data-controls
**Auth:** Required (rider)
**Purpose:** Update data usage and privacy controls. Writes to `users.data_controls` JSONB column.

**Zod schema:**
```
z.object({
  share_location: z.boolean().optional(),
  share_analytics: z.boolean().optional()
})
```
Partial update: merges provided fields into existing JSONB.

**Success: 200** `{ "updated": true }`

---

### POST /api/rider/data-export-request
**Auth:** Required (rider)
**Purpose:** Request downloadable export of rider data.

**Success: 202** `{ "requested": true, "request_id": "uuid" }`

---

### GET /api/payment/methods
**Auth:** Required (rider)
**Purpose:** Fetch all rider payment instruments for settings and checkout flows.

**Success: 200**
```json
{
  "methods": [
    {
      "id": "uuid",
      "type": "card|wallet|cash",
      "label": "Visa •••• 5567",
      "masked_ref": "•••• 5567",
      "status": "connected",
      "is_default": true,
      "is_enabled": true
    }
  ]
}
```

---

### POST /api/payment/methods
**Auth:** Required (rider)
**Purpose:** Add a new payment method.

**Body:** `{ "type": "card", "card_number": "string", "holder_name": "string", "expiry": "MM/YY", "cvv": "string" }`

**Success: 201** `{ "method_id": "uuid", "created": true }`

**Errors**
| Code | Condition |
|------|----------|
| 400 | `invalid_card_payload` |
| 422 | `unsupported_network` |

---

### GET /api/settings/appearance
**Auth:** Required (rider)
**Purpose:** Fetch current app appearance preferences.

**Success: 200** `{ "theme": "system|light|dark", "language": "en-US" }`

---

### PUT /api/settings/appearance/theme
**Auth:** Required (rider)
**Purpose:** Persist theme preference.

**Body:** `{ "theme": "system|light|dark" }`

**Success: 200** `{ "updated": true }`

---

### PUT /api/settings/appearance/language
**Auth:** Required (rider)
**Purpose:** Persist language preference.

**Body:** `{ "language": "en-US" }`

**Success: 200** `{ "updated": true }`

---

### GET /api/help/faq
**Auth:** Optional (recommended authenticated for personalization)
**Purpose:** Fetch FAQ items, optionally filtered by category/search.

**Query params:** `category` (optional), `q` (optional)

**Success: 200**
```json
{
  "items": [
    {
      "id": "faq_001",
      "category": "general",
      "question": "What is GoRide?",
      "answer": "GoRide is a convenient ride-hailing service..."
    }
  ]
}
```

---

### GET /api/help/support-channels
**Auth:** Optional
**Purpose:** Fetch configured support channels shown in Contact Support.

**Success: 200**
```json
{
  "channels": [
    { "id": "customer_support", "type": "internal", "label": "Customer Support", "target": "app://support/chat" },
    { "id": "website", "type": "external", "label": "Website", "target": "https://example.com" }
  ]
}
```

---

### GET /api/legal/privacy-policy
**Auth:** Optional
**Purpose:** Fetch active privacy policy document.

**Success: 200** `{ "effective_date": "2024-12-19", "content_markdown": "string" }`

---

### GET /api/legal/terms-of-service
**Auth:** Optional
**Purpose:** Fetch active terms of service document.

**Success: 200** `{ "effective_date": "2024-12-20", "content_markdown": "string" }`

---

### GET /api/ride/estimate
**Auth:** Required (rider)
**Purpose:** Pre-request fare estimate for all vehicle types with active pricing. Called before rider confirms pickup/dropoff.

**Query parameters**
| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| pickup_lat | number | yes | — |
| pickup_lng | number | yes | — |
| dropoff_lat | number | yes | — |
| dropoff_lng | number | yes | — |
| promo_code | string | no | If provided, response includes promo discount preview |
| preferences | string | no | Comma-separated preference UUIDs for surcharge calculation |

> **Note:** This is a GET endpoint — parameters must be in the query string, not the request body. Example: `GET /api/ride/estimate?pickup_lat=23.78&pickup_lng=90.40&dropoff_lat=23.73&dropoff_lng=90.38`

**Success: 200**
```json
{
  "estimates": [
    {
      "vehicle_type": "bike_basic",
      "label_en": "Bike Basic",
      "label_bn": "বাইক বেসিক",
      "seats": 1,
      "fare_breakdown": { "base_fare_bdt": 2500, "distance_charge_bdt": 3840, "time_charge_bdt": 0, "total_bdt": 6340, "floor_fare_bdt": 5800, "distance_km": 3.2, "platform_commission_percent": 0.00, "platform_commission_bdt": 0, "driver_net_bdt": 6340 },
      "preference_surcharge_bdt": 0,
      "driver_fare_bdt": 6340,
      "rider_payable_bdt": 6340,
      "promo": null
    },
    {
      "vehicle_type": "bike_standard",
      "label_en": "Bike Standard",
      "label_bn": "বাইক স্ট্যান্ডার্ড",
      "seats": 1,
      "fare_breakdown": { "base_fare_bdt": 3000, "distance_charge_bdt": 4800, "time_charge_bdt": 0, "total_bdt": 7800, "floor_fare_bdt": 6200, "distance_km": 3.2, "platform_commission_percent": 0.00, "platform_commission_bdt": 0, "driver_net_bdt": 7800 },
      "preference_surcharge_bdt": 500,
      "driver_fare_bdt": 8300,
      "rider_payable_bdt": 6740,
      "promo": {
        "discount_bdt": 1560,
        "rider_payable_bdt": 6740,
        "driver_fare_bdt": 8300,
        "platform_subsidy_bdt": 1560
      }
    }
  ],
  "distance_km": 3.2,
  "preferences_applied": ["large_luggage"]
}
```
**Notes:** Returns only vehicle types with `is_active=true` pricing for the active zone. Sorted by `total_bdt` ascending. If pickup outside zone → 422 `outside_zone`. Response includes `platform_commission_percent` from each pricing row. `fare_breakdown` includes `platform_commission_percent`, `platform_commission_bdt`, and `driver_net_bdt` as part of the shape. `driver_fare_bdt` = `fare_breakdown.total_bdt` + `preference_surcharge_bdt` (always present — driver receives full amount). `rider_payable_bdt` = `driver_fare_bdt` − `promo.discount_bdt` (when promo applied) or `driver_fare_bdt` (when no promo). When `promo_code` is provided and valid, each estimate includes a `promo` object with the discount breakdown. `preference_surcharge_bdt` is the sum of surcharges for selected preferences.

**Zone check on estimate is intentional** — prevents riders from seeing fares for areas the service doesn't cover. On 422 `outside_zone`, the client must show the zone error toast on the map screen (not inside the fare sheet which never opens). Rider should reposition the pickup pin.

---

### GET /api/ride/alternatives
**Auth:** Required (rider role)
**Purpose:** Fetch alternative vehicle types with available drivers for a ride that received no_drivers status.

**Query params:** `ride_id` (required, uuid)

**Response: 200**
```json
{
  "ride_id": "uuid",
  "requested_vehicle_type": "car_premium",
  "alternatives": [
    {
      "vehicle_type": "car_comfort",
      "fare_breakdown": { "base_fare_bdt": 5000, "distance_charge_bdt": 4400, "time_charge_bdt": 0, "total_bdt": 9400, "floor_fare_bdt": 19700, "distance_km": 2.0, "platform_commission_percent": 0.00, "platform_commission_bdt": 0, "driver_net_bdt": 9400 },
      "available_drivers": 3
    }
  ]
}
```

**Errors**
| Code | Condition |
|------|----------|
| 404 | Ride not found |
| 422 | Ride status is not 'no_drivers' |

---

### POST /api/promo/validate
**Auth:** Required (rider)
**Rate limit:** 20/rider/hour (configurable constant). Prevents brute-force promo code discovery.
**Purpose:** Validate a promo code for an upcoming ride without redeeming it. Used on the fare breakdown screen to preview the discount. Does NOT write to `promo_redemptions`. The rider sees the discount preview and taps "Use Now" to call `POST /api/promo/redeem` which stages the promo.

**Body:** `{ "code": "string", "vehicle_type": "vehicleTypeEnum", "pickup_lat": number, "pickup_lng": number, "dropoff_lat": number, "dropoff_lng": number }`

**Success: 200**
```json
{
  "valid": true,
  "promo": {
    "promo_id": "uuid",
    "code": "SAVE20",
    "title": "20% off",
    "discount_type": "percent",
    "discount_value": 20,
    "max_discount_bdt": 5000
  },
  "preview": {
    "original_total_bdt": 6840,
    "discount_bdt": 1368,
    "rider_payable_bdt": 5472,
    "driver_fare_bdt": 6840,
    "platform_subsidy_bdt": 1368
  }
}
```

**Errors**
| Code | Condition |
|------|----------|
| 404 | `promo_not_found` — code does not exist |
| 410 | `promo_expired` — code has expired |
| 422 | `promo_ineligible` — min spend / vehicle type / zone constraint not met |
| 429 | `promo_max_uses_reached` — global or per-rider limit reached |

---

### GET /api/reference/preferences
**Auth:** [public]
**Purpose:** Fetch active ride preference definitions for display on the booking screen.

**Response: 200**
```json
{
  "preferences": [
    {
      "id": "uuid",
      "name": "large_luggage",
      "display_label_en": "Large Luggage",
      "display_label_bn": "বড় লাগেজ",
      "icon": "luggage",
      "charge_bdt": 0,
      "affects_matching": true
    }
  ]
}
```

---

### GET /api/driver/incentives
**Auth:** Required (driver)
**Purpose:** Fetch the driver's active incentives with current progress and completed history.

**Response: 200**
```json
{
  "active": [
    {
      "incentive_id": "uuid",
      "name": "Complete 20 rides this week",
      "target_metric": "completed_rides",
      "target_value": 20,
      "current_progress": 14,
      "reward_calls": 5,
      "ends_at": "ISO-8601"
    }
  ],
  "completed": [
    {
      "incentive_id": "uuid",
      "name": "Online 40 hours this month",
      "completed_at": "ISO-8601",
      "reward_calls": 10
    }
  ],
  "total_bonus_calls_earned": 15
}
```

---

### POST /api/driver/preferences
**Auth:** Required (driver)
**Purpose:** Set the driver's opted-in preferences (replaces all existing).

**Body:** `{ "preference_ids": ["uuid", "uuid"] }`

**Success: 200** `{ "updated": true, "preference_ids": ["uuid", "uuid"] }`

---

### GET /api/promo/available
**Auth:** Required (rider)
**Purpose:** Fetch available promos/vouchers for rider context and current zone. Reads from the `promo_codes` table.

**Query params (optional):**
- `category`: `all|discount|cashback|partnership`

**Response: 200**
```json
{
  "promos": [
    {
      "promo_id": "uuid",
      "code": "SAVE20",
      "title": "20% off",
      "category": "discount",
      "valid_from": "ISO-8601",
      "valid_to": "ISO-8601",
      "min_spend_bdt": 10000,
      "max_discount_bdt": 5000,
      "terms": ["One ride per rider"],
      "is_eligible": true
    }
  ]
}
```

---

### POST /api/promo/redeem
**Auth:** Required (rider)
**Rate limit:** 10/rider/hour (configurable constant).
**Purpose:** Validate and lock a promo code for the rider's next ride. On success, the promo is **staged** (not yet consumed). The actual `promo_redemptions` row is written when `POST /api/ride/request` creates the ride. This deferral ensures the promo is not wasted if the ride is cancelled or never created. The staged state is held in a short-lived server-side cache (Redis or in-memory map, TTL 10 minutes). If the staged promo is not used within the TTL, it is released automatically.

**Body:** `{ "code": "string", "vehicle_type": "vehicleTypeEnum", "pickup_lat": number, "pickup_lng": number }`

**Success: 200**
```json
{
  "status": "valid",
  "promo": {
    "promo_id": "uuid",
    "code": "SAVE20",
    "discount_type": "percent|flat",
    "discount_value": 20,
    "max_discount_bdt": 5000,
    "receivable_bdt": 1500
  }
}
```

**Errors**
| Code | Condition |
|------|----------|
| 404 | `promo_not_found` |
| 410 | `promo_expired` |
| 422 | `promo_ineligible` (min spend/vehicle/zone constraints) |
| 429 | `promo_max_uses_reached` — global or per-rider limit reached |

> **Cancellation policy:** If a ride with a staged promo is cancelled before dispatch completes (`status IN ('pending','dispatching')`), the `promo_redemptions` row (if written) is deleted and the usage count is decremented atomically. If cancelled after match, the promo usage stands — the promo was consumed for a ride that was dispatched to a driver. This is a product decision: post-match cancellations are rider-initiated and the platform/driver cost is already incurred.
>
> **Consistency note:** `POST /api/promo/validate` uses lat/lng coordinates for zone eligibility. `POST /api/promo/redeem` uses the same lat/lng parameters for consistency. Both resolve the zone server-side from the coordinates.

---

### PUT /api/payment/default-method
**Auth:** Required (rider)
**Purpose:** Persist rider default payment method selected from payment picker.

**Body:** `{ "payment_method_id": "uuid" }`

**Success: 200** `{ "status": "ok", "default_payment_method_id": "uuid" }`

**Errors**
| Code | Condition |
|------|----------|
| 404 | `payment_method_not_found` |
| 422 | `payment_method_disabled` |

---

### GET /api/rider/wallet
**Auth:** Required (rider)
**Purpose:** Fetch rider wallet balance and recent transactions (referral rewards, ride usage).

**Response: 200**
```json
{
  "balance_bdt": 5000,
  "transactions": [
    {
      "id": "uuid",
      "type": "referral_reward",
      "amount_bdt": 5000,
      "created_at": "ISO-8601"
    }
  ]
}
```

---

### GET /api/driver/wallet
**Auth:** Required (driver)
**Purpose:** Fetch driver wallet balance and recent transactions (promo/referral subsidies, payouts).

**Response: 200**
```json
{
  "balance_bdt": 15000,
  "transactions": [
    {
      "id": "uuid",
      "type": "promo_receivable",
      "amount_bdt": 2000,
      "ride_id": "uuid",
      "created_at": "ISO-8601"
    }
  ]
}
```

---

### GET /api/user/points
**Auth:** Required (rider or driver)
**Purpose:** Fetch user's current point balance and recent transactions.

**Response: 200**
```json
{
  "balance": 1250,
  "transactions": [
    {
      "id": "uuid",
      "type": "earned",
      "amount": 250,
      "source": "ride",
      "created_at": "ISO-8601"
    }
  ]
}
```

---

### GET /api/points/offers
**Auth:** Required (rider or driver)
**Purpose:** Fetch active point redemption offers.

**Response: 200**
```json
{
  "offers": [
    {
      "id": "uuid",
      "title": "50 BDT Wallet Credit",
      "points_required": 5000,
      "reward_type": "wallet_credit",
      "reward_value": "5000"
    }
  ]
}
```

---

### POST /api/points/redeem
**Auth:** Required (rider or driver)
**Purpose:** Redeem points for a selected offer.

**Body:** `{ "offer_id": "uuid" }`

**Success: 200**
```json
{
  "success": true,
  "new_balance": 750,
  "reward_applied": true
}
```
**Errors:** 400 (insufficient points), 404 (offer not found)

---

### GET /api/referral/code
**Auth:** Required (user)
**Purpose:** Get user's unique referral code. Generates one if it doesn't exist.

**Response: 200** `{ "code": "RIDE-A3F9B2" }`

---

### POST /api/referral/apply
**Auth:** Required (rider or driver)
**Purpose:** Apply a referral code during registration or first ride. Validates code, checks campaign limits, and creates a referral link.

**Body:** `{ "code": "RIDE-A3F9B2" }`

**Validation:**
- Code must exist in `referral_codes` table.
- Active referral campaign must exist (`referral_campaigns.is_active = true`).
- Referrer must not have exceeded `max_uses_per_referrer`.
- Campaign must not have exceeded `max_uses_per_campaign`.
- User cannot apply their own code.
- User cannot apply a second code if already has a referral record.

**Side effects:**
- INSERT `referrals` row linking referrer and referee with `status='pending'`.
- On referee's first completed ride: referral rewards are distributed (see `POST /api/ride/:id/complete` step 12).

**Success: 200** `{ "referral_id": "uuid", "status": "applied", "referrer_reward_preview": "50% off next ride", "referee_reward_preview": "50% off first ride" }`

**Errors:** 400 (invalid code), 403 (self-referral), 409 (already referred), 422 (campaign limit reached, code expired)

---

## Admin Routes (Prefix: /api/admin/*)
**Auth:** All require `requireRole('admin')` middleware + IP allowlisting at infrastructure level.

---

### GET /api/admin/queue
**Query:** `status` ('pending'|'temporary'|'all', default 'pending'), `limit` (50), `offset` (0)

**Response: 200**
```json
{
  "drivers": [
    {
      "driver_id": "uuid", "user_id": "uuid", "name": "string", "phone": "+8801XXXXXXXXX",
      "vehicle_type": "car_comfort",
      "status": "pending", "submitted_at": "ISO-8601", "provisional_expires_at": "ISO-8601|null",
      "documents": [{ "doc_type": "license_front", "status": "pending" }, { "doc_type": "driver_photo", "status": "pending", "face_match_score": null, "face_match_status": "pending" }],
      "has_driver_photo": true,
      "face_match_warning": null,
      "sla_breach": "none",  // "none" | "standard" | "fast_track"
      "sla_hours": 24,           // 12 for legacy operators (fast-track SLA), 24 otherwise
      "is_legacy_operator": false
    }
  ],
  "total": 12, "overdue_count": 2
}
```

---

### POST /api/admin/driver/approve
**Precondition:** `drivers.status = 'pending'`
**Body:** `{ "driver_id": "uuid", "note": "string (optional)", "adjusted_vehicle_type": "vehicleTypeEnum (optional — admin override)", "adjustment_reason": "string (required if adjusted_vehicle_type set)" }`

**Admin vehicle type adjustment:** If admin determines the driver's claimed vehicle type is incorrect (e.g. claimed car_comfort but no AC visible in dashboard photo), admin sets `adjusted_vehicle_type` with a mandatory `adjustment_reason`. Server updates `vehicles.vehicle_type`, `vehicles.admin_type_note`, and `drivers.vehicle_type` atomically. Driver receives push notification: "Your vehicle type was adjusted to [new type]. Reason: [reason]."

**State transitions:**
- Path A (driver IS owner) → `status = 'active'`
- Path B (with consent scan) → `status = 'temporary'`, `provisional_expires_at = now() + 30 days` (business rule)
- Path B (without consent scan) → `status = 'pending'` (registered, not activated)

**Success: 200**
```json
{
  "driver_id": "uuid", "new_status": "active|temporary|pending",
  "provisional_expires_at": "ISO-8601|null",
  "vehicle_type_adjusted": true, "adjusted_to": "car_economy|null"
}
```

---

### POST /api/admin/driver/activate
**Precondition:** `drivers.status = 'temporary'` AND consent scan re-submitted
**Body:** `{ "driver_id": "uuid" }`
**Success: 200** `{ "driver_id": "uuid", "new_status": "active" }`

---

### POST /api/admin/driver/reject
**Precondition:** status IN ('pending','temporary')
**Body:** `{ "driver_id": "uuid", "reason": "string (10–500)" }`
**Success: 200** `{ "driver_id": "uuid", "new_status": "rejected" }`
**Side effect:** Push notification to driver.

---

### POST /api/admin/driver/suspend
**Precondition:** status IN ('temporary','active')
**Body:** `{ "driver_id": "uuid", "reason": "string (10–500)" }`
**Success: 200** `{ "driver_id": "uuid", "new_status": "suspended" }`
**Side effects:** Driver forced offline, active offers cancelled.

---

### POST /api/admin/driver/downgrade
**Auth:** Required (admin role)
**Purpose:** Downgrade a driver's vehicle type (e.g., Car Comfort → Car Economy if no AC visible). Creates `vehicle_type_changes` audit row.

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| driver_id | uuid | yes | Must exist |
| new_vehicle_type | string | yes | vehicleTypeEnum (8 values). Must be a valid downgrade (lower tier than current). |
| reason | string | yes | 10-500 chars. Mandatory explanation shown to driver. |

**Downgrade order:** car_xl > car_premium > car_comfort > car_economy > cng > bike_plus > bike_standard > bike_basic

**Success: 200**
```json
{ "driver_id": "uuid", "old_type": "car_comfort", "new_type": "car_economy", "reason": "No AC visible in dashboard photo" }
```

**Errors**
| Code | Condition |
|------|----------|
| 409 | new_vehicle_type is not a valid downgrade from current type |
| 404 | Driver not found |

**Side effects:** INSERT `vehicle_type_changes` row (`change_reason='admin_downgrade'`). UPDATE `drivers.vehicle_type` and `vehicles.vehicle_type` immediately. UPDATE `vehicles.passenger_seats` atomically with the new vehicle_type's seat count. Push notification to driver with reason.

---

### POST /api/admin/driver/upgrade
**Auth:** Required (admin role)
**Purpose:** Upgrade a driver's vehicle type (e.g., Car Economy → Car Comfort after AC verification). Creates `vehicle_type_changes` audit row. Admin upgrades are immediate — no cooling-off period (unlike driver-initiated changes, which defer by the business-rule cooling-off period).

**Request body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| driver_id | uuid | yes | Must exist |
| new_vehicle_type | string | yes | vehicleTypeEnum (8 values). Must be a valid upgrade (higher tier than current). |
| reason | string | yes | 10-500 chars. Mandatory explanation. |

**Upgrade order (reverse of downgrade):** bike_basic < bike_standard < bike_plus < cng < car_economy < car_comfort < car_premium < car_xl

**Success: 200**
```json
{ "driver_id": "uuid", "old_type": "car_economy", "new_type": "car_comfort", "reason": "AC verified in dashboard photo" }
```

**Errors**
| Code | Condition |
|------|----------|
| 409 | new_vehicle_type is not a valid upgrade from current type |
| 404 | Driver not found |
| 422 | Required documents for new vehicle_type not present (e.g., no dashboard_photo for car types, no helmet_photo for bike types) |

**Side effects:** INSERT `vehicle_type_changes` row (`change_reason='admin_upgrade'`, `status='approved'`, `effective_at=now()`). UPDATE `drivers.vehicle_type` and `vehicles.vehicle_type` immediately. UPDATE `vehicles.passenger_seats` atomically with the new vehicle_type's seat count. Push notification to driver.

---

### POST /api/admin/driver/close-account
**Auth:** Required (admin role)
**Purpose:** Admin-initiated account closure for a driver. Sets document purge timer.
**Body:** `{ "driver_id": "uuid" }`
**Success: 200** `{ "driver_id": "uuid", "closed": true }`
**Side effect:** `UPDATE documents SET purge_at=now()+interval '90 days' WHERE driver_id=?` (configurable retention period). Account closure is admin-initiated only — drivers cannot self-close.

---

### POST /api/admin/driver/type-change-approve
**Auth:** Required (admin)
**Purpose:** Approve a driver-initiated vehicle type change request.
**Body:** `{ "request_id": "uuid", "approved": boolean, "rejection_reason": "string (required if approved=false)" }`

**On approval:** Update `vehicles.vehicle_type = requested_type`, `vehicles.type_change_effective_at = now() + cooling-off period` (business rule; currently 7 days), `drivers.vehicle_type = requested_type` (effective after cooling-off — scheduler applies it). Notify driver: "Type change approved. Effective after cooling-off period."
**On rejection:** Notify driver with reason.

**Success: 200** `{ "effective_at": "ISO-8601|null" }`

---

### POST /api/admin/package
**Body:** `{ "name": "string", "call_count": integer (-1 or positive), "duration_days": integer, "price_bdt": integer (paisa), "is_trial": boolean, "daily_cap": integer|null }`
**Success: 201** `{ "package_id": "uuid", "name": "string" }`

> **Note:** If `call_count > 0` (finite package), `daily_cap` is stored but ignored during dispatch. Recommended: pass `null` for finite packages to make intent explicit. Server should store `null` (not the unlimited `daily_cap` value) when `call_count > 0`.

### PATCH /api/admin/package/:id
**Body (all optional):** `{ "name", "call_count", "duration_days", "price_bdt", "is_active", "daily_cap" }`
**Success: 200** `{ "package_id": "uuid", "updated": true }`

---

### POST /api/admin/pricing
**Body**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| zone_id | uuid | yes | Must exist |
| vehicle_type | string | yes | vehicleTypeEnum (8 values) |
| base_fare_bdt | integer | yes | In paisa |
| per_km_bdt | integer | yes | In paisa per km |
| per_min_bdt | integer | yes | In paisa per minute of ride time |
| floor_length_km | number | yes | Minimum distance for floor fare calculation |
| floor_min | integer | yes | Minimum minutes for floor fare calculation |
| platform_commission_percent | number | no | `z.number().min(0).max(100)`. Default 0.00. Platform's share of the final fare (%). |
| brta_fare_ceiling_bdt | integer | no | Optional reference ceiling (paisa) |

**Success: 201** `{ "pricing_id": "uuid" }`
**Side effect:** Deactivates previous pricing for same (zone_id, vehicle_type). Admin UI should display `brta_fare_ceiling_bdt` as a reference alongside the price inputs.
**Side effect (driver notification):** After updating pricing, server must re-validate all drivers with `min_per_km_bdt IS NOT NULL` for the affected vehicle_type. Drivers whose minimum now exceeds `platform_config.driver_max_ratio` (currently 150%) of the new per_km_bdt should receive a push notification: 'System pricing updated. Your minimum rate now exceeds the allowed range. Please review your settings.'

---

### POST /api/admin/zone
**Body:** `{ "name": "string", "polygon": [{lat, lng}...], "is_active": boolean }`
**Validation:** min 3 points, no self-intersection (turf.js kinks()), auto-close ring if not closed. 400 `invalid_polygon` on failure.
**Success: 201** `{ "zone_id": "uuid" }`
**Side effect:** If `is_active=true`, deactivates all other zones in the same transaction.

---

### GET /api/admin/dispatch-log/:ride_id
**Response: 200**
```json
{
  "ride_id": "uuid",
  "offers": [
    {
      "driver_id": "uuid", "driver_name": "string",
      "batch_index": 1, "sent_at": "ISO-8601",
      "fetch_confirmed_at": "ISO-8601|null", "responded_at": "ISO-8601|null",
      "outcome": "accepted|rejected|expired|refunded|delivered|filtered",
      "filtered_reason": "min_per_km|null",
      "call_ledger_event": { "event_type": "deduction|refund|null", "delta": "integer|null", "created_at": "ISO-8601|null" }
    }
  ],
  "total_offers": 15, "accepted_by": "driver_id|null"
}
```
**Note:** `outcome='filtered'` rows show `filtered_reason` for driver minimum-rate exclusions.

---

### POST /api/admin/payment-event/:id/recover
**Preconditions:** `payment_events.status = 'paid'` AND `subscription_id IS NULL`
**Body:** None
**Success: 200** `{ "subscription_id": "uuid", "message": "Activation successful" }`
**Errors:** 409 (already activated), 404, 422 (status not paid), 500 (queued for retry)

---

### GET /api/admin/document/:id/presigned-url
**Response: 200** `{ "url": "...", "expires_at": "ISO-8601 (+15 min)" }`

Uses `supabase.storage.from('driver-documents').createSignedUrl(...)` to generate a Supabase Storage signed URL.

---

### GET /api/admin/driver-economics
**Response: 200**
```json
{
  "drivers": [
    { "driver_id": "uuid", "driver_name": "string", "vehicle_type": "car_premium", "subscription_cost_bdt": 50000, "completed_rides_count": 3, "cost_per_ride_bdt": 16667, "calls_remaining": 47, "subscription_expires_at": "ISO-8601" }
  ]
}
```

---

### GET /api/admin/ride/:id/chat
**Response: 200** `{ "ride_id": "uuid", "messages": [...], "participant_rider": {...}, "participant_driver": {...} }`

---

### POST /api/admin/dispatch-toggle
**Body:** `{ "paused": boolean }`
**Success: 200** `{ "key": "dispatch_paused", "value": "true|false" }`

---

### GET /api/admin/config
**Purpose:** Returns all `platform_config` key-value pairs (driver slider ratios, BRTA ceiling reference values).
**Auth:** required (admin role)

**Success: 200**
```json
{
  "config": [
    { "key": "driver_min_ratio",           "value": "0.70", "updated_at": "ISO-8601" },
    { "key": "driver_max_ratio",           "value": "1.50", "updated_at": "ISO-8601" },
    { "key": "brta_max_base_bdt",         "value": "8500", "updated_at": "ISO-8601" },
    { "key": "brta_max_per_km_bdt",       "value": "3400", "updated_at": "ISO-8601" },
    { "key": "brta_max_wait_per_2min_bdt","value": "850",  "updated_at": "ISO-8601" }
  ]
}
```

---

### PATCH /api/admin/config
**Purpose:** Updates one or more `platform_config` rows. Changes take effect immediately for all future slider initializations and fare ceiling checks. No restart required.
**Auth:** required (admin role)

**Request body** (all fields optional; only provided keys are updated)
| Field | Type | Validation |
|-------|------|------------|
| `driver_min_ratio` | number | 0.50 ≤ value ≤ 1.00 (cannot be set above 100% — floor must be below system rate) |
| `driver_max_ratio` | number | 1.00 ≤ value ≤ 3.00 |
| `brta_max_base_bdt` | integer | > 0, in paisa |
| `brta_max_per_km_bdt` | integer | > 0, in paisa |
| `brta_max_wait_per_2min_bdt` | integer | > 0, in paisa |

**Success: 200** `{ "updated": ["driver_min_ratio", "driver_max_ratio"] }`

**Errors**
| Code | Condition |
|------|-----------|
| 400 | Unknown key or value out of range |
| 403 | Not admin |

---

### POST /api/admin/config
**Purpose:** Updates a single `system_config` row (operational toggles: `min_app_version`, `brta_fare_ceiling_bdt`). Not for driver slider ratios — use `PATCH /api/admin/config` for those.
**Body:** `{ "key": "string", "value": "string" }`
**Success: 200** `{ "key": "min_app_version", "value": "1.1.0", "updated_at": "ISO-8601" }`

---

### GET /api/admin/promo/:id
**Auth:** Required (admin)
**Purpose:** Fetch a single promo code for the edit modal.

**Response: 200**
```json
{
  "promo_id": "uuid",
  "code": "SAVE20",
  "title": "20% off",
  "description": "...",
  "discount_type": "percent",
  "discount_value": 20,
  "max_uses": 1000,
  "max_uses_per_rider": 1,
  "max_discount_bdt": 5000,
  "min_spend_bdt": null,
  "valid_from": "ISO-8601",
  "expires_at": "ISO-8601",
  "is_active": true,
  "times_used": 342
}
```

**Errors:** 404 `promo_not_found`

---

### POST /api/admin/promo
**Auth:** Required (admin)
**Purpose:** Create a new promo code.

**Body:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| code | string | yes | 2–30 chars, alphanumeric + hyphens |
| title | string | no | Max 100 chars |
| description | string | no | — |
| discount_type | string | yes | `'percent'` or `'flat'` |
| discount_value | integer | yes | > 0. Percent ≤ 100 |
| max_uses | integer | no | NULL = unlimited |
| max_uses_per_rider | integer | no | Default 1 |
| max_discount_bdt | integer | no | Paisa. NULL = no cap |
| min_spend_bdt | integer | no | Paisa. NULL = no minimum |
| valid_from | string | yes | ISO-8601 |
| expires_at | string | yes | ISO-8601, must be > valid_from |

**Success: 201** `{ "promo_id": "uuid", "code": "SAVE20" }`

### PATCH /api/admin/promo/:id
**Auth:** Required (admin)
**Purpose:** Update promo code fields (all optional).

**Body:** Partial of creation fields + `{ "is_active": boolean }`.

**Success: 200** `{ "promo_id": "uuid", "updated": true }`

### GET /api/admin/promos
**Auth:** Required (admin)
**Purpose:** List all promo codes with usage stats.

**Query params:** `page`, `limit`, `is_active` (optional filter)

**Response: 200**
```json
{
  "promos": [
    {
      "promo_id": "uuid",
      "code": "SAVE20",
      "title": "20% off",
      "discount_type": "percent",
      "discount_value": 20,
      "max_uses": 1000,
      "times_used": 342,
      "is_active": true,
      "valid_from": "ISO-8601",
      "expires_at": "ISO-8601"
    }
  ],
  "total": 5,
  "has_more": false
}
```

---

### GET /api/admin/incentive/:id
**Auth:** Required (admin)
**Purpose:** Fetch a single incentive campaign for the edit modal.

**Response: 200**
```json
{
  "incentive_id": "uuid",
  "name": "Complete 20 rides this week",
  "description": "...",
  "target_metric": "completed_rides",
  "target_value": 20,
  "reward_calls": 5,
  "vehicle_type_filter": null,
  "is_active": true,
  "starts_at": "ISO-8601",
  "ends_at": "ISO-8601",
  "participants": 142,
  "completed": 38
}
```

**Errors:** 404 `incentive_not_found`

---

### POST /api/admin/incentive
**Auth:** Required (admin)
**Purpose:** Create a new driver incentive campaign.

**Body:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | Max 100 chars |
| description | string | no | — |
| target_metric | string | yes | `'completed_rides'`, `'online_hours'`, `'acceptance_rate'`, `'consecutive_accepts'` |
| target_value | number | yes | > 0 |
| reward_calls | integer | yes | > 0 |
| vehicle_type_filter | string | no | vehicleTypeEnum or null |
| starts_at | string | yes | ISO-8601 |
| ends_at | string | yes | ISO-8601, must be > starts_at |

**Success: 201** `{ "incentive_id": "uuid" }`

### PATCH /api/admin/incentive/:id
**Auth:** Required (admin)
**Purpose:** Update incentive fields or toggle active status.

**Body:** Partial of creation fields + `{ "is_active": boolean }`.

**Success: 200** `{ "incentive_id": "uuid", "updated": true }`

### GET /api/admin/incentives
**Auth:** Required (admin)
**Purpose:** List all incentive campaigns with participation stats.

**Response: 200**
```json
{
  "incentives": [
    {
      "incentive_id": "uuid",
      "name": "Complete 20 rides this week",
      "target_metric": "completed_rides",
      "target_value": 20,
      "reward_calls": 5,
      "is_active": true,
      "starts_at": "ISO-8601",
      "ends_at": "ISO-8601",
      "participants": 142,
      "completed": 38
    }
  ]
}
```

---

### GET /api/admin/preference/:id
**Auth:** Required (admin)
**Purpose:** Fetch a single preference definition for the edit modal.

**Response: 200**
```json
{
  "preference_id": "uuid",
  "name": "large_luggage",
  "display_label_en": "Large Luggage",
  "display_label_bn": "বড় লাগেজ",
  "icon": "luggage",
  "charge_bdt": 0,
  "affects_matching": true,
  "is_active": true,
  "drivers_opted_in": 245
}
```

**Errors:** 404 `preference_not_found`

---

### POST /api/admin/preference
**Auth:** Required (admin)
**Purpose:** Create a new ride preference definition.

**Body:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | Machine key, unique |
| display_label_en | string | yes | — |
| display_label_bn | string | yes | — |
| icon | string | no | Icon name |
| charge_bdt | integer | no | Paisa, default 0 |
| affects_matching | boolean | no | Default false |

**Success: 201** `{ "preference_id": "uuid" }`

### PATCH /api/admin/preference/:id
**Auth:** Required (admin)
**Purpose:** Update preference definition.

**Body:** Partial of creation fields + `{ "is_active": boolean }`.

**Success: 200** `{ "preference_id": "uuid", "updated": true }`

### GET /api/admin/preferences
**Auth:** Required (admin)
**Purpose:** List all preference definitions with driver adoption stats.

**Response: 200**
```json
{
  "preferences": [
    {
      "preference_id": "uuid",
      "name": "large_luggage",
      "display_label_en": "Large Luggage",
      "display_label_bn": "বড় লাগেজ",
      "charge_bdt": 0,
      "affects_matching": true,
      "is_active": true,
      "drivers_opted_in": 245
    }
  ]
}
```

---

### GET /api/admin/referral-campaign/:id
**Auth:** Required (admin)
**Purpose:** Fetch a single referral campaign.

**Response: 200**
```json
{
  "id": "uuid",
  "name": "Launch Referral",
  "referrer_reward_percent": 50,
  "referee_reward_percent": 50,
  "max_uses_per_referrer": 10,
  "max_uses_per_campaign": 1000,
  "is_active": true,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Errors:** 404 `campaign_not_found`

---

### POST /api/admin/referral-campaign
**Auth:** Required (admin)
**Purpose:** Create a new referral campaign.

**Body:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | Max 100 chars |
| referrer_reward_percent | integer | yes | 1–100 |
| referee_reward_percent | integer | yes | 1–100 |
| max_uses_per_referrer | integer | yes | > 0 |
| max_uses_per_campaign | integer | no | NULL = unlimited |

**Success: 201** `{ "id": "uuid" }`

**Errors:** 409 `active_campaign_exists` — only one campaign can be active at a time.

### PATCH /api/admin/referral-campaign/:id
**Auth:** Required (admin)
**Purpose:** Update referral campaign fields or toggle active status.

**Body:** Partial of creation fields + `{ "is_active": boolean }`.

**Success: 200** `{ "id": "uuid", "updated": true }`

**Errors:** 409 `active_campaign_exists` — if setting `is_active=true` when another campaign is already active.

### GET /api/admin/referral-campaigns
**Auth:** Required (admin)
**Purpose:** List all referral campaigns.

**Response: 200**
```json
{
  "campaigns": [
    {
      "id": "uuid",
      "name": "Launch Referral",
      "referrer_reward_percent": 50,
      "referee_reward_percent": 50,
      "max_uses_per_referrer": 10,
      "max_uses_per_campaign": 1000,
      "is_active": true,
      "created_at": "ISO-8601"
    }
  ]
}
```

---

### GET /api/admin/point-offer/:id
**Auth:** Required (admin)
**Purpose:** Fetch a single point offer.

**Response: 200**
```json
{
  "id": "uuid",
  "title": "50 BDT Wallet Credit",
  "points_required": 5000,
  "reward_type": "wallet_credit",
  "reward_value": "5000",
  "is_active": true,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Errors:** 404 `offer_not_found`

---

### POST /api/admin/point-offer
**Auth:** Required (admin)
**Purpose:** Create a new point offer.

**Body:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| title | string | yes | Max 100 chars |
| points_required | integer | yes | > 0 |
| reward_type | string | yes | `'package_grant'` or `'wallet_credit'` |
| reward_value | string | yes | Package ID (uuid) or BDT amount in paisa |

**Success: 201** `{ "id": "uuid" }`

### PATCH /api/admin/point-offer/:id
**Auth:** Required (admin)
**Purpose:** Update point offer fields or toggle active status.

**Body:** Partial of creation fields + `{ "is_active": boolean }`.

**Success: 200** `{ "id": "uuid", "updated": true }`

### GET /api/admin/point-offers
**Auth:** Required (admin)
**Purpose:** List all point offers.

**Response: 200**
```json
{
  "offers": [
    {
      "id": "uuid",
      "title": "50 BDT Wallet Credit",
      "points_required": 5000,
      "reward_type": "wallet_credit",
      "reward_value": "5000",
      "is_active": true
    }
  ]
}
```

---

### GET /api/admin/vehicle-models
**Auth:** Required (admin)
**Purpose:** List vehicle model entries for admin management.

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| vehicle_type | string | no | Filter by vehicle type key. |
| brand | string | no | Filter by brand (case-insensitive, partial match). |
| is_active | boolean | no | Filter by active status. |
| cursor | string | no | Pagination cursor. |
| limit | integer | no | Max results (default: 50, max: 200). |

**Response: 200**
```json
{
  "models": [
    {
      "id": "uuid",
      "brand": "Suzuki",
      "model": "Alto",
      "year_start": 2010,
      "year_end": 2025,
      "default_vehicle_type": "car_economy",
      "has_ac": false,
      "passenger_seats": 4,
      "engine_cc": 660,
      "is_active": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "total": 150,
  "has_more": true
}
```

---

### POST /api/admin/vehicle-model
**Auth:** Required (admin)
**Purpose:** Add a new vehicle model entry to the reference table.

**Body:**
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| brand | string | yes | 1–100 chars |
| model | string | yes | 1–100 chars |
| year_start | integer | yes | 1990–current_year+1 |
| year_end | integer | yes | ≥ year_start |
| default_vehicle_type | string | yes | One of 8 vehicle type enum values |
| has_ac | boolean | no | Default null (null for bikes/CNG) |
| passenger_seats | integer | no | 1–8 |
| engine_cc | integer | no | Engine displacement in CC |

**Success: 201** `{ "id": "uuid", "brand": "...", "model": "..." }`
**Errors:** 400 (invalid body), 409 (duplicate brand+model+year range)

---

### PATCH /api/admin/vehicle-model/:id
**Auth:** Required (admin)
**Purpose:** Update a vehicle model entry (change classification, toggle active, extend year range).

**Body:** Partial of creation fields + `{ "is_active": boolean }`.

**Success: 200** `{ "id": "uuid", "updated": true }`
**Errors:** 400 (invalid body), 404 (model not found)

---

### GET /api/app-config
**Auth:** [public]
**Response: 200** `{ "min_app_version": "1.0.0", "latest_version": "1.0.0", "apk_download_url": "https://..." }`

> **Security note:** This endpoint returns only pre-approved system_config keys. Any key not in the allowlist is excluded from the response, even if present in system_config.

---

## WebSocket events (utils-server)

| Event | Direction | Payload | Notes |
|-------|-----------|---------|-------|
| `auth:hello` | client → server | `{supabase_jwt, role:'driver'\|'rider'}` | Bind socket |
| `auth:refresh` | client → server | `{supabase_jwt}` | Every 50m |
| `auth:ok`/`error` | server → client | `{user_id, role}` | — |
| `ride:offer` | server → driver | `{ride_id, pickup: {lat,lng,address}, dropoff: {lat,lng,address}, fare_breakdown, driver_fare_bdt, vehicle_type (8-value enum), rider_first_name, rider_rating, distance_km, pickup_distance_km, pickup_eta_minutes, is_scheduled, preferences: [{name, display_label_en, icon}], expires_in_ms: 15000, expires_at: ISO-8601}` | Client drives countdown from `expires_at`. Offer timeout is configurable (default 15s). `pickup_distance_km` and `pickup_eta_minutes` are estimated from driver's current location. `rider_rating` is the rider's average rating. `is_scheduled` is true for scheduled rides. `preferences` lists any rider-selected add-ons. **`driver_fare_bdt` is the amount the driver will earn** (fare_breakdown.total_bdt + preference_surcharge_bdt). The offer card MUST display `driver_fare_bdt`, NOT `fare_breakdown.total_bdt`. `fare_breakdown` contains the base fare components for potential future detailed view. |
| `fetch:confirm` | driver → server | `{ride_id}` | On first interaction with offer card |
| `offer:accept` | driver → server | `{ride_id}` | — |
| `offer:reject` | driver → server | `{ride_id, reason?}` | — |
| `offer:lost` | server → driver | `{ride_id, reason: 'accepted_by_other'}` | — |
| `offer:expired` | server → driver | `{ride_id, reason: 'timeout'}` | — |
| `ride:matched` | server → rider | `{ride_id, driver: {name, photo_url, rating, vehicle_type (8-value), vehicle_number}, eta_minutes, masked_phone}` | — |
| `ride:cancelled` | server → rider | `{ride_id, cancel_reason, cancelled_by}` | — |
| `location:update` | driver → server | `{lat, lng, ts}` | Every 5s during ride |
| `location:driver` | server → rider | `{ride_id, lat, lng, ts}` | Forwarded from driver |
| `heartbeat` | driver → server | `{lat, lng, ts}` | Every 10s. DB persist every 30s. |
| `subscription:expired` | server → driver | `{subscription_id}` | Delayed if in active ride |
| `chat:message` | server → other participant | `{id, ride_id, sender_id, content, attachments:[...], created_at}` | After POST /api/ride/:id/message |
| `chat:typing` | client ↔ server ↔ other | `{ride_id, is_typing: boolean}` | Optional |
| `call:state` | server → participant(s) | `{ride_id, session_id, state:'ringing'\|'connected'\|'ended', mode:'voice'\|'video', ended_by?}` | Raised around POST /api/ride/:id/call-session lifecycle |
| `ride:alternatives` | server → rider | `{ride_id, requested_vehicle_type, alternatives: [{vehicle_type, fare_breakdown, available_drivers}]}` | Sent when all dispatch batches exhausted AND other vehicle types have available drivers. See 02-ARCHITECTURE.md § Fallback Dispatch Logic. |
| `ride:expired` | server → rider | `{ride_id, reason: 'no_drivers_available'\|'timeout'}` | Sent when: (a) all 3 batches exhausted with no accept AND no alternatives exist, OR (b) ride expires without any driver accepting. Use `ride:expired` for all no-driver-found or timeout expiry scenarios. `ride:cancelled` is reserved for the stale-matched-ride auto-cancel. |
| `admin:vehicle-downgrade` | server → driver | `{driver_id, old_vehicle_type, new_vehicle_type, reason}` | Push notification + in-app modal on next launch when admin downgrades driver's vehicle type. |
| `vehicle-type:change-applied` | server → driver | `{old_type, new_type, effective_at, min_per_km_bdt_reset: true}` | Sent when a driver-initiated type change cooling-off completes and the new type takes effect (covers both upgrades and lateral changes — not downgrade-only). |
| `admin:suspended` | server → driver | `{driver_id, reason}` | Sent when admin suspends a driver. Driver app should show a blocking modal. |

---

## Internal Endpoints

### POST /internal/dispatch
**Auth:** `WEBSOCKET_INTERNAL_SECRET` (shared secret between Expo API and utils-server)

**Body:** `{ "ride_id": uuid }`

**Purpose:** Called by `POST /api/ride/request` (Expo API route) after the `rides` DB row is created. utils-server sets `rides.status='dispatching'` and starts the dispatch pipeline (H3 candidate selection, scoring, batch broadcast).

**Success:** 200 `{ "ok": true, "status": "dispatching" }`

---

### POST /internal/driver/force-offline
**Auth:** `WEBSOCKET_INTERNAL_SECRET` (shared secret between Expo API and utils-server)

**Body:** `{ "driver_id": uuid, "reason": string }`

**Purpose:** Called by the Expo API after updating the DB on driver suspension or downgrade. Forces the driver offline: closes the WebSocket connection, updates `driver_online_sessions` (sets `went_offline_at=now()`), and sets `drivers.is_online = false`.

**Success:** 200 `{ "ok": true }`

---

## Dispatch — Driver Minimum Per-Km Filter

**In `utils-server/dispatch.ts` candidate pool query, add after eligibility and cap checks:**

```sql
AND (
  d.min_per_km_bdt IS NULL
  OR d.min_per_km_bdt <= p.per_km_bdt
)
```
Where `p` is the `pricing` row for the ride's `vehicle_type` and `zone_id`.

**If a driver is excluded due to `min_per_km_bdt`:**
- INSERT `dispatch_offers` row with `outcome='filtered'`, `ride_id`, `driver_id`, `batch_index`.
- Do NOT send `ride:offer` WebSocket message to this driver.
- Do NOT open a deduction window.
- This row is surfaced in `GET /api/driver/missed-requests` and `GET /api/admin/dispatch-log`.

**Driver sees:** "You missed X offers this week because your minimum rate (৳X/km) was above the system rate (৳Y/km) for those requests."

---

## Dispatch — Rider Preference Matching Filter

**In `utils-server/dispatch.ts` candidate pool query, after vehicle_type and min_per_km filters:**

For any ride where `ride_preferences` has rows with `preferences.affects_matching = true`, the dispatch candidate pool must INNER JOIN `driver_preferences` and filter:

```sql
AND (
  NOT EXISTS (
    SELECT 1 FROM ride_preferences rp
    JOIN preferences p ON p.id = rp.preference_id
    WHERE rp.ride_id = :ride_id AND p.affects_matching = true
  )
  OR d.id IN (
    SELECT dp.driver_id FROM driver_preferences dp
    JOIN ride_preferences rp ON rp.preference_id = dp.preference_id
    WHERE rp.ride_id = :ride_id
  )
)
```

If no preferences have `affects_matching = true`, this filter is skipped entirely (no JOIN needed). If a driver lacks a required preference, they are excluded from the batch but no `dispatch_offers` row with `outcome='filtered'` is written (preference filtering is not a driver-controlled penalty).

---

## Ride Lifecycle State Machine

| Current | Trigger | Next | Actor |
|---------|---------|------|-------|
| pending | `/internal/dispatch` received | dispatching | System |
| dispatching | `offer:accept` | matched | Driver |
| matched | Immediate (same TX as match) | driver_arriving | System |
| driver_arriving | `POST /api/ride/:id/arrive` | driver_arrived | Driver |
| driver_arrived | `POST /api/ride/:id/start` | in_progress | Driver |
| in_progress | `POST /api/ride/:id/complete` | completed | Driver |
| pending/dispatching | 3 batches exhausted | expired | System |
| pending/dispatching | 3 batches exhausted + allow_downgrade=true + alternatives exist | no_drivers | System — returns 202 with alternatives |
| pending | Rider cancels | cancelled | Rider — no penalty |
| dispatching | Rider cancels | cancelled | Rider — deductions NOT refunded |
| matched/driver_arriving/driver_arrived | Rider cancels | cancelled | Rider — reason required, cooldown on repeat |
| matched/driver_arriving/driver_arrived | Driver cancels | cancelled | Driver — acceptance_rate decremented |
| driver_arrived | `stale_arrived_timeout_minutes` elapsed | cancelled | System — `cancel_reason = 'driver_no_show_after_arrival'` |
| in_progress | — | (not cancellable) | — |

---

## Rate Limiting Key Format

> **Implementation note:** The `rate_limits` table uses **fixed-window** counters (not rolling/sliding windows). Each row tracks `(key, window_start)`; when `now() >= window_start + window_duration`, a new bucket is created. This matches the current implementation and is sufficient for MVP scale.
>
> **Configurability note:** Rate limit windows and thresholds below are configurable constants, not hard-coded database values.

| Context | Key | Window | Limit |
|---------|-----|--------|-------|
| Ride request | `ride_req:user:{user_id}` | 60 min | 5 |
| Auth start-verification | `auth_start:{phone}` | 10 min | 5 |
| Document upload | `doc_upload:{driver_id}` | 10 min | 20 |

---

## Documented Gaps (Sprint 2)

### Device Binding (PRD req 36)
`users.device_id` column exists. Enforcement (collection, binding endpoint, 24h cooldown) not yet specified end-to-end. Medium risk for MVP.

### Owner Consent — Document-Based (resolved)
`POST /api/driver/owner-consent/submit` uses scan copy. Old OTP endpoints deprecated. TD-09 closed.

### Device Binding Enforcement
`POST /api/user/bind-device {device_id}` — sets `users.device_id` and `users.device_bound_at`. If device changes: triggers OTP re-verify + 24h cooldown. Not implemented in MVP but columns exist.
