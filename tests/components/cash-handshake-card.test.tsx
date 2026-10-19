/**
 * C4-6 (STAGE C4-FIX): CashHandshakeCard renders the server's
 * cash_handshake — amounts_match → settled; otherwise the computed
 * change_due; a mismatch with no change figure → the raw mismatch note.
 * Null handshake renders null.
 */
/* eslint-disable import/first */
jest.mock('@/lib/useAppearance', () => ({
  useIsDark: () => false,
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) =>
      opts ? `${key} ${Object.values(opts).join(' ')}` : key,
  }),
}));

import * as React from 'react';
import { create, act } from 'react-test-renderer';
import CashHandshakeCard from '@/components/CashHandshakeCard';

function renderText(handshake: React.ComponentProps<typeof CashHandshakeCard>['handshake']): string[] {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(<CashHandshakeCard handshake={handshake} />);
  });
  try {
    if (renderer!.toJSON() === null) return [];
    return renderer!.root
      .findAll((n) => typeof n.props?.children === 'string')
      .map((n) => n.props.children as string);
  } finally {
    renderer!.unmount();
  }
}

test('match renders settled', () => {
  const texts = renderText({
    rider_cash_tendered_bdt: 9000,
    driver_cash_received_bdt: 9000,
    change_due_bdt: 0,
    amounts_match: true,
  });
  expect(texts.some((t) => t.includes('finish_ride.cash_settled'))).toBe(true);
});

test('mismatch renders change_due', () => {
  const texts = renderText({
    rider_cash_tendered_bdt: 12000,
    driver_cash_received_bdt: 9000,
    change_due_bdt: 3000,
    amounts_match: false,
  });
  expect(texts.some((t) => t.includes('finish_ride.return_change'))).toBe(true);
  expect(texts.some((t) => t.includes('30'))).toBe(true);
});

test('mismatch with no change figure renders the mismatch note', () => {
  const texts = renderText({
    rider_cash_tendered_bdt: 9000,
    driver_cash_received_bdt: 8000,
    change_due_bdt: 0,
    amounts_match: false,
  });
  expect(texts.some((t) => t.includes('finish_ride.cash_mismatch'))).toBe(true);
});

test('null handshake renders null', () => {
  expect(renderText(null)).toEqual([]);
  expect(renderText(undefined)).toEqual([]);
});
