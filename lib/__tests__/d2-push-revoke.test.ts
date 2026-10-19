/**
 * D2-1 client half: every teardown funneled through authCleanup() hits the
 * server logout route with the dying session's token (best-effort) BEFORE
 * the callers kill the session — so the server can attribute and drop the
 * device push-token rows. A null session is a silent no-op.
 */
/* eslint-disable import/first */
jest.mock('../riderSocket', () => ({ teardownRiderSocket: jest.fn() }));
jest.mock('../shopSocket', () => ({ teardownShopSocket: jest.fn() }));
jest.mock('../sosQueue', () => ({ clearQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock('../../store/useRiderStore', () => ({
  useRiderStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../../store/useDriverStore', () => ({
  useDriverStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../../store/useChatStore', () => ({
  useChatStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../../store/useDriverStatusStore', () => ({
  useDriverStatusStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('../../store/usePackageStore', () => ({
  usePackageStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('../../store/useCallLedgerStore', () => ({
  useCallLedgerStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('../../store/useDriverFlowStore', () => ({
  useDriverFlowStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { supabase } from '../supabase';
import { authCleanup } from '../authCleanup';

const fetchMock = jest.fn();
(global as unknown as { fetch: unknown }).fetch = fetchMock;

const flush = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true });
});

describe('D2-1 authCleanup revokes push tokens', () => {
  it('POSTs the logout route with the live session token', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: 'dying-token', user: { id: 'u1' } } },
    });

    authCleanup();
    await flush();

    const logoutCalls = fetchMock.mock.calls.filter(([url]: string[]) =>
      String(url).endsWith('/api/auth/logout'),
    );
    expect(logoutCalls).toHaveLength(1);
    expect(logoutCalls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer dying-token' },
    });
  });

  it('no session → no revoke call, cleanup still runs', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    });

    expect(() => authCleanup()).not.toThrow();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
