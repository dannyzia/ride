/**
 * C4-5 (STAGE C4-FIX): driver-identity detail responses omit the start PIN.
 * Same ride id, driver token → no start_pin / start_pin_attempts /
 * start_pin_locked_at fields and an empty otp alias. Rider-identity
 * responses keep the PIN (the rider shows it to the driver).
 */
/* eslint-disable import/first */
jest.mock('@/lib/auth', () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from '@/src/db';
import { verifySupabaseToken } from '@/lib/auth';
import { GET } from '@/app/api/ride/[id]/index+api';

const SUPABASE_UID = '11111111-1111-4111-a111-111111111111';
const RIDER_ID = '22222222-2222-4222-8222-222222222222';
const DRIVER_USER_ID = '66666666-6666-4666-8666-666666666666';
const DRIVER_ID = '33333333-3333-4333-8333-333333333333';
const RIDE_ID = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex += 1;
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: async () => rows,
    };
    return chain;
  });
}

const RIDE_ROW: Row = {
  id: RIDE_ID,
  user_id: RIDER_ID,
  driver_id: DRIVER_ID,
  status: 'in_progress',
  origin_latitude: '23.8103',
  origin_longitude: '90.4125',
  destination_latitude: '23.8203',
  destination_longitude: '90.4225',
  distance_km: '5.2',
  fare_breakdown: { total_bdt: 9000 },
  start_pin: '1234',
  start_pin_attempts: 1,
  start_pin_locked_at: null,
  rider_cash_tendered_bdt: null,
  driver_cash_received_bdt: null,
  rider_payable_bdt: 9000,
};

const DRIVER_INFO_ROW: Row = {
  id: DRIVER_ID,
  name: 'Karim Uddin',
  profile_image_url: null,
  vehicle_type: 'bike_basic',
  rating: '4.9',
  rating_count: 120,
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('driver token → PIN fields stripped, otp empty', async () => {
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  mockSelectQueue([
    [{ id: DRIVER_USER_ID }],
    [RIDE_ROW],
    [{ id: DRIVER_ID }],
    [DRIVER_INFO_ROW],
  ]);

  const res = await GET({} as unknown as Request, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(200);
  const ride = body.ride as Row;
  expect(ride).not.toHaveProperty('start_pin');
  expect(ride).not.toHaveProperty('start_pin_attempts');
  expect(ride).not.toHaveProperty('start_pin_locked_at');
  expect(ride.otp).toBe('');
});

test('rider token → PIN kept, otp present', async () => {
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  mockSelectQueue([
    [{ id: RIDER_ID }],
    [RIDE_ROW],
    [DRIVER_INFO_ROW],
  ]);

  const res = await GET({} as unknown as Request, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(200);
  const ride = body.ride as Row;
  expect(ride.start_pin).toBe('1234');
  expect(ride.otp).toBe('1234');
});
