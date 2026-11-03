/* eslint-disable import/first */
/**
 * Plan 29 (v3.1): Peer-to-Peer MFS Assistance at Drop-Off & Transparent Dispatch
 * Verifies:
 * - GET /api/ride/[id] gates driver MFS details to in_progress OR completed with mfs_p2p (Rule C3-6 & FLAW 2)
 * - Strict immutable trip snapshot from rides.mfs_provider / rides.mfs_number (FLAW 6)
 * - Hides driver MFS on completed cash rides (zero privacy leak)
 * - POST /api/ride/[id]/complete persists payment_method and MFS snapshot
 * - Cash handshake is cleared when MFS payment is chosen
 * - Rejects MFS completion with 400 if driver had no eligible MFS method snapshotted at start
 */
jest.mock('@/lib/auth', () => ({
  requireRole: () => async () => ({ dbUser: { id: 'driver-user-1' } }),
  verifySupabaseToken: async () => ({ id: 'auth-uid-1' }),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/notify', () => ({
  sendNotification: jest.fn(async () => undefined),
}));
jest.mock('@/lib/fareCalc', () => ({
  calculateFare: jest.fn(() => ({
    total_bdt: 18000,
    driver_net_bdt: 18000,
    platform_commission_bdt: 0,
  })),
  calculateV6Fare: jest.fn(() => ({
    total_bdt: 18000,
    driver_net_bdt: 18000,
    platform_commission_bdt: 0,
  })),
}));
jest.mock('@/lib/fareFrameworkConfig', () => ({
  getFareFrameworkConfig: jest.fn(async () => ({})),
  isStage1Plus: jest.fn(async () => false),
}));
jest.mock('@/lib/accounting', () => ({
  recordRideCompletion: jest.fn(async () => undefined),
  recordTip: jest.fn(async () => undefined),
}));
jest.mock('@/lib/gamification', () => ({
  evaluateStreaks: jest.fn(async () => undefined),
}));
jest.mock('@/lib/walletCashback', () => ({
  earnCashback: jest.fn(async () => undefined),
}));
jest.mock('@/lib/zoneBudget', () => ({
  spendZoneBudget: jest.fn(async () => undefined),
}));
jest.mock('@/lib/rideCompletionWallet', () => ({
  computeCompletionWalletReceivable: jest.fn(() => null),
}));
jest.mock('@/lib/pickupTrueup', () => ({
  computePickupTrueup: jest.fn(() => ({ applies: false, insertSample: false })),
  PICKUP_TRUEUP_CONFIG_KEYS: [],
}));
jest.mock('@/lib/zoneFee', () => ({
  lookupZoneFee: jest.fn(async () => 0),
}));
jest.mock('@/lib/cashHandshake', () => ({
  buildCashHandshake: jest.fn((tendered, received, payable) => ({
    rider_cash_tendered_bdt: tendered,
    driver_cash_received_bdt: received,
    rider_payable_bdt: payable,
    change_due_bdt: tendered != null && payable != null && tendered > payable ? tendered - payable : 0,
    amounts_match: tendered != null && received != null && tendered === received,
  })),
}));

const mockTx = {
  select: jest.fn(),
  update: jest.fn(),
  insert: jest.fn(),
};

jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  },
}));

import { db } from '@/src/db';
import { GET as getRide } from '@/app/api/ride/[id]/index+api';
import { POST as completeRide } from '@/app/api/ride/[id]/complete+api';

const RIDE_ID = '11111111-1111-4111-a111-111111111111';
const DRIVER_ID = '22222222-2222-4222-a222-222222222222';
const RIDER_USER_ID = 'rider-user-1';

describe('Plan 29 — P2P MFS Assistance & Settlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/ride/[id] — Driver MFS Privacy Gate (Rule C3-6 & FLAW 2)', () => {
    function setupGetRide(rideStatus: string, options?: { snapshottedMfs?: { provider: string; number: string }; paymentMethod?: string }) {
      let selectCount = 0;
      (db.select as jest.Mock).mockImplementation(() => {
        const c: Record<string, unknown> = {};
        c.from = () => c;
        c.innerJoin = () => c;
        c.where = () => c;
        c.limit = async () => {
          selectCount++;
          if (selectCount === 1) {
            // users select
            return [{ id: RIDER_USER_ID, auth_uid: 'auth-uid-1', phone: '01700000000' }];
          }
          if (selectCount === 2) {
            // rides select
            return [{
              id: RIDE_ID,
              user_id: RIDER_USER_ID,
              driver_id: DRIVER_ID,
              status: rideStatus,
              payment_method: options?.paymentMethod ?? 'cash',
              pricing_id: 'pricing-1',
              fare_breakdown: { total_bdt: 18000 },
              mfs_provider: options?.snapshottedMfs?.provider ?? null,
              mfs_number: options?.snapshottedMfs?.number ?? null,
            }];
          }
          if (selectCount === 3) {
            // driver select
            return [{
              id: DRIVER_ID,
              name: 'Karim Driver',
              vehicle_type: 'bike',
              rating: 4.8,
              rating_count: 50,
            }];
          }
          return [];
        };
        return c;
      });
    }

    it('exposes driver MFS details when ride is in_progress and snapshot exists', async () => {
      setupGetRide('in_progress', { snapshottedMfs: { provider: 'bkash', number: '01712345678' } });
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}`);
      const res = await getRide(req, { id: RIDE_ID });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.driver).not.toBeNull();
      expect(json.driver.mfs_provider).toBe('bkash');
      expect(json.driver.mfs_number).toBe('01712345678');
    });

    it('hides driver MFS details when ride is not yet in_progress (e.g. driver_assigned)', async () => {
      setupGetRide('driver_assigned', { snapshottedMfs: { provider: 'bkash', number: '01712345678' } });
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}`);
      const res = await getRide(req, { id: RIDE_ID });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.driver).not.toBeNull();
      expect(json.driver.mfs_provider).toBeNull();
      expect(json.driver.mfs_number).toBeNull();
    });

    it('returns null for MFS details when ride has no snapshotted MFS at start', async () => {
      setupGetRide('in_progress');
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}`);
      const res = await getRide(req, { id: RIDE_ID });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.driver.mfs_provider).toBeNull();
      expect(json.driver.mfs_number).toBeNull();
    });

    it('exposes MFS details on completed ride IF payment_method is mfs_p2p', async () => {
      setupGetRide('completed', {
        snapshottedMfs: { provider: 'nagad', number: '01899999999' },
        paymentMethod: 'mfs_p2p',
      });
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}`);
      const res = await getRide(req, { id: RIDE_ID });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.driver.mfs_provider).toBe('nagad');
      expect(json.driver.mfs_number).toBe('01899999999');
    });

    it('hides MFS details on completed cash ride (FLAW 2 privacy leak prevented)', async () => {
      setupGetRide('completed', {
        snapshottedMfs: { provider: 'bkash', number: '01712345678' },
        paymentMethod: 'cash',
      });
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}`);
      const res = await getRide(req, { id: RIDE_ID });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.driver.mfs_provider).toBeNull();
      expect(json.driver.mfs_number).toBeNull();
    });
  });

  describe('POST /api/ride/[id]/complete — Concurrency & MFS Settlement', () => {
    function setupCompleteMocks(options: { paymentMethod: 'cash' | 'mfs_p2p'; snapshottedMfs?: { provider: string; number: string } }) {
      let outerSelectCount = 0;
      (db.select as jest.Mock).mockImplementation(() => {
        const c: Record<string, unknown> = {};
        c.from = () => c;
        c.where = () => c;
        c.limit = async () => {
          outerSelectCount++;
          if (outerSelectCount === 1) {
            return [{ id: DRIVER_ID }];
          }
          if (outerSelectCount === 2) {
            return [{
              id: RIDE_ID,
              driver_id: DRIVER_ID,
              user_id: RIDER_USER_ID,
              status: 'in_progress',
              pricing_id: 'pricing-1',
              vehicle_type: 'bike',
              zone_id: 'zone-1',
              rider_cash_tendered_bdt: 100000,
              mfs_provider: options.snapshottedMfs?.provider ?? null,
              mfs_number: options.snapshottedMfs?.number ?? null,
            }];
          }
          if (outerSelectCount === 3) {
            return [{
              id: 'pricing-1',
              base_fare_bdt: 5000,
              per_km_bdt: 1500,
              per_min_bdt: 200,
              free_wait_minutes: 3,
            }];
          }
          return [];
        };
        c.then = (onfulfilled?: (val: unknown) => unknown, onrejected?: (val: unknown) => unknown) => {
          return Promise.resolve([]).then(onfulfilled, onrejected);
        };
        return c;
      });

      mockTx.select.mockImplementation(() => {
        const c: Record<string, unknown> = {};
        c.from = () => c;
        c.where = () => c;
        c.for = () => c;
        c.limit = async () => [];
        c.then = (onfulfilled?: (val: unknown) => unknown, onrejected?: (val: unknown) => unknown) => {
          return Promise.resolve([]).then(onfulfilled, onrejected);
        };
        return c;
      });

      let updatedRow: Record<string, unknown> | null = null;
      mockTx.update.mockImplementation(() => {
        const c: Record<string, unknown> = {};
        c.set = (fields: Record<string, unknown>) => {
          updatedRow = {
            id: RIDE_ID,
            status: 'completed',
            rider_payable_bdt: 18000,
            payment_method: fields.payment_method,
            mfs_provider: fields.mfs_provider,
            mfs_number: fields.mfs_number,
            rider_cash_tendered_bdt: fields.rider_cash_tendered_bdt,
          };
          return c;
        };
        c.where = () => c;
        c.returning = async () => [updatedRow];
        return c;
      });

      mockTx.insert.mockImplementation(() => {
        const c: Record<string, unknown> = {};
        c.values = () => Promise.resolve({});
        return c;
      });
    }

    it('settles via MFS: uses immutable snapshot, clears cash handshake, sets cash_to_collect to 0', async () => {
      setupCompleteMocks({
        paymentMethod: 'mfs_p2p',
        snapshottedMfs: { provider: 'bkash', number: '01712345678' },
      });
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'mfs_p2p' }),
      });

      const res = await completeRide(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.payment_method).toBe('mfs_p2p');
      expect(json.cash_to_collect_bdt).toBe(0);
      expect(json.cash_handshake).toBeNull();
    });

    it('settles via Cash: preserves cash handshake and calculates cash_to_collect', async () => {
      setupCompleteMocks({ paymentMethod: 'cash' });
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'cash', cash_received_bdt: 18000 }),
      });

      const res = await completeRide(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.payment_method).toBe('cash');
      expect(json.cash_to_collect_bdt).toBe(18000);
      expect(json.cash_handshake).not.toBeNull();
    });

    it('rejects with 400 when driver attempts MFS settlement without an eligible MFS snapshot at start (FLAW 6)', async () => {
      setupCompleteMocks({ paymentMethod: 'mfs_p2p' }); // No snapshottedMfs
      const req = new Request(`http://localhost/api/ride/${RIDE_ID}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'mfs_p2p' }),
      });

      const res = await completeRide(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('mfs_not_configured');
    });
  });
});
