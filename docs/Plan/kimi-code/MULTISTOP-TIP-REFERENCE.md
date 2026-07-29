# Multi-Stop + Upfront Tip — Code Reference
# =============================================================================
# IMPLEMENT NOW (user approved). Scoped version:
# - Upfront Tip: full implementation
# - Multi-Stop: max 2 stops, NO delivery mode, NO photos, NO counter-offer
#
# Source: Kimi-K2.6 (2026-07-29), extracted from P5 output
#
# FIX ANNOTATIONS (apply before using):
# [FIX:money] = decimal → integer paisa (multiply default values by 100)
# [FIX:auth]  = verifySupabaseToken(req) → verifySupabaseToken(request)
# [FIX:params] = { params: { id } } → { id }: { id: string }
# [FIX:style] = inline style={{}} → NativeWind className + dark: variants
# [FIX:case]  = camelCase Drizzle props → snake_case (codebase convention)
# [FIX:zod]   = raw req.json() → parseJsonBody(request, schema)
# =============================================================================

## SCHEMA (src/db/schema.ts)

### New table: rideStops
```typescript
// [FIX:case] — use snake_case property names to match codebase convention
// [FIX:money] — wait_fee_bdt is integer paisa, NOT decimal
export const rideStops = pgTable("ride_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  stop_order: integer("stop_order").notNull(),
  lat: decimal("lat", { precision: 10, scale: 8 }).notNull(),
  lng: decimal("lng", { precision: 11, scale: 8 }).notNull(),
  address: text("address").notNull(),
  status: text("status", { enum: ['pending', 'arrived', 'completed', 'skipped'] }).default('pending'),
  wait_start_at: timestamp("wait_start_at", { withTimezone: true }),
  wait_end_at: timestamp("wait_end_at", { withTimezone: true }),
  wait_fee_bdt: integer("wait_fee_bdt").default(0),  // [FIX:money] paisa NOT decimal
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### Column additions to existing rides table:
```typescript
// [FIX:money] — both are integer paisa
upfront_tip_bdt: integer("upfront_tip_bdt").default(0),  // [FIX:money] paisa NOT decimal
```

NOTE: SKIP these columns (deferred to P5):
// driver_counter_offer_bdt — SKIP (no counter-offer)
// counter_offer_status — SKIP
// guaranteed_pickup — SKIP
// is_delivery — SKIP
// delivery_instructions — SKIP
// delivery_photo_url — SKIP


## RIDER UI: Upfront Tip Slider

### components/UpfrontTipSlider.tsx
```tsx
// [FIX:style] — rewrite ALL inline styles with NativeWind className + dark: variants
// The slider value is in TAKA (user-friendly). Convert to paisa when sending to API: value * 100.

import { View, Text, TouchableOpacity } from "react-native";
import Slider from "@react-native-community/slider"; // [NOTE: check if installed, if not use a simple preset-button UI instead]

interface UpfrontTipSliderProps {
  value: number;          // in taka
  onChange: (val: number) => void;
  averageTip?: number;    // in taka, optional
}

export function UpfrontTipSlider({ value, onChange, averageTip }: UpfrontTipSliderProps) {
  // PRESET-BASED UI (no slider dependency needed):
  // Show quick-select buttons: ৳0, ৳20, ৳50, ৳100
  // Highlight the selected one
  // Show "Get a driver faster" text when tip > 0

  return (
    <View className="bg-goAccentLight dark:bg-goAccent/10 rounded-xl p-4 mb-4">
      <Text className="text-[15px] font-JakartaBold text-goAccent dark:text-goPrimary mb-1">
        💰 Get a Driver Faster
      </Text>
      <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-3">
        Add an upfront tip to attract drivers quickly.
      </Text>
      <View className="flex-row gap-2">
        {[0, 20, 50, 100].map((amount) => (
          <TouchableOpacity
            key={amount}
            onPress={() => onChange(amount)}
            className={`flex-1 py-2.5 rounded-full items-center border ${
              value === amount
                ? "bg-goPrimary border-goPrimary"
                : "bg-transparent border-goBorderLight dark:border-goBorderDark"
            }`}
          >
            <Text className={`text-[14px] font-JakartaBold ${
              value === amount ? "text-goWhite" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            }`}>
              {amount === 0 ? "No tip" : `৳${amount}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
```

### Wire into confirm-ride/index.tsx:
```tsx
// Add state:
const [upfrontTip, setUpfrontTip] = useState(0); // in taka

// Add UpfrontTipSlider above the "Request Ride" button:
<UpfrontTipSlider value={upfrontTip} onChange={setUpfrontTip} />

// In the POST body to /api/ride/request, add:
upfront_tip_bdt: upfrontTip > 0 ? upfrontTip * 100 : undefined,  // convert taka → paisa
```


## RIDER UI: Multi-Stop Inputs

### In confirm-ride/index.tsx:
```tsx
// Add state:
const [stops, setStops] = useState<{ lat: number; lng: number; address: string }[]>([]);
const [showStopInput, setShowStopInput] = useState(false);

// Max 2 stops
const addStop = (location: { lat: number; lng: number; address: string }) => {
  if (stops.length >= 2) {
    Alert.alert("Maximum 2 stops allowed");
    return;
  }
  setStops([...stops, location]);
  setShowStopInput(false);
};

const removeStop = (index: number) => {
  setStops(stops.filter((_, i) => i !== index));
};

// UI: "Add Stop" button (only if < 2 stops) + list of added stops with remove buttons
// Place between destination and fare summary:

{stops.length < 2 && (
  <TouchableOpacity onPress={() => setShowStopInput(true)} className="flex-row items-center py-3">
    <Text className="text-goPrimary font-Jakarta text-[15px]">➕ Add Stop</Text>
  </TouchableOpacity>
)}

{stops.map((stop, i) => (
  <View key={i} className="flex-row items-center bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-lg px-4 py-3 mb-2">
    <Text className="flex-1 text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">
      Stop {i + 1}: {stop.address}
    </Text>
    <TouchableOpacity onPress={() => removeStop(i)}>
      <Text className="text-goDanger text-[14px]">✕</Text>
    </TouchableOpacity>
  </View>
))}

// For the stop input, reuse the existing BarikoiAutocomplete component
// in a Modal. When a location is selected, call addStop(location).

// In the POST body to /api/ride/request, add:
stops: stops.length > 0 ? stops : undefined,
```


## API: request+api.ts modifications

```typescript
// [FIX:zod] — use parseJsonBody, not raw req.json()
// [FIX:auth] — verifySupabaseToken(request)

// Add to Zod schema:
const requestSchema = z.object({
  // ... existing fields ...
  upfront_tip_bdt: z.number().int().min(0).optional(),
  stops: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().min(1).max(500),
  })).max(2).optional(),
});

// After creating the ride INSERT, add stops:
if (parsed.stops && parsed.stops.length > 0) {
  await db.insert(rideStops).values(
    parsed.stops.map((stop, i) => ({
      ride_id: ride.id,
      stop_order: i + 1,
      lat: stop.lat.toString(),
      lng: stop.lng.toString(),
      address: stop.address,
    }))
  );
}

// The upfront_tip_bdt goes into the rides INSERT:
// upfront_tip_bdt: parsed.upfront_tip_bdt ?? 0,
```


## API: estimate+api.ts modifications (multi-leg distance)

```typescript
// When stops are provided, calculate total distance as sum of legs:
// pickup → stop1 → stop2 → destination

// Add to Zod schema:
stops: z.array(z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string(),
})).max(2).optional(),

// In the distance calculation:
let totalDistance = 0;
const waypoints = [
  { lat: pickupLat, lng: pickupLng },
  ...(parsed.stops || []),
  { lat: dropoffLat, lng: dropoffLng },
];

for (let i = 0; i < waypoints.length - 1; i++) {
  const legDistance = await barikoiDistance(
    waypoints[i].lat, waypoints[i].lng,
    waypoints[i + 1].lat, waypoints[i + 1].lng
  );
  totalDistance += legDistance;
}

// Use totalDistance instead of the single-leg distance for fare calculation.
```


## API: ride/[id]/stops+api.ts

```typescript
// [FIX:auth] [FIX:params]
import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { rideStops } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request, { id }: { id: string }) {
  const user = await verifySupabaseToken(request);
  const stops = await db.select().from(rideStops)
    .where(eq(rideStops.ride_id, id))
    .orderBy(rideStops.stop_order);
  return Response.json({ stops });
}

export async function POST(request: Request, { id }: { id: string }) {
  // [FIX:zod]
  const user = await verifySupabaseToken(request);
  const { stopId } = await request.json(); // [FIX: use parseJsonBody]

  const [stop] = await db.update(rideStops)
    .set({ status: 'completed', completed_at: new Date() })
    .where(eq(rideStops.id, stopId))
    .returning();

  return Response.json({ success: true, stop });
}
```


## DRIVER UI: Show stops in find-customer

### In find-customer/index.tsx (or finish-ride for subsequent stops):
```tsx
// Fetch stops on mount:
const [stops, setStops] = useState([]);
const [currentStopIndex, setCurrentStopIndex] = useState(0);

useEffect(() => {
  if (activeRideId) {
    fetch(`${API_URL}/api/ride/${activeRideId}/stops`, { headers: authHeader })
      .then(r => r.json())
      .then(data => setStops(data.stops ?? []));
  }
}, [activeRideId]);

// Show stop list if any:
{stops.length > 0 && (
  <View className="px-6 py-3">
    <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
      📍 Stops ({currentStopIndex + 1}/{stops.length + 1})
    </Text>
    {stops.map((stop, i) => (
      <View key={stop.id} className="flex-row items-center py-1">
        <Text className={`text-[13px] font-Jakarta ${
          i < currentStopIndex ? 'text-goTextSecondaryLight dark:text-goTextSecondaryDark line-through' :
          i === currentStopIndex ? 'text-goPrimary font-JakartaBold' :
          'text-goTextSecondaryLight dark:text-goTextSecondaryDark'
        }`}>
          {i + 1}. {stop.address}
        </Text>
      </View>
    ))}
    <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
      Final: {rideDetails?.destination_address}
    </Text>
  </View>
)}

// Add "Complete Stop" button when driver arrives at a stop:
{stops.length > 0 && currentStopIndex < stops.length && (
  <TouchableOpacity
    onPress={async () => {
      const stop = stops[currentStopIndex];
      await fetch(`${API_URL}/api/ride/${activeRideId}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ stopId: stop.id }),
      });
      setCurrentStopIndex(i => i + 1);
      Alert.alert('Stop completed', 'Continue to next destination.');
    }}
    className="bg-goPrimary rounded-full py-3 px-6 items-center mt-3"
  >
    <Text className="text-goWhite font-JakartaBold text-[15px]">✓ Complete Stop {currentStopIndex + 1}</Text>
  </TouchableOpacity>
)}
```


## DRIVER UI: Show upfront tip in RideOfferSheet

### In components/RideOfferSheet.tsx:
```tsx
// If the ride has upfront_tip_bdt > 0, show a tip badge:
{ride.upfront_tip_bdt && Number(ride.upfront_tip_bdt) > 0 && (
  <View className="bg-goAccentLight dark:bg-goAccent/10 rounded-lg px-3 py-2 mb-2 flex-row items-center">
    <Text className="text-[14px] font-JakartaBold text-goAccent dark:text-goPrimary">
      💰 +৳{(Number(ride.upfront_tip_bdt) / 100).toFixed(0)} tip
    </Text>
  </View>
)}
// Place this near the fare display so the driver sees the total including tip.
```


## WebSocket payload: Include stops + tip in ride:offer

### In utils-server (dispatch or index.ts):
```typescript
// When building the ride:offer payload, include:
const stops = await db.select().from(rideStops)
  .where(eq(rideStops.ride_id, ride.id))
  .orderBy(rideStops.stop_order);

const offer = {
  type: 'ride:offer',
  // ... existing fields ...
  upfront_tip_bdt: ride.upfront_tip_bdt ?? 0,  // in paisa
  has_stops: stops.length > 0,
  stops: stops.map(s => ({ id: s.id, address: s.address, stop_order: s.stop_order })),
};
```


## INTEGRATION CHECKLIST

| # | File | Change |
|---|------|--------|
| 1 | schema.ts | Add rideStops table + upfront_tip_bdt column to rides |
| 2 | drizzle-kit generate + push | One migration |
| 3 | components/UpfrontTipSlider.tsx | Create new component |
| 4 | confirm-ride/index.tsx | Add tip slider + stop inputs + POST body changes |
| 5 | request+api.ts | Accept upfront_tip_bdt + stops in Zod schema + INSERT |
| 6 | estimate+api.ts | Calculate multi-leg distance when stops provided |
| 7 | app/api/ride/[id]/stops+api.ts | Create GET (list stops) + POST (complete stop) |
| 8 | find-customer/index.tsx | Show stops list + complete stop button |
| 9 | RideOfferSheet.tsx | Show upfront tip badge |
| 10 | utils-server dispatch | Include stops + tip in ride:offer WS payload |

## SCOPE LIMITS (what NOT to build):
- NO delivery mode (is_delivery, delivery_instructions, delivery_photo_url)
- NO counter-offer (driver_counter_offer_bdt, counter_offer_status)
- NO arrival photos for stops
- NO per-stop wait fees (use the existing ride-level wait charges only)
- NO guaranteed_pickup
- NO riderTipHistory table (track via existing rides.upfront_tip_bdt column only)
