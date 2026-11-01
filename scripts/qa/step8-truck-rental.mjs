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
  console.log('=== Step 8: V5 Truck Rental Request & Fleet Bidding Lifecycle ===');

  // 1. Authenticate Rider (Fatima)
  console.log('Logging in Rider (Fatima)...');
  const { data: riderAuth, error: rErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (rErr) throw rErr;
  const riderToken = riderAuth.session.access_token;
  const riderUserId = '57384ff5-9719-4ccd-862c-f3db52721453';

  // 2. Authenticate Driver/Fleet Owner (Amina / Pilot)
  console.log('Logging in Fleet Bidder...');
  const { data: driverAuth, error: dErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990002',
    password: 'test1234'
  });
  if (dErr) throw dErr;
  const driverToken = driverAuth.session.access_token;
  const driverUserId = 'c58c7987-5ee7-41a6-ab8a-5a520a54a591';
  const fleetId = '0ff9e0a7-f52d-4d22-a549-a51cd5d87a77';
  console.log('Using Fleet ID:', fleetId);

  // 4. Clean up rate limits and open truck rental requests for test rider
  await pool.query("DELETE FROM rate_limits WHERE key LIKE 'rental_%'");
  await pool.query(
    "UPDATE rental_requests SET status = 'cancelled' WHERE rider_user_id = $1 AND status IN ('broadcasting', 'collecting', 'awarded', 'confirmed')",
    [riderUserId]
  );
  console.log('Cleared rate limits and cancelled prior open rental requests.');

  // 5. Create fresh V5 Truck Rental Request
  console.log('Creating fresh V5 Truck Rental Request (category=truck_rental, medium_truck)...');
  const createReq = await fetch('http://127.0.0.1:8081/api/rental/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      category: 'truck_rental',
      pickup_address: 'Tejgaon Industrial Area, Dhaka',
      pickup_lat: 23.7644,
      pickup_lng: 90.3987,
      dropoff_address: 'Chittagong Port, Agrabad',
      dropoff_lat: 22.3200,
      dropoff_lng: 91.7400,
      cargo_tags: ['Freight', 'covered'],
      cargo_weight_kg: 2500,
      cargo_volume_m3: 15.0,
      cargo_description: 'Industrial machinery spare parts',
      rental_options: 'Fragile goods, Weight > 1 ton',
      requested_vehicle_type: 'medium_truck',
      duration_hours: 12,
      bidding_window_seconds: 1800
    })
  });

  const createJson = await createReq.json();
  console.log('Create truck rental request status:', createReq.status);
  console.log('Create truck rental response:', JSON.stringify(createJson));
  if (!createReq.ok) throw new Error('Create truck rental request failed: ' + JSON.stringify(createJson));

  const requestId = createJson.request_id || createJson.request?.id || createJson.id;
  console.log('Created fresh Truck Rental Request ID:', requestId);

  // 6. Submit Sealed Bid (Fleet Bidder)
  console.log(`Fleet submitting sealed bid for truck request ${requestId}...`);
  const bidRes = await fetch('http://127.0.0.1:8081/api/rental/bids', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({
      request_id: requestId,
      fleet_id: fleetId,
      vehicle_type: 'medium_truck',
      driver_user_id: driverUserId,
      quoted_price_bdt: 2800000, // ৳28,000.00
      quoted_notes: '14ft Medium Truck with hydraulic lift and cargo cover'
    })
  });

  console.log('Submit truck bid status:', bidRes.status);
  const bidJson = await bidRes.json();
  console.log('Submit truck bid response:', JSON.stringify(bidJson, null, 2));
  if (!bidRes.ok) throw new Error('Submit truck bid failed: ' + JSON.stringify(bidJson));

  const bidId = bidJson.bid_id || bidJson.bid?.id || bidJson.id;
  console.log('Truck Rental Bid ID:', bidId);

  // 7. Rider views available bids
  console.log(`Rider fetching request and bids for request ${requestId}...`);
  const listBidsRes = await fetch(`http://127.0.0.1:8081/api/rental/requests/${requestId}`, {
    headers: {
      'Authorization': `Bearer ${riderToken}`
    }
  });
  console.log('List bids status:', listBidsRes.status);
  const listBidsJson = await listBidsRes.json();
  console.log('Request & bids response:', JSON.stringify(listBidsJson, null, 2));

  // 8. Rider accepts the Truck Bid
  console.log(`Rider accepting truck bid ${bidId}...`);
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
  console.log('Accept truck bid status:', acceptRes.status);
  const acceptJson = await acceptRes.json();
  console.log('Accept truck bid response:', JSON.stringify(acceptJson, null, 2));
  if (!acceptRes.ok) throw new Error('Accept truck bid failed: ' + JSON.stringify(acceptJson));

  // 9. Verify DB state of rental request and bid
  const checkReq = await pool.query(
    'SELECT id, category, status, requested_vehicle_type, cargo_tags, cargo_weight_kg, awarded_bid_id, awarded_at FROM rental_requests WHERE id = $1',
    [requestId]
  );
  const checkBid = await pool.query(
    'SELECT id, request_id, vehicle_type, quoted_price_bdt, status FROM rental_bids WHERE id = $1',
    [bidId]
  );

  console.log('\n=== Final DB Verification for V5 Truck Rental ===');
  console.log('Truck Rental Request:', checkReq.rows[0]);
  console.log('Truck Rental Bid:', checkBid.rows[0]);

  if (checkReq.rows[0].awarded_bid_id !== bidId) {
    throw new Error('Awarded bid ID does not match accepted bid');
  }
  if (checkReq.rows[0].category !== 'truck_rental') {
    throw new Error('Category is not truck_rental');
  }
  if (checkReq.rows[0].status !== 'awarded') {
    throw new Error('Request status is not awarded');
  }
  if (checkBid.rows[0].status !== 'won') {
    throw new Error('Bid status is not won');
  }

  console.log('\n--- SUCCESS: V5 Truck Rental Lifecycle Completed & Verified! ---');
  await pool.end();
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
