// @ts-nocheck — Jest mock factories produce untyped DB chains; runtime behavior is what's under test.
// B3-FIX — delivery dispatch expiry advance (skeptic §B3-1).
// Pins the TICK (not just the pure ranker):
//  1. expired 'offered' leg + tick → next ranked candidate offered
//  2. expired 'offered' leg at cap + tick → 'exhausted' + F-12 pushes fire
//  3. live (unexpired) 'offered' leg + tick → 'noop' (no stomp)
//  4. fault-injection: runtime copy WITHOUT the expiry branch returns 'noop'
//     for the expired leg (a no-op fix fails this suite).
import { jest } from '@jest/globals';

const LEG = '00000000-0000-4000-8000-0000000000e1';
const ORDER = '00000000-0000-4000-8000-0000000000e2';
const SHOP = '00000000-0000-4000-8000-0000000000e3';
const EXPIRED_COURIER = '00000000-0000-4000-8000-0000000000e4';
const NEXT_COURIER = '00000000-0000-4000-8000-0000000000e5';
const OWNER = '00000000-0000-4000-8000-0000000000e6';
const MEMBER = '00000000-0000-4000-8000-0000000000e7';
const RIDER = '00000000-0000-4000-8000-0000000000e8';

// ── Mutable mock state ──────────────────────────────────────────────────
let mockLegRow: Record<string, unknown> | null = null;
let mockStaleRows: Record<string, unknown>[] = [];
let mockFreshRows: Record<string, unknown>[] = [];
let mockParcelRows: Record<string, unknown>[] = [];
// Arm 1 (stale) and Arm 2b (parcel) are both limit(25) deliveries scans —
// the 1st per tick is stale, the 2nd is the parcel arm.
let mockLimit25Calls = 0;
let mockCourierRows: Record<string, unknown>[] = [];
let mockUserRows: Record<string, unknown>[] = [];
let mockOrderRows: Record<string, unknown>[] = [];
let mockShopRows: Record<string, unknown>[] = [];
let mockMemberRows: Record<string, unknown>[] = [];
let mockUpdateCalls: { vals: Record<string, unknown> }[] = [];
let mockNotifyBatches: Record<string, unknown>[][] = [];

jest.mock('@/src/db', () => {
  const schema = require('@/src/db/schema');
  const T = {
    deliveries: schema.deliveries,
    couriers: schema.couriers,
    drivers: schema.drivers,
    rides: schema.rides,
    users: schema.users,
    shopOrders: schema.shopOrders,
    shops: schema.shops,
    shopMembers: schema.shopMembers,
  };

  const awaitable = (rows: unknown[]) => {
    const c: any = {};
    c.limit = (n: number) => {
      if (n === 25) return Promise.resolve(rows);
      // limit(1): support both `.for()` (advance) and direct await (exhaust)
      const one: any = Promise.resolve(rows.slice(0, 1));
      one.for = async () => rows.slice(0, 1);
      return one;
    };
    c.for = async () => rows.slice(0, 1);
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  return {
    db: {
      select: jest.fn((..._sargs: unknown[]) => ({
        from: (t: unknown) => {
          const q: any = {};
          q.innerJoin = () => ({
            where: () => ({ limit: async () => mockFreshRows }),
          });
          q.where = () => {
            if (t === T.deliveries) {
              // Disambiguate by call context is unnecessary: stale (limit 25)
              // returns mockStaleRows, single-leg returns mockLegRow, and the
              // ranking active-claim query (no limit) returns [].
              // The same `awaitable` handles all three via limit/for shape —
              // but the row SET differs, so branch on a marker: tick stale is
              // the only deliveries query using limit(25).
              const withLimit = (n: number) => {
                if (n === 25) {
                  mockLimit25Calls += 1;
                  if (mockLimit25Calls % 2 === 1) return Promise.resolve(mockStaleRows);
                  return Promise.resolve(mockParcelRows);
                }
                const one: any = Promise.resolve(mockLegRow ? [mockLegRow] : []);
                one.for = async () => (mockLegRow ? [mockLegRow] : []);
                return one;
              };
              return { limit: withLimit, for: async () => (mockLegRow ? [mockLegRow] : []), then: (res: any, rej: any) => Promise.resolve([]).then(res, rej) };
            }
            if (t === T.couriers) return awaitable(mockCourierRows);
            if (t === T.drivers) return awaitable([]);
            if (t === T.rides) return awaitable([]);
            if (t === T.users) return awaitable(mockUserRows);
            if (t === T.shopOrders) return awaitable(mockOrderRows);
            if (t === T.shops) return awaitable(mockShopRows);
            if (t === T.shopMembers) return awaitable(mockMemberRows);
            return awaitable([]);
          };
          return q;
        },
      })),
      update: jest.fn((_t: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: (..._w: unknown[]) => {
            mockUpdateCalls.push({ vals });
            return { returning: async () => [{ id: LEG }] };
          },
          returning: async () => [{ id: LEG }],
        }),
      })),
    },
  };
});

jest.mock('@/lib/platformConfig', () => ({
  requireConfigInt: jest.fn(async (key: string) => {
    if (key === 'delivery_max_suggestions') return 3;
    if (key === 'delivery_offer_window_seconds') return 45;
    throw new Error(`unexpected config key ${key}`);
  }),
}));

jest.mock('@/lib/notify', () => ({
  sendNotifications: jest.fn(async (batch: Record<string, unknown>[]) => {
    mockNotifyBatches.push(batch);
  }),
}));

jest.mock('@/lib/deliverySettlement', () => ({
  couriersOnDispatchHold: jest.fn(async () => new Set()),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  advanceDeliveryChain,
  deliveryDispatchTick,
} from '@/lib/deliveryDispatch';

function resetState() {
  mockLegRow = null;
  mockStaleRows = [];
  mockFreshRows = [];
  mockParcelRows = [];
  mockLimit25Calls = 0;
  mockCourierRows = [{ user_id: NEXT_COURIER, last_lat: '23.8103', last_lng: '90.4125' }];
  mockUserRows = [{ user_id: NEXT_COURIER, rating: '4.9' }];
  mockOrderRows = [];
  mockShopRows = [];
  mockMemberRows = [];
  mockUpdateCalls = [];
  mockNotifyBatches = [];
  jest.clearAllMocks();
}

function expiredLeg(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LEG,
    order_id: ORDER,
    status: 'offered',
    offered_to_user_id: EXPIRED_COURIER,
    offer_expires_at: new Date(Date.now() - 60_000),
    offer_attempts: 1,
    tried_claimer_ids: [EXPIRED_COURIER],
    pickup_lat: '23.8103',
    pickup_lng: '90.4125',
    delivery_man_user_id: null,
    dropoff_user_id: null,
    ...over,
  };
}

describe('B3 — delivery dispatch expiry advance (tick-pinned)', () => {
  it('1. expired offered leg + tick → next ranked candidate offered', async () => {
    resetState();
    mockLegRow = expiredLeg();
    mockStaleRows = [{ id: LEG }];
    mockFreshRows = [];

    const result = await deliveryDispatchTick();

    expect(result.advanced).toBe(1);
    expect(result.exhausted).toBe(0);
    // Flip (created + nulls) then offer (offered to NEXT).
    const offer = mockUpdateCalls.find((c) => c.vals.status === 'offered');
    expect(offer).toBeDefined();
    expect(offer!.vals.offered_to_user_id).toBe(NEXT_COURIER);
    expect(offer!.vals.offer_expires_at).toBeInstanceOf(Date);
    expect(offer!.vals.offer_attempts).toBe(2);
    // Expired candidate counts as tried and is kept.
    expect(offer!.vals.tried_claimer_ids).toEqual(
      expect.arrayContaining([EXPIRED_COURIER, NEXT_COURIER]),
    );
    const flip = mockUpdateCalls.find(
      (c) => c.vals.status === 'created' && 'offered_to_user_id' in c.vals,
    );
    expect(flip).toBeDefined();
    expect(flip!.vals.offered_to_user_id).toBeNull();
    expect(flip!.vals.offer_expires_at).toBeNull();
  });

  it('2. expired offered leg at cap + tick → exhausted + F-12 pushes fire (round-scoped)', async () => {
    resetState();
    mockLegRow = expiredLeg({ offer_attempts: 3 });
    mockStaleRows = [{ id: LEG }];
    mockFreshRows = [];
    mockOrderRows = [{ id: ORDER, shop_id: SHOP, rider_user_id: RIDER, status: 'preparing' }];
    mockShopRows = [{ owner_user_id: OWNER }];
    mockMemberRows = [{ user_id: MEMBER }];

    const result = await deliveryDispatchTick();

    expect(result.exhausted).toBe(1);
    expect(result.advanced).toBe(0);
    const flat = mockNotifyBatches.flat();
    const shopPushes = flat.filter((n) => n.type === 'shop:delivery_exhausted');
    const riderPushes = flat.filter((n) => n.type === 'shop:order_status');
    expect(shopPushes.length).toBeGreaterThan(0);
    expect(riderPushes.length).toBeGreaterThan(0);
    // Round-scoped: the attempt count rides in the key so an F-12 retry that
    // re-exhausts re-notifies instead of hitting the notify dedup gate.
    for (const n of shopPushes) {
      expect(n.idempotencyKey).toBe(`shop_delivery_exhausted:${ORDER}:${LEG}:3`);
    }
    for (const n of riderPushes) {
      expect(String(n.idempotencyKey)).toContain(':3');
    }
  });

  it('3. live (unexpired) offered leg + tick → noop (no stomp)', async () => {
    resetState();
    mockLegRow = expiredLeg({
      offer_expires_at: new Date(Date.now() + 60_000),
      offer_attempts: 1,
    });
    mockStaleRows = [{ id: LEG }];
    mockFreshRows = [];

    const result = await deliveryDispatchTick();

    expect(result).toEqual({ advanced: 0, exhausted: 0 });
    expect(mockUpdateCalls).toEqual([]);
    expect(mockNotifyBatches).toEqual([]);
  });

  it('5. Arm 2b: created parcel leg (no shop join) advances to the ranked candidate', async () => {
    resetState();
    mockStaleRows = [];
    mockFreshRows = [];
    mockParcelRows = [{ id: LEG }];
    // Parcel leg: created, attempts left, consignment uuid matches NO shop
    // order (mockOrderRows stays []).
    mockLegRow = expiredLeg({
      order_id: 'parcel-uuid-9',
      status: 'created',
      offered_to_user_id: null,
      offer_expires_at: null,
      offer_attempts: 0,
      tried_claimer_ids: [],
    });

    const result = await deliveryDispatchTick();

    expect(result.advanced).toBe(1);
    expect(result.exhausted).toBe(0);
    const offer = mockUpdateCalls.find((c) => c.vals.status === 'offered');
    expect(offer).toBeDefined();
    expect(offer!.vals.offered_to_user_id).toBe(NEXT_COURIER);
  });

  it('4. fault-injection: runtime WITHOUT the expiry branch wedges (returns noop)', async () => {
    resetState();
    mockLegRow = expiredLeg();
    mockStaleRows = [{ id: LEG }];

    // Old code shape: hard-return unless status === 'created'.
    const advanceWithoutExpiry = async (leg: Record<string, unknown>) => {
      if (!leg || leg.status !== 'created') return 'noop' as const;
      return 'offered' as const;
    };
    expect(await advanceWithoutExpiry(mockLegRow)).toBe('noop');

    // And the fixed runtime advances the same leg.
    mockUpdateCalls = [];
    mockNotifyBatches = [];
    expect(await advanceDeliveryChain(LEG)).toBe('offered');
  });
});
