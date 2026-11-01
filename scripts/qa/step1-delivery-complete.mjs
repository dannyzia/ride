import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    phone: '+8801700990002',
    password: 'Password123!'
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    process.exit(1);
  }
  const token = authData.session.access_token;
  const legId = '272cd47a-e345-4cd5-b033-9e13740a573f';

  // 1. Pickup
  console.log('Sending pickup action...');
  const pickupRes = await fetch(`http://127.0.0.1:8081/api/delivery/active/${legId}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'pickup' })
  });
  console.log('Pickup status:', pickupRes.status);
  const pickupJson = await pickupRes.json();
  console.log('Pickup response:', JSON.stringify(pickupJson, null, 2));

  // 2. Deliver
  console.log('Sending deliver action...');
  const deliverRes = await fetch(`http://127.0.0.1:8081/api/delivery/active/${legId}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'deliver',
      amount_collected_bdt: 8000,
      proof_photo_url: 'https://pub-e7ff534a7d2e46b08fa11f4eead1865c.r2.dev/delivery-proofs/272cd47a.jpg'
    })
  });
  console.log('Deliver status:', deliverRes.status);
  const deliverJson = await deliverRes.json();
  console.log('Deliver response:', JSON.stringify(deliverJson, null, 2));
}

run().catch(console.error);
