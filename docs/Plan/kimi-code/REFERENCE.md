# Kimi-K2.6 P4 Code Reference
# =============================================================================
# This file contains ALL code from Kimi's P4 output, organized by task.
# The coding model reads this alongside KIMI-P4-ROADMAP.yaml.
#
# FIX ANNOTATIONS — apply to ALL code below before using:
#   [FIX:money]   = change decimal to integer paisa (multiply by 100)
#   [FIX:auth]    = change requireRole(req,'admin') → requireRole('admin')(request)
#   [FIX:params]  = change {params:{id}} → {id}:{id:string}
#   [FIX:style]   = change inline style={} → NativeWind className with dark: variants
# =============================================================================

## P4-006: COMMUTE MODE — Schema + Dispatch + API

### Schema (add to src/db/schema.ts):
```typescript
export const driverCommutePreferences = pgTable("driver_commute_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  destinationLat: decimal("destination_lat", { precision: 10, scale: 8 }).notNull(),
  destinationLng: decimal("destination_lng", { precision: 11, scale: 8 }).notNull(),
  destinationAddress: text("destination_address").notNull(),
  maxDeviationMeters: integer("max_deviation_meters").notNull().default(2000),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### Haversine helper (add to utils-server):
```typescript
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

### Commute filter (insert in dispatch loop BEFORE sending ride:offer):
```typescript
async function isRideTowardCommute(
  driverId: string, driverLat: number, driverLng: number,
  rideDestLat: number, rideDestLng: number
): Promise<boolean> {
  const [commute] = await db.select().from(driverCommutePreferences)
    .where(and(
      eq(driverCommutePreferences.driverId, driverId),
      eq(driverCommutePreferences.active, true)
    )).limit(1);
  if (!commute) return true; // no filter set
  const destLat = parseFloat(commute.destinationLat);
  const destLng = parseFloat(commute.destinationLng);
  const distToCommute = haversineMeters(rideDestLat, rideDestLng, destLat, destLng);
  if (distToCommute <= commute.maxDeviationMeters) return true;
  // Check if ride dest is closer to commute dest than driver currently is (moving toward)
  const driverToCommute = haversineMeters(driverLat, driverLng, destLat, destLng);
  return distToCommute < driverToCommute * 0.8;
}
```

### API (app/api/driver/commute+api.ts):
```typescript
// [FIX:auth] — use verifySupabaseToken(request) not (req)
import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { driverCommutePreferences } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  destination_lat: z.number(),
  destination_lng: z.number(),
  destination_address: z.string(),
  max_deviation_meters: z.number().default(2000),
  active: z.boolean().default(true),
});

export async function POST(request: Request) {
  const user = await verifySupabaseToken(request);
  const { data, ok, response } = await parseJsonBody(request, schema);
  if (!ok) return response;
  // Upsert — one preference per driver
  await db.insert(driverCommutePreferences).values({
    driverId: user.driverId!, // [NOTE: verify driverId is on the token payload]
    destinationLat: data.destination_lat.toString(),
    destinationLng: data.destination_lng.toString(),
    destinationAddress: data.destination_address,
    maxDeviationMeters: data.max_deviation_meters,
    active: data.active,
  }).onConflictDoUpdate({
    target: driverCommutePreferences.driverId,
    set: {
      destinationLat: data.destination_lat.toString(),
      destinationLng: data.destination_lng.toString(),
      destinationAddress: data.destination_address,
      maxDeviationMeters: data.max_deviation_meters,
      active: data.active,
      updatedAt: new Date(),
    },
  });
  return Response.json({ success: true });
}

export async function GET(request: Request) {
  const user = await verifySupabaseToken(request);
  const [pref] = await db.select().from(driverCommutePreferences)
    .where(eq(driverCommutePreferences.driverId, user.driverId!)).limit(1);
  return Response.json({ commute: pref || null });
}

export async function DELETE(request: Request) {
  const user = await verifySupabaseToken(request);
  await db.delete(driverCommutePreferences)
    .where(eq(driverCommutePreferences.driverId, user.driverId!));
  return Response.json({ success: true });
}
```

### Trigger SQL (run AFTER drizzle-kit push):
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';
DROP TRIGGER IF EXISTS update_commute_updated_at ON driver_commute_preferences;
CREATE TRIGGER update_commute_updated_at BEFORE UPDATE ON driver_commute_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## P4-007: WAITING TIME CHARGES — Schema + API + Fare Calc

### Schema additions (add to EXISTING tables in schema.ts):
```typescript
// Add to pricing table:
freeWaitMinutes: integer("free_wait_minutes").notNull().default(3),
waitFeePerMinuteBdt: integer("wait_fee_per_minute_bdt").notNull().default(200), // [FIX:money] paisa NOT decimal

// Add to rides table:
waitStartAt: timestamp("wait_start_at", { withTimezone: true }),
waitEndAt: timestamp("wait_end_at", { withTimezone: true }),
waitFeeBdt: integer("wait_fee_bdt").notNull().default(0), // [FIX:money] paisa NOT decimal
```

### API: wait-start (app/api/ride/[id]/wait-start+api.ts):
```typescript
// [FIX:auth] [FIX:params]
import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request, { id }: { id: string }) {
  const user = await verifySupabaseToken(request);
  const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
  if (!ride) return Response.json({ error: 'not_found' }, { status: 404 });
  // Verify this driver owns the ride
  if (ride.driverId !== user.driverId) // [NOTE: verify field name]
    return Response.json({ error: 'forbidden' }, { status: 403 });
  await db.update(rides).set({ waitStartAt: new Date() }).where(eq(rides.id, id));
  return Response.json({ success: true, waitStartedAt: new Date().toISOString() });
}
```

### API: wait-end (app/api/ride/[id]/wait-end+api.ts):
```typescript
// [FIX:auth] [FIX:params] [FIX:money]
import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { rides, pricing } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request, { id }: { id: string }) {
  const user = await verifySupabaseToken(request);
  const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
  if (!ride) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!ride.waitStartAt) return Response.json({ error: 'wait_not_started' }, { status: 400 });

  // Get pricing for this vehicle type
  const [priceTier] = await db.select().from(pricing)
    .where(eq(pricing.vehicleType, ride.vehicleType)).limit(1);
  const freeMinutes = priceTier?.freeWaitMinutes ?? 3;
  const feePerMin = priceTier?.waitFeePerMinuteBdt ?? 200; // paisa

  const waitMs = Date.now() - new Date(ride.waitStartAt).getTime();
  const waitMinutes = Math.floor(waitMs / 60000);
  const chargeableMinutes = Math.max(0, waitMinutes - freeMinutes);
  const waitFeePaisa = chargeableMinutes * feePerMin; // [FIX:money] integer paisa

  await db.update(rides).set({
    waitEndAt: new Date(),
    waitFeeBdt: waitFeePaisa,
  }).where(eq(rides.id, id));

  return Response.json({
    success: true,
    totalWaitMinutes: waitMinutes,
    freeMinutes,
    chargeableMinutes,
    waitFeeBdt: waitFeePaisa,
  });
}
```

### Fare calc modification (in complete+api.ts):
```typescript
// After existing fare calculation, ADD waiting fee:
const waitFee = ride.waitFeeBdt ?? 0; // already in paisa
const finalTotal = baseTotal + surgeFee + waitFee;
// Use finalTotal for commission calc, driver net, and rides.total_bdt update
```

---

## P4-008 + P4-009: RIDER POINTS + RIDE PASS

### Schema additions (add to EXISTING + NEW tables in schema.ts):
```typescript
// ADD COLUMNS to existing point_offers table:
// pointsRequired: integer("points_required")
// rewardType: text("reward_type", { enum: ['wallet_credit', 'package_grant'] })
// rewardValueBdt: integer("reward_value_bdt") // [FIX:money] paisa

// NEW TABLE: rider_passes
export const riderPasses = pgTable("rider_passes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  priceBdt: integer("price_bdt").notNull(), // [FIX:money] paisa
  discountPercent: integer("discount_percent").notNull().default(10),
  maxRides: integer("max_rides"), // null = unlimited
  validityDays: integer("validity_days").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// NEW TABLE: rider_subscriptions (rider's active pass)
export const riderSubscriptions = pgTable("rider_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  riderId: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  passId: uuid("pass_id").references(() => riderPasses.id).notNull(),
  status: text("status", { enum: ['active', 'expired', 'cancelled'] }).notNull().default('active'),
  ridesUsed: integer("rides_used").notNull().default(0),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
  paymentEventId: uuid("payment_event_id").references(() => paymentEvents.id),
});
```

### API: GET /api/rider/points (mirror existing /api/driver/points):
```typescript
// [FIX:auth] — verifySupabaseToken(request)
// Pattern: query points table for user.id, return balance + transactions + offers
// Mirror the EXISTING driver points API at app/api/driver/points+api.ts
// Key: points.userId = user.id (NOT user.driverId)
```

### API: POST /api/rider/points/redeem:
```typescript
// [FIX:auth] [FIX:money]
// 1. Validate offer_id via Zod
// 2. Fetch point_offers WHERE id = offer_id AND is_active = true
// 3. Fetch points WHERE userId = user.id (FOR UPDATE — row lock)
// 4. Check balance >= pointsRequired
// 5. Deduct: UPDATE points SET balance = balance - pointsRequired
// 6. Log: INSERT point_transactions (amount: -pointsRequired, type: 'redeem')
// 7. Grant reward:
//    - wallet_credit: INSERT rider_wallet_transactions (amount = rewardValueBdt in paisa)
//    - package_grant: INSERT subscription or package logic
// 8. Return { success: true, reward_bdt: rewardValueBdt }
```

### API: GET /api/rider/passes:
```typescript
// List available passes + rider's active subscription
// SELECT * FROM rider_passes WHERE is_active = true
// SELECT * FROM rider_subscriptions WHERE rider_id = user.id AND status = 'active' AND valid_until > now()
```

### API: POST /api/rider/passes (purchase via PortPos):
```typescript
// 1. Fetch pass by pass_id
// 2. Create PortPos payment for pass.priceBdt (paisa)
// 3. Return { payment_url, payment_event_id }
// 4. On PortPos callback: create rider_subscriptions row:
//    riderId: user.id, passId: pass.id, status: 'active',
//    validUntil: new Date(Date.now() + pass.validityDays * 86400000),
//    paymentEventId: event.id
```

### Estimate API modification (ride/estimate+api.ts):
```typescript
// AFTER base fare + surge calculation, BEFORE returning response:
// 1. Check for active rider subscription
const [activeSub] = await db.select().from(riderSubscriptions)
  .where(and(
    eq(riderSubscriptions.riderId, user.id),
    eq(riderSubscriptions.status, 'active'),
    gt(riderSubscriptions.validUntil, new Date())
  )).limit(1);

let passDiscountPaisa = 0;
let passName: string | null = null;
if (activeSub) {
  const [pass] = await db.select().from(riderPasses)
    .where(eq(riderPasses.id, activeSub.passId)).limit(1);
  // Check ride count limit
  if (pass && (!pass.maxRides || activeSub.ridesUsed < pass.maxRides)) {
    passDiscountPaisa = Math.round(breakdown.total_bdt * pass.discountPercent / 100);
    breakdown.total_bdt -= passDiscountPaisa;
    passName = pass.name;
    // Recommission on discounted total
    if (commissionPct > 0) {
      breakdown.platform_commission_bdt = Math.floor(breakdown.total_bdt * commissionPct / 100);
      breakdown.driver_net_bdt = breakdown.total_bdt - breakdown.platform_commission_bdt;
    }
  }
}
// Add to response: pass_discount_bdt: passDiscountPaisa, pass_name: passName
// ORDER: base fare → pass discount → surge (discount BEFORE surge per Kimi)
// Actually per Kimi: "apply pass discount before surge" — but the current code
// applies surge in the same block. The order should be:
// 1. Calculate base fare (calculateFare)
// 2. Apply pass discount (if active)
// 3. Apply surge (if active)
// This means pass discount is on the BASE fare, surge is on the DISCOUNTED fare.
```

### Pass lifecycle (add to scheduler.ts + complete+api.ts):
```typescript
// SCHEDULER JOB (every 60s): expire passes
// UPDATE rider_subscriptions SET status = 'expired'
// WHERE status = 'active' AND valid_until < now()

// IN complete+api.ts: increment rides_used
// After ride completion, if rider has active subscription:
// UPDATE rider_subscriptions SET rides_used = rides_used + 1
// WHERE rider_id = ride.user_id AND status = 'active'
```

### Admin CRUD for rider_passes (app/admin/ride-passes.tsx):
```typescript
// Mirror existing packages CRUD pattern (app/admin/packages.tsx)
// List passes, create/edit/delete via adminFetch
// API: GET/POST/PATCH /api/admin/rider-passes (create if not exists)
// Fields: name, description, price_bdt (paisa), discount_percent, max_rides, validity_days, is_active
```

---

## P4-013 to P4-016: TAX + ACCOUNTING ENGINE

### Tax Schema (add to schema.ts):
```typescript
// [FIX:money] ALL _bdt columns are integer paisa

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code", { enum: ['vat_commission', 'vat_subscription', 'source_tax_payout', 'source_tax_instant_pay'] }).notNull(),
  ratePercent: decimal("rate_percent", { precision: 5, scale: 2 }).notNull(), // percentage, NOT paisa
  appliesTo: text("applies_to", { enum: ['commission', 'subscription', 'driver_payout', 'driver_instant_pay'] }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taxLedgers = pgTable("tax_ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  taxRateId: uuid("tax_rate_id").references(() => taxRates.id).notNull(),
  referenceType: text("reference_type", {
    enum: ['ride_commission', 'subscription_sale', 'driver_payout', 'driver_instant_pay']
  }).notNull(),
  referenceId: uuid("reference_id").notNull(),
  baseAmountBdt: integer("base_amount_bdt").notNull(), // [FIX:money] paisa
  taxAmountBdt: integer("tax_amount_bdt").notNull(),   // [FIX:money] paisa
  netAmountBdt: integer("net_amount_bdt").notNull(),   // [FIX:money] paisa
  driverId: uuid("driver_id").references(() => drivers.id),
  riderId: uuid("rider_id").references(() => users.id),
  taxDate: timestamp("tax_date", { withTimezone: true }).notNull(),
  isReported: boolean("is_reported").notNull().default(false),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dailyTaxSummaries = pgTable("daily_tax_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  summaryDate: date("summary_date").notNull(),
  taxRateId: uuid("tax_rate_id").references(() => taxRates.id).notNull(),
  taxCode: text("tax_code").notNull(),
  transactionCount: integer("transaction_count").notNull().default(0),
  totalBaseAmountBdt: integer("total_base_amount_bdt").notNull().default(0), // [FIX:money]
  totalTaxAmountBdt: integer("total_tax_amount_bdt").notNull().default(0),   // [FIX:money]
  totalNetAmountBdt: integer("total_net_amount_bdt").notNull().default(0),   // [FIX:money]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique().on(t.summaryDate, t.taxCode),
]);
```

### Accounting Schema (add to schema.ts):
```typescript
// [FIX:money] ALL _bdt columns are integer paisa

export const accountingAccounts = pgTable("accounting_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ['asset', 'liability', 'equity', 'income', 'expense'] }).notNull(),
  subType: text("sub_type"),
  parentId: uuid("parent_id").references(() => accountingAccounts.id),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  openingBalanceBdt: integer("opening_balance_bdt").notNull().default(0), // [FIX:money]
  currentBalanceBdt: integer("current_balance_bdt").notNull().default(0), // [FIX:money]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountingEntries = pgTable("accounting_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryNumber: text("entry_number").notNull().unique(),
  referenceType: text("reference_type", {
    enum: ['ride', 'subscription', 'driver_payout', 'wallet_topup', 'rider_pass', 'tax', 'cancellation_fee', 'tip', 'adjustment']
  }).notNull(),
  referenceId: uuid("reference_id"),
  entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  notes: text("notes"),
  isReversed: boolean("is_reversed").notNull().default(false),
  reversedById: uuid("reversed_by_id").references(() => accountingEntries.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountingEntryLines = pgTable("accounting_entry_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").references(() => accountingEntries.id, { onDelete: "cascade" }).notNull(),
  accountId: uuid("account_id").references(() => accountingAccounts.id).notNull(),
  debitBdt: integer("debit_bdt").notNull().default(0),  // [FIX:money]
  creditBdt: integer("credit_bdt").notNull().default(0), // [FIX:money]
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### lib/tax.ts (complete):
```typescript
import { db } from '@/src/db';
import { taxRates, taxLedgers, dailyTaxSummaries } from '@/src/db/schema';
import { eq, and, between } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export type TaxCode = 'vat_commission' | 'vat_subscription' | 'source_tax_payout' | 'source_tax_instant_pay';

export interface TaxCalculation {
  baseAmountPaisa: number;
  taxAmountPaisa: number;
  netAmountPaisa: number;
  ratePercent: number;
  taxRateId: string;
}

export async function calculateTax(code: TaxCode, baseAmountPaisa: number): Promise<TaxCalculation> {
  const [rate] = await db.select().from(taxRates)
    .where(and(eq(taxRates.code, code), eq(taxRates.isActive, true))).limit(1);
  if (!rate) {
    return { baseAmountPaisa, taxAmountPaisa: 0, netAmountPaisa: baseAmountPaisa, ratePercent: 0, taxRateId: '' };
  }
  const ratePercent = parseFloat(rate.ratePercent);
  const taxAmountPaisa = Math.round(baseAmountPaisa * ratePercent / 100);
  const isDeduction = code.startsWith('source_tax');
  const netAmountPaisa = isDeduction ? baseAmountPaisa - taxAmountPaisa : baseAmountPaisa;
  return { baseAmountPaisa, taxAmountPaisa, netAmountPaisa, ratePercent, taxRateId: rate.id };
}

export async function recordTaxLedger(params: {
  taxRateId: string;
  referenceType: 'ride_commission' | 'subscription_sale' | 'driver_payout' | 'driver_instant_pay';
  referenceId: string;
  baseAmountPaisa: number;
  taxAmountPaisa: number;
  netAmountPaisa: number;
  driverId?: string;
  riderId?: string;
  taxDate?: Date;
}) {
  return db.insert(taxLedgers).values({
    taxRateId: params.taxRateId,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    baseAmountBdt: params.baseAmountPaisa,
    taxAmountBdt: params.taxAmountPaisa,
    netAmountBdt: params.netAmountPaisa,
    driverId: params.driverId || null,
    riderId: params.riderId || null,
    taxDate: params.taxDate || new Date(),
  });
}

export async function getDailyTaxReport(date: Date) {
  const dateStr = date.toISOString().split('T')[0];
  const rows = await db.select().from(dailyTaxSummaries)
    .where(eq(dailyTaxSummaries.summaryDate, dateStr)).orderBy(dailyTaxSummaries.taxCode);
  return {
    date: dateStr,
    breakdown: rows,
    totalBaseAmountBdt: rows.reduce((s, r) => s + r.totalBaseAmountBdt, 0),
    totalTaxAmountBdt: rows.reduce((s, r) => s + r.totalTaxAmountBdt, 0),
  };
}

export async function getTaxReportRange(startDate: Date, endDate: Date) {
  const rows = await db.select().from(dailyTaxSummaries)
    .where(between(dailyTaxSummaries.summaryDate,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]))
    .orderBy(dailyTaxSummaries.summaryDate);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    rows,
    totalTaxAmountBdt: rows.reduce((s, r) => s + r.totalTaxAmountBdt, 0),
    totalBaseAmountBdt: rows.reduce((s, r) => s + r.totalBaseAmountBdt, 0),
    transactionCount: rows.reduce((s, r) => s + r.transactionCount, 0),
  };
}
```

### lib/accounting.ts (complete — CORRECTED version only):
```typescript
import { db } from '@/src/db';
import { accountingAccounts, accountingEntries, accountingEntryLines } from '@/src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { calculateTax, recordTaxLedger } from './tax';
import { logger } from '@/lib/logger';

const ACCOUNT_CODES = {
  CASH_BANK: '1001', AR_RIDERS: '1002', AR_DRIVERS: '1003',
  VAT_PAYABLE: '2001', SOURCE_TAX_PAYABLE: '2002',
  DRIVER_WALLET_LIABILITY: '2003', RIDER_WALLET_LIABILITY: '2004',
  DRIVER_PAYOUTS_PAYABLE: '2005',
  COMMISSION_INCOME: '3001', SUBSCRIPTION_INCOME: '3002', RIDE_FARE_INCOME: '3003',
  DRIVER_PAYOUT_EXPENSE: '4001', PAYMENT_GATEWAY_FEES: '4002', SOURCE_TAX_EXPENSE: '4003',
} as const;

let accountCache: Map<string, string> | null = null;
async function getAccountId(code: string): Promise<string> {
  if (!accountCache) {
    const all = await db.select().from(accountingAccounts);
    accountCache = new Map(all.map(a => [a.code, a.id]));
  }
  const id = accountCache.get(code);
  if (!id) throw new Error(`Account ${code} not found`);
  return id;
}

interface JournalLine { accountCode: string; debit?: number; credit?: number; description?: string; }

export async function createJournalEntry(params: {
  referenceType: string; referenceId?: string; entryDate: Date;
  description: string; notes?: string; lines: JournalLine[]; createdBy?: string;
}) {
  const totalDebit = params.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001)
    throw new Error(`Journal unbalanced: Dr ${totalDebit} ≠ Cr ${totalCredit}`);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [last] = await db.select({ count: sql<number>`count(*)` })
    .from(accountingEntries).where(sql`entry_number LIKE ${`JV-${today}-%`}`);
  const entryNumber = `JV-${today}-${((last?.count || 0) + 1).toString().padStart(4, '0')}`;

  const [entry] = await db.insert(accountingEntries).values({
    entryNumber, referenceType: params.referenceType as any, referenceId: params.referenceId,
    entryDate: params.entryDate, description: params.description, notes: params.notes,
    createdBy: params.createdBy,
  }).returning();

  for (const line of params.lines) {
    const accountId = await getAccountId(line.accountCode);
    await db.insert(accountingEntryLines).values({
      entryId: entry.id, accountId,
      debitBdt: line.debit || 0, creditBdt: line.credit || 0,
      description: line.description || params.description,
    });
  }
  return entry;
}

// CORRECTED ride completion entry (Kimi's 3rd version — the only correct one)
export async function recordRideCompletion(ride: {
  id: string; finalFarePaisa: number; commissionPct: number;
  driverId: string; riderId: string;
}) {
  const fare = ride.finalFarePaisa;
  const commission = Math.round(fare * ride.commissionPct / 100);
  const driverShare = fare - commission;

  const vat = await calculateTax('vat_commission', commission);
  const sourceTax = await calculateTax('source_tax_payout', driverShare);

  await Promise.all([
    recordTaxLedger({ taxRateId: vat.taxRateId, referenceType: 'ride_commission', referenceId: ride.id,
      baseAmountPaisa: commission, taxAmountPaisa: vat.taxAmountPaisa, netAmountPaisa: vat.netAmountPaisa,
      driverId: ride.driverId, riderId: ride.riderId }),
    recordTaxLedger({ taxRateId: sourceTax.taxRateId, referenceType: 'driver_payout', referenceId: ride.id,
      baseAmountPaisa: driverShare, taxAmountPaisa: sourceTax.taxAmountPaisa, netAmountPaisa: sourceTax.netAmountPaisa,
      driverId: ride.driverId }),
  ]);

  // Dr Cash/Bank = fare | Cr Commission(net) + VAT + Driver Payable(net) + Source Tax
  await createJournalEntry({
    referenceType: 'ride', referenceId: ride.id, entryDate: new Date(),
    description: `Ride ${ride.id} — Fare ৳${fare/100}, Commission ৳${commission/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: fare },
      { accountCode: ACCOUNT_CODES.COMMISSION_INCOME, credit: commission - vat.taxAmountPaisa },
      { accountCode: ACCOUNT_CODES.VAT_PAYABLE, credit: vat.taxAmountPaisa },
      { accountCode: ACCOUNT_CODES.DRIVER_PAYOUTS_PAYABLE, credit: driverShare - sourceTax.taxAmountPaisa },
      { accountCode: ACCOUNT_CODES.SOURCE_TAX_PAYABLE, credit: sourceTax.taxAmountPaisa },
    ],
  });
}

export async function recordDriverPayout(payout: { id: string; amountPaisa: number; }) {
  const sourceTax = await calculateTax('source_tax_payout', payout.amountPaisa);
  await createJournalEntry({
    referenceType: 'driver_payout', referenceId: payout.id, entryDate: new Date(),
    description: `Driver payout — ৳${payout.amountPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.DRIVER_PAYOUTS_PAYABLE, debit: payout.amountPaisa },
      { accountCode: ACCOUNT_CODES.CASH_BANK, credit: sourceTax.netAmountPaisa },
      { accountCode: ACCOUNT_CODES.SOURCE_TAX_PAYABLE, debit: sourceTax.taxAmountPaisa },
      { accountCode: ACCOUNT_CODES.CASH_BANK, credit: sourceTax.taxAmountPaisa },
    ],
  });
}

export async function recordSubscriptionSale(sub: { id: string; driverId: string; amountPaisa: number; }) {
  const vat = await calculateTax('vat_subscription', sub.amountPaisa);
  await recordTaxLedger({ taxRateId: vat.taxRateId, referenceType: 'subscription_sale', referenceId: sub.id,
    baseAmountPaisa: sub.amountPaisa, taxAmountPaisa: vat.taxAmountPaisa, netAmountPaisa: vat.netAmountPaisa,
    driverId: sub.driverId });
  await createJournalEntry({
    referenceType: 'subscription', referenceId: sub.id, entryDate: new Date(),
    description: `Subscription sale — ৳${sub.amountPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: sub.amountPaisa },
      { accountCode: ACCOUNT_CODES.SUBSCRIPTION_INCOME, credit: sub.amountPaisa - vat.taxAmountPaisa },
      { accountCode: ACCOUNT_CODES.VAT_PAYABLE, credit: vat.taxAmountPaisa },
    ],
  });
}

// MISSING from Kimi — ADD THESE:

export async function recordWalletTopup(params: {
  userId: string; amountPaisa: number; isDriver: boolean; paymentEventId: string;
}) {
  await createJournalEntry({
    referenceType: 'wallet_topup', referenceId: params.paymentEventId, entryDate: new Date(),
    description: `Wallet top-up — ৳${params.amountPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: params.amountPaisa },
      { accountCode: params.isDriver ? ACCOUNT_CODES.DRIVER_WALLET_LIABILITY : ACCOUNT_CODES.RIDER_WALLET_LIABILITY,
        credit: params.amountPaisa },
    ],
  });
}

export async function recordCancellationFee(ride: { id: string; feePaisa: number; riderId: string; }) {
  if (ride.feePaisa <= 0) return;
  await createJournalEntry({
    referenceType: 'cancellation_fee', referenceId: ride.id, entryDate: new Date(),
    description: `Cancellation fee — ৳${ride.feePaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: ride.feePaisa },
      { accountCode: ACCOUNT_CODES.RIDE_FARE_INCOME, credit: ride.feePaisa },
    ],
  });
}

export async function recordTip(ride: { id: string; tipPaisa: number; driverId: string; }) {
  if (ride.tipPaisa <= 0) return;
  await createJournalEntry({
    referenceType: 'tip', referenceId: ride.id, entryDate: new Date(),
    description: `Tip — ৳${ride.tipPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: ride.tipPaisa },
      { accountCode: ACCOUNT_CODES.DRIVER_PAYOUTS_PAYABLE, credit: ride.tipPaisa },
    ],
  });
}

export async function recordRiderPassPurchase(params: {
  subscriptionId: string; amountPaisa: number; riderId: string; paymentEventId: string;
}) {
  // Rider passes are NOT subject to VAT (they're prepayment, not income)
  await createJournalEntry({
    referenceType: 'rider_pass', referenceId: params.subscriptionId, entryDate: new Date(),
    description: `Rider pass purchase — ৳${params.amountPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: params.amountPaisa },
      { accountCode: ACCOUNT_CODES.RIDER_WALLET_LIABILITY, credit: params.amountPaisa },
    ],
  });
}
```

### Trigger SQL (run AFTER drizzle-kit push):
```sql
-- Trigger 1: Auto-upsert daily tax summary when a tax_ledger row is inserted
CREATE OR REPLACE FUNCTION upsert_daily_tax_summary() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO daily_tax_summaries (summary_date, tax_rate_id, tax_code, transaction_count,
    total_base_amount_bdt, total_tax_amount_bdt, total_net_amount_bdt)
  SELECT NEW.tax_date::date, NEW.tax_rate_id, tr.code, 1,
    NEW.base_amount_bdt, NEW.tax_amount_bdt, NEW.net_amount_bdt
  FROM tax_rates tr WHERE tr.id = NEW.tax_rate_id
  ON CONFLICT (summary_date, tax_code) DO UPDATE SET
    transaction_count = daily_tax_summaries.transaction_count + 1,
    total_base_amount_bdt = daily_tax_summaries.total_base_amount_bdt + NEW.base_amount_bdt,
    total_tax_amount_bdt = daily_tax_summaries.total_tax_amount_bdt + NEW.tax_amount_bdt,
    total_net_amount_bdt = daily_tax_summaries.total_net_amount_bdt + NEW.net_amount_bdt,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upsert_daily_tax_summary ON tax_ledgers;
CREATE TRIGGER trg_upsert_daily_tax_summary AFTER INSERT ON tax_ledgers
  FOR EACH ROW EXECUTE FUNCTION upsert_daily_tax_summary();

-- Trigger 2: Auto-update account balance when entry line is inserted
CREATE OR REPLACE FUNCTION update_account_balance() RETURNS TRIGGER AS $$
BEGIN
  UPDATE accounting_accounts
  SET current_balance_bdt = current_balance_bdt + NEW.debit_bdt - NEW.credit_bdt
  WHERE id = NEW.account_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_account_balance ON accounting_entry_lines;
CREATE TRIGGER trg_update_account_balance AFTER INSERT ON accounting_entry_lines
  FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Trigger 3: Auto-update updated_at on commute preferences
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_commute_updated_at ON driver_commute_preferences;
CREATE TRIGGER update_commute_updated_at BEFORE UPDATE ON driver_commute_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Seed data (run AFTER drizzle-kit push):
```sql
-- Tax rates
INSERT INTO tax_rates (name, code, rate_percent, applies_to, description) VALUES
  ('VAT on Commission (5%)', 'vat_commission', 5.00, 'commission', '5% VAT on platform commission'),
  ('VAT on Subscription (5%)', 'vat_subscription', 5.00, 'subscription', '5% VAT on driver packages'),
  ('Source Tax on Payout (1%)', 'source_tax_payout', 1.00, 'driver_payout', '1% AIT on driver payouts'),
  ('Source Tax on Instant Pay (1%)', 'source_tax_instant_pay', 1.00, 'driver_instant_pay', '1% AIT on instant pay')
ON CONFLICT (code) DO NOTHING;

-- Chart of accounts (14 accounts)
INSERT INTO accounting_accounts (code, name, type, sub_type, description) VALUES
  ('1001', 'Cash & Bank', 'asset', 'current_asset', 'PortPos and bank balances'),
  ('1002', 'AR - Riders', 'asset', 'current_asset', 'Unpaid ride fares'),
  ('1003', 'AR - Drivers', 'asset', 'current_asset', 'Driver dues'),
  ('2001', 'VAT Payable', 'liability', 'current_liability', 'VAT collected'),
  ('2002', 'Source Tax Payable', 'liability', 'current_liability', 'AIT withheld'),
  ('2003', 'Driver Wallet Liability', 'liability', 'current_liability', 'Driver wallet balances'),
  ('2004', 'Rider Wallet Liability', 'liability', 'current_liability', 'Rider wallet balances'),
  ('2005', 'Driver Payouts Payable', 'liability', 'current_liability', 'Pending payouts'),
  ('3001', 'Commission Income', 'income', 'operating_income', 'Platform commission'),
  ('3002', 'Subscription Income', 'income', 'operating_income', 'Driver package sales'),
  ('3003', 'Ride Fare Income', 'income', 'operating_income', 'Gross ride fares'),
  ('4001', 'Driver Payout Expense', 'expense', 'operating_expense', 'Payments to drivers'),
  ('4002', 'Payment Gateway Fees', 'expense', 'operating_expense', 'PortPos fees'),
  ('4003', 'Source Tax Expense', 'expense', 'tax_expense', 'Non-recoverable tax')
ON CONFLICT (code) DO NOTHING;

-- GRANT statements (TD-31: required after Oct 30 2026 for PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_commute_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rider_passes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rider_subscriptions TO authenticated;
GRANT SELECT ON tax_rates TO authenticated;
GRANT SELECT, INSERT ON tax_ledgers TO authenticated;
GRANT SELECT ON daily_tax_summaries TO authenticated;
GRANT SELECT ON accounting_accounts TO authenticated;
GRANT SELECT ON accounting_entries TO authenticated;
GRANT SELECT ON accounting_entry_lines TO authenticated;
```

---

## INTEGRATION WIRING (modifications to existing APIs)

### ride/complete+api.ts — add after ride completion:
```typescript
import { recordRideCompletion, recordCancellationFee, recordTip } from '@/lib/accounting';

// After ride is marked completed + fare finalized:
try {
  await recordRideCompletion({
    id: ride.id,
    finalFarePaisa: finalTotal, // the TOTAL including surge + wait fee
    commissionPct: pricing.platform_commission_percent ?? 0,
    driverId: ride.driverId,
    riderId: ride.userId,
  });
} catch (e) { logger.warn('[accounting] ride completion entry failed (non-blocking)', e); }

// If there was a cancellation fee on this ride (status = cancelled with fee):
// Already handled in cancel API — call recordCancellationFee there.

// If there was a tip:
if (ride.tipBdt && ride.tipBdt > 0) {
  try { await recordTip({ id: ride.id, tipPaisa: ride.tipBdt, driverId: ride.driverId }); }
  catch (e) { logger.warn('[accounting] tip entry failed', e); }
}

// If rider has active pass, increment rides_used:
try {
  await db.update(riderSubscriptions).set({
    ridesUsed: sql`${riderSubscriptions.ridesUsed} + 1`
  }).where(and(
    eq(riderSubscriptions.riderId, ride.userId),
    eq(riderSubscriptions.status, 'active')
  ));
} catch (e) { logger.warn('[pass] rides_used increment failed', e); }
```

### driver/instant-pay+api.ts — add after payout creation:
```typescript
import { calculateTax, recordTaxLedger } from '@/lib/tax';
import { recordDriverPayout } from '@/lib/accounting';

try {
  const tax = await calculateTax('source_tax_instant_pay', payoutAmountPaisa);
  if (tax.taxRateId) {
    await recordTaxLedger({
      taxRateId: tax.taxRateId, referenceType: 'driver_instant_pay', referenceId: payout.id,
      baseAmountPaisa: payoutAmountPaisa, taxAmountPaisa: tax.taxAmountPaisa,
      netAmountPaisa: tax.netAmountPaisa, driverId: driverId,
    });
  }
  await recordDriverPayout({ id: payout.id, amountPaisa: payoutAmountPaisa });
} catch (e) { logger.warn('[accounting] payout entry failed (non-blocking)', e); }
```

### payment/portpos/callback+api.ts — add on subscription confirmation:
```typescript
import { recordSubscriptionSale } from '@/lib/accounting';
import { recordRiderPassPurchase, recordWalletTopup } from '@/lib/accounting';

// For DRIVER package purchase:
try { await recordSubscriptionSale({ id: sub.id, driverId: sub.driverId, amountPaisa: amount }); }
catch (e) { logger.warn('[accounting] subscription entry failed', e); }

// For RIDER pass purchase:
try { await recordRiderPassPurchase({ subscriptionId: sub.id, amountPaisa: amount,
  riderId: userId, paymentEventId: event.id }); }
catch (e) { logger.warn('[accounting] rider pass entry failed', e); }

// For WALLET TOP-UP (rider or driver):
try { await recordWalletTopup({ userId, amountPaisa: amount, isDriver: isDriver, paymentEventId: event.id }); }
catch (e) { logger.warn('[accounting] wallet topup entry failed', e); }
```

### cancel API — add after fee calculation:
```typescript
import { recordCancellationFee } from '@/lib/accounting';

if (feePaisa > 0) {
  try { await recordCancellationFee({ id: ride.id, feePaisa, riderId: ride.userId }); }
  catch (e) { logger.warn('[accounting] cancellation fee entry failed', e); }
}
```

### Scheduler — add pass expiry job:
```typescript
// Job: expire rider passes (every 60s)
const expired = await db.update(riderSubscriptions).set({ status: 'expired' })
  .where(and(
    eq(riderSubscriptions.status, 'active'),
    lt(riderSubscriptions.validUntil, new Date())
  ));
```
