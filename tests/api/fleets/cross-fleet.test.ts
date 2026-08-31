/**
 * Integration tests for Phase 2 fleet authorization.
 *
 * Exercises the REAL requireFleetMember middleware + the REAL GET/PATCH
 * /api/fleets/[id] handlers. Only the data layer (DB), Supabase token
 * provider, and logger are mocked. Verifies the critical security rule:
 * a user who is an active member of Fleet A receives 403 Forbidden when
 * attempting to READ or WRITE Fleet B — cross-fleet access is blocked
 * server-side, never by client/token guesswork.
 *
 * Pattern: minimal jest.mock factories (mock* prefix allowed); configure row
 * queues in beforeEach.
 */

// ── Mock queues (mock* prefix → allowed inside jest.mock factories) ──────
// - mockQueryQueue: supabaseAdmin.from(...).select(...).eq(...).maybeSingle()
//   — the PostgREST path requireFleetMember uses for users + fleet_members.
// - mockSelectQueue / mockUpdateQueue: Drizzle `db` used by the routes
//   themselves (fleets SELECT on GET, fleets UPDATE on PATCH).

const mockQueryQueue: (() => Record<string, jest.Mock>)[] = [];
const mockSelectQueue: (() => Record<string, jest.Mock>)[] = [];
const mockUpdateQueue: (() => Record<string, jest.Mock>)[] = [];

function mockChainQuery(result: { data: unknown; error: unknown }) {
  const c: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  return c;
}

function mockChainSelect(rows: unknown[]) {
  const c: Record<string, jest.Mock> = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  return c;
}

function mockChainUpdate(rows: unknown[]) {
  const c: Record<string, jest.Mock> = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
  };
  return c;
}

function mockNextQuery() {
  return mockQueryQueue.length > 0
    ? mockQueryQueue.shift()!()
    : mockChainQuery({ data: null, error: null });
}

function mockNextSelect() {
  return mockSelectQueue.length > 0
    ? mockSelectQueue.shift()!()
    : mockChainSelect([]);
}

function mockNextUpdate() {
  return mockUpdateQueue.length > 0
    ? mockUpdateQueue.shift()!()
    : mockChainUpdate([{ id: 'fleet-A', name: 'Updated', updated_at: '2026-08-30T00:00:00Z' }]);
}

// ── jest.mock (only references mock* prefixed functions) ─────────────────

jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn(() => mockNextSelect()),
    update: jest.fn(() => mockNextUpdate()),
  },
}));

jest.mock('@/lib/supabaseServer', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn(() =>
        Promise.resolve({ data: { user: { id: 'auth-user-1' } }, error: null }),
      ),
    },
    from: jest.fn(() => mockNextQuery()),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Imports ──────────────────────────────────────────────────────────────

import { GET, PATCH } from '@/app/api/fleets/[id]+api';
import { supabaseAdmin } from '@/lib/supabaseServer';

const FLEET_A = '11111111-1111-1111-1111-111111111111';
const FLEET_B = '22222222-2222-2222-2222-222222222222';

/** Queue a PostgREST .maybeSingle() result (users / fleet_members lookup). */
function pushQueryRows(...results: { data: unknown; error: unknown }[]) {
  for (const r of results) mockQueryQueue.push(() => mockChainQuery(r));
}

type DbResult<T> = { data: T; error: null };

function usersResult(row: { id: string; role: string } | null): DbResult<{ id: string; role: string } | null> {
  return { data: row, error: null };
}

function memberResult(
  role: string | null,
  opts: { status?: string; removedAt?: unknown } = {},
): DbResult<{
  id: string;
  role: string;
  status: string;
  removed_at: unknown;
} | null> {
  if (role === null) return { data: null, error: null };
  return {
    data: {
      id: 'fm-1',
      role,
      status: opts.status ?? 'active',
      removed_at: opts.removedAt ?? null,
    },
    error: null,
  };
}

const FLEET_A_ROW = [
  {
    id: FLEET_A,
    name: 'Fleet A',
    fleet_type: 'NATIVE',
    status: 'ACTIVE',
    owner_user_id: 'user-1',
    business_name: null,
    phone: '+8801xxxxxxxxx',
    email: null,
    address: null,
    created_at: '2026-08-30T00:00:00Z',
  },
];

function pushSelectRows(...rows: unknown[][]) {
  for (const r of rows) mockSelectQueue.push(() => mockChainSelect(r));
}

function pushUpdateRows(rows: unknown[]) {
  mockUpdateQueue.push(() => mockChainUpdate(rows));
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/fleets/00000000-0000-0000-0000-000000000000', {
    method,
    headers: {
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const USER = { id: 'user-1', role: 'driver' };

describe('fleet authorization — requireFleetMember (cross-fleet 403)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryQueue.length = 0;
    mockSelectQueue.length = 0;
    mockUpdateQueue.length = 0;
    (supabaseAdmin.auth.getUser as jest.Mock).mockImplementation(() =>
      Promise.resolve({ data: { user: { id: 'auth-user-1' } }, error: null }),
    );
  });

  it('member of Fleet A can READ Fleet A (200, profile + my_role)', async () => {
    // Middleware (PostgREST): users row → fleet_members(OWNER active)
    // Route (drizzle): fleets row
    pushQueryRows(usersResult(USER), memberResult('OWNER'));
    pushSelectRows(FLEET_A_ROW);

    const res = await GET(makeRequest('GET'), { id: FLEET_A });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fleet.id).toBe(FLEET_A);
    expect(body.fleet.name).toBe('Fleet A');
    expect(body.my_role).toBe('OWNER');
  });

  it('READ cross-fleet: member of Fleet A requesting Fleet B → 403 Forbidden', async () => {
    // Middleware: users row ok, but NO fleet_members row for (user, Fleet B)
    pushQueryRows(usersResult(USER), memberResult(null));

    const res = await GET(makeRequest('GET'), { id: FLEET_B });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
  });

  it('WRITE cross-fleet: member of Fleet A PATCHing Fleet B → 403 Forbidden', async () => {
    // Middleware: users row ok, but NO fleet_members row for (user, Fleet B)
    pushQueryRows(usersResult(USER), memberResult(null));

    const res = await PATCH(makeRequest('PATCH', { name: 'Hijack' }), { id: FLEET_B });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
  });

  it('role gate: VIEWER PATCHing their OWN fleet → 403 (not OWNER/MANAGER)', async () => {
    // Middleware: users row → fleet_members(VIEWER active) → role gate rejects
    pushQueryRows(usersResult(USER), memberResult('VIEWER'));

    const res = await PATCH(makeRequest('PATCH', { name: 'Nope' }), { id: FLEET_A });
    expect(res.status).toBe(403);
  });

  it('successful WRITE: MANAGER PATCHes their own fleet → 200', async () => {
    pushQueryRows(usersResult(USER), memberResult('MANAGER'));
    pushUpdateRows([
      { id: FLEET_A, name: 'Fleet A Ltd', updated_at: '2026-08-30T00:00:00Z' },
    ]);

    const res = await PATCH(makeRequest('PATCH', { name: 'Fleet A Ltd' }), { id: FLEET_A });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fleet.name).toBe('Fleet A Ltd');
  });

  it('inactive member → 403 even for their own fleet', async () => {
    pushQueryRows(usersResult(USER), memberResult('OWNER', { status: 'inactive' }));

    const res = await GET(makeRequest('GET'), { id: FLEET_A });
    expect(res.status).toBe(403);
  });

  it('vacated member (removed_at set) → 403', async () => {
    pushQueryRows(usersResult(USER), memberResult('OWNER', { removedAt: '2026-08-01T00:00:00Z' }));

    const res = await GET(makeRequest('GET'), { id: FLEET_A });
    expect(res.status).toBe(403);
  });

  it('no users row → 403', async () => {
    pushQueryRows(usersResult(null));
    const res = await GET(makeRequest('GET'), { id: FLEET_A });
    expect(res.status).toBe(403);
  });

  it('unauthenticated (no valid Supabase user) → 401', async () => {
    (supabaseAdmin.auth.getUser as jest.Mock).mockImplementation(() =>
      Promise.resolve({ data: { user: null }, error: null }),
    );
    const res = await GET(makeRequest('GET'), { id: FLEET_A });
    expect(res.status).toBe(401);
  });

  it('malformed fleet id → 400 (uuid boundary)', async () => {
    // No middleware call needs to happen — id validation runs first.
    const res = await GET(makeRequest('GET'), { id: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});