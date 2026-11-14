/**
 * Delivery packages — the two post-purchase banners the screen renders from the
 * server's answer, driven end to end through a STUBBED payment rail.
 *
 * Why this file exists. `app/(main)/(delivery-staff)/packages.tsx` turns one
 * POST answer into two very different banners:
 *   - `activated` truthy        → the green "Package activated" banner, whose
 *                                 body and buttons depend on the bill amount
 *                                 (>= the ৳10 gateway floor → Pay now + Pay later;
 *                                 below it → the roll-into-next-bill note);
 *   - `error: dues_outstanding_purchase_blocked`
 *                               → the amber "Settle dues first" banner carrying
 *                                 `total_unpaid_paisa`, with no activation banner.
 * Both were only ever checked by eye on a device, and both sit one tap away from
 * money. This test pins them against the real screen with a fake rail.
 *
 * No real money moves, by construction:
 *   - `global.fetch` is the only transport and it is a jest mock; every call is
 *     recorded, and nothing leaves the process.
 *   - the purchase POST answers canned JSON (the route's documented shape:
 *     `{activated, bill, grant}` or `{error, total_unpaid_paisa}`).
 *   - `@/components/PaymentWebView` is replaced by a spy that renders nothing, so
 *     a PortPos URL can never be loaded; `payNow` is additionally asserted to be
 *     OFF the rail for these banners (no `/api/delivery/dues` call).
 *   - `expo-crypto` is a fixed UUID, so the Idempotency-Key header is predictable.
 *
 * Related (concrete paths):
 *   - app/(main)/(delivery-staff)/packages.tsx — the screen under test
 *   - app/api/delivery/packages/purchase+api.ts — the response shape stubbed here
 *   - i18n/locales/en/common.json — `delivery.packages.*` keys asserted by key
 *   - tests/components/cash-handshake-card.test.tsx — same render/spy pattern
 * Last verified: 2026-11-10 — 6 tests green; tsc + lint clean.
 * How to update: if the banner branches change, change the fixture, not the
 * assertions' meaning — each test names the ONE server answer it pins.
 */
/* eslint-disable import/first */
jest.mock('@/lib/config', () => ({ API_URL: 'http://stub.local' }));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: () => undefined,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: unknown }) => children ?? null,
}));

jest.mock('@/lib/useAppearance', () => ({ useIsDark: () => false }));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

/** Spy on the payment rail's WebView: it must never receive a URL here. */
const webViewProps: { paymentURL: string; paymentID: string }[] = [];
jest.mock('@/components/PaymentWebView', () => ({
  __esModule: true,
  default: (props: { paymentURL: string; paymentID: string }) => {
    webViewProps.push(props);
    return null;
  },
}));

// The locale keys are asserted, not the copy: the mock echoes `key <params>`, so
// a test proves WHICH banner rendered AND what the interpolation resolved to.
jest.mock('react-i18next', () => {
  // ONE `t` for the whole file. A fresh function per render would make the
  // screen's `useCallback(..., [t])` load() change identity every render and
  // re-fire its effect forever (it did: every test timed out at 5s).
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key} ${Object.values(opts).join(' ')}` : key;
  return { useTranslation: () => ({ t }) };
});

import * as React from 'react';
import { create, act } from 'react-test-renderer';
import { router } from 'expo-router';
import DeliveryPackagesScreen from '@/app/(main)/(delivery-staff)/packages';

const PKG = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Courier 30-day',
  product_type: 'delivery',
  call_count: 100,
  duration_days: 30,
  price_bdt: 120000,
  daily_cap: null,
  is_trial: false,
  commission_percent: null,
  applicable_roles: ['delivery'],
};

type FetchCall = { url: string; init?: RequestInit };

const calls: FetchCall[] = [];

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 409,
    json: async () => body,
  } as unknown as Response;
}

/** The whole rail: GET package shelf, POST purchase. Everything else 500s. */
function stubRail(purchaseBody: unknown, options: { purchaseOk?: boolean } = {}) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/api/delivery/packages')) {
      return jsonResponse({ packages: [PKG] });
    }
    if (url.endsWith('/api/delivery/packages/purchase')) {
      return jsonResponse(purchaseBody, options.purchaseOk ?? true);
    }
    throw new Error(`unexpected real-rail call: ${url}`);
  }) as unknown as typeof fetch;
}

function textsOf(renderer: ReturnType<typeof create>): string[] {
  return renderer.root
    .findAll((n) => typeof n.props?.children === 'string')
    .map((n) => n.props.children as string);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Render, wait for the shelf, tap Activate, and settle. Returns the texts after
 * the purchase answer has been applied.
 */
async function activate(purchaseBody: unknown) {
  stubRail(purchaseBody);
  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(<DeliveryPackagesScreen />);
  });
  await flush();

  const button = renderer!.root.findByProps({
    testID: 'delivery-staff.packages.purchase',
  });
  await act(async () => {
    button.props.onPress();
  });
  await flush();
  await flush();

  return { renderer: renderer!, texts: textsOf(renderer!) };
}

beforeEach(() => {
  calls.length = 0;
  webViewProps.length = 0;
  jest.clearAllMocks();
});

describe('delivery packages — activated banner', () => {
  test('a payable bill shows the amount and offers Pay now', async () => {
    const { renderer, texts } = await activate({
      activated: true,
      bill: { id: 'bill-1', amount_bdt: 1200, due_at: null },
      grant: { expires_at: '2026-12-10T00:00:00.000Z' },
    });

    expect(texts).toContain('delivery.packages.activated_title');
    // 1200 paisa = ৳12 above the ৳10 floor → the bill line, not the rollover note.
    expect(texts).toContain('delivery.packages.activated_bill ৳12');
    expect(texts).not.toContain('delivery.packages.minimum_note');
    // Assert the VISIBLE labels, not node counts: a RN Touchable copies its
    // testID onto every wrapper layer, so findAllByProps returns 5 nodes for one
    // button and says nothing about what the driver sees.
    expect(texts).toContain('delivery.packages.pay_now');
    expect(texts).toContain('delivery.packages.pay_later');
    expect(
      renderer.root.findAllByProps({ testID: 'delivery-staff.packages.pay-now' })
        .length,
    ).toBeGreaterThan(0);

    // The rail was NOT touched: paying is a separate, deliberate tap.
    expect(calls.some((c) => c.url.includes('/api/delivery/dues'))).toBe(false);
    expect(webViewProps).toHaveLength(0);
  });

  test('a bill below the gateway floor shows the rollover note and no Pay now', async () => {
    const { texts } = await activate({
      activated: true,
      bill: { id: 'bill-2', amount_bdt: 500, due_at: null },
      grant: { expires_at: null },
    });

    expect(texts).toContain('delivery.packages.activated_bill ৳5');
    expect(texts).toContain('delivery.packages.minimum_note');
    expect(texts).not.toContain('delivery.packages.pay_now');
    expect(texts).toContain('delivery.packages.pay_later');
  });

  test('no bill at all says the package needs no payment', async () => {
    const { texts } = await activate({
      activated: true,
      bill: null,
      grant: { expires_at: null },
    });

    expect(texts).toContain('delivery.packages.activated_title');
    expect(texts).toContain('delivery.packages.activated_no_bill');
    expect(texts.join('|')).not.toContain('delivery.packages.activated_bill');
  });

  test('the purchase POST carries an Idempotency-Key and the package id', async () => {
    await activate({
      activated: true,
      bill: null,
      grant: { expires_at: null },
    });

    const post = calls.find((c) =>
      c.url.endsWith('/api/delivery/packages/purchase'),
    );
    expect(post).toBeDefined();
    const headers = post!.init!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(String(post!.init!.body))).toEqual({
      package_id: PKG.id,
    });
  });
});

describe('delivery packages — purchase-blocked banner', () => {
  test('dues outstanding renders the blocked banner with the owed total', async () => {
    const { texts } = await activate(
      {
        error: 'dues_outstanding_purchase_blocked',
        message: 'Settle outstanding dues before buying a package',
        total_unpaid_paisa: 45000,
      },
    );

    // 45000 paisa = ৳450, formatted through formatBDT inside the screen.
    expect(texts).toContain('delivery.packages.blocked_title');
    expect(texts).toContain('delivery.packages.blocked_body ৳450');
    // The two banners are mutually exclusive.
    expect(texts).not.toContain('delivery.packages.activated_title');
    expect(texts).toContain('delivery.packages.go_to_dues');

    expect(calls.some((c) => c.url.includes('/api/delivery/dues'))).toBe(false);
    expect(webViewProps).toHaveLength(0);
  });

  test('the blocked banner routes the driver to dues and stops paying there', async () => {
    const { renderer } = await activate({
      error: 'dues_outstanding_purchase_blocked',
      total_unpaid_paisa: 45000,
    });

    const goToDues = renderer.root.findAllByProps({
      testID: 'delivery-staff.packages.go-to-dues-2',
    })[0];
    await act(async () => {
      goToDues.props.onPress();
    });

    expect(router.push).toHaveBeenCalledWith('/(main)/(delivery-staff)/dues');
    // Navigating is not paying: still no dues POST, still no WebView.
    expect(calls.some((c) => c.url.includes('/api/delivery/dues'))).toBe(false);
    expect(webViewProps).toHaveLength(0);
  });
});
