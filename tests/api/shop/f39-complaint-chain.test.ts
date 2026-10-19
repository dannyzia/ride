/**
 * F-39 customer-complaint chain (STAGE D1-FIX, owner ruling 2026-10-17):
 * flag → shop sees → escalate → admin ban → customer suspended; a
 * dismissed complaint bans nobody; the ban 403s the customer's next
 * protected call through the REAL C2-1 gate (enforceAccountState).
 *
 * Drives the REAL routes with a mocked db; pins RECORDED writes
 * (complaint row, users suspension, audit_logs) — never stubbed returns.
 * Out of scope: Locked-screen UI (no such screen exists on disk — the
 * 403 + surfaced reason contract is pinned here instead).
 */
/* eslint-disable import/first */
jest.mock('@/lib/supabaseServer', () => ({ supabaseAdmin: {} }));
jest.mock('@/lib/marketplaceRbac', () => ({
  requireDeliveryAgent: jest.fn(),
  requireShopMember: jest.fn(),
}));
jest.mock('@/lib/adminRbac', () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock('@/lib/notify', () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
  sendNotifications: jest.fn(async () => undefined),
}));
jest.mock('@/lib/shopNotify', () => ({
  notifyShopComplaintFlagged: jest.fn(async () => undefined),
  notifyComplaintDecided: jest.fn(async () => undefined),
  notifyCustomerOrderStatus: jest.fn(),
  notifyCustomerPartialAccept: jest.fn(),
  shopOrderRecipients: jest.fn(async () => []),
}));
jest.mock('@/lib/wsNotify', () => ({ notifyWs: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));

import { db } from '@/src/db';
import {
  deliveries,
  shopOrders,
  customerComplaints,
  courierRemittanceDues,
  users,
  auditLogs,
} from '@/src/db/schema';
import { requireDeliveryAgent, requireShopMember } from '@/lib/marketplaceRbac';
import { requireAdminPermission } from '@/lib/adminRbac';
import {
  notifyShopComplaintFlagged,
  notifyComplaintDecided,
} from '@/lib/shopNotify';
import { notifyWs } from '@/lib/wsNotify';
import { enforceAccountState } from '@/lib/auth';
import { POST as flagComplaint } from '@/app/api/delivery/active/[id]/complaint+api';
import { GET as shopList } from '@/app/api/shop/complaints+api';
import { POST as escalate } from '@/app/api/shop/complaints/[id]/escalate+api';
import { GET as adminQueue } from '@/app/api/admin/customer-complaints+api';
import { POST as decide } from '@/app/api/admin/customer-complaints/[id]/decide+api';

type Row = Record<string, unknown>;

const LEG_ID = '11111111-1111-4111-a111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const RIDER_ID = '44444444-4444-4444-8444-444444444444';
const COURIER_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_ID = '66666666-6666-4666-8666-666666666666';
const ADMIN_ID = '77777777-7777-4777-8777-777777777777';
const DUE_ID = '88888888-8888-4888-8888-888888888888';
const COMPLAINT_ID = '99999999-9999-4999-8999-999999999999';

// subtotal 20000 + fee 8000 = 28000 expected; collected 20000 → short 8000.
const BASE_LEG: Row = {
  id: LEG_ID,
  status: 'delivered',
  delivery_man_user_id: COURIER_ID,
  order_id: ORDER_ID,
  source_vertical: 'shop',
  delivery_fee_bdt: 8000,
  amount_collected_bdt: 20000,
};
const BASE_ORDER: Row = {
  id: ORDER_ID,
  shop_id: SHOP_ID,
  rider_user_id: RIDER_ID,
  status: 'delivered',
  subtotal_bdt: 20000,
  delivery_fee_bdt: 8000,
};
const SHORTPAY_DUE: Row = {
  id: DUE_ID,
  remittance_note: 'F-38 short-pay: expected 28000 paisa collected, courier recorded 20000 (short 8000)',
};
const BASE_COMPLAINT: Row = {
  id: COMPLAINT_ID,
  order_id: ORDER_ID,
  leg_id: LEG_ID,
  raised_by_user_id: COURIER_ID,
  shop_id: SHOP_ID,
  against_user_id: RIDER_ID,
  evidence_due_id: DUE_ID,
  reason: 'short_pay',
  courier_note: null,
  status: 'open',
};

let resolvers: Map<unknown, Row[]>;
let inserts: { table: unknown; values: Row }[];
let updates: { table: unknown; set: Row }[];
let insertSeq = 0;

function chain(rows: Row[]) {
  const c: Record<string, unknown> = {
    from: jest.fn(() => c),
    where: jest.fn(() => c),
    limit: jest.fn(() => c),
    for: jest.fn(() => c),
    orderBy: jest.fn(() => c),
    // Join fan-out: attach the evidence note to complaint rows.
    leftJoin: jest.fn(() => {
      if (rows.length > 0 && 'reason' in rows[0] && rows[0].reason === 'short_pay') {
        const dues = resolvers.get(courierRemittanceDues) ?? [];
        return chain(
          rows.map((r) => ({ ...r, evidence_note: dues[0]?.remittance_note ?? null })),
        );
      }
      return chain(rows);
    }),
    returning: jest.fn(async () => rows),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  };
  return c;
}

function wireDb() {
  const selectImpl = () => ({
    from: jest.fn((t: unknown) => chain(resolvers.get(t) ?? [])),
  });
  (db.select as jest.Mock).mockImplementation(selectImpl);
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((vals: Row) => {
      insertSeq += 1;
      // UUID-shaped: downstream routes Zod-validate ids as uuids.
      const row = { id: `10000000-1000-4000-8000-10000000000${insertSeq}`, ...vals };
      inserts.push({ table, values: row });
      const out = {
        returning: jest.fn(async () => [row]),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve([row]).then(res, rej),
      };
      return out;
    }),
  }));
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updates.push({ table, set: setObj });
      return { where: jest.fn(() => Promise.resolve([])) };
    }),
  }));
  const tx = { select: selectImpl, insert: (db.insert as jest.Mock).getMockImplementation(), update: (db.update as jest.Mock).getMockImplementation() };
  (db.transaction as jest.Mock).mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
}

function jsonReq(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  resolvers = new Map();
  inserts = [];
  updates = [];
  insertSeq = 0;
  wireDb();
  (requireDeliveryAgent as jest.Mock).mockResolvedValue({ dbUser: { id: COURIER_ID }, kind: 'courier' });
  (requireShopMember as unknown as jest.Mock).mockImplementation(
    () => async () => ({ dbUser: { id: STAFF_ID }, membership: { role: 'OWNER' } }),
  );
  (requireAdminPermission as unknown as jest.Mock).mockImplementation(
    () => async () => ({ dbUser: { id: ADMIN_ID, role: 'admin' } }),
  );
});

describe('F-39 round trip: flag → shop sees → escalate → admin ban → suspended', () => {
  it('pins every recorded write of the chain', async () => {
    // 1. Courier flags (evidence present).
    resolvers.set(deliveries, [{ ...BASE_LEG }]);
    resolvers.set(shopOrders, [{ ...BASE_ORDER }]);
    resolvers.set(courierRemittanceDues, [{ ...SHORTPAY_DUE }]);
    resolvers.set(customerComplaints, []);
    const flagRes = await flagComplaint(jsonReq({ note: 'customer paid 200 short' }), { id: LEG_ID });
    expect(flagRes.status).toBe(201);
    const flagBody = await flagRes.json();
    const complaintRows = inserts.filter((i) => i.table === customerComplaints);
    expect(complaintRows).toHaveLength(1);
    expect(complaintRows[0].values).toMatchObject({
      order_id: ORDER_ID,
      leg_id: LEG_ID,
      raised_by_user_id: COURIER_ID,
      shop_id: SHOP_ID,
      against_user_id: RIDER_ID,
      evidence_due_id: DUE_ID,
      reason: 'short_pay',
      // status rides the DB default ('open') — the route never sends it;
      // the 201 body below pins the live status.
    });
    expect(flagBody).toMatchObject({ id: complaintRows[0].values.id, status: 'open' });
    // C6-2 bell → the shop, with the computed shortfall.
    expect(notifyShopComplaintFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_ID, orderId: ORDER_ID, shortfallBdt: 8000 }),
    );

    // 2. Shop sees it on the dashboard list, evidence attached.
    const liveId = complaintRows[0].values.id as string;
    resolvers.set(customerComplaints, [{ ...BASE_COMPLAINT, id: liveId }]);
    const listRes = await shopList(
      { url: `http://x/api/shop/complaints?shop_id=${SHOP_ID}` } as unknown as Request,
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.complaints).toHaveLength(1);
    expect(listBody.complaints[0]).toMatchObject({
      against_user_id: RIDER_ID,
      order_id: ORDER_ID,
      status: 'open',
      evidence_note: SHORTPAY_DUE.remittance_note,
    });

    // 3. Shop escalates to platform.
    const escRes = await escalate({} as Request, { id: liveId });
    expect(escRes.status).toBe(200);
    expect(await escRes.json()).toMatchObject({ id: liveId, status: 'escalated' });
    const escUpdates = updates.filter((u) => u.table === customerComplaints);
    expect(escUpdates).toHaveLength(1);
    expect(escUpdates[0].set).toMatchObject({ status: 'escalated', escalated_by: STAFF_ID });
    expect(notifyWs).toHaveBeenCalledWith([
      expect.objectContaining({
        event: 'shop:complaint_status',
        payload: expect.objectContaining({ complaint_id: liveId, status: 'escalated' }),
      }),
    ]);

    // 4. Admin queue surfaces the escalation (escalated → admin).
    resolvers.set(customerComplaints, [{ ...BASE_COMPLAINT, id: liveId, status: 'escalated' }]);
    const qRes = await adminQueue(
      { url: 'http://x/api/admin/customer-complaints?status=escalated' } as unknown as Request,
    );
    expect(qRes.status).toBe(200);
    expect((await qRes.json()).complaints).toHaveLength(1);

    // 5. Admin bans: customer suspended + reason, audit row, parties notified.
    const banRes = await decide(jsonReq({ decision: 'ban', reason: 'repeat short-payer' }), { id: liveId });
    expect(banRes.status).toBe(200);
    expect(await banRes.json()).toMatchObject({ id: liveId, status: 'banned', decision: 'ban' });
    const userUpdates = updates.filter((u) => u.table === users);
    expect(userUpdates).toHaveLength(1);
    expect(userUpdates[0].set).toMatchObject({
      account_status: 'suspended',
      suspension_reason: 'repeat short-payer',
    });
    const audits = inserts.filter((i) => i.table === auditLogs);
    expect(audits).toHaveLength(1);
    expect(audits[0].values).toMatchObject({
      actor_user_id: ADMIN_ID,
      action: 'customer_complaint.ban',
      entity_type: 'customer_complaint',
      entity_id: liveId,
    });
    expect(notifyComplaintDecided).toHaveBeenCalledWith(
      expect.objectContaining({
        complaintId: liveId,
        customerUserId: RIDER_ID,
        courierUserId: COURIER_ID,
        decision: 'banned',
      }),
    );

    // 6. The ban 403s the customer's next protected call (REAL C2-1 gate).
    let gateErr: { status?: number; code?: string; reason?: string } | null = null;
    try {
      enforceAccountState({
        id: RIDER_ID,
        role: 'rider',
        account_status: 'suspended',
        suspension_reason: 'repeat short-payer',
        deleted_at: null,
      });
    } catch (e: unknown) {
      gateErr = e as { status?: number; code?: string; reason?: string };
    }
    expect(gateErr?.status).toBe(403);
    expect(gateErr?.code).toBe('account_suspended');
    expect(gateErr?.reason).toBe('repeat short-payer');
  });
});

describe('F-39 guards and the dismiss arm', () => {
  it('flag without short-pay evidence → 409, no rows', async () => {
    resolvers.set(deliveries, [{ ...BASE_LEG }]);
    resolvers.set(shopOrders, [{ ...BASE_ORDER }]);
    resolvers.set(courierRemittanceDues, []);
    resolvers.set(customerComplaints, []);
    const res = await flagComplaint(jsonReq({}), { id: LEG_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('short_pay_evidence_required');
    expect(inserts.filter((i) => i.table === customerComplaints)).toHaveLength(0);
    expect(notifyShopComplaintFlagged).not.toHaveBeenCalled();
  });

  it('duplicate live flag → 409, no second row', async () => {
    resolvers.set(deliveries, [{ ...BASE_LEG }]);
    resolvers.set(shopOrders, [{ ...BASE_ORDER }]);
    resolvers.set(courierRemittanceDues, [{ ...SHORTPAY_DUE }]);
    resolvers.set(customerComplaints, [{ ...BASE_COMPLAINT, status: 'open' }]);
    const res = await flagComplaint(jsonReq({}), { id: LEG_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('complaint_already_open');
    expect(inserts.filter((i) => i.table === customerComplaints)).toHaveLength(0);
  });

  it('decide from open (never escalated) → 409, nobody touched', async () => {
    resolvers.set(customerComplaints, [{ ...BASE_COMPLAINT, status: 'open' }]);
    const res = await decide(jsonReq({ decision: 'ban' }), { id: COMPLAINT_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('invalid_transition');
    expect(updates.filter((u) => u.table === users)).toHaveLength(0);
    expect(inserts.filter((i) => i.table === auditLogs)).toHaveLength(0);
  });

  it('dismissed complaint bans nobody but still audits + notifies', async () => {
    resolvers.set(customerComplaints, [{ ...BASE_COMPLAINT, status: 'escalated' }]);
    const res = await decide(jsonReq({ decision: 'dismiss', reason: 'first offence' }), {
      id: COMPLAINT_ID,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'dismissed', decision: 'dismiss' });
    expect(updates.filter((u) => u.table === users)).toHaveLength(0);
    const statusUpdates = updates.filter((u) => u.table === customerComplaints);
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0].set).toMatchObject({ status: 'dismissed' });
    const audits = inserts.filter((i) => i.table === auditLogs);
    expect(audits).toHaveLength(1);
    expect(audits[0].values).toMatchObject({ action: 'customer_complaint.dismiss' });
    expect(notifyComplaintDecided).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'dismissed', customerUserId: RIDER_ID }),
    );
    // And the customer account still passes the C2-1 gate (sync, void).
    expect(() =>
      enforceAccountState({
        id: RIDER_ID,
        role: 'rider',
        account_status: 'active',
        suspension_reason: null,
        deleted_at: null,
      }),
    ).not.toThrow();
  });
});
