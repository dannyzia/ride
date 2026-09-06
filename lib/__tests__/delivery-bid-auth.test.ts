 
/**
 * Delivery bid auth — courier type matching (FIX 1).
 *
 * Verifies that:
 * 1. Request type is resolved from `source_shop_order_id` (present = food, absent = parcel)
 * 2. `requireCourier(type)` is called with the resolved type (no fallback chain)
 * 3. Mismatched courier types are rejected (403)
 * 4. Missing request returns 404 before any auth call
 */

// ─── Module-level mocks (static, set before import) ───────────────────────

const mockRequireCourierFn = jest.fn();

jest.mock('@/lib/marketplaceRbac', () => ({
  requireCourier: (...args: any[]) => mockRequireCourierFn(...args),
}));

jest.mock('@/lib/platformConfig', () => ({
  isVerticalEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('@/lib/parseBody', () => ({
  parseJsonBody: jest.fn().mockImplementation(async (req: Request) => {
    try {
      const body = await req.json();
      return { ok: true, data: body };
    } catch {
      return { ok: false, response: new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 }) };
    }
  }),
}));

// ─── DB mock factory ───────────────────────────────────────────────────────

function createDbMock(requestRow: any | null, existingBid: any | null = null) {
  let callCount = 0;
  return {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation(() => ({
          limit: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // First select: delivery request lookup
              return Promise.resolve(requestRow ? [requestRow] : []);
            }
            if (existingBid) {
              return Promise.resolve([existingBid]);
            }
            return Promise.resolve([]);
          }),
        })),
      })),
    })),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'bid-new' }]),
      }),
    }),
  };
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/delivery/bids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeFoodRequest(overrides: Record<string, any> = {}): any {
  return {
    id: 'req-001',
    status: 'pending',
    deadline_at: new Date(Date.now() + 86_400_000).toISOString(),
    source_shop_order_id: 'shop-order-1', // ← food indicator
    ...overrides,
  };
}

function makeParcelRequest(overrides: Record<string, any> = {}): any {
  return {
    id: 'req-002',
    status: 'pending',
    deadline_at: new Date(Date.now() + 86_400_000).toISOString(),
    source_shop_order_id: null, // ← parcel indicator
    ...overrides,
  };
}

function mockAuthSuccess(type: 'food' | 'parcel') {
  return jest.fn().mockResolvedValue({
    supabaseUser: { id: 'sb-1' },
    dbUser: { id: 'user-1', role: 'courier' },
    courier: { id: 'courier-1', courier_type: type, status: 'active' },
    driver: type === 'parcel' ? { id: 'driver-1', vehicle_type: 'bike' } : null,
  });
}

function mockAuthFailure() {
  return jest.fn().mockRejectedValue(
    Object.assign(new Error('Forbidden'), { status: 403, message: 'courier_required' }),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('FIX 1: Delivery bid courier type validation', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('resolves food type when source_shop_order_id is present', async () => {
    const dbMock = createDbMock(makeFoodRequest());
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    mockRequireCourierFn.mockImplementation((type: string) => {
      if (type === 'food') return mockAuthSuccess('food');
      return mockAuthFailure();
    });

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'req-001', quoted_fee_bdt: 5000 }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.bid).toBeDefined();
    // CRITICAL: requireCourier was called with 'food', NOT with a fallback
    expect(mockRequireCourierFn).toHaveBeenCalledWith('food');
    expect(mockRequireCourierFn).toHaveBeenCalledTimes(1);
  });

  it('resolves parcel type when source_shop_order_id is null', async () => {
    const dbMock = createDbMock(makeParcelRequest());
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    mockRequireCourierFn.mockImplementation((type: string) => {
      if (type === 'parcel') return mockAuthSuccess('parcel');
      return mockAuthFailure();
    });

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'req-002', quoted_fee_bdt: 5000 }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.bid).toBeDefined();
    expect(mockRequireCourierFn).toHaveBeenCalledWith('parcel');
    expect(mockRequireCourierFn).toHaveBeenCalledTimes(1);
  });

  it('rejects parcel courier bidding on food request (403)', async () => {
    const dbMock = createDbMock(makeFoodRequest());
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    mockRequireCourierFn.mockImplementation((type: string) => {
      // Food request → requireCourier('food') called → parcel courier fails
      if (type === 'food') return mockAuthFailure();
      // Should never be called with 'parcel' for a food request
      return mockAuthSuccess('parcel');
    });

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'req-001', quoted_fee_bdt: 5000 }));

    expect(res.status).toBe(403);
    // Only 'food' was attempted — no fallback to 'parcel'
    expect(mockRequireCourierFn).toHaveBeenCalledTimes(1);
    expect(mockRequireCourierFn).toHaveBeenCalledWith('food');
  });

  it('rejects food courier bidding on parcel request (403)', async () => {
    const dbMock = createDbMock(makeParcelRequest());
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    mockRequireCourierFn.mockImplementation((type: string) => {
      // Parcel request → requireCourier('parcel') called → food courier fails
      if (type === 'parcel') return mockAuthFailure();
      // Should never be called with 'food' for a parcel request
      return mockAuthSuccess('food');
    });

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'req-002', quoted_fee_bdt: 5000 }));

    expect(res.status).toBe(403);
    expect(mockRequireCourierFn).toHaveBeenCalledTimes(1);
    expect(mockRequireCourierFn).toHaveBeenCalledWith('parcel');
  });

  it('returns 404 before any auth call when request does not exist', async () => {
    const dbMock = createDbMock(null);
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'nonexistent', quoted_fee_bdt: 5000 }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('not_found');
    // Auth should NOT have been called — request check comes first
    expect(mockRequireCourierFn).not.toHaveBeenCalled();
  });

  it('rejects bids on expired requests (deadline passed)', async () => {
    const dbMock = createDbMock(makeFoodRequest({ deadline_at: new Date(Date.now() - 1000).toISOString() }));
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    mockRequireCourierFn.mockImplementation((type: string) => {
      if (type === 'food') return mockAuthSuccess('food');
      return mockAuthFailure();
    });

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'req-001', quoted_fee_bdt: 5000 }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('deadline_passed');
  });

  it('rejects bids on non-pending requests', async () => {
    const dbMock = createDbMock(makeFoodRequest({ status: 'in_progress' }));
    jest.doMock('@/src/db', () => ({ db: dbMock }));

    mockRequireCourierFn.mockImplementation((type: string) => {
      if (type === 'food') return mockAuthSuccess('food');
      return mockAuthFailure();
    });

    const { POST } = require('@/app/api/delivery/bids+api');
    const res = await POST(makeRequest({ request_id: 'req-001', quoted_fee_bdt: 5000 }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('not_biddable');
  });
});
