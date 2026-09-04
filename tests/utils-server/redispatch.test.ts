// Plain jest — no mock-chain harness. utils-server/redispatch.ts has no
// runtime db/WS imports (DI deps per design §2), so this file tests the
// trigger function in isolation (spec §10).
import { jest } from '@jest/globals';

jest.mock('@/src/db', () => ({})); // redispatch.ts must not need it at runtime

import { runRedispatchTrigger } from '@/utils-server/redispatch';

const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const RIDER_ID = "11111111-1111-4111-a111-111111111111";

function makeDeps(over: Partial<{
  getRide: (rideId: string) => Promise<Record<string, unknown> | null>;
  dispatchPipeline: (ride: Record<string, unknown>) => Promise<void>;
  notifyRider: (userId: string, msg: Record<string, unknown>) => void;
  delayMs: number;
}> = {}) {
  return {
    getRide: jest.fn(async () => ({ id: RIDE_ID, status: 'dispatching' })),
    dispatchPipeline: jest.fn(async () => {}),
    notifyRider: jest.fn(),
    delayMs: 0,
    ...over,
  };
}

/**
 * Invoke the trigger with the rejection settled (never unhandled — a stub
 * throw must surface as an ASSERTION failure on the deps below, not a worker
 * crash). Returns 'ok' on success or the caught error.
 */
async function runSettled(
  p: Promise<void>,
): Promise<'ok' | unknown> {
  return p.then(
    () => 'ok' as const,
    (e: unknown) => e,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('runRedispatchTrigger', () => {
  it('notifies the rider before the delay elapses', async () => {
    const deps = makeDeps({ delayMs: 15_000 });
    const settled = runSettled(runRedispatchTrigger(RIDE_ID, RIDER_ID, deps as never));

    // BEFORE advancing timers: the WS ride:status push has already fired (§4)
    expect(deps.notifyRider).toHaveBeenCalledWith(RIDER_ID, {
      type: 'ride:status',
      ride_id: RIDE_ID,
      status: 'dispatching',
    });
    expect(deps.getRide).not.toHaveBeenCalled();

    jest.advanceTimersByTime(15_000);
    expect(await settled).toBe('ok');
  });

  it('calls dispatchPipeline with the fresh ride row after the delay when still dispatching', async () => {
    const freshRide = { id: RIDE_ID, status: 'dispatching' };
    const deps = makeDeps({
      delayMs: 15_000,
      getRide: jest.fn(async () => freshRide),
    });
    const settled = runSettled(runRedispatchTrigger(RIDE_ID, RIDER_ID, deps as never));
    expect(deps.dispatchPipeline).not.toHaveBeenCalled();

    jest.advanceTimersByTime(15_000);
    expect(await settled).toBe('ok');

    expect(deps.getRide).toHaveBeenCalledWith(RIDE_ID);
    expect(deps.dispatchPipeline).toHaveBeenCalledTimes(1);
    expect(deps.dispatchPipeline).toHaveBeenCalledWith(freshRide);
  });

  it('does not call dispatchPipeline when the ride is no longer dispatching after the delay (§5 rider cancel)', async () => {
    const deps = makeDeps({
      delayMs: 15_000,
      getRide: jest.fn(async () => ({ id: RIDE_ID, status: 'cancelled' })),
    });
    const settled = runSettled(runRedispatchTrigger(RIDE_ID, RIDER_ID, deps as never));

    jest.advanceTimersByTime(15_000);
    expect(await settled).toBe('ok');

    expect(deps.dispatchPipeline).not.toHaveBeenCalled();
  });

  it('does not call dispatchPipeline when getRide returns null (ride missing)', async () => {
    const deps = makeDeps({
      delayMs: 15_000,
      getRide: jest.fn(async () => null),
    });
    const settled = runSettled(runRedispatchTrigger(RIDE_ID, RIDER_ID, deps as never));

    jest.advanceTimersByTime(15_000);
    expect(await settled).toBe('ok');

    expect(deps.dispatchPipeline).not.toHaveBeenCalled();
  });

  it('skips the delay entirely when delayMs is 0', async () => {
    const deps = makeDeps({ delayMs: 0 });
    // No timer advance — the pipeline call must already have happened once
    // the promise's microtasks settle.
    expect(await runSettled(runRedispatchTrigger(RIDE_ID, RIDER_ID, deps as never))).toBe('ok');

    expect(jest.getTimerCount()).toBe(0);
    expect(deps.dispatchPipeline).toHaveBeenCalledTimes(1);
  });

  it('does not call notifyRider when riderUserId is null', async () => {
    const deps = makeDeps({ delayMs: 0 });
    expect(await runSettled(runRedispatchTrigger(RIDE_ID, null, deps as never))).toBe('ok');

    expect(deps.notifyRider).not.toHaveBeenCalled();
    expect(deps.dispatchPipeline).toHaveBeenCalledTimes(1);
  });
});
