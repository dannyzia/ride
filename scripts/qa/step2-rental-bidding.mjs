import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('utils-server/.env', 'utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const conn = m[1].trim();
const pool = new pg.Pool({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('--- Step 2: Rental Request & Fleet Bidding Lifecycle ---');

  // 1. Authenticate Rider
  console.log('Logging in Rider...');
  const { data: riderAuth, error: rErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (rErr) throw rErr;
  const riderToken = riderAuth.session.access_token;

  // 2. Authenticate Driver/Fleet Owner
  console.log('Logging in Driver Pilot (Fleet Bidder)...');
  const { data: driverAuth, error: dErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990002',
    password: 'test1234'
  });
  if (dErr) throw dErr;
  const driverToken = driverAuth.session.access_token;
  const driverUserId = 'c58c7987-5ee7-41a6-ab8a-5a520a54a591';
  const riderUserId = '57384ff5-9719-4ccd-862c-f3db52721453';

  // 3. Clean up rate limits and open requests for test rider
  await pool.query("DELETE FROM rate_limits WHERE key LIKE 'rental_%'");
  await pool.query("UPDATE rental_requests SET status = 'cancelled' WHERE rider_user_id = $1 AND status IN ('broadcasting', 'collecting')", [riderUserId]);
  console.log('Cleared rate limits and cancelled prior open rental requests.');

  // 4. Create fresh Rental Request
  console.log('Creating fresh Rental Request (Car Rental, 4 hours)...');
  const createReq = await fetch('http://127.0.0.1:8081/api/rental/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      category: 'car_rental',
      pickup_address: 'Gulshan 2, Dhaka',
      pickup_lat: 23.7925,
      pickup_lng: 90.4078,
      dropoff_address: 'Uttara Sector 4, Dhaka',
      dropoff_lat: 23.8681,
      dropoff_lng: 90.3980,
      requested_vehicle_type: 'car_compact',
      duration_hours: 4,
      bidding_window_seconds: 1200
    })
  });

  const createJson = await createReq.json();
  console.log('Create rental request status:', createReq.status);
  console.log('Create rental response:', JSON.stringify(createJson));
  if (!createReq.ok) throw new Error('Create rental request failed: ' + JSON.stringify(createJson));

  const requestId = createJson.request_id || createJson.request?.id || createJson.id;
  console.log('Created fresh Rental Request ID:', requestId);

  // 5. Submit Bid (Fleet Bidder)
  console.log(`Fleet submitting bid for request ${requestId}...`);
  const bidRes = await fetch('http://127.0.0.1:8081/api/rental/bids', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({
      request_id: requestId,
      fleet_id: '0ff9e0a7-f52d-4d22-a549-a51cd5d87a77',
      vehicle_type: 'car_compact',
      driver_user_id: driverUserId,
      vehicle_id: 'c3524463-38e8-42cc-b3b7-be2f984cec56',
      quoted_price_bdt: 350000, // ৳3,500.00
      quoted_notes: 'Toyota Corolla with AC and experienced driver'
    })
  });
  console.log('Submit bid status:', bidRes.status);
  const bidJson = await bidRes.json();
  console.log('Submit bid response:', JSON.stringify(bidJson, null, 2));
  if (!bidRes.ok) throw new Error('Submit bid failed: ' + JSON.stringify(bidJson));

  const bidId = bidJson.bid_id || bidJson.bid?.id || bidJson.id;
  console.log('Rental Bid ID:', bidId);

  // 6. Accept Bid (Rider)
  console.log(`Rider accepting bid ${bidId}...`);
  const acceptRes = await fetch(`http://127.0.0.1:8081/api/rental/requests/${requestId}/accept-bid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      bid_id: bidId
    })
  });
  console.log('Accept bid status:', acceptRes.status);
  const acceptJson = await acceptRes.json();
  console.log('Accept bid response:', JSON.stringify(acceptJson, null, 2));
  if (!acceptRes.ok) throw new Error('Accept bid failed: ' + JSON.stringify(acceptJson));

  // 7. Verify DB state of rental request and bid
  const checkReq = await pool.query('SELECT id, status, awarded_bid_id, awarded_at FROM rental_requests WHERE id = $1', [requestId]);
  const checkBid = await pool.query('SELECT id, status FROM rental_bids WHERE id = $1', [bidId]);

  console.log('\nFinal DB Verification:');
  console.log('Rental Request:', checkReq.rows[0]);
  console.log('Rental Bid:', checkBid.rows[0]);

  if (checkReq.rows[0].awarded_bid_id !== bidId) {
    throw new Error('Awarded bid ID does not match accepted bid');
  }

  console.log('\n--- SUCCESS: Rental Request & Fleet Bidding Completed Successfully! ---');
  await pool.end();
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
