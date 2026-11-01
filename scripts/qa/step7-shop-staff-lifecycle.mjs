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
  console.log('--- Step 7: Shop Staff Orders-Only Proof & Order Lifecycle ---');

  const shopId = 'e2e00000-0000-4000-8000-00000000a003'; // E2E Garage (Vehicle Parts & Workshop)
  const productId = 'e2e00000-0000-4000-8000-00000000b005'; // E2E Mobil Super 4T Lubricant
  const staffUserId = 'fd40a004-d2f9-4cb4-9ebb-5da288e3a8ec'; // Phone +8801700000002

  // 1. Seed Lubricant Product in E2E Garage if not exists
  await pool.query(`
    INSERT INTO shop_products (
      id, shop_id, name, description, price_bdt, stock, category, is_active
    ) VALUES (
      $1, $2, 'E2E Mobil Super 4T 20W-50 Lubricant',
      'Premium synthetic engine oil for 4-stroke motorcycle engines',
      65000, 50, 'lubricants', true
    ) ON CONFLICT (id) DO UPDATE SET
      price_bdt = 65000,
      is_active = true,
      stock = 50;
  `, [productId, shopId]);
  console.log('Seeded E2E Mobil Super 4T Lubricant in E2E Garage.');

  // 2. Configure staff account with STAFF role (orders-only) in shop_members
  await pool.query('DELETE FROM shop_members WHERE shop_id = $1 AND user_id = $2', [shopId, staffUserId]);
  await pool.query(`
    INSERT INTO shop_members (shop_id, user_id, role, status)
    VALUES ($1, $2, 'STAFF', 'active');
  `, [shopId, staffUserId]);
  console.log('Configured user +8801700000002 as STAFF (orders-only) for E2E Garage.');

  // 3. Authenticate Staff Member and Customer
  console.log('Logging in Staff Member (+8801700000002)...');
  const { data: staffAuth, error: sErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700000002',
    password: 'test1234'
  });
  if (sErr) throw sErr;
  const staffToken = staffAuth.session.access_token;

  console.log('Logging in Customer Fatima (+8801700990001)...');
  const { data: custAuth, error: cErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (cErr) throw cErr;
  const customerToken = custAuth.session.access_token;

  // 4. PROVE ORDERS-ONLY: Staff attempts catalog mutation (adding product) -> MUST BE 403 FORBIDDEN
  console.log('\n[Proof 1] Staff attempting catalog creation (POST /api/shop/products)...');
  const forbiddenProdRes = await fetch(`http://127.0.0.1:8081/api/shop/${shopId}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staffToken}`
    },
    body: JSON.stringify({
      name: 'Illegal Product by Staff',
      price_bdt: 10000,
      stock: 5
    })
  });
  console.log('Catalog mutation response status:', forbiddenProdRes.status);
  if (forbiddenProdRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for staff catalog mutation, got ${forbiddenProdRes.status}`);
  }
  console.log('PASS: Staff is blocked from catalog mutation (403 Forbidden).');

  // 5. Customer buys lubricant from Vehicle Parts shop (E2E Garage)
  console.log('\n[Order Flow] Customer purchasing Mobil Super 4T Lubricant from E2E Garage...');
  const orderRes = await fetch('http://127.0.0.1:8081/api/shop/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customerToken}`
    },
    body: JSON.stringify({
      shop_id: shopId,
      items: [{ product_id: productId, quantity: 2 }],
      fulfillment: 'delivery',
      delivery_address: 'House 8, Road 11, Banani, Dhaka',
      delivery_lat: 23.7937,
      delivery_lng: 90.4048,
      rider_notes: 'Leave at front desk'
    })
  });

  console.log('Order create HTTP status:', orderRes.status);
  const orderJson = await orderRes.json();
  console.log('Order create response:', JSON.stringify(orderJson, null, 2));
  if (!orderRes.ok) throw new Error('Customer order failed: ' + JSON.stringify(orderJson));

  const orderId = orderJson.order_id || orderJson.order?.id || orderJson.id;
  console.log('Created Shop Order ID:', orderId, 'Total:', orderJson.total_bdt);

  // 6. PROVE ORDERS ALLOWED: Staff accepts order with prep_minutes
  console.log(`\n[Proof 2] Staff accepting order ${orderId} with prep_minutes: 10...`);
  const acceptRes = await fetch(`http://127.0.0.1:8081/api/shop/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staffToken}`
    },
    body: JSON.stringify({
      status: 'accepted',
      prep_minutes: 10
    })
  });
  console.log('Staff accept status:', acceptRes.status);
  const acceptJson = await acceptRes.json();
  console.log('Staff accept response:', JSON.stringify(acceptJson));
  if (!acceptRes.ok) throw new Error('Staff accept failed: ' + JSON.stringify(acceptJson));

  // 7. Staff transitions order to preparing
  console.log(`Staff transitioning order ${orderId} to preparing...`);
  const prepRes = await fetch(`http://127.0.0.1:8081/api/shop/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staffToken}`
    },
    body: JSON.stringify({ status: 'preparing' })
  });
  console.log('Staff prep status:', prepRes.status);
  if (!prepRes.ok) throw new Error('Staff preparing transition failed');

  // 8. Staff marks order ready for pickup
  console.log(`Staff marking order ${orderId} ready_for_pickup...`);
  const readyRes = await fetch(`http://127.0.0.1:8081/api/shop/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staffToken}`
    },
    body: JSON.stringify({ status: 'ready_for_pickup' })
  });
  console.log('Staff ready status:', readyRes.status);
  if (!readyRes.ok) throw new Error('Staff ready_for_pickup transition failed');

  // 9. DB Verification
  const verifyClient = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await verifyClient.connect();
  const checkOrder = await verifyClient.query(
    'SELECT id, status, shop_id, total_bdt, prep_minutes FROM shop_orders WHERE id = $1',
    [orderId]
  );
  console.log('\nFinal DB Verification:');
  console.log('Shop Order row:', checkOrder.rows[0]);
  await verifyClient.end();
  await pool.end();

  if (checkOrder.rows[0].status !== 'ready_for_pickup') {
    throw new Error('Order status is not ready_for_pickup');
  }

  console.log('\n--- SUCCESS: Shop Staff Orders-Only Proof & Order Lifecycle Complete! ---');
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
