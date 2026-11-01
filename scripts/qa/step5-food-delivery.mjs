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
  console.log('--- Step 5: Food Delivery Full End-to-End Lifecycle ---');

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
  const shopId = 'e2e00000-0000-4000-8000-00000000a001'; // E2E Bistro
  const productId = 'e2e00000-0000-4000-8000-00000000b001'; // E2E Rice Plate

  // 2. Add Driver Pilot as shop manager for E2E Bistro, enable deliveries, and clear stale claims
  await pool.query('UPDATE drivers SET deliveries_enabled = true WHERE user_id = $1', [driverUserId]);
  await pool.query('DELETE FROM shop_members WHERE shop_id = $1 AND user_id = $2', [shopId, driverUserId]);
  await pool.query(`
    INSERT INTO shop_members (shop_id, user_id, role, status)
    VALUES ($1, $2, 'MANAGER', 'active');
  `, [shopId, driverUserId]);
  await pool.query("DELETE FROM deliveries WHERE delivery_man_user_id = $1 AND status IN ('accepted', 'picked_up')", [driverUserId]);
  console.log('Driver Pilot configured as E2E Bistro MANAGER, deliveries enabled, prior claims cleared.');

  // 3. Customer places Food Delivery Order
  console.log('Customer placing Food Delivery order at E2E Bistro...');
  const orderRes = await fetch('http://127.0.0.1:8081/api/shop/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      shop_id: shopId,
      items: [{ product_id: productId, quantity: 1 }],
      fulfillment: 'delivery',
      delivery_address: 'House 15, Road 27, Dhanmondi, Dhaka',
      delivery_lat: 23.7500,
      delivery_lng: 90.3700,
      rider_notes: 'Please add extra cutlery'
    })
  });
  console.log('Create order status:', orderRes.status);
  const orderJson = await orderRes.json();
  console.log('Create order response:', JSON.stringify(orderJson, null, 2));
  if (!orderRes.ok) throw new Error('Create shop order failed');

  const orderId = orderJson.order_id || orderJson.order?.id || orderJson.id;
  console.log('Created Shop Order ID:', orderId);

  // 4. Shop accepts order with prep time
  console.log('Shop accepting order with prep_minutes: 15...');
  const acceptOrderRes = await fetch(`http://127.0.0.1:8081/api/shop/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({
      status: 'accepted',
      prep_minutes: 15
    })
  });
  console.log('Shop accept status:', acceptOrderRes.status);
  const acceptOrderJson = await acceptOrderRes.json();
  console.log('Shop accept response:', JSON.stringify(acceptOrderJson));

  // 5. Shop transitions to preparing
  console.log('Shop transitioning order to preparing...');
  const prepRes = await fetch(`http://127.0.0.1:8081/api/shop/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ status: 'preparing' })
  });
  console.log('Shop prep status:', prepRes.status);

  // 6. Find the delivery leg created for this order
  const legQuery = await pool.query(
    'SELECT id, status, source_vertical, delivery_fee_bdt FROM deliveries WHERE order_id = $1',
    [orderId]
  );
  if (legQuery.rows.length === 0) throw new Error('No delivery leg found for order ' + orderId);
  const leg = legQuery.rows[0];
  console.log('Found delivery leg for food order:', leg);

  // 7. Offer the leg to Driver Pilot
  await pool.query(`
    UPDATE deliveries
    SET status = 'offered', offered_to_user_id = $1, offer_expires_at = NOW() + INTERVAL '120 seconds'
    WHERE id = $2;
  `, [driverUserId, leg.id]);
  console.log(`Delivery leg ${leg.id} offered to Driver Pilot.`);

  // 8. Driver Pilot accepts delivery offer while order is 'preparing'
  console.log('Driver Pilot accepting food delivery offer...');
  const acceptOfferRes = await fetch(`http://127.0.0.1:8081/api/delivery/offers/${leg.id}/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ decision: 'accept' })
  });
  console.log('Courier accept offer status:', acceptOfferRes.status);
  const acceptOfferJson = await acceptOfferRes.json();
  console.log('Courier accept offer response:', JSON.stringify(acceptOfferJson));
  if (!acceptOfferRes.ok) throw new Error('Courier accept offer failed');

  // 9. Query handover codes from shop_orders
  const orderCodesQuery = await pool.query(
    'SELECT status, pickup_code, delivery_otp, total_bdt FROM shop_orders WHERE id = $1',
    [orderId]
  );
  const orderCodes = orderCodesQuery.rows[0];
  console.log('Order status and codes after courier accept:', orderCodes);
  if (!orderCodes.pickup_code || !orderCodes.delivery_otp) {
    throw new Error('Handover codes (pickup_code, delivery_otp) were not generated');
  }

  // 10. Shop marks order ready for pickup
  console.log('Shop marking order ready_for_pickup...');
  const readyRes = await fetch(`http://127.0.0.1:8081/api/shop/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ status: 'ready_for_pickup' })
  });
  console.log('Shop ready status:', readyRes.status);
  if (!readyRes.ok) throw new Error('Shop ready_for_pickup failed');

  // 11. Courier picks up food order presenting the pickup code
  console.log(`Courier picking up order with code: ${orderCodes.pickup_code}...`);
  const pickupRes = await fetch(`http://127.0.0.1:8081/api/delivery/active/${leg.id}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({
      action: 'pickup',
      code: orderCodes.pickup_code
    })
  });
  console.log('Courier pickup status:', pickupRes.status);
  const pickupJson = await pickupRes.json();
  console.log('Courier pickup response:', JSON.stringify(pickupJson));
  if (!pickupRes.ok) throw new Error('Courier pickup failed');

  // 12. Courier delivers food to customer with OTP and collected cash
  console.log(`Courier delivering food with OTP: ${orderCodes.delivery_otp}, collected: ${orderCodes.total_bdt}...`);
  const deliverRes = await fetch(`http://127.0.0.1:8081/api/delivery/active/${leg.id}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({
      action: 'deliver',
      otp: orderCodes.delivery_otp,
      amount_collected_bdt: orderCodes.total_bdt
    })
  });
  console.log('Courier deliver status:', deliverRes.status);
  const deliverJson = await deliverRes.json();
  console.log('Courier deliver response:', JSON.stringify(deliverJson));
  if (!deliverRes.ok) throw new Error('Courier deliver failed');

  // 13. Final verification of order, leg, and settlement in DB
  const finalOrder = await pool.query('SELECT id, status, total_bdt, delivered_at FROM shop_orders WHERE id = $1', [orderId]);
  const finalLeg = await pool.query('SELECT id, status, picked_up_at, delivered_at, amount_collected_bdt FROM deliveries WHERE id = $1', [leg.id]);
  const finalEarnings = await pool.query('SELECT id, fee_bdt, net_bdt FROM delivery_earnings WHERE leg_id = $1', [leg.id]);

  console.log('\nFinal DB Verification:');
  console.log('Shop Order:', finalOrder.rows[0]);
  console.log('Delivery Leg:', finalLeg.rows[0]);
  console.log('Courier Earnings Record:', finalEarnings.rows[0]);

  if (finalOrder.rows[0].status !== 'delivered' || finalLeg.rows[0].status !== 'delivered') {
    throw new Error('Food delivery did not transition to delivered in DB');
  }

  console.log('\n--- SUCCESS: Food Delivery Full Lifecycle Completed & Verified! ---');
  await pool.end();
}

run().catch((e) => {
  console.error('FAILED:', e);
  pool.end();
  process.exit(1);
});
