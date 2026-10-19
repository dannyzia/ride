/**
 * C4-3 (STAGE C4-FIX): ExtraChargeApproval renders live on the rider's
 * active ride with a pending charge; Approve PATCHes {charge_id, approve}
 * (→ approved → the completion fold books the ledger entry); Dispute
 * PATCHes {charge_id, dispute} (→ flagged via the support ticket).
 * Empty (no pending charges) renders null — safe to mount unconditionally.
 */
/* eslint-disable import/first */
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock('@/lib/useAppearance', () => ({
  useIsDark: () => false,
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import * as React from 'react';
import { create, act } from 'react-test-renderer';
import { supabase } from '@/lib/supabase';
import ExtraChargeApproval from '@/components/ExtraChargeApproval';

const RIDE_ID = 'ride-1';
const CHARGE_ID = 'charge-1';

function mockSession(): void {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { access_token: 'token' } },
  });
}

function mockChargesFetch(charges: unknown[], capture: { url: string; init?: RequestInit }[]): void {
  (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
    capture.push({ url, init });
    if (!init || !init.method || init.method === 'GET') {
      return { ok: true, json: async () => ({ charges }) };
    }
    return { ok: true, json: async () => ({ success: true }) };
  });
}

function textsOf(root: ReturnType<typeof create>['root']): string[] {
  return root
    .findAll((n) => typeof n.props?.children === 'string')
    .map((n) => n.props.children as string);
}

function pressButtonByLabel(root: ReturnType<typeof create>['root'], label: string): void {
  // The RN mock duplicates host/composite nodes — assert presence, then
  // drive the card's pressables. Each button renders twice (composite +
  // host) carrying the same fn: dedupe by identity, Approve before Dispute
  // in tree order.
  expect(root.findAll((n) => n.props?.children === label).length).toBeGreaterThan(0);
  const fns = root
    .findAll((n) => typeof n.props?.onPress === 'function')
    .map((n) => n.props.onPress as () => void);
  const unique = [...new Set(fns)] as Array<() => void>;
  expect(unique).toHaveLength(2);
  (label === 'Approve' ? unique[0] : unique[1])();
}

const PENDING = [
  { id: CHARGE_ID, type: 'toll', amount_bdt: 500, description: 'bridge toll', status: 'pending' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as unknown) = jest.fn();
  mockSession();
});

test('pending charge renders live with amount; Approve PATCHes approve', async () => {
  const capture: { url: string; init?: RequestInit }[] = [];
  mockChargesFetch(PENDING, capture);

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(<ExtraChargeApproval rideId={RIDE_ID} />);
    await Promise.resolve();
  });
  try {
    const root = renderer!.root;
    const texts = textsOf(root);
    expect(texts).toContain('Toll Charge');
    expect(texts.some((t) => t.includes('5'))).toBe(true);

    await act(async () => {
      pressButtonByLabel(root, 'Approve');
      await Promise.resolve();
    });

    const patch = capture.find((c) => c.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch!.url).toContain(`/api/ride/${RIDE_ID}/extra-charge`);
    expect(JSON.parse(patch!.init!.body as string)).toEqual({ charge_id: CHARGE_ID, action: 'approve' });
  } finally {
    act(() => { renderer!.unmount(); });
  }
});

test('Dispute PATCHes dispute (flagged for support)', async () => {
  const capture: { url: string; init?: RequestInit }[] = [];
  mockChargesFetch(PENDING, capture);

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(<ExtraChargeApproval rideId={RIDE_ID} />);
    await Promise.resolve();
  });
  try {
    const root = renderer!.root;
    await act(async () => {
      pressButtonByLabel(root, 'Dispute');
      await Promise.resolve();
    });

    const patch = capture.find((c) => c.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(patch!.init!.body as string)).toEqual({ charge_id: CHARGE_ID, action: 'dispute' });
  } finally {
    act(() => { renderer!.unmount(); });
  }
});

test('no pending charges → renders null', async () => {
  const capture: { url: string; init?: RequestInit }[] = [];
  mockChargesFetch([], capture);

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(<ExtraChargeApproval rideId={RIDE_ID} />);
    await Promise.resolve();
  });
  try {
    expect(renderer!.toJSON()).toBeNull();
  } finally {
    act(() => { renderer!.unmount(); });
  }
});
