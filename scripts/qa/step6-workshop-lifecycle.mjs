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
  console.log('--- Step 6: Workshop Service Booking & Completion Lifecycle ---');

  // 1. Authenticate Customer (Fatima) and Shop Owner (E2E Shop Owner)
  console.log('Logging in Customer Fatima (+8801700990001)...');
  const { data: customerAuth, error: cErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (cErr) throw cErr;
  const customerToken = customerAuth.session.access_token;

  console.log('Logging in E2E Shop Owner (+8801799999992)...');
  const { data: ownerAuth, error: oErr } = await supabase.auth.signInWithPassword({
    phone: '+8801799999992',
    password: 'test1234'
  });
  if (oErr) throw oErr;
  const ownerToken = ownerAuth.session.access_token;

  const shopId = 'e2e00000-0000-4000-8000-00000000a003'; // E2E Garage
  const serviceId = 'e2e00000-0000-4000-8000-00000000d001'; // E2E Oil Change

  // 2. Customer creates workshop service booking
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const requestedDate = tomorrow.toISOString().slice(0, 10);

  console.log(`Customer booking workshop service on ${requestedDate}...`);
  const bookRes = await fetch(`http://127.0.0.1:8081/api/shop/${shopId}/workshop/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customerToken}`
    },
    body: JSON.stringify({
      service_id: serviceId,
      requested_date: requestedDate,
      window_start: '10:00',
      window_end: '12:00',
      vehicle_details: 'Honda CB Hornet 160R (Dhaka Metro-LA-12-3456)',
      note: 'Periodic synthetic engine oil replacement and filter check'
    })
  });

  console.log('Book service HTTP status:', bookRes.status);
  const bookJson = await bookRes.json();
  console.log('Book service response:', JSON.stringify(bookJson, null, 2));
  if (!bookRes.ok) throw new Error('Failed to book workshop service: ' + JSON.stringify(bookJson));

  const requestId = bookJson.request_id || bookJson.request?.id || bookJson.id;
  console.log('Created Workshop Request ID:', requestId);

  // 3. Shop Owner checks inbox
  console.log('Shop Owner querying workshop requests inbox...');
  const inboxRes = await fetch(`http://127.0.0.1:8081/api/shop/${shopId}/workshop/requests`, {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log('Inbox HTTP status:', inboxRes.status);
  const inboxJson = await inboxRes.json();
  console.log('Inbox requests count:', inboxJson.requests?.length || 0);

  // 4. Shop Owner confirms request
  console.log(`Shop Owner confirming request ${requestId}...`);
  const confirmRes = await fetch(`http://127.0.0.1:8081/api/shop/${shopId}/workshop/requests`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ id: requestId, status: 'confirmed' })
  });
  console.log('Confirm HTTP status:', confirmRes.status);
  const confirmJson = await confirmRes.json();
  console.log('Confirm response:', JSON.stringify(confirmJson));
  if (!confirmRes.ok) throw new Error('Confirm workshop request failed');

  // 5. Shop Owner marks in_progress
  console.log(`Shop Owner starting service on ${requestId}...`);
  const inProgressRes = await fetch(`http://127.0.0.1:8081/api/shop/${shopId}/workshop/requests`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ id: requestId, status: 'in_progress' })
  });
  console.log('In-progress HTTP status:', inProgressRes.status);
  if (!inProgressRes.ok) throw new Error('In-progress transition failed');

  // 6. Shop Owner marks done
  console.log(`Shop Owner completing service on ${requestId}...`);
  const doneRes = await fetch(`http://127.0.0.1:8081/api/shop/${shopId}/workshop/requests`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ id: requestId, status: 'done' })
  });
  console.log('Done HTTP status:', doneRes.status);
  if (!doneRes.ok) throw new Error('Done transition failed');

  // 7. DB Verification
  const dbCheck = await pool.query(
    'SELECT id, shop_id, service_id, status, vehicle_details, created_at, updated_at FROM workshop_requests WHERE id = $1',
    [requestId]
  );
  console.log('\nFinal DB Verification:');
  console.log('Workshop Request record:', dbCheck.rows[0]);

  if (dbCheck.rows[0].status !== 'done') {
    throw new Error('Workshop request status is not done');
  }

  console.log('\n--- SUCCESS: Workshop Service Booking & Completion Lifecycle Verified! ---');
  await pool.end();
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
