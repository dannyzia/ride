/**
 * C7 (STAGE C7-FIX): delivery-man verification gate + handover-code privacy.
 *
 * C7-2:
 *  - POST /api/delivery/courier/signup → 410 (the auto-active self-signup
 *    bypass is retired; onboarding is the register-delivery-man wizard).
 *  - A courier with status='active' but verification_status='pending' is
 *    invisible: 403 at requireDeliveryAgent AND absent from the
 *    rankedDeliveryCandidates pool predicate. An approved courier passes
 *    both. (Removing either check flips this suite red.)
 * C7-1:
 *  - GET /api/shop/orders/[id] as the ordering rider strips pickup_code
 *    but keeps delivery_otp; a shop member sees both.
 */
/* eslint-disable import/first */
// Mock ambulanceCerts to prevent h3-js TextDecoder issue in Jest
jest.mock('@/lib/ambulanceCerts', () => ({
  serviceLevelSatisfies: jest.fn(() => true),
}));
jest.mock('@/lib/auth', () => ({
  verifySupabaseToken: jest.fn().mockResolvedValue({ id: 'auth-uid' }),
  requireAnyRole: jest.fn(),
  requireMemberRoles: jest.fn(),
}));
jest.mock('@/lib/supabaseServer', () => ({
  get supabaseAdmin() {
    return mockSupabaseAdmin;
  },
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn() },
}));
jest.mock('@/lib/marketplaceRbac', () => {
  const actual = jest.requireActual('@/lib/marketplaceRbac');
  return { ...actual, requireShopMember: jest.fn() };
});
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ─── supabaseAdmin stub (chainable; per-table data) ─────────────────────
const supabaseTables: Record<string, unknown> = {};

function chainable(table: string): unknown {
  const data = supabaseTables[table] ?? null;
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.in = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => ({ data, error: null }));
  return chain;
}

const mockSupabaseAdmin = {
  from: jest.fn((table: string) => chainable(table)),
};

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { db } from '@/src/db';
import { couriers } from '@/src/db/schema';
import { requireMemberRoles } from '@/lib/auth';
import { requireShopMember } from '@/lib/marketplaceRbac';
import { requireDeliveryAgent, requireCourier } from '@/lib/marketplaceRbac';
import { rankedDeliveryCandidates } from '@/lib/deliveryDispatch';
import { POST as courierSignup } from '@/app/api/delivery/courier/signup+api';
import { GET as orderDetail } from '@/app/api/shop/orders/[id]+api';

const RIDER_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '44444444-4444-4444-8444-444444444444';
const SHOP_ID = '55555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const fakeRequest = {} as unknown as Request;

function setSupabase(tables: Record<string, unknown>): void {
  for (const k of Object.keys(supabaseTables)) delete supabaseTables[k];
  Object.assign(supabaseTables, tables);
}

describe('C7-2 signup bypass', () => {
  test('POST /api/delivery/courier/signup → 410', async () => {
    const res = await courierSignup(fakeRequest);
    const body = await getJson(res);
    expect(res.status).toBe(410);
    expect(body.error).toBe('courier_signup_retired');
  });
});

describe('C7-2 verification gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('pending-verification courier → 403 at requireDeliveryAgent', async () => {
    setSupabase({
      users: { id: RIDER_ID, role: 'rider' },
      couriers: { id: 'c1', status: 'active', verification_status: 'pending' },
    });
    await expect(requireDeliveryAgent(fakeRequest)).rejects.toMatchObject({ status: 403 });
  });

  test('approved courier → passes requireDeliveryAgent as courier', async () => {
    setSupabase({
      users: { id: RIDER_ID, role: 'rider' },
      couriers: { id: 'c1', status: 'active', verification_status: 'active' },
    });
    const auth = await requireDeliveryAgent(fakeRequest);
    expect(auth.kind).toBe('courier');
  });

  test('pending-verification courier → 403 at requireCourier(food)', async () => {
    setSupabase({
      users: { id: RIDER_ID, role: 'rider' },
      couriers: { id: 'c1', courier_type: 'food', status: 'active', verification_status: 'pending' },
    });
    await expect(requireCourier('food')(fakeRequest)).rejects.toMatchObject({ status: 403 });
  });

  test('pending courier invisible to the dispatch pool at SQL level', async () => {
    const predicates: SQL[] = [];
    (db.select as jest.Mock).mockImplementation(() => ({
      from: (table: unknown) => ({
        where: (predicate: SQL) => {
          if (table === couriers) predicates.push(predicate);
          return { then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve) };
        },
      }),
    }));

    await rankedDeliveryCandidates(
      { id: 'leg-1', pickup_lat: '23.8103', pickup_lng: '90.4125', tried_claimer_ids: null },
    );

    expect(predicates).toHaveLength(1);
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(predicates[0]);
    // Removing the verification predicate flips this red — a pending
    // courier would re-enter the pool while the gate 403s it elsewhere.
    expect(rendered.sql).toContain('"couriers"."verification_status" = $');
    expect(rendered.params).toContain('active');
  });
});

describe('C7-1 handover-code privacy (orders/[id])', () => {
  const ORDER_ROW: Row = {
    id: ORDER_ID,
    shop_id: SHOP_ID,
    rider_user_id: RIDER_ID,
    status: 'picked_up',
    pickup_code: '123456',
    delivery_otp: '654321',
  };

  function mockOrderSelect(): void {
    const queue: Row[][] = [[ORDER_ROW], [], [{ name: 'Shop' }], []];
    let i = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      const rows = queue[i] ?? [];
      i += 1;
      const chain: any = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => rows,
      };
      return chain;
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rider sees delivery_otp only — no pickup_code', async () => {
    (requireShopMember as jest.Mock).mockImplementation(() => async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    (requireMemberRoles as jest.Mock).mockImplementation(() => async () => ({ dbUser: { id: RIDER_ID } }));
    mockOrderSelect();

    const res = await orderDetail(fakeRequest, { id: ORDER_ID });
    const body = await getJson(res);

    expect(res.status).toBe(200);
    const order = body.order as Row;
    expect(order).not.toHaveProperty('pickup_code');
    expect(order.delivery_otp).toBe('654321');
  });

  test('shop member sees both codes', async () => {
    (requireShopMember as jest.Mock).mockImplementation(() => async () => ({ membership: { role: 'OWNER' } }));
    mockOrderSelect();

    const res = await orderDetail(fakeRequest, { id: ORDER_ID });
    const body = await getJson(res);

    expect(res.status).toBe(200);
    const order = body.order as Row;
    expect(order.pickup_code).toBe('123456');
    expect(order.delivery_otp).toBe('654321');
  });
});
