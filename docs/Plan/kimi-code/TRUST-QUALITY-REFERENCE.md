# Trust & Quality System — Code Reference
# =============================================================================
# IMPLEMENT NOW (user approved). 3 sub-features:
# 1. Lost Items Workflow (rider reports → driver responds → return arranged)
# 2. Fare Dispute Arbitration (auto-refund for >20% route deviation)
# 3. Rider-Driver Blocklist (rider blocks driver → dispatch filter)
#
# Source: Kimi-K2.6 (2026-07-29)
#
# FIX ANNOTATIONS (apply before using):
# [FIX:money] = decimal → integer paisa (multiply defaults by 100)
# [FIX:auth]  = verifySupabaseToken(req) → verifySupabaseToken(request)
# [FIX:params] = { params: { id } } → { id }: { id: string }
# [FIX:style] = inline style={{}} → NativeWind className + dark: variants
# [FIX:case]  = camelCase Drizzle props → snake_case (codebase convention)
# [FIX:zod]   = raw req.json() → parseJsonBody(request, schema)
# [FIX:role]  = requireRole(req, 'admin') → requireRole('admin')(request) curried
# =============================================================================

## SCHEMA (src/db/schema.ts) — 4 new tables

### lostItems
```typescript
// [FIX:case] [FIX:money] return_fee_bdt is integer paisa
export const lostItems = pgTable("lost_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  item_description: text("item_description").notNull(),
  status: text("status", { enum: ['reported', 'driver_confirmed', 'photo_provided', 'arranged_return', 'resolved', 'unresolved'] }).notNull().default('reported'),
  driver_response: text("driver_response"),
  driver_photo_url: text("driver_photo_url"),
  return_method: text("return_method", { enum: ['driver_returns', 'rider_pickup', 'drop_at_hub', 'undeliverable'] }),
  return_fee_bdt: integer("return_fee_bdt").default(0), // [FIX:money] paisa
  admin_mediation: boolean("admin_mediation").default(false),
  reported_at: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### fareDisputes
```typescript
// [FIX:case] [FIX:money] ALL _bdt columns are integer paisa
export const fareDisputes = pgTable("fare_disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  claimed_fare_bdt: integer("claimed_fare_bdt").notNull(), // [FIX:money] paisa
  charged_fare_bdt: integer("charged_fare_bdt").notNull(), // [FIX:money] paisa
  dispute_reason: text("dispute_reason", { enum: ['route_longer', 'wrong_vehicle', 'wait_fee_unfair', 'surge_unexplained', 'other'] }).notNull(),
  rider_note: text("rider_note"),
  actual_distance_meters: integer("actual_distance_meters"),
  estimated_distance_meters: integer("estimated_distance_meters"),
  route_deviation_percent: numeric("route_deviation_percent", { precision: 5, scale: 2 }),
  auto_refund_bdt: integer("auto_refund_bdt").default(0), // [FIX:money] paisa
  admin_adjustment_bdt: integer("admin_adjustment_bdt").default(0), // [FIX:money] paisa
  final_resolution: text("final_resolution", { enum: ['auto_approved', 'auto_rejected', 'admin_approved', 'admin_rejected', 'pending'] }),
  status: text("status", { enum: ['open', 'under_review', 'resolved', 'escalated'] }).notNull().default('open'),
  resolved_by: uuid("resolved_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
});
```

### driverBlocklists
```typescript
// [FIX:case]
export const driverBlocklists = pgTable("driver_blocklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  reason: text("reason", { enum: ['rude_behavior', 'unsafe_driving', 'overcharged', 'harassment', 'no_show', 'other'] }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### ridePhotos (for dispute evidence + lost item photos)
```typescript
// [FIX:case]
export const ridePhotos = pgTable("ride_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  photo_type: text("photo_type", { enum: ['pickup', 'dropoff', 'delivery', 'lost_item', 'dispute_evidence'] }).notNull(),
  taken_by: text("taken_by", { enum: ['driver', 'rider'] }).notNull(),
  storage_url: text("storage_url").notNull(),
  lat: decimal("lat", { precision: 10, scale: 8 }),
  lng: decimal("lng", { precision: 11, scale: 8 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

## LIBRARY: lib/fareArbitration.ts
```typescript
// [FIX:money] ALL amounts in paisa. Kimi's code uses decimal — convert.
// autoArbitrateDispute: if route deviation > 20%, auto-refund (capped at 30% of charged fare)
// Uses actual_distance_meters vs estimated_distance_meters
// Refund goes to rider_wallet_transactions
// Key formula: deviation = ((actual - estimated) / estimated) * 100
// If deviation > 20: auto_approved, refund = min(charged - claimed, charged * 0.30)
// Else: auto_rejected, refund = 0
```

## APIs (6 files)

### Rider APIs:
1. POST/GET app/api/rider/lost-items+api.ts — report lost item (24h window), list own reports
2. POST/GET app/api/rider/fare-disputes+api.ts — file dispute (48h window), auto-arbitrate, list own
3. POST/DELETE/GET app/api/rider/block+api.ts — block/unblock driver, list blocked

### Driver APIs:
4. GET/PATCH app/api/driver/lost-items+api.ts — list reports, respond (confirm/photo/return/not_found)

### Admin APIs:
5. GET/PATCH app/api/admin/lost-items+api.ts — view all, mediate
6. GET app/api/admin/fare-disputes+api.ts — view all disputes, manual adjust

## DISPATCH INTEGRATION

In utils-server dispatch loop, after commute filter, add blocklist check:
```typescript
// Check if rider has blocked this driver
const [block] = await db.select().from(driverBlocklists)
  .where(and(
    eq(driverBlocklists.rider_id, ride.user_id),
    eq(driverBlocklists.driver_id, driver.id)
  )).limit(1);
if (block) continue; // Skip blocked driver
```

## UI SCREENS

### Rider:
- Lost items screen: list reports + status badges + driver photo + return method
- Dispute button: in ride-completed/receipt → reason selector + claimed fare input → submit
- Block button: in rate-driver or ride-detail → toggle block/unblock

### Driver:
- Lost items screen: list reports → "I Have It" / "Not Found" buttons → arrange return

### Admin:
- Lost items dashboard: all reports with mediation flag
- Fare disputes dashboard: all disputes with resolution status

## INTEGRATION CHECKLIST

| # | File | Change |
|---|------|--------|
| 1 | schema.ts | 4 new tables (lostItems, fareDisputes, driverBlocklists, ridePhotos) |
| 2 | drizzle-kit generate + push | One migration |
| 3 | lib/fareArbitration.ts | Create autoArbitrateDispute function |
| 4 | app/api/rider/lost-items+api.ts | POST report + GET list |
| 5 | app/api/rider/fare-disputes+api.ts | POST dispute + auto-arbitrate + GET list |
| 6 | app/api/rider/block+api.ts | POST block + DELETE unblock + GET list |
| 7 | app/api/driver/lost-items+api.ts | GET list + PATCH respond |
| 8 | app/api/admin/lost-items+api.ts | GET all + PATCH mediate |
| 9 | app/api/admin/fare-disputes+api.ts | GET all |
| 10 | utils-server dispatch | Add blocklist filter in dispatch loop |
| 11 | Rider lost-items screen | Create in settings hub |
| 12 | Rider dispute button | Add to ride-completed/receipt |
| 13 | Rider block button | Add to rate-driver screen |
| 14 | Driver lost-items screen | Create in driver settings |
| 15 | Admin lost-items + disputes screens | Add to admin sidebar |
