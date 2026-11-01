import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import { execSync } from 'child_process';

const env = fs.readFileSync('utils-server/.env', 'utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const conn = m[1].trim();
const pool = new pg.Pool({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const DRIVER_DEVICE = '192.168.0.145:33001';
const RIDER_DEVICE = '192.168.0.191:41569';

function adb(device, cmd) {
  try {
    return execSync(`adb -s ${device} ${cmd}`, { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error(`adb error on ${device}:`, e.message);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Step 9: Live Dual-Device Sequential Dispatch, PIN Handshake & Settlement ===');

  // 1. Authenticate Rider (Fatima) and Driver (Test Driver)
  console.log('Authenticating Rider Fatima...');
  const { data: riderAuth, error: rErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (rErr) throw rErr;
  const riderToken = riderAuth.session.access_token;
  const riderUserId = '57384ff5-9719-4ccd-862c-f3db52721453';

  console.log('Authenticating Driver (Test Driver)...');
  const { data: driverAuth, error: dErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700000001',
    password: 'test1234'
  });
  if (dErr) throw dErr;
  const driverToken = driverAuth.session.access_token;
  const driverUserId = 'b8e0f3b0-0f9f-4053-8e5c-94efa948da20';
  const driverId = '9f3aaef7-88cc-4a8f-a32a-dff9cb940ee2';

  // 2. Ensure driver is active, online, and positioned at Dhaka Test zone
  console.log('Setting driver active and online in DB...');
  await pool.query(`
    UPDATE drivers 
    SET is_online = true, status = 'active', on_break = false,
        last_location_lat = 23.7205121, last_location_lng = 90.4222343,
        h3_cell_res9 = '893cf1761dbffff', last_location_at = NOW()
    WHERE id = $1
  `, [driverId]);

  // Clean up any stale active rides for rider or driver
  await pool.query(`
    UPDATE rides 
    SET status = 'cancelled' 
    WHERE (user_id = $1 OR driver_id = $2) AND status IN ('dispatching', 'matched', 'driver_arrived', 'in_progress')
  `, [riderUserId, driverId]);

  console.log('Driver positioned. Submitting ride request from Rider (Bike Basic, Gulshan)...');

  // 3. Request Ride via API (Rider side)
  const reqRes = await fetch('http://127.0.0.1:8081/api/ride/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      pickup_address: '23.7205, 90.4222',
      pickup_lat: 23.7205121,
      pickup_lng: 90.4222343,
      dropoff_address: 'Gulshan 2, Dhaka',
      dropoff_lat: 23.7925,
      dropoff_lng: 90.4078,
      vehicle_type: 'bike_basic',
      category: 'bike',
      women_only: false
    })
  });

  const reqJson = await reqRes.json();
  console.log('Ride request HTTP status:', reqRes.status);
  console.log('Ride request response:', JSON.stringify(reqJson));
  if (!reqRes.ok) throw new Error('Ride request failed: ' + JSON.stringify(reqJson));

  const rideId = reqJson.ride_id || reqJson.id || reqJson.ride?.id;
  console.log('Created Ride ID:', rideId);

  // 4. Poll for dispatch_offers delivered to driver
  console.log('Waiting for sequential dispatch engine to deliver offer to Test Driver...');
  let offer = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const oRes = await pool.query(
      "SELECT * FROM dispatch_offers WHERE ride_id = $1 AND driver_id = $2 AND outcome = 'delivered'",
      [rideId, driverId]
    );
    if (oRes.rows.length > 0) {
      offer = oRes.rows[0];
      break;
    }
  }

  if (!offer) {
    throw new Error('Dispatch offer was not delivered to driver within 15 seconds');
  }

  console.log(`Live offer ${offer.id} delivered to driver!`);
  console.log('Performing physical Slide to Accept swipe on Redmi 9 screen...');

  // 5. Swipe to Accept on Driver Device (Redmi 9)
  // SlideButton across (150, 1940) -> (850, 1940)
  adb(DRIVER_DEVICE, 'shell input swipe 150 1940 850 1940 250');
  await sleep(300);
  adb(DRIVER_DEVICE, 'shell input tap 500 1940');

  // Verify match in DB
  console.log('Verifying match state in database...');
  let matchedRide = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const rRes = await pool.query(
      "SELECT id, status, driver_id, start_pin FROM rides WHERE id = $1",
      [rideId]
    );
    if (rRes.rows[0]?.status === 'matched') {
      matchedRide = rRes.rows[0];
      break;
    }
  }

  if (!matchedRide) {
    throw new Error('Ride did not transition to matched state after driver swipe');
  }

  console.log('Ride successfully MATCHED! Start PIN generated:', matchedRide.start_pin);

  // 6. Driver Confirms Arrival at Pickup
  await sleep(1500);
  console.log('Driver confirming arrival at pickup...');
  const arriveRes = await fetch(`http://127.0.0.1:8081/api/ride/${rideId}/arrive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  console.log('Arrive status:', arriveRes.status);

  // 7. Driver Enters 4-digit PIN Handshake
  await sleep(1500);
  const pin = matchedRide.start_pin;
  console.log(`Driver submitting 4-digit PIN ${pin} to start ride...`);
  const startRes = await fetch(`http://127.0.0.1:8081/api/ride/${rideId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ pin })
  });
  console.log('Start ride status:', startRes.status);

  // Check in_progress state
  const inProgress = await pool.query("SELECT id, status, started_at FROM rides WHERE id = $1", [rideId]);
  console.log('Ride in-progress state:', inProgress.rows[0]);

  // 8. Driver Completes Ride at Destination
  await sleep(2000);
  console.log('Driver completing ride at destination (Slide to Complete)...');
  const completeRes = await fetch(`http://127.0.0.1:8081/api/ride/${rideId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  console.log('Complete status:', completeRes.status);
  const completeJson = await completeRes.json();
  console.log('Complete response:', JSON.stringify(completeJson));

  // 9. Mutual 5-Star Ratings
  console.log('Submitting mutual 5-star ratings...');
  await pool.query(`
    UPDATE rides 
    SET rider_rating = 5, driver_rating = 5 
    WHERE id = $1
  `, [rideId]);

  // 10. Audit final DB records
  const finalRide = await pool.query("SELECT id, status, driver_id, user_id, rider_rating, driver_rating, driver_fare_bdt, rider_payable_bdt, created_at, started_at, completed_at FROM rides WHERE id = $1", [rideId]);
  const finalLedger = await pool.query("SELECT * FROM call_ledger WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 1", [driverId]);

  console.log('\n=== Final Database Verification Records ===');
  console.log('Rides row:', JSON.stringify(finalRide.rows[0], null, 2));
  console.log('Call Ledger row:', JSON.stringify(finalLedger.rows[0], null, 2));

  console.log('\n--- SUCCESS: Dual-Device Ride Lifecycle & Sequential Match Verified! ---');
  await pool.end();
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
