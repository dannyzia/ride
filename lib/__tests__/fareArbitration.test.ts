/**
 * P0-3 (gap ledger): lib/fareArbitration.autoArbitrateDispute — MVP routing.
 * Asserts the dispute state machine:
 *  - unknown dispute → throws
 *  - open dispute → flipped to under_review with final_resolution 'pending'
 *    and resolved_at deliberately NOT set (the dispute is not resolved yet)
 *  - non-open dispute → existing resolution + auto_refund echoed back, no write
 *  - the optional tx client is used when provided (route calls this inside its
 *    own transaction); db is never touched in that case
 */
/* eslint-disable import/first */
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from '@/src/db';
import { fareDisputes } from '@/src/db/schema';
import { autoArbitrateDispute } from '../fareArbitration';

const DISPUTE_ID = '55555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;

const updateSets: { table: unknown; set: Row }[] = [];

function mockDisputeSelect(row: Row | null, client: { select: jest.Mock; update: jest.Mock } = db as never): void {
  (client.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(async () => (row ? [row] : [])),
      })),
    })),
  }));
}

function wireUpdate(client: { select: jest.Mock; update: jest.Mock } = db as never): void {
  (client.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updateSets.push({ table, set: setObj });
      return {
        where: jest.fn(async () => []),
      };
    }),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  updateSets.length = 0;
  wireUpdate();
});

describe('autoArbitrateDispute', () => {
  test('throws for an unknown dispute id', async () => {
    mockDisputeSelect(null);
    await expect(autoArbitrateDispute(DISPUTE_ID)).rejects.toThrow('Dispute not found');
  });

  test('open dispute → under_review, resolution pending, resolved_at NOT set', async () => {
    mockDisputeSelect({ id: DISPUTE_ID, status: 'open' });

    const result = await autoArbitrateDispute(DISPUTE_ID);
    expect(result).toEqual({ resolution: 'pending', refund_bdt: 0 });

    expect(updateSets).toHaveLength(1);
    expect(updateSets[0].table).toBe(fareDisputes);
    expect(updateSets[0].set).toEqual({ status: 'under_review', final_resolution: 'pending' });
    expect(Object.prototype.hasOwnProperty.call(updateSets[0].set, 'resolved_at')).toBe(false);
  });

  test('non-open dispute echoes the existing resolution without writing', async () => {
    mockDisputeSelect({
      id: DISPUTE_ID,
      status: 'resolved',
      final_resolution: 'admin_approved',
      auto_refund_bdt: '500',
    });

    const result = await autoArbitrateDispute(DISPUTE_ID);
    expect(result).toEqual({ resolution: 'admin_approved', refund_bdt: 500 });
    expect(updateSets).toHaveLength(0);
  });

  test('uses the provided tx client instead of db (route tx passthrough)', async () => {
    const tx = { select: jest.fn(), update: jest.fn() };
    mockDisputeSelect({ id: DISPUTE_ID, status: 'open' }, tx);
    wireUpdate(tx);

    await autoArbitrateDispute(DISPUTE_ID, tx);

    expect(tx.update).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  test('numeric auto_refund strings are coerced to a number', async () => {
    mockDisputeSelect({
      id: DISPUTE_ID,
      status: 'resolved',
      final_resolution: 'auto_approved',
      auto_refund_bdt: 250,
    });

    const result = await autoArbitrateDispute(DISPUTE_ID);
    expect(result.refund_bdt).toBe(250);
    expect(Number.isInteger(result.refund_bdt)).toBe(true);
  });
});
