import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('--- Step 3: Emergency Ambulance Flow ---');

  // 1. Authenticate Rider
  console.log('Logging in Rider Newd123...');
  const { data: riderAuth, error: rErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990001',
    password: 'test1234'
  });
  if (rErr) throw rErr;
  const riderToken = riderAuth.session.access_token;

  // 2. Authenticate Driver Pilot
  console.log('Logging in Driver Pilot (ALS Certified Ambulance Operator)...');
  const { data: driverAuth, error: dErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990002',
    password: 'test1234'
  });
  if (dErr) throw dErr;
  const driverToken = driverAuth.session.access_token;

  // 3. Create Emergency Request (Rider)
  console.log('Rider submitting Emergency Request (ALS with Paramedic)...');
  const createRes = await fetch('http://127.0.0.1:8081/api/emergency/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${riderToken}`
    },
    body: JSON.stringify({
      pickup_address: 'House 12, Road 27, Dhanmondi, Dhaka',
      pickup_lat: 23.7500,
      pickup_lng: 90.3700,
      dropoff_address: 'Dhaka Medical College Hospital',
      dropoff_lat: 23.7258,
      dropoff_lng: 90.3976,
      patient_condition: 'Acute respiratory failure and low SPO2',
      requires_paramedic: true,
      service_level: 'ALS'
    })
  });
  console.log('Create Emergency status:', createRes.status);
  const createJson = await createRes.json();
  console.log('Create Emergency response:', JSON.stringify(createJson, null, 2));
  if (!createRes.ok) throw new Error('Failed to create emergency request');

  const emergencyId = createJson.request?.id || createJson.id;
  console.log('Created Emergency Request ID:', emergencyId);

  // 4. Driver queries open emergency requests
  console.log('Driver querying open emergency requests...');
  const openRes = await fetch('http://127.0.0.1:8081/api/emergency/requests/open', {
    headers: { 'Authorization': `Bearer ${driverToken}` }
  });
  console.log('Open requests status:', openRes.status);
  const openJson = await openRes.json();
  console.log('Open requests count:', openJson.requests?.length || 0);

  // 5. Driver Accepts Emergency Request
  console.log(`Driver accepting Emergency Request ${emergencyId}...`);
  const acceptRes = await fetch(`http://127.0.0.1:8081/api/emergency/requests/${emergencyId}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  console.log('Accept status:', acceptRes.status);
  const acceptJson = await acceptRes.json();
  console.log('Accept response:', JSON.stringify(acceptJson, null, 2));
  if (!acceptRes.ok) throw new Error('Driver accept failed');

  // 6. Transition lifecycle states: en_route_pickup -> arrived -> en_route_dropoff -> completed
  const transitions = ['en_route_pickup', 'arrived', 'en_route_dropoff', 'completed'];
  for (const status of transitions) {
    console.log(`Transitioning status to ${status}...`);
    const statusRes = await fetch(`http://127.0.0.1:8081/api/emergency/requests/${emergencyId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${driverToken}`
      },
      body: JSON.stringify({ status })
    });
    console.log(`Status transition to ${status} response code:`, statusRes.status);
    const sJson = await statusRes.json();
    if (!statusRes.ok) {
      console.error(`Transition error for ${status}:`, sJson);
      throw new Error(`Failed transition to ${status}`);
    }
    console.log(`Successfully transitioned to ${status}`);
  }

  console.log('--- Emergency Ambulance Flow Completed Successfully! ---');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
