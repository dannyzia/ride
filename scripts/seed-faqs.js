const postgres = require("postgres");
require("dotenv").config({ path: ".env.local" });

const riderFaqs = [
  { q: "How do I book a ride?", a: "Enter your pickup and destination, select a vehicle type, and tap 'Find Ride'.", category: "Booking" },
  { q: "How do I pay for my ride?", a: "You can pay via wallet balance, card, or mobile banking (bKash/Nagad).", category: "Payment" },
  { q: "Can I schedule a ride in advance?", a: "Yes, use the 'Schedule Ride' option and select your preferred date and time.", category: "Booking" },
  { q: "What if no drivers are available?", a: "Try again in a few minutes or schedule for later.", category: "Booking" },
  { q: "How do I add a promo code?", a: "Go to 'Apply Promos' before confirming your ride and enter the code.", category: "Payment" },
  { q: "How do I contact my driver?", a: "Use the in-app chat or call button once a driver is assigned.", category: "Ride" },
  { q: "How do I rate my driver?", a: "After your ride completes, you'll be prompted to rate your driver from 1-5 stars.", category: "Ride" },
  { q: "What if I left something in the car?", a: "Contact support immediately with your ride details.", category: "Safety" },
];

const driverFaqs = [
  { q: "How do I go online?", a: "Tap the Go Online button from the driver home screen. You need an active call package to receive ride requests.", category: "Getting Started" },
  { q: "When are payouts made?", a: "Instant pay is available anytime from your wallet to bKash or bank account. Regular weekly payouts process every Sunday.", category: "Payment" },
  { q: "How are calls deducted?", a: "One call is deducted from your package each time you accept a ride offer. Declined offers do not consume calls.", category: "Packages" },
  { q: "What is commission?", a: "Commission is a percentage of your trip earnings paid to Ride. Rates vary by your subscription plan — typically 12-20%.", category: "Earnings" },
  { q: "How do I change my vehicle?", a: "Go to Settings > My Vehicles to add or switch your active vehicle. You can register multiple vehicles.", category: "Account" },
  { q: "What if the rider cancels?", a: "If the rider cancels, you will not be charged a call. Cancellation fees may apply depending on timing.", category: "Ride" },
];

function escapeSql(str) {
  return str.replace(/'/g, "''");
}

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });

  let order = 0;
  for (const faq of riderFaqs) {
    await client.unsafe(`
      INSERT INTO faqs (role, question, answer, category, sort_order, is_active, created_at, updated_at)
      VALUES ('rider', '${escapeSql(faq.q)}', '${escapeSql(faq.a)}', '${escapeSql(faq.category)}', ${order}, true, now(), now())
      ON CONFLICT DO NOTHING;
    `);
    order++;
  }

  order = 0;
  for (const faq of driverFaqs) {
    await client.unsafe(`
      INSERT INTO faqs (role, question, answer, category, sort_order, is_active, created_at, updated_at)
      VALUES ('driver', '${escapeSql(faq.q)}', '${escapeSql(faq.a)}', '${escapeSql(faq.category)}', ${order}, true, now(), now())
      ON CONFLICT DO NOTHING;
    `);
    order++;
  }

  console.log(`FAQs seeded: ${riderFaqs.length} rider + ${driverFaqs.length} driver`);

  const result = await client`SELECT role, count(*)::int as cnt FROM faqs GROUP BY role ORDER BY role;`;
  for (const row of result) {
    console.log(`  ${row.role}: ${row.cnt} FAQs`);
  }

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});