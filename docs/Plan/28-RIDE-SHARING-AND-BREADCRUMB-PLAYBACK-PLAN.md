# Live Ride Sharing & GPS Breadcrumb Playback Engine — Architecture & Implementation Plan

> **Status:** APPROVED WITH AMENDMENTS (Verified via EGM Goldfish Subagent Review)  
> **Target Release:** Safety & Telematics Phase  
> **Key Invariants Preserved:** P1-17 (Terminal State Privacy), Drizzle BigInt `{ mode: "number" }`, DP-Relay SMS Gateway, 500-row DB batch chunks, HMAC-gated public replay.

---

## 1. System Architecture & Information Flow

```mermaid
flowchart TD
    subgraph Driver["Driver App & Telematics"]
        D_GPS["GPS Service (adaptive 5s-15s)"]
        D_WS["WebSocket Client (utils-server)"]
    end

    subgraph Server["Backend & utils-server"]
        WS_HUB["utils-server (index.ts)"]
        TRACE_MOD["utils-server/trace.ts (RingBuffer)"]
        CHUNK_FLUSH["Batched Chunk Inserter (<= 500 rows)"]
        DB_FLUSH[("PostgreSQL: ride_breadcrumbs")]
        HTTP_COMPLETE["POST /api/ride/:id/complete (Expo Server)"]
        AUTO_SHARE["Auto-Share Dispatch Engine (lib/dprelay.ts)"]
    end

    subgraph Security["HMAC Token Signing"]
        TOKEN_SIGN["HMAC-SHA256 Token Signer"]
        PUB_LINK["Signed URL: /track/[rideId]?token=hmac&exp=epoch"]
    end

    subgraph Messaging["Sharing Rails"]
        WA_LINK["1-Tap WhatsApp Deep Link (wa.me / whatsapp://)"]
        SMS_GW["SMS via lib/dprelay.ts"]
    end

    subgraph Playback["Consumption & Playback"]
        WEB_VIEW["Web Live Map & HMAC-Gated Route Replay"]
        THIRD_PARTY["3rd-Party Apps (Google Earth, GPX Viewer via XML Export)"]
    end

    D_GPS --> D_WS
    D_WS --> WS_HUB
    WS_HUB --> TRACE_MOD
    TRACE_MOD --> CHUNK_FLUSH
    CHUNK_FLUSH -->|Flush every 30s in 500-row chunks| DB_FLUSH
    
    HTTP_COMPLETE -->|Flush trigger on completion| TRACE_MOD
    HTTP_COMPLETE -->|If auto-share enabled| AUTO_SHARE
    
    AUTO_SHARE --> TOKEN_SIGN
    TOKEN_SIGN --> PUB_LINK
    PUB_LINK --> SMS_GW
    
    WA_LINK --> PUB_LINK
    DB_FLUSH -->|GET /api/ride/:id/export/gpx (Token/JWT verified)| THIRD_PARTY
    DB_FLUSH -->|GET /api/ride/:id/breadcrumbs (Token/JWT verified)| WEB_VIEW
```

---

## 2. Feature 1: One-Tap & Automated Ride Sharing (WhatsApp / SMS)

### 2.1 Current State vs Desired State
* **Current State:**
  * Client has generic `Share.share()` opening the OS share sheet.
  * Backend sends an automated SMS when a ride is booked for someone else (`is_booked_for_someone_else`).
* **Desired State:**
  * **One-Tap Direct WhatsApp Share:** Button in active ride sheet opens WhatsApp directly with internationalized contact selection pre-filled with the live tracking message.
  * **Auto-Share Default Mode:** Rider can toggle "Auto-Share Rides" in their profile and select trusted emergency contacts (default: opt-in per contact). When their ride matches or starts, the server automatically sends the signed tracking link without requiring rider interaction.

### 2.2 Database Schema Additions

Extend `user_emergency_contacts` and `users` to support auto-sharing:

```sql
-- Migration: 0088_ride_auto_share_and_breadcrumbs.sql

-- 1. Rider auto-share preference flags
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "auto_share_rides_enabled" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "auto_share_channel" varchar(20) NOT NULL DEFAULT 'sms'; -- 'sms' | 'whatsapp' | 'both'

-- 2. Mark specific emergency contacts for auto-sharing (MUST default to FALSE for explicit consent)
ALTER TABLE "user_emergency_contacts"
ADD COLUMN IF NOT EXISTS "auto_share_enabled" boolean NOT NULL DEFAULT false;

-- 3. Audit log of auto-shares dispatched per ride
CREATE TABLE IF NOT EXISTS "ride_share_dispatches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ride_id" uuid NOT NULL REFERENCES "rides"("id") ON DELETE CASCADE,
  "recipient_phone" varchar(20) NOT NULL,
  "recipient_name" varchar(100),
  "channel" varchar(20) NOT NULL, -- 'sms' | 'whatsapp'
  "dispatch_status" varchar(20) NOT NULL, -- 'sent' | 'failed' | 'rate_limited'
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  "error_message" text
);

CREATE INDEX IF NOT EXISTS "ride_share_dispatches_ride_idx" ON "ride_share_dispatches" ("ride_id");
```

### 2.3 Mobile Client Implementation

#### A. Direct WhatsApp 1-Tap Share with Fallback & Number Normalization
In `app/(main)/(customer)/ride-tracking/[ride_id].tsx`:
```typescript
import { Linking, Platform, Share } from "react-native";
import { normalizeBdPhone } from "@/lib/dprelay";

const handleWhatsAppShare = async (rawPhone?: string) => {
  try {
    const trackingUrl = `${API_URL}/track/${ride_id}?token=${signedToken}&exp=${tokenExp}`;
    const message = t("ride_tracking.share_message_detailed", {
      driverName: driver?.full_name ?? "Driver",
      vehiclePlate: driver?.vehicle_plate ?? "",
      vehicleModel: driver?.vehicle_model ?? "",
      url: trackingUrl,
    });

    const encoded = encodeURIComponent(message);

    // Normalize Bangladeshi numbers to E.164 without '+' (e.g. 88017XXXXXXXX)
    const intlPhone = rawPhone ? normalizeBdPhone(rawPhone).replace(/^\+/, "") : null;

    // Fallback chain: native whatsapp:// -> wa.me universal link -> native Share.share()
    const appUrl = intlPhone 
      ? `whatsapp://send?phone=${intlPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    
    const webUrl = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(appUrl);
    } else {
      const canOpenWeb = await Linking.canOpenURL(webUrl).catch(() => false);
      if (canOpenWeb) {
        await Linking.openURL(webUrl);
      } else {
        await Share.share({ message });
      }
    }
  } catch (err) {
    logger.warn("[tracking] whatsapp share failed, falling back to share sheet", err);
    await Share.share({ message });
  }
};
```

#### B. Android Manifest Queries in `app.config.js`
Ensure Android 11+ (API 30+) resolves WhatsApp intent queries:
```javascript
android: {
  package: "com.goride.app",
  queries: [
    "com.whatsapp",
    "com.whatsapp.w4b" // WhatsApp Business
  ]
}
```

---

## 3. Feature 2: High-Fidelity GPS Breadcrumbs & Ingestion

### 3.1 Database Schema: `ride_breadcrumbs`

```typescript
// Drizzle Schema Definition in src/db/schema.ts
export const rideBreadcrumbs = pgTable(
  "ride_breadcrumbs",
  {
    // Mode 'number' is mandatory to prevent BigInt serialization crash in Response.json()
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    speed_mps: real("speed_mps").default(0),
    heading: real("heading").default(0),
    recorded_at: timestamptz("recorded_at").notNull(),
    source: varchar("source", { length: 20 }).notNull().default("driver_ws"),
  },
  (t) => [
    index("ride_breadcrumbs_ride_seq_idx").on(t.ride_id, t.recorded_at),
  ]
);
```

### 3.2 High-Performance Ingestion in `utils-server/trace.ts`
1. **Extend `utils-server/trace.ts`:**
   Leverage the existing rolling buffer infrastructure.
2. **Chunking Boundary:**
   All bulk inserts are batched in groups of **$\le 500$ rows** ($500 \times 7 = 3,500$ parameters, safely below Postgres 65k limit).
3. **HTTP Completion Flush Hook:**
   Because `ride:complete` runs via HTTP `POST /api/ride/[id]/complete`, the completion endpoint triggers a synchronous or HTTP webhook flush:
   `POST http://127.0.0.1:3001/internal/flush-breadcrumbs` with `{ ride_id }`.
   This ensures zero loss of the final arrival coordinates.
4. **Adaptive Client Polling:**
   * Vehicle moving ($> 10\text{ km/h}$): 5-second interval.
   * Vehicle stationary or heavy traffic ($< 3\text{ km/h}$ for $> 30\text{ s}$): 15-second interval to protect driver device thermals and battery.

---

## 4. Feature 3: HMAC-Gated Route Replay & GPX Export

### 4.1 Reconciling Security Invariant P1-17
* **Invariant P1-17 Rule:** Public `/api/ride/[id]/track` for terminal rides MUST nullify coordinates and driver details when accessed unauthenticated to prevent home address leaks.
* **HMAC Token Extension:**
  * Public links include a signed token: `?token=[hmac]&exp=[timestamp]`.
  * **While Active:** Both authenticated and valid signed token users see live location.
  * **Terminal (< 2 hours):** Valid signed token grants access to route scrubber replay and GPX download.
  * **Terminal (> 2 hours or no token):** Strictly degrades to status-only per Invariant P1-17 (`origin_lat: null`, coordinates inaccessible), protecting rider privacy and keeping `tests/api/ride/track.test.ts` 100% green.
  * **Authenticated Rider in App:** Full access to their own past breadcrumbs at any time via `GET /api/ride/[id]/breadcrumbs`.

### 4.2 Endpoints

#### 1. `GET /api/ride/[id]/export/gpx`
* Gated by valid HMAC token or authenticated Supabase JWT.
* Returns standard XML stream (`application/gpx+xml`).
* XML-escapes all strings (`<![CDATA[...]]>`) to prevent injection.
* ISO-8601 UTC timestamps.

#### 2. `GET /api/ride/[id]/breadcrumbs`
* Returns JSON payload for map polyline rendering and web scrubber replay.

---

## 5. Phasing & Quality Gates

| Phase | Tasks | Quality Gates |
|---|---|---|
| **Phase 1: Deep Linking & Schema** | Add `queries` to `app.config.js`, normalize BD phone in `ride-tracking/[ride_id].tsx`, create `0088_ride_auto_share_and_breadcrumbs.sql` migration. | `npx tsc --noEmit` + `npm run lint` clean. |
| **Phase 2: Ingestion & Completion Flush** | Add `ride_breadcrumbs` chunked inserter in `utils-server/trace.ts` + `/internal/flush-breadcrumbs` hook in `complete+api.ts`. | Unit test: batch insert under 500 rows; completion flushes in-memory buffer. |
| **Phase 3: HMAC Token Gating & Export API** | Implement `generateTrackingToken` in `lib/trackingToken.ts`, update `track+api.ts` with HMAC check, build GPX export route with XML sanitization. | `tests/api/ride/track.test.ts` passes; GPX valid in XML validator. |
| **Phase 4: Web Route Replay UI** | Timeline scrubber slider on `app/track/[rideId].tsx` with play/pause and stop duration badges. | Scrubber smoothly animates pin; unauthenticated expired link returns status-only. |
