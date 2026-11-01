import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import WebSocket from 'ws';

const env = fs.readFileSync('utils-server/.env', 'utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const conn = m[1].trim();
const pool = new pg.Pool({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('--- Step 4: Offer Rejection & Sequential Advance ---');

  // 1. Authenticate Rider and Driver
  const { data: riderAuth, error: rErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (rErr) throw rErr;
  const riderToken = riderAuth.session.access_token;

  const { data: driverAuth, error: dErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990002',
    password: 'test1234'
  });
  if (dErr) throw dErr;
  const driverToken = driverAuth.session.access_token;
  const driverUserId = 'c58c7987-5ee7-41a6-ab8a-5a520a54a591';
  const driverId = '28dfe391-8568-4eee-a6c0-9a5cf64bd3e4';

  // Ensure driver has deliveries enabled
  await pool.query('UPDATE drivers SET deliveries_enabled = true WHERE id = $1', [driverId]);

  // ─────────────────────────────────────────────────────────────
  // PART A: Delivery Leg Offer Rejection (REST API)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[Part A] Testing Delivery Offer Rejection...');
  
  // Create a parcel delivery leg
  const testOrderId = crypto.randomUUID();
  const createLegRes = await pool.query(`
    INSERT INTO deliveries (
      source_vertical, order_id, dropoff_user_id, receiver_phone,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      item_note, delivery_fee_bdt, status, offered_to_user_id, offer_expires_at
    ) VALUES (
      'parcel', $1, '57384ff5-9719-4ccd-862c-f3db52721453', '+8801700990099',
      'Gulshan 1 Circle, Dhaka', 23.7780, 90.4180,
      'Banani 11, Dhaka', 23.7937, 90.4048,
      'Electronics', 9000, 'offered', $2, NOW() + INTERVAL '45 seconds'
    ) RETURNING id, status, offered_to_user_id;
  `, [testOrderId, driverUserId]);

  const testLegId = createLegRes.rows[0].id;
  console.log(`Created test offered delivery leg: ${testLegId}, status: ${createLegRes.rows[0].status}`);

  // Driver rejects the delivery offer
  console.log(`Driver Pilot rejecting delivery offer ${testLegId}...`);
  const rejectRes = await fetch(`http://127.0.0.1:8081/api/delivery/offers/${testLegId}/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ decision: 'reject' })
  });

  console.log('Delivery reject HTTP status:', rejectRes.status);
  const rejectJson = await rejectRes.json();
  console.log('Delivery reject response:', JSON.stringify(rejectJson));

  // Check DB state of delivery leg
  const checkLegRes = await pool.query(
    'SELECT id, status, offered_to_user_id, offer_expires_at FROM deliveries WHERE id = $1',
    [testLegId]
  );
  console.log('Delivery leg after reject:', checkLegRes.rows[0]);
  if (checkLegRes.rows[0].status !== 'created' || checkLegRes.rows[0].offered_to_user_id !== null) {
    throw new Error('Delivery reject did not reset status to created or clear offered_to_user_id');
  }
  console.log('PASS: Delivery offer rejected cleanly, reset to "created", freed for next courier!');

  // ─────────────────────────────────────────────────────────────
  // PART B: Ride Dispatch Offer Rejection (WebSocket Dispatch Engine)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[Part B] Testing Ride Dispatch Offer Rejection via WebSocket...');

  // Create test ride in DB
  const rideRes = await pool.query(`
    INSERT INTO rides (
      user_id, status, zone_id, pricing_id,
      origin_address, destination_address,
      origin_latitude, origin_longitude, destination_latitude, destination_longitude,
      vehicle_type, distance_km, fare_breakdown
    ) VALUES (
      '57384ff5-9719-4ccd-862c-f3db52721453', 'dispatching',
      'd484c99b-31a7-4b2e-b2ab-9f62dad53ccf', '5c38d713-4c3e-4084-93c2-adc234ba6d89',
      'Farmgate, Dhaka', 'Tejgaon, Dhaka',
      23.7500, 90.3800, 23.7700, 90.3900,
      'bike_basic', 2.5, '{"total_bdt": 12000}'::jsonb
    ) RETURNING id;
  `);
  const testRideId = rideRes.rows[0].id;
  console.log('Created test ride:', testRideId);

  // Insert a delivered dispatchOffer row
  const offerRes = await pool.query(`
    INSERT INTO dispatch_offers (
      ride_id, driver_id, outcome, batch_index, sent_at
    ) VALUES (
      $1, $2, 'delivered', 0, NOW()
    ) RETURNING id;
  `, [testRideId, driverId]);
  const offerId = offerRes.rows[0].id;
  console.log('Created dispatch offer:', offerId);

  // Connect Driver WebSocket to port 3001
  const ws = new WebSocket('ws://127.0.0.1:3001');

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log('WebSocket connected. Sending auth:hello...');
      ws.send(JSON.stringify({
        type: 'auth:hello',
        access_token: driverToken,
        role: 'driver',
        lat: 23.7500,
        lng: 90.3800
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('WS received:', msg.type, msg.message || '');

      if (msg.type === 'auth:ok') {
        console.log('Driver authenticated on WS. Sending offer reject...');
        ws.send(JSON.stringify({
          type: 'offer:reject',
          ride_id: testRideId,
          reason: 'too_far'
        }));
      }

      if (msg.type === 'offer:rejected') {
        console.log('Received confirmation offer:rejected for ride:', msg.ride_id);
        ws.close();
        resolve();
      }
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS timeout waiting for offer:rejected')), 8000);
  });

  // Verify DB state of dispatch_offers
  const checkOfferRes = await pool.query(
    'SELECT id, outcome, rejection_reason, responded_at FROM dispatch_offers WHERE id = $1',
    [offerId]
  );
  console.log('Offer record after reject:', checkOfferRes.rows[0]);
  if (checkOfferRes.rows[0].outcome !== 'rejected' || checkOfferRes.rows[0].rejection_reason !== 'too_far') {
    throw new Error('Dispatch offer outcome was not updated to rejected');
  }
  console.log('PASS: Ride dispatch offer recorded as rejected with reason "too_far"!');

  // Cleanup test records
  await pool.query('DELETE FROM dispatch_offers WHERE id = $1', [offerId]);
  await pool.query('DELETE FROM rides WHERE id = $1', [testRideId]);
  await pool.query('DELETE FROM deliveries WHERE id = $1', [testLegId]);
  console.log('Cleaned up ephemeral test rows.');

  await pool.end();
  console.log('\n--- Step 4: Offer Rejection & Sequential Advance Completed Successfully! ---');
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
